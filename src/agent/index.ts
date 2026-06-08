import { analyzePR, analyzeFromCLI } from './analyzer';
import { initGateway } from '../gateway/client';
import { initGitHub, getPRDetails, getRepositoryDefaultBranch } from '../mcp/github';
import { logger } from '../utils/logger';
import { AnalysisReport, WebhookPayload } from '../types';

export async function initAgent(): Promise<void> {
  logger.info('Initializing Faultline agent...');
  
  // Initialize connections
  initGateway();
  initGitHub();
  
  logger.info('Faultline agent initialized successfully');
}

export async function handlePullRequest(
  payload: WebhookPayload,
  onProgress?: (event: any) => void
): Promise<AnalysisReport> {
  await initAgent();
  return analyzePR(payload, onProgress);
}

export { analyzePR, analyzeFromCLI, getPRDetails, getRepositoryDefaultBranch };
