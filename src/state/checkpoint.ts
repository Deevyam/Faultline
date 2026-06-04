import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AnalysisState } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

let s3: S3Client | null = null;
const LOCAL_CHECKPOINT_DIR = path.join(process.cwd(), '.faultline-checkpoints');

function getS3Client(): S3Client | null {
  if (!process.env.S3_CHECKPOINT_BUCKET) return null;
  if (!s3) {
    s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return s3;
}

function getS3Key(runId: string): string {
  return `faultline/${runId}/state.json`;
}

function getLocalPath(runId: string): string {
  return path.join(LOCAL_CHECKPOINT_DIR, `${runId.replace(/[/\\:]/g, '_')}.json`);
}

export async function saveCheckpoint(runId: string, state: AnalysisState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  const body = JSON.stringify(state, null, 2);

  // Try S3 first
  const client = getS3Client();
  if (client && process.env.S3_CHECKPOINT_BUCKET) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: process.env.S3_CHECKPOINT_BUCKET,
        Key: getS3Key(runId),
        Body: body,
        ContentType: 'application/json',
      }));
      logger.debug('Checkpoint saved to S3', { runId });
      return;
    } catch (error: any) {
      logger.warn('S3 checkpoint save failed, falling back to local', { error: error.message });
    }
  }

  // Fallback to local file
  if (!fs.existsSync(LOCAL_CHECKPOINT_DIR)) {
    fs.mkdirSync(LOCAL_CHECKPOINT_DIR, { recursive: true });
  }
  fs.writeFileSync(getLocalPath(runId), body);
  logger.debug('Checkpoint saved locally', { runId });
}

export async function loadCheckpoint(runId: string): Promise<AnalysisState | null> {
  // Try S3 first
  const client = getS3Client();
  if (client && process.env.S3_CHECKPOINT_BUCKET) {
    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: process.env.S3_CHECKPOINT_BUCKET,
        Key: getS3Key(runId),
      }));
      const body = await response.Body?.transformToString();
      if (body) {
        logger.info('Checkpoint loaded from S3', { runId });
        return JSON.parse(body);
      }
    } catch (error: any) {
      if (error.name !== 'NoSuchKey') {
        logger.warn('S3 checkpoint load failed', { error: error.message });
      }
    }
  }

  // Fallback to local
  const localPath = getLocalPath(runId);
  if (fs.existsSync(localPath)) {
    const body = fs.readFileSync(localPath, 'utf-8');
    logger.info('Checkpoint loaded from local file', { runId });
    return JSON.parse(body);
  }

  return null;
}

export async function deleteCheckpoint(runId: string): Promise<void> {
  // Delete from S3
  const client = getS3Client();
  if (client && process.env.S3_CHECKPOINT_BUCKET) {
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_CHECKPOINT_BUCKET,
        Key: getS3Key(runId),
      }));
      logger.debug('Checkpoint deleted from S3', { runId });
    } catch (error: any) {
      logger.warn('S3 checkpoint delete failed', { error: error.message });
    }
  }

  // Delete local
  const localPath = getLocalPath(runId);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    logger.debug('Checkpoint deleted locally', { runId });
  }
}
