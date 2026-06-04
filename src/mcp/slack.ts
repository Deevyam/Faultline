import { EnrichedFinding } from '../types';
import { logger } from '../utils/logger';

export async function alertSlack(
  owner: string, repo: string, prNumber: number,
  criticals: EnrichedFinding[]
): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_ALERT_CHANNEL) {
    logger.debug('Slack not configured, skipping alert');
    return;
  }

  logger.info('Sending Slack alert for critical findings', {
    repo: `${owner}/${repo}`,
    prNumber,
    criticalCount: criticals.length,
  });

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
        text: `🚨 Faultline found ${criticals.length} critical resilience issues in ${owner}/${repo}#${prNumber}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn('Slack API returned error', { status: response.status });
    } else {
      logger.info('Slack alert sent successfully');
    }
  } catch (error: any) {
    logger.warn('Failed to send Slack alert', { error: error.message });
    // Non-critical — don't throw
  }
}
