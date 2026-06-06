import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import EventSource from 'eventsource';
import { logger } from '../utils/logger';

// Polyfill EventSource for Node.js
(globalThis as any).EventSource = EventSource;

const clientCache = new Map<string, Client>();

export async function getMcpClient(serverName: string): Promise<Client> {
  const cached = clientCache.get(serverName);
  if (cached) {
    return cached;
  }

  const gatewayUrl = process.env.TRUEFOUNDRY_MCP_GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('TRUEFOUNDRY_MCP_GATEWAY_URL is not set in environment');
  }

  const cleanGatewayUrl = gatewayUrl.replace(/\/$/, '');
  const sseUrl = new URL(`${cleanGatewayUrl}/${serverName}/server`);

  logger.info(`Connecting to MCP server ${serverName} at ${sseUrl.toString()}`);

  const transport = new SSEClientTransport(sseUrl, {
    requestInit: {
      headers: {
        'Authorization': `Bearer ${process.env.TRUEFOUNDRY_API_KEY || ''}`,
      },
    },
  });

  const client = new Client(
    { name: 'faultline-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  clientCache.set(serverName, client);
  logger.info(`Successfully connected to MCP server: ${serverName}`);
  return client;
}

export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const client = await getMcpClient(serverName);
  
  logger.debug(`Calling MCP tool ${toolName} on server ${serverName}`, { args });
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  if (result.isError) {
    throw new Error(`MCP tool call to ${serverName}/${toolName} failed: ${JSON.stringify(result.content)}`);
  }

  return result.content;
}

export function isMcpConfigured(): boolean {
  return !!process.env.TRUEFOUNDRY_MCP_GATEWAY_URL;
}
