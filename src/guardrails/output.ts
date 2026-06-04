import { GuardrailResult } from '../types';
import { logger } from '../utils/logger';

// Validate that a code suggestion is syntactically reasonable
export function validateCodeSuggestion(fix: string, filePath: string): GuardrailResult {
  if (!fix || fix.trim().length === 0) {
    return { passed: false, action: 'block', reason: 'Empty fix suggestion' };
  }

  // Check for common hallucination patterns
  const hallucinations = [
    /\.\.\./g,                        // Truncated suggestions
    /# TODO|FIXME|XXX/gi,            // Placeholder comments
    /your_.*_here/gi,                 // Template placeholders
    /INSERT_.*_HERE/g,
  ];

  for (const pattern of hallucinations) {
    if (pattern.test(fix) && fix.length < 50) {
      logger.warn('Potential hallucination in code suggestion', { pattern: pattern.source, fix });
      return {
        passed: false,
        action: 'block',
        reason: `Potential hallucination: matches ${pattern.source}`,
      };
    }
  }

  // Language-specific validation
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'py') {
    return validatePython(fix);
  } else if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) {
    return validateJavaScript(fix);
  } else if (ext === 'java') {
    return validateJava(fix);
  } else if (ext === 'go') {
    return validateGo(fix);
  }

  // For unknown languages, do basic bracket matching
  return validateBrackets(fix);
}

function validatePython(code: string): GuardrailResult {
  // Check for obviously broken Python
  const lines = code.split('\n');
  for (const line of lines) {
    const stripped = line.trimEnd();
    // Check for mismatched parentheses per line (simple check)
    const opens = (stripped.match(/\(/g) || []).length;
    const closes = (stripped.match(/\)/g) || []).length;
    if (Math.abs(opens - closes) > 3) {
      return {
        passed: false,
        action: 'block',
        reason: `Mismatched parentheses in Python suggestion: ${opens} open, ${closes} close`,
      };
    }
  }
  return { passed: true, action: 'allow' };
}

function validateJavaScript(code: string): GuardrailResult {
  return validateBrackets(code);
}

function validateJava(code: string): GuardrailResult {
  return validateBrackets(code);
}

function validateGo(code: string): GuardrailResult {
  return validateBrackets(code);
}

function validateBrackets(code: string): GuardrailResult {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  // Skip strings and comments for bracket matching
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }

    if ('([{'.includes(ch)) stack.push(ch);
    if (')]}'.includes(ch)) {
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) {
        return {
          passed: false,
          action: 'block',
          reason: `Mismatched bracket '${ch}' at position ${i}`,
        };
      }
      stack.pop();
    }
  }

  if (stack.length > 0) {
    return {
      passed: false,
      action: 'block',
      reason: `Unclosed brackets: ${stack.join(', ')}`,
    };
  }

  return { passed: true, action: 'allow' };
}
