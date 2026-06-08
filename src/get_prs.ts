import dotenv from 'dotenv';
dotenv.config();

class StatelessMcpClient {
  private url: string;
  private apiKey: string;

  constructor(url: string, apiKey: string) {
    this.url = url;
    this.apiKey = apiKey;
  }

  async callTool(params: { name: string; arguments?: any }) {
    const res = await this.call('tools/call', params);
    return res.result;
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

async function run() {
  const url = 'https://gateway.truefoundry.ai/deevyam/mcp/github/server';
  const client = new StatelessMcpClient(url, process.env.TRUEFOUNDRY_API_KEY || '');
  try {
    const files = await client.callTool({
      name: 'get_file_contents',
      arguments: {
        owner: 'Deevyam',
        repo: 'Hackathon-PAMC',
        path: ''
      }
    });
    console.log('Result:', JSON.stringify(files, null, 2).substring(0, 1000));
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

run();
