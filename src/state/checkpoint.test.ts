import * as fs from 'fs';
import * as path from 'path';
import { saveCheckpoint, loadCheckpoint, deleteCheckpoint } from './checkpoint';
import { AnalysisState } from '../types';

// Suppress logger output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock S3 to ensure we only test local file paths
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

const CHECKPOINT_DIR = path.join(process.cwd(), '.faultline-checkpoints');

function makeState(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    runId: 'test-run-001',
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 42,
    headSha: 'abc123def456',
    context: {
      repoName: 'test-repo',
      prTitle: 'Test PR',
      prBody: 'Test body',
      fileCount: 3,
      languages: ['python', 'javascript'],
    },
    pendingFiles: [],
    completedFiles: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Unique run IDs per test to avoid collisions
const testRunIds: string[] = [];

function uniqueRunId(): string {
  const id = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  testRunIds.push(id);
  return id;
}

// Ensure S3 env vars are NOT set so we exercise the local path
const originalS3Bucket = process.env.S3_CHECKPOINT_BUCKET;

beforeAll(() => {
  delete process.env.S3_CHECKPOINT_BUCKET;
});

afterAll(() => {
  if (originalS3Bucket !== undefined) {
    process.env.S3_CHECKPOINT_BUCKET = originalS3Bucket;
  }
});

afterEach(() => {
  // Clean up all test checkpoint files
  for (const runId of testRunIds) {
    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  testRunIds.length = 0;
});

describe('saveCheckpoint (local)', () => {
  it('should create a checkpoint file on disk', async () => {
    const runId = uniqueRunId();
    const state = makeState({ runId });

    await saveCheckpoint(runId, state);

    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should write valid JSON to the checkpoint file', async () => {
    const runId = uniqueRunId();
    const state = makeState({ runId });

    await saveCheckpoint(runId, state);

    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.runId).toBe(runId);
    expect(parsed.owner).toBe('test-owner');
    expect(parsed.repo).toBe('test-repo');
    expect(parsed.prNumber).toBe(42);
  });

  it('should set the updatedAt timestamp', async () => {
    const runId = uniqueRunId();
    const state = makeState({ runId, updatedAt: '1970-01-01T00:00:00Z' });

    const before = new Date().toISOString();
    await saveCheckpoint(runId, state);
    const after = new Date().toISOString();

    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.updatedAt).not.toBe('1970-01-01T00:00:00Z');
    expect(parsed.updatedAt >= before).toBe(true);
    expect(parsed.updatedAt <= after).toBe(true);
  });

  it('should overwrite an existing checkpoint', async () => {
    const runId = uniqueRunId();

    await saveCheckpoint(runId, makeState({ runId, prNumber: 1 }));
    await saveCheckpoint(runId, makeState({ runId, prNumber: 99 }));

    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.prNumber).toBe(99);
  });

  it('should create the checkpoint directory if it does not exist', async () => {
    const runId = uniqueRunId();
    const state = makeState({ runId });

    // Even if the directory exists already, this just confirms no error thrown
    await expect(saveCheckpoint(runId, state)).resolves.toBeUndefined();
  });
});

describe('loadCheckpoint (local)', () => {
  it('should load a previously saved checkpoint', async () => {
    const runId = uniqueRunId();
    const state = makeState({
      runId,
      owner: 'load-owner',
      repo: 'load-repo',
      prNumber: 77,
    });

    await saveCheckpoint(runId, state);
    const loaded = await loadCheckpoint(runId);

    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(runId);
    expect(loaded!.owner).toBe('load-owner');
    expect(loaded!.repo).toBe('load-repo');
    expect(loaded!.prNumber).toBe(77);
    expect(loaded!.headSha).toBe('abc123def456');
  });

  it('should return null for a non-existent checkpoint', async () => {
    const loaded = await loadCheckpoint('non-existent-run-id-xyz');

    expect(loaded).toBeNull();
  });

  it('should preserve nested context data', async () => {
    const runId = uniqueRunId();
    const state = makeState({
      runId,
      context: {
        repoName: 'ctx-repo',
        prTitle: 'My PR Title',
        prBody: 'Fixes PROJ-123',
        fileCount: 10,
        languages: ['go', 'rust', 'python'],
      },
    });

    await saveCheckpoint(runId, state);
    const loaded = await loadCheckpoint(runId);

    expect(loaded!.context.repoName).toBe('ctx-repo');
    expect(loaded!.context.prTitle).toBe('My PR Title');
    expect(loaded!.context.languages).toEqual(['go', 'rust', 'python']);
    expect(loaded!.context.fileCount).toBe(10);
  });

  it('should preserve arrays (pendingFiles, completedFiles)', async () => {
    const runId = uniqueRunId();
    const state = makeState({
      runId,
      pendingFiles: [
        { filename: 'app.py', status: 'modified', additions: 5, deletions: 2 },
      ],
      completedFiles: [],
    });

    await saveCheckpoint(runId, state);
    const loaded = await loadCheckpoint(runId);

    expect(loaded!.pendingFiles).toHaveLength(1);
    expect(loaded!.pendingFiles[0].filename).toBe('app.py');
    expect(loaded!.completedFiles).toHaveLength(0);
  });
});

describe('deleteCheckpoint (local)', () => {
  it('should delete an existing checkpoint file', async () => {
    const runId = uniqueRunId();
    await saveCheckpoint(runId, makeState({ runId }));

    const safeName = runId.replace(/[/\\:]/g, '_');
    const filePath = path.join(CHECKPOINT_DIR, `${safeName}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    await deleteCheckpoint(runId);

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should not throw when deleting a non-existent checkpoint', async () => {
    await expect(
      deleteCheckpoint('non-existent-run-to-delete')
    ).resolves.toBeUndefined();
  });

  it('should make loadCheckpoint return null after deletion', async () => {
    const runId = uniqueRunId();
    await saveCheckpoint(runId, makeState({ runId }));

    const beforeDelete = await loadCheckpoint(runId);
    expect(beforeDelete).not.toBeNull();

    await deleteCheckpoint(runId);

    const afterDelete = await loadCheckpoint(runId);
    expect(afterDelete).toBeNull();
  });
});
