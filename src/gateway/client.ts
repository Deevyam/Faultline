import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { RawFinding, ScanResult, EnrichedFinding, ServiceContext } from '../types';
import { PHASE1_SYSTEM_PROMPT, PHASE2_SYSTEM_PROMPT } from '../detectors';

const PHASE1_MODEL = process.env.PHASE1_MODEL || 'phase1-scan';
const PHASE2_MODEL = process.env.PHASE2_MODEL || 'phase2-reasoning';

let gateway: OpenAI;

export function initGateway(): OpenAI {
  if (!process.env.TRUEFOUNDRY_GATEWAY_URL) {
    throw new Error('TRUEFOUNDRY_GATEWAY_URL is required');
  }
  gateway = new OpenAI({
    baseURL: process.env.TRUEFOUNDRY_GATEWAY_URL,
    apiKey: process.env.TRUEFOUNDRY_API_KEY || '',
    maxRetries: 3,
    timeout: 60000,
  });
  logger.info('AI Gateway initialized', { baseURL: process.env.TRUEFOUNDRY_GATEWAY_URL });
  return gateway;
}

export function getGateway(): OpenAI {
  if (!gateway) return initGateway();
  return gateway;
}

export async function phase1Scan(code: string, filename: string): Promise<ScanResult> {
  const startTime = Date.now();
  logger.info(`Phase 1 scan starting`, { filename, model: PHASE1_MODEL });

  try {
    const client = getGateway();
    const res = await client.chat.completions.create({
      model: PHASE1_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: PHASE1_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze this file for resilience anti-patterns.\n\nFile: ${filename}\n\`\`\`\n${code}\n\`\`\``
        }
      ],
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      logger.warn('Phase 1 returned empty response', { filename });
      return { findings: [], filesScanned: 1, modelUsed: PHASE1_MODEL, scanDurationMs: Date.now() - startTime };
    }

    let jsonString = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    const parsed = JSON.parse(jsonString);
    const result: ScanResult = {
      findings: parsed.findings || [],
      filesScanned: 1,
      modelUsed: res.model || PHASE1_MODEL,
      scanDurationMs: Date.now() - startTime,
    };

    logger.info(`Phase 1 scan complete`, {
      filename,
      findingsCount: result.findings.length,
      durationMs: result.scanDurationMs,
      model: result.modelUsed,
    });

    return result;
  } catch (error: any) {
    logger.error('Phase 1 scan failed', { filename, error: error.message });
    // Return empty results on failure — don't block the pipeline
    return {
      findings: [],
      filesScanned: 1,
      modelUsed: PHASE1_MODEL,
      scanDurationMs: Date.now() - startTime,
    };
  }
}

export async function phase2Reason(
  code: string,
  finding: RawFinding,
  context: ServiceContext,
  filePath: string,
  commitSha: string
): Promise<EnrichedFinding | null> {
  const startTime = Date.now();
  logger.info(`Phase 2 reasoning starting`, {
    pattern: finding.pattern,
    line: finding.line,
    file: filePath,
    model: PHASE2_MODEL,
  });

  try {
    const client = getGateway();
    const prompt = buildReasoningPrompt(code, finding, context);

    const res = await client.chat.completions.create({
      model: PHASE2_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: PHASE2_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      logger.warn('Phase 2 returned empty response', { pattern: finding.pattern });
      return null;
    }

    const parsed = parseEnrichedFinding(content, finding, filePath, commitSha, res.model || PHASE2_MODEL);
    logger.info('Phase 2 reasoning complete', {
      pattern: parsed.pattern,
      severity: parsed.severity,
      durationMs: Date.now() - startTime,
      model: parsed.modelUsed,
    });

    return parsed;
  } catch (error: any) {
    logger.error('Phase 2 reasoning failed', { pattern: finding.pattern, error: error.message });
    // Fallback: return a basic enriched finding without deep reasoning
    return {
      pattern: finding.pattern,
      severity: finding.confidence === 'high' ? 'high' : 'medium',
      scenario: `Potential ${finding.pattern.toLowerCase().replace(/_/g, ' ')} detected. Deep analysis unavailable due to model error.`,
      fix: 'Manual review recommended for this finding.',
      blastRadius: 'function',
      incidentRef: 'N/A',
      filePath,
      lineNumber: finding.line,
      snippet: finding.snippet,
      commitSha,
      confidence: finding.confidence,
      modelUsed: PHASE2_MODEL + ' (fallback)',
    };
  }
}

function buildReasoningPrompt(code: string, finding: RawFinding, context: ServiceContext): string {
  return `## Context
Repository: ${context.repoName}
PR Title: ${context.prTitle}
PR Description: ${context.prBody || 'No description provided'}
${context.jiraTicket ? `Jira Ticket: ${context.jiraTicket.key} — ${context.jiraTicket.summary}` : ''}

## Finding from Phase 1
Pattern: ${finding.pattern}
Line: ${finding.line}
Code snippet: \`${finding.snippet}\`
Confidence: ${finding.confidence}

## Full File Content
\`\`\`
${code}
\`\`\`

## Task
Analyze this specific finding. Determine:
1. The exact failure scenario — what happens when this code runs and the dependency fails?
2. The blast radius — does it affect just this line, this function, or the entire service?
3. The severity — is this critical (will cause outage), high (will cause degraded service), or medium (will cause minor issues)?
4. A minimal, syntactically correct code fix.
5. A reference to a similar real-world incident if possible.

Return your analysis as a JSON object matching the EnrichedFinding schema.`;
}

function parseEnrichedFinding(
  content: string,
  originalFinding: RawFinding,
  filePath: string,
  commitSha: string,
  modelUsed: string
): EnrichedFinding {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      pattern: parsed.pattern || originalFinding.pattern,
      severity: parsed.severity || 'medium',
      scenario: parsed.scenario || 'Analysis unavailable',
      fix: parsed.fix || 'Manual review recommended',
      blastRadius: parsed.blastRadius || parsed.blast_radius || 'function',
      incidentRef: parsed.incidentRef || parsed.incident_ref || 'N/A',
      filePath,
      lineNumber: parsed.line || originalFinding.line,
      snippet: originalFinding.snippet,
      commitSha,
      confidence: originalFinding.confidence,
      modelUsed,
    };
  } catch {
    // If JSON parsing fails, extract what we can from text
    return {
      pattern: originalFinding.pattern,
      severity: 'medium',
      scenario: content.substring(0, 500),
      fix: 'Manual review recommended — could not parse structured suggestion.',
      blastRadius: 'function',
      incidentRef: 'N/A',
      filePath,
      lineNumber: originalFinding.line,
      snippet: originalFinding.snippet,
      commitSha,
      confidence: originalFinding.confidence,
      modelUsed,
    };
  }
}
