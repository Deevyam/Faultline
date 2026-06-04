// All shared types for the Faultline project

export type PatternType =
  | 'MISSING_TIMEOUT'
  | 'MISSING_RETRY'
  | 'NON_IDEMPOTENT'
  | 'SILENT_EXCEPTION'
  | 'UNBOUNDED_POOL'
  | 'RATE_LIMIT_UNHANDLED'
  | 'CASCADE_UNGUARDED'
  | 'NO_DEAD_LETTER';

export type Severity = 'critical' | 'high' | 'medium';
export type Confidence = 'high' | 'medium' | 'low';
export type BlastRadius = 'line' | 'function' | 'service-wide';

export interface RawFinding {
  pattern: PatternType;
  line: number;
  snippet: string;
  confidence: Confidence;
}

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
  modelUsed: string;
  scanDurationMs: number;
}

export interface EnrichedFinding {
  pattern: PatternType;
  severity: Severity;
  scenario: string;
  fix: string;
  blastRadius: BlastRadius;
  incidentRef: string;
  filePath: string;
  lineNumber: number;
  snippet: string;
  commitSha: string;
  confidence: Confidence;
  modelUsed: string;
}

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ServiceContext {
  repoName: string;
  prTitle: string;
  prBody: string;
  jiraTicket?: JiraTicket;
  fileCount: number;
  languages: string[];
}

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  type: string;
}

export interface AnalysisState {
  runId: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  context: ServiceContext;
  pendingFiles: PRFile[];
  completedFiles: CompletedFile[];
  startedAt: string;
  updatedAt: string;
}

export interface CompletedFile {
  file: PRFile;
  findings: EnrichedFinding[];
  analyzedAt: string;
}

export interface WebhookPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string;
    head: { sha: string; ref: string };
    base: { ref: string };
    user: { login: string };
  };
  repository: {
    name: string;
    full_name: string;
    owner: { login: string };
  };
}

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
  phase1Model: string;
  phase2Model: string;
  timeoutMs: number;
}

export interface GuardrailResult {
  passed: boolean;
  action: 'allow' | 'block' | 'redact';
  reason?: string;
  redactedContent?: string;
  originalContent?: string;
}

export interface AnalysisReport {
  runId: string;
  repo: string;
  prNumber: number;
  totalFiles: number;
  filesAnalyzed: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  findings: EnrichedFinding[];
  duration: string;
  modelsUsed: string[];
  timestamp: string;
}
