import { GuardrailResult } from '../types';
import { logger } from '../utils/logger';

// Patterns that indicate leaked secrets
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key', pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|secret_key)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub Classic Token', pattern: /github_pat_[A-Za-z0-9_]{82}/g },
  { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{32,}/g },
  { name: 'Slack Token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?[A-Za-z0-9]{20,}['"]?/gi },
  { name: 'Private Key Block', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'Connection String', pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi },
];

export function scrubSecrets(content: string): GuardrailResult & { content: string } {
  let redactedContent = content;
  const foundSecrets: string[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      foundSecrets.push(`${name} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`);
      redactedContent = redactedContent.replace(pattern, `[REDACTED_${name.toUpperCase().replace(/\s+/g, '_')}]`);
    }
  }

  if (foundSecrets.length > 0) {
    logger.warn('Secrets detected and redacted before LLM call', { secrets: foundSecrets });
    return {
      passed: true,  // We redacted, so it's safe to proceed
      action: 'redact',
      reason: `Redacted: ${foundSecrets.join(', ')}`,
      redactedContent,
      originalContent: content,
      content: redactedContent,
    };
  }

  return {
    passed: true,
    action: 'allow',
    content: content,
  };
}

export function validateInputSize(content: string, maxChars: number = 100000): GuardrailResult {
  if (content.length > maxChars) {
    logger.warn('Input exceeds maximum size', { size: content.length, max: maxChars });
    return {
      passed: false,
      action: 'block',
      reason: `Input too large: ${content.length} chars (max: ${maxChars})`,
    };
  }
  return { passed: true, action: 'allow' };
}
