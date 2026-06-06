import { JiraTicket } from '../types';
import { logger } from '../utils/logger';
import { isMcpConfigured, callMcpTool, getMcpClient } from './client';

const JIRA_TICKET_REGEX = /([A-Z][A-Z0-9]+-\d+)/g;

export function extractJiraKey(text: string): string | null {
  const match = text.match(JIRA_TICKET_REGEX);
  return match ? match[0] : null;
}

function findTool(names: string[], patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    const match = names.find(n => n.toLowerCase().includes(pattern.toLowerCase()));
    if (match) return match;
  }
  return undefined;
}

export async function getJiraContext(prBody: string): Promise<JiraTicket | undefined> {
  const ticketKey = extractJiraKey(prBody || '');
  if (!ticketKey) {
    logger.debug('No Jira ticket found in PR body');
    return undefined;
  }

  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('jira');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['get_jira_issue', 'getjiraissue', 'get_issue', 'getissue']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for getJiraContext`);
        const result = await callMcpTool('jira', toolName, {
          issueIdOrKey: ticketKey,
          issue_id_or_key: ticketKey,
          issueKey: ticketKey,
          key: ticketKey
        });
        
        const textContent = result.find((c: any) => c.type === 'text')?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          // Standard Jira structure from API/MCP responses
          return {
            key: parsed.key || ticketKey,
            summary: parsed.fields?.summary || parsed.summary || '',
            description: parsed.fields?.description?.content?.[0]?.content?.[0]?.text || parsed.description || '',
            type: parsed.fields?.issuetype?.name || parsed.type || 'Unknown',
          };
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch Jira ticket via MCP, falling back to REST', { error: error.message });
    }
  }

  // REST API logic fallback
  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_API_TOKEN) {
    logger.debug('Jira not configured (missing baseUrl/token), skipping REST context fetch');
    return undefined;
  }

  logger.info('Fetching Jira ticket via REST API', { ticketKey });

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
      logger.warn('Jira REST API returned error', { status: response.status, ticketKey });
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
    logger.warn('Failed to fetch Jira ticket via REST API', { ticketKey, error: error.message });
    return undefined;
  }
}
