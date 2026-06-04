import dotenv from 'dotenv';
dotenv.config();

import { analyzeFromCLI, initAgent } from './agent';
import { logger } from './utils/logger';

async function run() {
  try {
    const prNumber = parseInt(process.env.PR_NUMBER || '', 10);
    const repoFull = process.env.PR_REPO || '';
    const headSha = process.env.PR_HEAD_SHA || '';

    if (!prNumber || !repoFull || !headSha) {
      throw new Error('Missing required environment variables: PR_NUMBER, PR_REPO, PR_HEAD_SHA');
    }

    const [owner, repo] = repoFull.split('/');
    if (!owner || !repo) {
      throw new Error('PR_REPO must be in owner/name format');
    }

    logger.info('GitHub Action starting', { prNumber, repo: repoFull, sha: headSha });

    await initAgent();
    const report = await analyzeFromCLI(owner, repo, prNumber, headSha);

    // Output for GitHub Actions
    console.log(`::set-output name=total_findings::${report.totalFindings}`);
    console.log(`::set-output name=critical_findings::${report.criticalFindings}`);
    console.log(`::set-output name=high_findings::${report.highFindings}`);
    console.log(`::set-output name=medium_findings::${report.mediumFindings}`);

    if (report.criticalFindings > 0 && process.env.FAIL_ON_CRITICAL !== 'false') {
      console.log(`::error::Faultline found ${report.criticalFindings} critical resilience issues`);
      process.exit(1);
    }

    logger.info('GitHub Action completed', {
      findings: report.totalFindings,
      duration: report.duration,
    });

  } catch (error: any) {
    console.log(`::error::${error.message}`);
    logger.error('GitHub Action failed', { error: error.message });
    process.exit(1);
  }
}

run();
