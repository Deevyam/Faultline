import { Octokit } from '@octokit/rest';
import { PRFile, EnrichedFinding } from '../types';
import { logger } from '../utils/logger';
import { formatFindingComment, buildReviewSummary } from '../utils/formatter';

let octokit: Octokit;

export function initGitHub(): Octokit {
  octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: { timeout: 10000 },
  });
  logger.info('GitHub client initialized');
  return octokit;
}

function getOctokit(): Octokit {
  if (!octokit) return initGitHub();
  return octokit;
}

export async function getPRFiles(
  owner: string, repo: string, prNumber: number
): Promise<PRFile[]> {
  logger.info('Fetching PR files', { owner, repo, prNumber });
  const client = getOctokit();

  const { data } = await client.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 100,
  });

  const files: PRFile[] = data.map(f => ({
    filename: f.filename,
    status: f.status as PRFile['status'],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));

  logger.info(`Fetched ${files.length} PR files`, { owner, repo, prNumber });
  return files;
}

export async function getFileContent(
  owner: string, repo: string, path: string, ref: string
): Promise<string> {
  logger.debug('Fetching file content', { owner, repo, path, ref });
  const client = getOctokit();

  try {
    const { data } = await client.repos.getContent({
      owner, repo, path, ref,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    throw new Error(`No content found for ${path}`);
  } catch (error: any) {
    logger.error('Failed to fetch file content', { path, error: error.message });
    throw error;
  }
}

export async function postReviewComment(
  owner: string, repo: string, prNumber: number,
  finding: EnrichedFinding
): Promise<void> {
  logger.info('Posting review comment', {
    owner, repo, prNumber,
    pattern: finding.pattern,
    file: finding.filePath,
    line: finding.lineNumber,
  });
  const client = getOctokit();

  try {
    await client.pulls.createReviewComment({
      owner, repo,
      pull_number: prNumber,
      commit_id: finding.commitSha,
      path: finding.filePath,
      line: finding.lineNumber,
      body: formatFindingComment(finding),
    });
  } catch (error: any) {
    // If inline comment fails (e.g. line not in diff), post as issue comment
    logger.warn('Inline comment failed, falling back to issue comment', {
      error: error.message,
      file: finding.filePath,
    });
    await client.issues.createComment({
      owner, repo,
      issue_number: prNumber,
      body: formatFindingComment(finding),
    });
  }
}

export async function submitFinalReview(
  owner: string, repo: string, prNumber: number,
  findings: EnrichedFinding[]
): Promise<void> {
  const client = getOctokit();
  const hasCritical = findings.some(f => f.severity === 'critical');
  const event = hasCritical ? 'REQUEST_CHANGES' as const : 'COMMENT' as const;

  logger.info('Submitting final review', {
    owner, repo, prNumber,
    event,
    findingsCount: findings.length,
  });

  await client.pulls.createReview({
    owner, repo,
    pull_number: prNumber,
    event,
    body: buildReviewSummary(findings),
  });
}
