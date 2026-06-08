import { WebhookPayload, AnalysisState, PRFile, EnrichedFinding, AnalysisReport, CompletedFile } from '../types';
import { phase1Scan, phase2Reason } from '../gateway/client';
import { getPRFiles, getFileContent, postReviewComment, submitFinalReview, getRepoFiles } from '../mcp/github';
import { getJiraContext } from '../mcp/jira';
import { alertSlack } from '../mcp/slack';
import { scrubSecrets, validateInputSize } from '../guardrails/input';
import { validateCodeSuggestion } from '../guardrails/output';
import { saveCheckpoint, loadCheckpoint, deleteCheckpoint } from '../state/checkpoint';
import { isAnalyzableFile, getFileLanguage } from '../detectors';
import { logger } from '../utils/logger';
import { getModelDisplayName } from '../gateway/models';

const MAX_FILE_SIZE = 100000; // 100KB max per file
const MAX_FILES_PER_PR = 50;  // Limit to avoid runaway analysis

export async function analyzePR(
  payload: WebhookPayload,
  onProgress?: (event: any) => void
): Promise<AnalysisReport> {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = payload.pull_request.number;
  const headSha = payload.pull_request.head.sha;
  const runId = prNumber > 0
    ? `${repo}-pr-${prNumber}-${headSha.substring(0, 8)}`
    : `${repo}-repo-${headSha.substring(0, 8)}`;
  const startTime = Date.now();

  logger.info('Starting PR/Repo analysis', { runId, owner, repo, prNumber, headSha });

  // Step 1: Try to resume from checkpoint
  let state = await loadCheckpoint(runId);

  if (state) {
    logger.info('Resuming from checkpoint', {
      runId,
      completedFiles: state.completedFiles.length,
      pendingFiles: state.pendingFiles.length,
    });
  } else {
    // Step 2: Fetch files and context
    let allFiles: PRFile[] = [];
    if (prNumber > 0) {
      allFiles = await getPRFiles(owner, repo, prNumber);
    } else {
      allFiles = await getRepoFiles(owner, repo, headSha);
    }
    const analyzableFiles = allFiles
      .filter(f => f.status !== 'removed')
      .filter(f => isAnalyzableFile(f.filename))
      .slice(0, MAX_FILES_PER_PR);

    logger.info(`Filtered files for analysis`, {
      total: allFiles.length,
      analyzable: analyzableFiles.length,
      skipped: allFiles.length - analyzableFiles.length,
    });

    if (analyzableFiles.length === 0) {
      throw new Error(`No analyzable files found in repository or PR (total: ${allFiles.length})`);
    }

    // Fetch Jira context (non-blocking)
    const jiraTicket = await getJiraContext(payload.pull_request.body || '');

    // Detect languages
    const languages = [...new Set(analyzableFiles.map(f => getFileLanguage(f.filename)))];

    state = {
      runId,
      owner,
      repo,
      prNumber,
      headSha,
      context: {
        repoName: `${owner}/${repo}`,
        prTitle: payload.pull_request.title,
        prBody: payload.pull_request.body || '',
        jiraTicket,
        fileCount: analyzableFiles.length,
        languages,
      },
      pendingFiles: analyzableFiles,
      completedFiles: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCheckpoint(runId, state);
  }

  if (onProgress) {
    onProgress({
      type: 'start',
      repo: `${owner}/${repo}`,
      prNumber,
      prTitle: state.context.prTitle,
      prBody: state.context.prBody,
      files: [...state.completedFiles.map(f => f.file.filename), ...state.pendingFiles.map(f => f.filename)],
      phase1Model: getModelDisplayName(process.env.PHASE1_MODEL || 'phase1-scan'),
      phase2Model: getModelDisplayName(process.env.PHASE2_MODEL || 'phase2-reasoning'),
    });
  }

  // Step 3: Analyze each file
  const filesToAnalyze = [...state.pendingFiles];

  for (const file of filesToAnalyze) {
    try {
      logger.info(`Analyzing file`, { file: file.filename, remaining: state.pendingFiles.length });

      if (onProgress) {
        onProgress({
          type: 'file_start',
          fileIndex: state.completedFiles.length,
          fileName: file.filename,
          phase: `Phase 1 - Fast scanning with ${getModelDisplayName(process.env.PHASE1_MODEL || 'phase1-scan')}...`,
        });
      }

      // Fetch full file content (not just diff) for complete context
      let content: string;
      try {
        content = await getFileContent(owner, repo, file.filename, headSha);
      } catch (error: any) {
        logger.warn('Could not fetch file content, skipping', { file: file.filename, error: error.message });
        state.pendingFiles = state.pendingFiles.filter(f => f.filename !== file.filename);
        state.completedFiles.push({ file, findings: [], analyzedAt: new Date().toISOString() });
        await saveCheckpoint(runId, state);
        if (onProgress) {
          onProgress({
            type: 'file_complete',
            fileIndex: state.completedFiles.length - 1,
            fileName: file.filename,
            status: 'complete',
            findings: [],
          });
        }
        continue;
      }

      // Input guardrail: validate size
      const sizeCheck = validateInputSize(content, MAX_FILE_SIZE);
      if (!sizeCheck.passed) {
        logger.warn('File too large, skipping', { file: file.filename, reason: sizeCheck.reason });
        state.pendingFiles = state.pendingFiles.filter(f => f.filename !== file.filename);
        state.completedFiles.push({ file, findings: [], analyzedAt: new Date().toISOString() });
        await saveCheckpoint(runId, state);
        if (onProgress) {
          onProgress({
            type: 'file_complete',
            fileIndex: state.completedFiles.length - 1,
            fileName: file.filename,
            status: 'complete',
            findings: [],
          });
        }
        continue;
      }

      // Input guardrail: scrub secrets before any LLM call
      const scrubbed = scrubSecrets(content);
      const safeContent = scrubbed.content;

      // Phase 1: Fast pattern detection with Llama 8B
      const scan = await phase1Scan(safeContent, file.filename);

      if (onProgress) {
        onProgress({
          type: 'file_progress',
          fileIndex: state.completedFiles.length,
          fileName: file.filename,
          progress: 50,
          phase: `Phase 2 - Deep reasoning with ${getModelDisplayName(process.env.PHASE2_MODEL || 'phase2-reasoning')}...`,
        });
      }

      // Phase 2: Deep reasoning with Claude (only for files with findings)
      const enrichedFindings: EnrichedFinding[] = [];

      for (const rawFinding of scan.findings) {
        const enriched = await phase2Reason(
          safeContent,
          rawFinding,
          state.context,
          file.filename,
          headSha
        );

        if (enriched) {
          // Output guardrail: validate code suggestion before posting
          const validation = validateCodeSuggestion(enriched.fix, file.filename);
          if (validation.passed) {
            enrichedFindings.push(enriched);
          } else {
            logger.warn('Code suggestion failed validation, requesting regeneration', {
              pattern: enriched.pattern,
              reason: validation.reason,
            });
            // Still include finding but with a note about manual review
            enrichedFindings.push({
              ...enriched,
              fix: `/* Faultline: auto-fix failed validation (${validation.reason}). Manual fix recommended. */\n${enriched.fix}`,
            });
          }
        }
      }

      // Mark file as completed
      const completedFile: CompletedFile = {
        file,
        findings: enrichedFindings,
        analyzedAt: new Date().toISOString(),
      };
      state.completedFiles.push(completedFile);
      state.pendingFiles = state.pendingFiles.filter(f => f.filename !== file.filename);

      // Checkpoint after every file (resilience!)
      await saveCheckpoint(runId, state);

      logger.info(`File analysis complete`, {
        file: file.filename,
        findings: enrichedFindings.length,
        remaining: state.pendingFiles.length,
      });

      if (onProgress) {
        onProgress({
          type: 'file_complete',
          fileIndex: state.completedFiles.length - 1,
          fileName: file.filename,
          status: 'complete',
          findings: enrichedFindings.map(f => ({
            pattern: f.pattern,
            severity: f.severity,
            line: f.lineNumber,
            scenario: f.scenario,
            fix: f.fix,
          })),
        });
      }

    } catch (error: any) {
      logger.error('File analysis failed', { file: file.filename, error: error.message });
      // Save progress before continuing (don't lose work)
      await saveCheckpoint(runId, state);
      if (onProgress) {
        onProgress({
          type: 'file_complete',
          fileIndex: state.completedFiles.length,
          fileName: file.filename,
          status: 'error',
          findings: [],
        });
      }
      // Continue with next file rather than failing entirely
      continue;
    }
  }

  // Step 4: Post results to GitHub
  const allFindings = state.completedFiles.flatMap(f => f.findings);

  const criticals = allFindings.filter(f => f.severity === 'critical');

  if (prNumber > 0) {
    logger.info('Posting results to GitHub', {
      totalFindings: allFindings.length,
      filesWithFindings: state.completedFiles.filter(f => f.findings.length > 0).length,
    });

    // Post individual review comments
    for (const finding of allFindings) {
      try {
        await postReviewComment(owner, repo, prNumber, finding);
      } catch (error: any) {
        logger.error('Failed to post review comment', { pattern: finding.pattern, error: error.message });
      }
    }

    // Submit final review summary
    try {
      await submitFinalReview(owner, repo, prNumber, allFindings);
    } catch (error: any) {
      logger.error('Failed to submit final review', { error: error.message });
    }

    // Slack alert for critical findings
    if (criticals.length > 0) {
      await alertSlack(owner, repo, prNumber, criticals);
    }
  } else {
    logger.info('Skipping GitHub review comment posting and summary submission (repository scan)');
  }

  // Clean up checkpoint on success
  await deleteCheckpoint(runId);

  // Build report
  const duration = Date.now() - startTime;
  const report: AnalysisReport = {
    runId,
    repo: `${owner}/${repo}`,
    prNumber,
    totalFiles: state.completedFiles.length + state.pendingFiles.length,
    filesAnalyzed: state.completedFiles.length,
    totalFindings: allFindings.length,
    criticalFindings: criticals.length,
    highFindings: allFindings.filter(f => f.severity === 'high').length,
    mediumFindings: allFindings.filter(f => f.severity === 'medium').length,
    findings: allFindings,
    duration: `${(duration / 1000).toFixed(1)}s`,
    modelsUsed: [...new Set(allFindings.map(f => f.modelUsed))],
    timestamp: new Date().toISOString(),
  };

  logger.info('Analysis complete', {
    runId,
    duration: report.duration,
    totalFindings: report.totalFindings,
    criticalFindings: report.criticalFindings,
  });

  if (onProgress) {
    onProgress({
      type: 'complete',
      summary: {
        totalFindings: report.totalFindings,
        criticalFindings: report.criticalFindings,
        highFindings: report.highFindings,
        mediumFindings: report.mediumFindings,
        duration: report.duration,
      },
    });
  }

  return report;
}

// Analyze from CLI arguments (for GitHub Action or direct use)
export async function analyzeFromCLI(
  owner: string, repo: string, prNumber: number, headSha: string
): Promise<AnalysisReport> {
  const payload: WebhookPayload = {
    action: 'opened',
    number: prNumber,
    pull_request: {
      number: prNumber,
      title: `PR #${prNumber}`,
      body: '',
      head: { sha: headSha, ref: 'feature-branch' },
      base: { ref: 'main' },
      user: { login: 'cli-user' },
    },
    repository: {
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: { login: owner },
    },
  };

  return analyzePR(payload);
}
