import { logger } from '../utils/logger';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface ListToolsResult {
  tools: McpTool[];
}

export class StatelessMcpClient {
  private url: string;
  private apiKey: string;

  constructor(url: string, apiKey: string) {
    this.url = url;
    this.apiKey = apiKey;
  }

  async listTools(): Promise<ListToolsResult> {
    logger.debug(`StatelessMcpClient listing tools for ${this.url}`);
    const res = await this.call('tools/list', {});
    return res.result as ListToolsResult;
  }

  async callTool(params: { name: string; arguments?: any }): Promise<any> {
    logger.debug(`StatelessMcpClient calling tool ${params.name} on ${this.url}`, { args: params.arguments });
    const res = await this.call('tools/call', params);
    return res.result.content;
  }

  private async call(method: string, params: any): Promise<any> {
    const payload = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 100000),
      method,
      params
    };

    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP error ${res.status}: ${res.statusText} - ${errBody}`);
    }

    const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!reader) throw new Error('No response body');

    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          return JSON.parse(trimmed.substring(5).trim());
        }
      }
    }
  }
}

const clientCache = new Map<string, StatelessMcpClient>();

export async function getMcpClient(serverName: string): Promise<StatelessMcpClient> {
  const cached = clientCache.get(serverName);
  if (cached) {
    return cached;
  }

  const gatewayUrl = process.env.TRUEFOUNDRY_MCP_GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('TRUEFOUNDRY_MCP_GATEWAY_URL is not set in environment');
  }

  const cleanGatewayUrl = gatewayUrl.replace(/\/$/, '');
  const sseUrl = `${cleanGatewayUrl}/${serverName}/server`;

  logger.info(`Creating StatelessMcpClient for server ${serverName} at ${sseUrl}`);

  const client = new StatelessMcpClient(sseUrl, process.env.TRUEFOUNDRY_API_KEY || '');
  clientCache.set(serverName, client);
  return client;
}

export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const client = await getMcpClient(serverName);
  
  logger.debug(`Calling MCP tool ${toolName} on server ${serverName}`, { args });
  const content = await client.callTool({
    name: toolName,
    arguments: args,
  });

  return content;
}

export function isMcpConfigured(): boolean {
  return !!process.env.TRUEFOUNDRY_MCP_GATEWAY_URL;
}
