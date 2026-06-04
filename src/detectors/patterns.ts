import { PatternType, Severity, BlastRadius } from '../types';

export interface PatternSpec {
  id: PatternType;
  name: string;
  description: string;
  defaultSeverity: Severity;
  defaultBlastRadius: BlastRadius;
  examples: {
    bad: string;
    good: string;
    language: string;
  }[];
  keywords: string[];  // Keywords to look for in code
}

export const PATTERNS: PatternSpec[] = [
  {
    id: 'MISSING_TIMEOUT',
    name: 'Missing Timeout',
    description: 'I/O call without timeout parameter — can block threads indefinitely',
    defaultSeverity: 'critical',
    defaultBlastRadius: 'service-wide',
    examples: [
      {
        bad: 'response = requests.post(url, json=data)',
        good: 'response = requests.post(url, json=data, timeout=(3, 10))',
        language: 'python',
      },
      {
        bad: 'const res = await fetch(url)',
        good: 'const res = await fetch(url, { signal: AbortSignal.timeout(5000) })',
        language: 'javascript',
      },
      {
        bad: 'resp, err := http.Get(url)',
        good: 'client := &http.Client{Timeout: 10 * time.Second}\nresp, err := client.Get(url)',
        language: 'go',
      },
    ],
    keywords: ['requests.get', 'requests.post', 'requests.put', 'requests.delete', 'requests.patch',
               'http.get', 'http.post', 'fetch(', 'axios.get', 'axios.post',
               'urllib.request', 'httpx.get', 'httpx.post',
               'http.Get', 'http.Post', 'HttpClient',
               'RestTemplate', 'WebClient', 'OkHttpClient'],
  },
  {
    id: 'MISSING_RETRY',
    name: 'Missing Retry/Backoff',
    description: 'External call with no retry logic — transient failures become permanent failures',
    defaultSeverity: 'high',
    defaultBlastRadius: 'function',
    examples: [
      {
        bad: 'result = db.execute(query)',
        good: '@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=10))\ndef execute_with_retry(query):\n    return db.execute(query)',
        language: 'python',
      },
      {
        bad: 'await dynamodb.putItem(params).promise()',
        good: 'await retry(async () => await dynamodb.putItem(params).promise(), { retries: 3 })',
        language: 'javascript',
      },
    ],
    keywords: ['db.execute', 'cursor.execute', 'query(', 'fetch(', 'dynamodb', 'putItem',
               'sendMessage', 'publish(', 'sqs.send', 'sns.publish'],
  },
  {
    id: 'NON_IDEMPOTENT',
    name: 'Non-Idempotent Write',
    description: 'Write operation that produces duplicates on retry — causes data corruption',
    defaultSeverity: 'critical',
    defaultBlastRadius: 'service-wide',
    examples: [
      {
        bad: 'db.execute("INSERT INTO charges (user_id, amount) VALUES (?, ?)", user_id, amount)',
        good: 'db.execute("INSERT INTO charges (user_id, amount, idempotency_key) VALUES (?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING", user_id, amount, idem_key)',
        language: 'python',
      },
    ],
    keywords: ['INSERT INTO', 'INSERT', '.create(', '.save(', 'charge(', 'transfer(', 'payment',
               'sendEmail', 'send_email', 'send_sms', 'send_notification'],
  },
  {
    id: 'SILENT_EXCEPTION',
    name: 'Silent Exception Swallow',
    description: 'Error caught and silently ignored — failures become invisible',
    defaultSeverity: 'high',
    defaultBlastRadius: 'function',
    examples: [
      {
        bad: 'try:\n    send_email(user)\nexcept:\n    pass',
        good: 'try:\n    send_email(user)\nexcept Exception as e:\n    logger.error(f"Email send failed: {e}")\n    metrics.increment("email.send.failure")',
        language: 'python',
      },
      {
        bad: 'try { await sendNotification(user); } catch (e) {}',
        good: 'try { await sendNotification(user); } catch (e) { logger.error("Notification failed", { error: e, userId: user.id }); }',
        language: 'javascript',
      },
    ],
    keywords: ['except:', 'except Exception', 'catch (', 'catch(', 'rescue', '.catch('],
  },
  {
    id: 'UNBOUNDED_POOL',
    name: 'Unbounded Connection Pool',
    description: 'Pool without max size — leads to resource exhaustion under load',
    defaultSeverity: 'high',
    defaultBlastRadius: 'service-wide',
    examples: [
      {
        bad: 'pool = create_engine(DATABASE_URL)',
        good: 'pool = create_engine(DATABASE_URL, pool_size=10, max_overflow=5, pool_timeout=30)',
        language: 'python',
      },
      {
        bad: 'const pool = new Pool({ connectionString: url })',
        good: 'const pool = new Pool({ connectionString: url, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })',
        language: 'javascript',
      },
    ],
    keywords: ['create_engine(', 'ConnectionPool', 'new Pool(', 'createPool(', 'pool_size',
               'ThreadPoolExecutor(', 'Semaphore(', 'newFixedThreadPool'],
  },
  {
    id: 'RATE_LIMIT_UNHANDLED',
    name: 'Unhandled Rate Limit',
    description: 'HTTP call without 429 handling — causes cascading failures when upstream rate-limits',
    defaultSeverity: 'high',
    defaultBlastRadius: 'function',
    examples: [
      {
        bad: 'response = stripe.Charge.create(amount=1000, currency="usd")',
        good: '@retry(retry=retry_if_exception_type(stripe.error.RateLimitError), wait=wait_exponential())\ndef charge():\n    return stripe.Charge.create(amount=1000, currency="usd")',
        language: 'python',
      },
    ],
    keywords: ['stripe.', 'twilio.', 'sendgrid.', 'github.', '.api.', 'api_call', 'rate_limit',
               'Charge.create', 'api/v1', 'api/v2'],
  },
  {
    id: 'CASCADE_UNGUARDED',
    name: 'Unguarded Cascade',
    description: 'Chain of synchronous calls without circuit breaker — single failure cascades everywhere',
    defaultSeverity: 'medium',
    defaultBlastRadius: 'service-wide',
    examples: [
      {
        bad: 'user = user_service.get(id)\norders = order_service.get(user.id)\npayments = payment_service.get(orders)',
        good: 'user = circuit_breaker.call(user_service.get, id, fallback=cached_user)\norders = circuit_breaker.call(order_service.get, user.id, fallback=[])\npayments = circuit_breaker.call(payment_service.get, orders, fallback=[])',
        language: 'python',
      },
    ],
    keywords: ['service.get', 'service.fetch', 'client.call', 'rpc.call', 'grpc.'],
  },
  {
    id: 'NO_DEAD_LETTER',
    name: 'No Dead Letter Queue',
    description: 'Queue consumer without DLQ — poison messages block processing forever',
    defaultSeverity: 'medium',
    defaultBlastRadius: 'function',
    examples: [
      {
        bad: 'def process_message(msg):\n    data = json.loads(msg.body)\n    handle(data)\n    msg.delete()',
        good: 'def process_message(msg):\n    try:\n        data = json.loads(msg.body)\n        handle(data)\n        msg.delete()\n    except Exception:\n        if msg.receive_count > 3:\n            dlq.send(msg)\n            msg.delete()\n        else:\n            raise  # let it retry',
        language: 'python',
      },
    ],
    keywords: ['process_message', 'handle_message', 'consumer', 'subscriber', 'on_message',
               'sqs.receive', 'consume(', '@queue_handler', '@celery.task'],
  },
];

export function getPatternSpec(id: PatternType): PatternSpec | undefined {
  return PATTERNS.find(p => p.id === id);
}

export function getPatternName(id: PatternType): string {
  return getPatternSpec(id)?.name || id;
}
