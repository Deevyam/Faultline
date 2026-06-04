// Model constants and fallback ordering
export const MODELS = {
  // Phase 1: Fast pattern scan
  PHASE1_PRIMARY: 'phase1-scan',

  // Phase 2: Deep reasoning
  PHASE2_PRIMARY: 'phase2-reasoning',

  // Direct model references (for observability)
  CLAUDE_SONNET: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
  LLAMA_70B: 'meta.llama3-70b-instruct-v1:0',
  LLAMA_8B: 'meta.llama3-8b-instruct-v1:0',
} as const;

export const FALLBACK_CHAIN = {
  reasoning: [MODELS.CLAUDE_SONNET, MODELS.LLAMA_70B],
  scanning: [MODELS.LLAMA_8B],
} as const;

export const MODEL_COSTS = {
  [MODELS.CLAUDE_SONNET]: { inputPer1k: 0.003, outputPer1k: 0.015 },
  [MODELS.LLAMA_70B]: { inputPer1k: 0.00099, outputPer1k: 0.00099 },
  [MODELS.LLAMA_8B]: { inputPer1k: 0.00022, outputPer1k: 0.00022 },
} as const;

export function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
    'phase1-scan': 'Llama 3 8B (Phase 1)',
    'phase2-reasoning': 'Claude 3.7 Sonnet (Phase 2)',
    [MODELS.CLAUDE_SONNET]: 'Claude 3.7 Sonnet',
    [MODELS.LLAMA_70B]: 'Llama 3 70B',
    [MODELS.LLAMA_8B]: 'Llama 3 8B',
  };
  return names[model] || model;
}
