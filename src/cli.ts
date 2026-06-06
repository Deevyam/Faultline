import dotenv from 'dotenv';
dotenv.config();

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { analyzeFromCLI, initAgent } from './agent';
import { buildCLIReport } from './utils/formatter';
import { logger } from './utils/logger';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { phase1Scan, phase2Reason } from './gateway/client';
import { AnalysisReport, EnrichedFinding } from './types';

const banner = `
${chalk.red('╔═══════════════════════════════════════════════════╗')}
${chalk.red('║')}  ${chalk.bold.white('⚡ FAULTLINE')} ${chalk.gray('— Resilience-First PR Review')}     ${chalk.red('║')}
${chalk.red('║')}  ${chalk.gray('Finds silent failures before they cause outages')}  ${chalk.red('║')}
${chalk.red('╚═══════════════════════════════════════════════════╝')}
`;

async function main() {
  console.log(banner);

  const argv = await yargs(hideBin(process.argv))
    .option('pr', {
      type: 'number',
      description: 'PR number to analyze',
      demandOption: false,
    })
    .option('repo', {
      type: 'string',
      description: 'Repository in owner/name format',
      demandOption: false,
    })
    .option('sha', {
      type: 'string',
      description: 'Head SHA of the PR',
      demandOption: false,
    })
    .option('self-review', {
      type: 'boolean',
      description: 'Run Faultline on its own codebase',
      default: false,
    })
    .option('json', {
      type: 'boolean',
      description: 'Output results as JSON',
      default: false,
    })
    .help()
    .argv;

  const spinner = ora('Initializing Faultline agent...').start();

  try {
    if (!argv['self-review']) {
      if (!argv.pr || !argv.repo || !argv.sha) {
        spinner.fail('Validation failed');
        console.error(chalk.red('\nError: --pr, --repo, and --sha are required unless running with --self-review'));
        process.exit(1);
      }

      const [owner, repo] = argv.repo.split('/');
      if (!owner || !repo) {
        spinner.fail('Validation failed');
        console.error(chalk.red('\nError: --repo must be in owner/name format'));
        process.exit(1);
      }

      await initAgent();
      spinner.succeed('Agent initialized');

      spinner.start(`Analyzing PR #${argv.pr} in ${argv.repo}...`);
      const report = await analyzeFromCLI(owner, repo, argv.pr, argv.sha);
      spinner.stop();

      if (argv.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(buildCLIReport(report));
      }

      // Exit with error code if critical findings found
      if (report.criticalFindings > 0) {
        console.log(chalk.red(`\n❌ ${report.criticalFindings} critical finding(s) — blocking merge`));
        process.exit(1);
      } else if (report.totalFindings > 0) {
        console.log(chalk.yellow(`\n⚠️  ${report.totalFindings} finding(s) — review recommended`));
        process.exit(0);
      } else {
        console.log(chalk.green('\n✅ No resilience issues found — code looks solid!'));
        process.exit(0);
      }
    } else {
      // Local self-review mode
      spinner.succeed('Agent initialized (Local / Offline mode)');

      const filePath = path.join(__dirname, 'test-samples', 'bad-code.py');
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`Error: Local test sample file not found at ${filePath}`));
        process.exit(1);
      }

      spinner.start(`Analyzing local test sample: ${chalk.cyan('bad-code.py')}...`);

      const code = fs.readFileSync(filePath, 'utf-8');
      const startTime = Date.now();

      // Run Phase 1
      const scan = await phase1Scan(code, 'bad-code.py');

      // Run Phase 2
      const context = {
        repoName: 'local/faultline',
        prTitle: 'Self-Review Scan',
        prBody: 'Analyzing local test samples for resilience issues',
        fileCount: 1,
        languages: ['python'],
      };

      const enrichedFindings: EnrichedFinding[] = [];
      for (const rawFinding of scan.findings) {
        const enriched = await phase2Reason(
          code,
          rawFinding,
          context,
          'bad-code.py',
          'self-review'
        );
        if (enriched) {
          enrichedFindings.push(enriched);
        }
      }

      spinner.stop();

      const duration = Date.now() - startTime;
      const report: AnalysisReport = {
        runId: 'local-self-review',
        repo: 'local/faultline',
        prNumber: 0,
        totalFiles: 1,
        filesAnalyzed: 1,
        totalFindings: enrichedFindings.length,
        criticalFindings: enrichedFindings.filter(f => f.severity === 'critical').length,
        highFindings: enrichedFindings.filter(f => f.severity === 'high').length,
        mediumFindings: enrichedFindings.filter(f => f.severity === 'medium').length,
        findings: enrichedFindings,
        duration: `${(duration / 1000).toFixed(1)}s`,
        modelsUsed: [...new Set(enrichedFindings.map(f => f.modelUsed))],
        timestamp: new Date().toISOString(),
      };

      if (argv.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(buildCLIReport(report));
      }

      if (report.totalFindings > 0) {
        console.log(chalk.yellow(`\n⚠️  ${report.totalFindings} local resilience issue(s) detected.`));
      } else {
        console.log(chalk.green('\n✅ No resilience issues found in local test sample!'));
      }
      process.exit(0);
    }

  } catch (error: any) {
    spinner.fail('Analysis failed');
    logger.error('CLI error', { error: error.message, stack: error.stack });
    console.error(chalk.red(`\nError: ${error.message}`));
    process.exit(2);
  }
}

main();
