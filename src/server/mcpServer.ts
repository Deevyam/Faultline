import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzePR } from '../agent/analyzer';
import { initGitHub } from '../mcp/github';
import { WebhookPayload } from '../types';
import { logger } from '../utils/logger';
import { phase1Scan, phase2Reason } from '../gateway/client';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'faultline-server',
    version: '1.0.0',
  });

  // Tool 1: Full PR Analysis
  server.tool(
    'analyze_pr',
    'Trigger Faultline analysis on a specific GitHub Pull Request',
    {
      owner: z.string().describe('The GitHub organization or username (e.g. "facebook")'),
      repo: z.string().describe('The repository name (e.g. "react")'),
      prNumber: z.number().describe('The pull request number'),
    },
    async ({ owner, repo, prNumber }) => {
      logger.info(`MCP Tool call: analyze_pr for ${owner}/${repo}#${prNumber}`);
      
      try {
        // Initialize Octokit client using the configuration
        const octokit = initGitHub();
        
        logger.info('Fetching PR details from GitHub API...');
        const { data: pr } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });

        const payload: WebhookPayload = {
          action: 'opened',
          number: prNumber,
          pull_request: {
            number: prNumber,
            title: pr.title,
            body: pr.body || '',
            head: {
              sha: pr.head.sha,
              ref: pr.head.ref,
            },
            base: {
              ref: pr.base.ref,
            },
            user: {
              login: pr.user?.login || 'unknown',
            },
          },
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: {
              login: owner,
            },
          },
        };

        // Trigger standard analysis
        logger.info('Starting PR analysis via MCP tool...');
        const report = await analyzePR(payload);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('MCP analyze_pr tool failed', { error: error.message });
        return {
          content: [
            {
              type: 'text',
              text: `Error running analysis: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: Ad-hoc Code Scan
  server.tool(
    'analyze_code_resilience',
    'Scan raw code for resilience anti-patterns and get recommended fixes',
    {
      code: z.string().describe('The raw source code to analyze'),
      filename: z.string().describe('The name of the file (to determine language and context)'),
    },
    async ({ code, filename }) => {
      logger.info(`MCP Tool call: analyze_code_resilience for ${filename}`);
      
      try {
        const { initGateway } = await import('../gateway/client');
        initGateway();
        
        const scan = await phase1Scan(code, filename);
        const enrichedFindings = [];
        
        for (const rawFinding of scan.findings) {
          const enriched = await phase2Reason(
            code,
            rawFinding,
            {
              repoName: 'sandbox',
              prTitle: 'Ad-hoc Scan',
              prBody: '',
              fileCount: 1,
              languages: [filename.split('.').pop() || ''],
            },
            filename,
            'sandbox-commit'
          );
          if (enriched) {
            enrichedFindings.push(enriched);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(enrichedFindings, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('MCP analyze_code_resilience tool failed', { error: error.message });
        return {
          content: [
            {
              type: 'text',
              text: `Error running analysis: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
