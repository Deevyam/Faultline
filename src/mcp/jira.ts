import { JiraTicket } from '../types';
import { logger } from '../utils/logger';

const JIRA_TICKET_REGEX = /([A-Z][A-Z0-9]+-\d+)/g;

export function extractJiraKey(text: string): string | null {
  const match = text.match(JIRA_TICKET_REGEX);
  return match ? match[0] : null;
}

export async function getJiraContext(prBody: string): Promise<JiraTicket | undefined> {
  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_API_TOKEN) {
    logger.debug('Jira not configured, skipping');
    return undefined;
  }

  const ticketKey = extractJiraKey(prBody || '');
  if (!ticketKey) {
    logger.debug('No Jira ticket found in PR body');
    return undefined;
  }

  logger.info('Fetching Jira ticket', { ticketKey });

  try {
    const url = `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${ticketKey}`;
    const auth = Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
    ).toString('base64');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn('Jira API returned error', { status: response.status, ticketKey });
      return undefined;
    }

    const data = await response.json() as any;
    return {
      key: data.key,
      summary: data.fields?.summary || '',
      description: data.fields?.description?.content?.[0]?.content?.[0]?.text || '',
      type: data.fields?.issuetype?.name || 'Unknown',
    };
  } catch (error: any) {
    logger.warn('Failed to fetch Jira ticket', { ticketKey, error: error.message });
    return undefined;
  }
}
