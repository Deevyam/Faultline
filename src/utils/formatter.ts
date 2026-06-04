import { EnrichedFinding, AnalysisReport } from '../types';
import { getModelDisplayName } from '../gateway/models';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
};

const PATTERN_NAMES: Record<string, string> = {
  MISSING_TIMEOUT: 'Missing Timeout',
  MISSING_RETRY: 'Missing Retry/Backoff',
  NON_IDEMPOTENT: 'Non-Idempotent Write',
  SILENT_EXCEPTION: 'Silent Exception Swallow',
  UNBOUNDED_POOL: 'Unbounded Connection Pool',
  RATE_LIMIT_UNHANDLED: 'Unhandled Rate Limit',
  CASCADE_UNGUARDED: 'Unguarded Cascade',
  NO_DEAD_LETTER: 'No Dead Letter Queue',
};

export function formatFindingComment(finding: EnrichedFinding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] || '⚪';
  const patternName = PATTERN_NAMES[finding.pattern] || finding.pattern;

  return `## ${emoji} Faultline: ${patternName}

**Severity:** ${finding.severity.toUpperCase()} | **Blast Radius:** ${finding.blastRadius} | **Confidence:** ${finding.confidence}

### 💥 Failure Scenario
${finding.scenario}

### 🔧 Suggested Fix
\`\`\`suggestion
${finding.fix}
\`\`\`

${finding.incidentRef && finding.incidentRef !== 'N/A' ? `### 📚 Similar Incident\n${finding.incidentRef}` : ''}

---
<sub>Found by <b>Faultline</b> · Resilience-first PR review · Analyzed with ${getModelDisplayName(finding.modelUsed)}</sub>`;
}

export function buildReviewSummary(findings: EnrichedFinding[]): string {
  if (findings.length === 0) {
    return `## ✅ Faultline Resilience Review — All Clear

No resilience anti-patterns detected in this PR. The code handles:
- I/O timeouts
- Retry logic with backoff
- Error propagation
- Resource bounds

Great work! 🎉

---
<sub>Powered by <b>Faultline</b> · Resilience-first PR review</sub>`;
  }

  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');

  const summary = `## 🛡️ Faultline Resilience Review Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${critical.length} |
| 🟠 High | ${high.length} |
| 🟡 Medium | ${medium.length} |
| **Total** | **${findings.length}** |

### Findings
${findings.map((f, i) => {
  const emoji = SEVERITY_EMOJI[f.severity];
  const name = PATTERN_NAMES[f.pattern] || f.pattern;
  return `${i + 1}. ${emoji} **${name}** in \`${f.filePath}:${f.lineNumber}\` — ${f.scenario.split('.')[0]}.`;
}).join('\n')}

${critical.length > 0 ? '\n> ⚠️ **This PR contains critical resilience issues that could cause production outages. Please address before merging.**\n' : ''}

---
<sub>Powered by <b>Faultline</b> · Resilience-first PR review · ${findings.length} finding${findings.length !== 1 ? 's' : ''} across ${new Set(findings.map(f => f.filePath)).size} file${new Set(findings.map(f => f.filePath)).size !== 1 ? 's' : ''}</sub>`;

  return summary;
}

export function buildCLIReport(report: AnalysisReport): string {
  const header = `
╔══════════════════════════════════════════════════════════════╗
║                    FAULTLINE ANALYSIS REPORT                 ║
╚══════════════════════════════════════════════════════════════╝

Repository: ${report.repo}
PR: #${report.prNumber}
Files analyzed: ${report.filesAnalyzed}/${report.totalFiles}
Duration: ${report.duration}
Timestamp: ${report.timestamp}
`;

  if (report.findings.length === 0) {
    return header + '\n✅ No resilience anti-patterns detected. Code looks solid!\n';
  }

  const findingsText = report.findings.map((f, i) => {
    const emoji = SEVERITY_EMOJI[f.severity];
    const name = PATTERN_NAMES[f.pattern] || f.pattern;
    return `
${emoji} Finding #${i + 1}: ${name}
${'─'.repeat(50)}
File: ${f.filePath}:${f.lineNumber}
Severity: ${f.severity.toUpperCase()}
Blast Radius: ${f.blastRadius}
Confidence: ${f.confidence}

Scenario:
  ${f.scenario}

Fix:
  ${f.fix}
${f.incidentRef !== 'N/A' ? `\nSimilar Incident: ${f.incidentRef}` : ''}
Model: ${getModelDisplayName(f.modelUsed)}
`;
  }).join('\n');

  const summaryText = `
${'═'.repeat(60)}
SUMMARY: ${report.criticalFindings} critical · ${report.highFindings} high · ${report.mediumFindings} medium
${'═'.repeat(60)}
`;

  return header + findingsText + summaryText;
}
