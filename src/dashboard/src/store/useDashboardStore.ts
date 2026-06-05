import { create } from 'zustand';

export interface Finding {
  pattern: string;
  severity: 'critical' | 'high' | 'medium';
  line: number;
  scenario: string;
  fix: string;
}

export interface FileData {
  name: string;
  delay: number;
  phase1Time: number;
  phase2Time: number;
  model: string;
  modelPhase2: string | null;
  findings: Finding[];
  // Runtime state
  status: 'queued' | 'scanning' | 'complete' | 'error';
  progress: number; // 0 to 100
  phase: string;
}

export interface GuardrailEvent {
  id: string;
  icon: string;
  text: string;
  timestamp: string;
}

export interface DashboardState {
  mode: 'demo' | 'live';
  running: boolean;
  startTime: number | null;
  elapsedTime: string;
  filesAnalyzed: number;
  totalFiles: number;
  totalFindings: number;
  criticalCount: number;
  llamaCalls: number;
  claudeCalls: number;
  currentFileIndex: number;
  activeNodeId: number | null;
  hoveredNodeId: number | null;
  files: FileData[];
  guardrailEvents: GuardrailEvent[];
  
  // Actions
  setMode: (mode: 'demo' | 'live') => void;
  setRunning: (running: boolean) => void;
  setStartTime: (time: number | null) => void;
  setElapsedTime: (time: string) => void;
  setActiveNodeId: (id: number | null) => void;
  setHoveredNodeId: (id: number | null) => void;
  updateFile: (index: number, updates: Partial<FileData>) => void;
  addGuardrailEvent: (icon: string, text: string) => void;
  incrementLlamaCalls: () => void;
  incrementClaudeCalls: () => void;
  resetSimulation: () => void;
}

const INITIAL_FILES: FileData[] = [
  {
    name: 'src/payments/charge.py',
    delay: 2200,
    phase1Time: 1200,
    phase2Time: 1800,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'MISSING_TIMEOUT',
        severity: 'critical',
        line: 47,
        scenario: 'The requests.post() call to the Stripe API on line 47 has no timeout parameter. Under network degradation, this will block the payment worker thread indefinitely, causing a cascading thread pool exhaustion across all payment processing.',
        fix: "response = requests.post(\n  stripe_url,\n  json=payload,\n  timeout=(3.05, 10)  # connect, read\n)",
      },
      {
        pattern: 'NON_IDEMPOTENT',
        severity: 'critical',
        line: 63,
        scenario: 'INSERT INTO charges without an idempotency key. If the Stripe webhook retries (which it will), duplicate charges will be created for the same payment intent, resulting in customers being double-charged.',
        fix: "db.execute(\n  \"INSERT INTO charges (user_id, amount, idempotency_key) \"\n  \"VALUES (%s, %s, %s) \"\n  \"ON CONFLICT (idempotency_key) DO NOTHING\",\n  user_id, amount, payment_intent_id\n)",
      },
    ],
  },
  {
    name: 'src/api/handlers.ts',
    delay: 2800,
    phase1Time: 1000,
    phase2Time: 1600,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'SILENT_EXCEPTION',
        severity: 'high',
        line: 112,
        scenario: 'The catch block on line 112 catches the payment processing error but only logs to console.debug(). In production, this means failed payment notifications will silently disappear with no alerting, no retry, and no audit trail.',
        fix: "try {\n  await processPaymentNotification(event);\n} catch (err) {\n  logger.error('Payment notification failed', {\n    error: err,\n    eventId: event.id,\n    customerId: event.customer_id\n  });\n  metrics.increment('payment.notification.failure');\n  throw err; // propagate for retry\n}",
      },
    ],
  },
  {
    name: 'src/db/connection.py',
    delay: 2500,
    phase1Time: 900,
    phase2Time: 1400,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'UNBOUNDED_POOL',
        severity: 'high',
        line: 23,
        scenario: 'create_engine() called with no pool_size or max_overflow constraints. Under traffic spikes, SQLAlchemy will open unlimited database connections until the PostgreSQL server hits max_connections and starts refusing all connections service-wide.',
        fix: "engine = create_engine(\n  DATABASE_URL,\n  pool_size=10,\n  max_overflow=5,\n  pool_timeout=30,\n  pool_pre_ping=True\n)",
      },
    ],
  },
  {
    name: 'src/services/email.py',
    delay: 2100,
    phase1Time: 1100,
    phase2Time: 1500,
    model: 'Llama 8B',
    modelPhase2: null,
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'MISSING_RETRY',
        severity: 'high',
        line: 38,
        scenario: 'SendGrid API call on line 38 has no retry logic. Transient 503 errors from SendGrid (which occur during their deployments ~2x/week) will cause permanent email delivery failures for password resets and order confirmations.',
        fix: "@retry(\n  stop=stop_after_attempt(3),\n  wait=wait_exponential(multiplier=1, max=10),\n  retry=retry_if_exception_type(\n    (ConnectionError, TimeoutError)\n  )\n)\ndef send_email(to, subject, body):\n    return sg.send(message)",
      },
    ],
  },
  {
    name: 'src/integrations/stripe.ts',
    delay: 3000,
    phase1Time: 1300,
    phase2Time: 2000,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'RATE_LIMIT_UNHANDLED',
        severity: 'high',
        line: 91,
        scenario: 'stripe.charges.create() has no 429 rate limit handling. During peak checkout (Black Friday), when Stripe rate-limits this service, every subsequent payment attempt will fail immediately rather than backing off and retrying.',
        fix: "async function createCharge(params) {\n  return retry(\n    () => stripe.charges.create(params),\n    {\n      retries: 3,\n      onRetry: (err) => {\n        if (err.statusCode === 429) {\n          const delay = err.headers['retry-after'] || 2;\n          return delay * 1000;\n        }\n      }\n    }\n  );\n}",
      },
    ],
  },
  {
    name: 'src/api/dashboard.ts',
    delay: 1800,
    phase1Time: 900,
    phase2Time: 800,
    model: 'Llama 8B',
    modelPhase2: null,
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [],
  },
  {
    name: 'src/workers/queue.py',
    delay: 2600,
    phase1Time: 1100,
    phase2Time: 1700,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'NO_DEAD_LETTER',
        severity: 'medium',
        line: 55,
        scenario: 'Queue consumer processes messages without a dead letter queue. If a malformed payment event enters the queue, process_message() will throw on JSON parsing, the message will be re-delivered, and this cycle will repeat forever — blocking all subsequent messages.',
        fix: "def process_message(msg):\n    try:\n        data = json.loads(msg.body)\n        handle_payment(data)\n        msg.delete()\n    except Exception as e:\n        if msg.approximate_receive_count > 3:\n            dlq.send_message(MessageBody=msg.body)\n            msg.delete()\n            logger.error(f'Moved to DLQ: {e}')\n        else:\n            raise  # allow SQS retry",
      },
    ],
  },
  {
    name: 'src/api/gateway.ts',
    delay: 2400,
    phase1Time: 1000,
    phase2Time: 1500,
    model: 'Llama 8B',
    modelPhase2: 'Claude 3.7',
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    findings: [
      {
        pattern: 'CASCADE_UNGUARDED',
        severity: 'medium',
        line: 29,
        scenario: 'Sequential calls to userService.get(), orderService.list(), and paymentService.status() with no circuit breaker. If the payment service goes down, the gateway endpoint will hang on every request, cascading the failure to all API consumers.',
        fix: "const user = await circuitBreaker.fire(\n  () => userService.get(id),\n  { fallback: cachedUser }\n);\nconst orders = await circuitBreaker.fire(\n  () => orderService.list(user.id),\n  { fallback: [] }\n);",
      },
    ],
  },
];

export const useDashboardStore = create<DashboardState>((set) => ({
  mode: 'demo',
  running: false,
  startTime: null,
  elapsedTime: '00:00',
  filesAnalyzed: 0,
  totalFiles: INITIAL_FILES.length,
  totalFindings: 0,
  criticalCount: 0,
  llamaCalls: 0,
  claudeCalls: 0,
  currentFileIndex: 0,
  activeNodeId: null,
  hoveredNodeId: null,
  files: INITIAL_FILES.map(f => ({ ...f })),
  guardrailEvents: [],

  setMode: (mode) => set({ mode }),
  setRunning: (running) => set({ running }),
  setStartTime: (startTime) => set({ startTime }),
  setElapsedTime: (elapsedTime) => set({ elapsedTime }),
  setActiveNodeId: (activeNodeId) => set({ activeNodeId }),
  setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
  
  updateFile: (index, updates) => set((state) => {
    const newFiles = [...state.files];
    newFiles[index] = { ...newFiles[index], ...updates };
    
    // Recalculate stats based on updated file runs
    let filesAnalyzed = 0;
    let totalFindings = 0;
    let criticalCount = 0;
    
    newFiles.forEach((file) => {
      if (file.status === 'complete') {
        filesAnalyzed++;
        totalFindings += file.findings.length;
        criticalCount += file.findings.filter(f => f.severity === 'critical').length;
      } else if (file.status === 'scanning') {
        // Count intermediate findings during scanning if needed
      }
    });

    return {
      files: newFiles,
      filesAnalyzed,
      totalFindings,
      criticalCount,
      currentFileIndex: index,
    };
  }),

  addGuardrailEvent: (icon, text) => set((state) => ({
    guardrailEvents: [
      {
        id: Math.random().toString(36).substring(7),
        icon,
        text,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...state.guardrailEvents,
    ].slice(0, 8), // Keep last 8 items
  })),

  incrementLlamaCalls: () => set((state) => ({ llamaCalls: state.llamaCalls + 1 })),
  incrementClaudeCalls: () => set((state) => ({ claudeCalls: state.claudeCalls + 1 })),

  resetSimulation: () => set({
    running: false,
    startTime: null,
    elapsedTime: '00:00',
    filesAnalyzed: 0,
    totalFindings: 0,
    criticalCount: 0,
    llamaCalls: 0,
    claudeCalls: 0,
    currentFileIndex: 0,
    activeNodeId: null,
    hoveredNodeId: null,
    files: INITIAL_FILES.map(f => ({ ...f })),
    guardrailEvents: [],
  }),
}));
