import { EnrichedFinding } from '../types';
import { logger } from '../utils/logger';
import { isMcpConfigured, callMcpTool, getMcpClient } from './client';

function findTool(names: string[], patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    const match = names.find(n => n.toLowerCase().includes(pattern.toLowerCase()));
    if (match) return match;
  }
  return undefined;
}

export async function alertSlack(
  owner: string, repo: string, prNumber: number,
  criticals: EnrichedFinding[]
): Promise<void> {
  const text = `🚨 Faultline found ${criticals.length} critical resilience issues in ${owner}/${repo}#${prNumber}`;
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Faultline: Critical Resilience Issues Found',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${owner}/${repo}` },
        { type: 'mrkdwn', text: `*PR:*\n<https://github.com/${owner}/${repo}/pull/${prNumber}|#${prNumber}>` },
        { type: 'mrkdwn', text: `*Critical Issues:*\n${criticals.length}` },
      ],
    },
    { type: 'divider' },
    ...criticals.slice(0, 5).map(f => ({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `*${f.pattern}* in \`${f.filePath}:${f.lineNumber}\`\n${f.scenario.substring(0, 200)}`,
      },
    })),
  ];

  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('slack');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['slack_post_message', 'post_message', 'send_message', 'slack_send_message']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for alertSlack`);
        await callMcpTool('slack', toolName, {
          channel_id: process.env.SLACK_ALERT_CHANNEL || '',
          channel: process.env.SLACK_ALERT_CHANNEL || '',
          text,
          blocks
        });
        return;
      }
    } catch (error: any) {
      logger.warn('Failed to send Slack alert via MCP, falling back to REST', { error: error.message });
    }
  }

  // REST API logic fallback
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_ALERT_CHANNEL) {
    logger.debug('Slack not configured (missing token/channel), skipping alert');
    return;
  }

  logger.info('Sending Slack alert via REST API', {
    repo: `${owner}/${repo}`,
    prNumber,
    criticalCount: criticals.length,
  });

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: process.env.SLACK_ALERT_CHANNEL,
        blocks,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn('Slack API returned error', { status: response.status });
    } else {
      logger.info('Slack alert sent successfully');
    }
  } catch (error: any) {
    logger.warn('Failed to send Slack alert via REST API', { error: error.message });
  }
}
