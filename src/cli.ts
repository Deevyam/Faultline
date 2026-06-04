import dotenv from 'dotenv';
dotenv.config();

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { analyzeFromCLI, initAgent } from './agent';
import { buildCLIReport } from './utils/formatter';
import { logger } from './utils/logger';
import chalk from 'chalk';
import ora from 'ora';

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
      demandOption: true,
    })
    .option('repo', {
      type: 'string',
      description: 'Repository in owner/name format',
      demandOption: true,
    })
    .option('sha', {
      type: 'string',
      description: 'Head SHA of the PR',
      demandOption: true,
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

  const [owner, repo] = argv.repo.split('/');
  if (!owner || !repo) {
    console.error(chalk.red('Error: --repo must be in owner/name format'));
    process.exit(1);
  }

  const spinner = ora('Initializing Faultline agent...').start();

  try {
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

  } catch (error: any) {
    spinner.fail('Analysis failed');
    logger.error('CLI error', { error: error.message, stack: error.stack });
    console.error(chalk.red(`\nError: ${error.message}`));
    process.exit(2);
  }
}

main();
