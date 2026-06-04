import express from 'express';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { handlePullRequest } from '../agent';
import { logger } from '../utils/logger';
import { WebhookPayload } from '../types';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ---- Dashboard ----
const dashboardDir = path.join(__dirname, '..', 'dashboard');
app.use('/dashboard/assets', express.static(dashboardDir));

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
    handlePullRequest(payload)
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
