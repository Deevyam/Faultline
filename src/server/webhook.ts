import express from 'express';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { handlePullRequest, analyzePR, getPRDetails, getRepositoryDefaultBranch } from '../agent';
import { logger } from '../utils/logger';
import { WebhookPayload } from '../types';
import { createMcpServer } from './mcpServer';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { EventEmitter } from 'events';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  if (req.path.startsWith('/mcp/')) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ---- Dashboard ----
// In dev (ts-node): __dirname = src/server → resolve to src/dashboard/dist
// In prod (compiled): __dirname = dist/server → resolve to src/dashboard/dist via project root
const projectRoot = path.resolve(__dirname, '..', '..');
const dashboardDir = path.join(projectRoot, 'src', 'dashboard', 'dist');
app.use('/dashboard', express.static(dashboardDir));

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'faultline',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint
app.get('/status', (_req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ---- Real-time Event Streaming & PR Trigger ----
const liveEvents = new EventEmitter();
let currentRunState: any = null;

function handleLiveEvent(event: any) {
  if (!event || !event.type) return;

  if (event.type === 'start') {
    currentRunState = {
      repo: event.repo,
      prNumber: event.prNumber,
      prTitle: event.prTitle,
      prBody: event.prBody,
      files: event.files.map((name: string) => ({
        name,
        status: 'queued',
        progress: 0,
        phase: 'Queued',
        findings: []
      })),
      running: true,
      totalFindings: 0,
      criticalCount: 0,
      llamaCalls: 0,
      claudeCalls: 0,
      filesAnalyzed: 0,
      phase1Model: event.phase1Model || 'Llama 8B',
      phase2Model: event.phase2Model || 'Claude 3.7'
    };
  } else if (currentRunState) {
    if (event.type === 'file_start') {
      const file = currentRunState.files[event.fileIndex];
      if (file) {
        file.status = 'scanning';
        file.phase = event.phase || 'Scanning...';
        file.progress = 0;
      }
      currentRunState.llamaCalls += 1;
    } else if (event.type === 'file_progress') {
      const file = currentRunState.files[event.fileIndex];
      if (file) {
        file.progress = event.progress;
        file.phase = event.phase || file.phase;
      }
    } else if (event.type === 'file_complete') {
      const file = currentRunState.files[event.fileIndex];
      if (file) {
        file.status = event.status;
        file.progress = 100;
        file.findings = event.findings;
        file.phase = event.findings.length > 0
          ? `Complete — ${event.findings.length} issue${event.findings.length > 1 ? 's' : ''} detected`
          : 'Complete — No issues found';
      }
      currentRunState.filesAnalyzed += 1;
      currentRunState.totalFindings += event.findings.length;
      currentRunState.criticalCount += event.findings.filter((f: any) => f.severity === 'critical').length;
      currentRunState.claudeCalls += event.findings.length > 0 ? 1 : 0;
    } else if (event.type === 'complete') {
      currentRunState.running = false;
    }
  }

  liveEvents.emit('message', event);
}

// REST Endpoint to post live status updates (usually from CLI)
app.post('/api/live-status', (req, res) => {
  handleLiveEvent(req.body);
  res.sendStatus(200);
});

// SSE endpoint for the dashboard frontend
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state if something is running or was recently completed
  if (currentRunState) {
    res.write(`data: ${JSON.stringify({ type: 'init', state: currentRunState })}\n\n`);
  }

  const listener = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  liveEvents.on('message', listener);

  req.on('close', () => {
    liveEvents.off('message', listener);
  });
});

// Helper to run a simulated real-time analysis for demonstration when credentials fail
async function runMockLiveAnalysis(owner: string, repo: string, prNumber: number, onEvent: (evt: any) => void) {
  const files = [
    'src/auth/jwt.ts',
    'src/db/connection.ts',
    'src/payment/stripe.ts',
    'src/utils/logger.ts',
    'src/routes/users.ts'
  ];

  const mockFindings: Record<string, any[]> = {
    'src/db/connection.ts': [
      {
        pattern: 'Missing Timeouts',
        severity: 'critical',
        line: 14,
        scenario: 'Database connection is established without a timeout parameter. Under high load or network partition, threads will hang indefinitely.',
        fix: 'const client = new MongoClient(uri, {\n  connectTimeoutMS: 5000,\n  socketTimeoutMS: 30000\n});'
      }
    ],
    'src/payment/stripe.ts': [
      {
        pattern: 'Non-Idempotent Operations',
        severity: 'critical',
        line: 35,
        scenario: 'Stripe charge is retried without an idempotency key. Network retry will charge the customer twice.',
        fix: 'const charge = await stripe.charges.create({\n  amount,\n  currency: "usd",\n  customer\n}, {\n  idempotencyKey: `charge_${orderId}`\n});'
      },
      {
        pattern: 'Swallowed Errors',
        severity: 'medium',
        line: 52,
        scenario: 'Catch block catches all errors but ignores them, potentially leaving the transaction in an inconsistent state.',
        fix: 'try {\n  await stripe.charges.create(...);\n} catch (error) {\n  logger.error("Stripe payment failed", { error });\n  throw error;\n}'
      }
    ],
    'src/auth/jwt.ts': [
      {
        pattern: 'Unvalidated External Data',
        severity: 'high',
        line: 28,
        scenario: 'JWT payload parameters are used without validating structure or type, allowing potential runtime crashes.',
        fix: 'const decoded = jwt.verify(token, secret) as JwtPayload;\nif (!decoded || typeof decoded !== "object" || !decoded.userId) {\n  throw new Error("Invalid token payload");\n}'
      }
    ]
  };

  onEvent({
    type: 'start',
    repo: `${owner}/${repo}`,
    prNumber,
    prTitle: prNumber > 0 ? `Analyze JWT auth and payments` : `Repository Analysis: ${owner}/${repo}`,
    prBody: `This is a simulated real-time analysis because the local .env credentials (TRUEFOUNDRY_API_KEY/GITHUB_TOKEN) are expired or placeholders.`,
    files,
    phase1Model: 'Llama 3 70B',
    phase2Model: 'Claude 3.7 Sonnet'
  });

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    
    // File start
    onEvent({
      type: 'file_start',
      fileIndex: i,
      fileName,
      phase: 'Phase 1 - Fast scanning with Llama 3 70B...'
    });
    await sleep(1000);

    // Progress 1
    onEvent({
      type: 'file_progress',
      fileIndex: i,
      fileName,
      progress: 30,
      phase: 'Phase 1 - Fast scanning with Llama 3 70B...'
    });
    await sleep(800);

    // Phase 2 start
    onEvent({
      type: 'file_progress',
      fileIndex: i,
      fileName,
      progress: 50,
      phase: 'Phase 2 - Deep reasoning with Claude 3.7 Sonnet...'
    });
    await sleep(1000);

    // Progress 2
    onEvent({
      type: 'file_progress',
      fileIndex: i,
      fileName,
      progress: 80,
      phase: 'Phase 2 - Deep reasoning with Claude 3.7 Sonnet...'
    });
    await sleep(800);

    // Complete file
    const findings = mockFindings[fileName] || [];
    onEvent({
      type: 'file_complete',
      fileIndex: i,
      fileName,
      status: 'complete',
      findings
    });
    await sleep(600);
  }

  // Final complete
  const allFindings = Object.values(mockFindings).flat();
  onEvent({
    type: 'complete',
    summary: {
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      highFindings: allFindings.filter(f => f.severity === 'high').length,
      mediumFindings: allFindings.filter(f => f.severity === 'medium').length,
      duration: '18.0s'
    }
  });
}

// REST Endpoint to trigger a real PR or Repo analysis from the frontend UI
app.post('/api/analyze-pr', async (req, res) => {
  const { prUrl } = req.body;
  if (!prUrl) {
    res.status(400).json({ error: 'Missing prUrl' });
    return;
  }

  const githubPrRegex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const githubRepoRegex = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;

  let owner = '';
  let repo = '';
  let prNumber = 0;
  let isPr = false;

  const prMatch = prUrl.match(githubPrRegex);
  if (prMatch) {
    owner = prMatch[1];
    repo = prMatch[2];
    prNumber = parseInt(prMatch[3], 10);
    isPr = true;
  } else {
    const repoMatch = prUrl.match(githubRepoRegex);
    if (repoMatch) {
      owner = repoMatch[1];
      repo = repoMatch[2].replace(/\.git$/, '');
      prNumber = 0;
      isPr = false;
    } else {
      res.status(400).json({ error: 'Invalid GitHub PR or Repository URL' });
      return;
    }
  }

  // Return ACK immediately
  res.status(202).json({ message: 'Analysis triggered' });

  // Run review asynchronously in the background
  (async () => {
    try {
      logger.info(`Starting background analysis for ${isPr ? `PR #${prNumber}` : 'Repository'} from UI request`);
      
      let payload;
      if (isPr) {
        const prDetails = await getPRDetails(owner, repo, prNumber);
        payload = {
          action: 'opened' as const,
          number: prNumber,
          pull_request: {
            number: prNumber,
            title: prDetails.title,
            body: prDetails.body,
            head: { sha: prDetails.headSha, ref: prDetails.headRef },
            base: { ref: prDetails.baseRef },
            user: { login: prDetails.author },
          },
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
          },
        };
      } else {
        const defaultBranch = await getRepositoryDefaultBranch(owner, repo);
        payload = {
          action: 'opened' as const,
          number: 0,
          pull_request: {
            number: 0,
            title: `Repository Analysis: ${owner}/${repo}`,
            body: `Analyzing the codebase of ${owner}/${repo} at ${defaultBranch}`,
            head: { sha: defaultBranch, ref: defaultBranch },
            base: { ref: defaultBranch },
            user: { login: 'ui-user' },
          },
          repository: {
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
          },
        };
      }

      await analyzePR(payload, handleLiveEvent);
    } catch (err: any) {
      logger.warn(`Real analysis failed due to credential errors, falling back to simulated live analysis: ${err.message}`);
      // Fallback to simulated real-time analysis so user gets visual feedback
      await runMockLiveAnalysis(owner, repo, prNumber, handleLiveEvent);
    }
  })();
});

// ---- MCP Server Endpoints ----
const mcpTransports = new Map<string, SSEServerTransport>();

app.get('/mcp/sse', async (req, res) => {
  logger.info('Received connection request for MCP SSE');
  
  const transport = new SSEServerTransport('/mcp/messages', res);
  const sessionId = transport.sessionId;
  mcpTransports.set(sessionId, transport);
  
  logger.info(`Established MCP session: ${sessionId}`);

  res.on('close', () => {
    logger.info(`MCP session closed: ${sessionId}`);
    mcpTransports.delete(sessionId);
  });

  const server = createMcpServer();
  await server.connect(transport);
});

app.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId query parameter' });
    return;
  }

  const transport = mcpTransports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: `Session not found: ${sessionId}` });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// GitHub webhook endpoint
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Verify webhook signature
    if (process.env.GITHUB_WEBHOOK_SECRET) {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
      const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const payload: WebhookPayload = req.body instanceof Buffer 
      ? JSON.parse(req.body.toString()) 
      : req.body;

    // Only process PR events
    const event = req.headers['x-github-event'] as string;
    if (event !== 'pull_request') {
      res.status(200).json({ message: 'Event ignored', event });
      return;
    }

    // Only analyze on open/sync
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      res.status(200).json({ message: 'Action ignored', action: payload.action });
      return;
    }

    logger.info('Webhook received', {
      event,
      action: payload.action,
      repo: payload.repository.full_name,
      pr: payload.pull_request.number,
    });

    // Respond immediately (GitHub requires <10s ACK)
    res.status(202).json({
      message: 'Analysis started',
      runId: `${payload.repository.name}-pr-${payload.pull_request.number}`,
    });

    // Run analysis async (don't await in the request handler)
    handlePullRequest(payload, handleLiveEvent)
      .then(report => {
        logger.info('PR analysis complete via webhook', {
          runId: report.runId,
          findings: report.totalFindings,
          duration: report.duration,
        });
      })
      .catch(error => {
        logger.error('PR analysis failed via webhook', {
          error: error.message,
          repo: payload.repository.full_name,
          pr: payload.pull_request.number,
        });
      });

  } catch (error: any) {
    logger.error('Webhook handler error', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Faultline webhook server running on port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
  logger.info(`Dashboard: http://localhost:${PORT}/dashboard`);
  logger.info(`Webhook: POST http://localhost:${PORT}/webhook`);
});

export default app;
