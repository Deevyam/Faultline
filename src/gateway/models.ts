// Model constants and fallback ordering
export const MODELS = {
  // Phase 1: Fast pattern scan
  PHASE1_PRIMARY: 'phase1-scan',

  // Phase 2: Deep reasoning
  PHASE2_PRIMARY: 'phase2-reasoning',

  // Direct model references (for observability)
  CLAUDE_SONNET: 'us.anthropic.claude-sonnet-4-6',
  DEEPSEEK_R1: 'us.deepseek.r1-v1-0',
  LLAMA_70B: 'meta.llama3-70b-instruct-v1-0',
  KIMI: 'moonshotai.kimi-k2.5',
  GLM: 'zai.glm-5',
} as const;

export const FALLBACK_CHAIN = {
  reasoning: [MODELS.CLAUDE_SONNET, MODELS.DEEPSEEK_R1, MODELS.LLAMA_70B],
  scanning: [MODELS.LLAMA_70B, MODELS.KIMI, MODELS.GLM],
} as const;

export const MODEL_COSTS = {
  [MODELS.CLAUDE_SONNET]: { inputPer1k: 0.0033, outputPer1k: 0.0165 },
  [MODELS.DEEPSEEK_R1]: { inputPer1k: 0.00135, outputPer1k: 0.0054 },
  [MODELS.LLAMA_70B]: { inputPer1k: 0.00265, outputPer1k: 0.0035 },
  [MODELS.KIMI]: { inputPer1k: 0.0006, outputPer1k: 0.003 },
  [MODELS.GLM]: { inputPer1k: 0.001, outputPer1k: 0.0032 },
} as const;

export function getModelDisplayName(model: string): string {
  const cleanModel = model.split('/').pop() || model;
  const names: Record<string, string> = {
    'phase1-scan': 'Llama 3 70B',
    'phase2-reasoning': 'Claude 4.6 Sonnet',
    [MODELS.CLAUDE_SONNET]: 'Claude 4.6 Sonnet',
    [MODELS.DEEPSEEK_R1]: 'DeepSeek R1',
    [MODELS.LLAMA_70B]: 'Llama 3 70B',
    [MODELS.KIMI]: 'Kimi K2.5',
    [MODELS.GLM]: 'GLM-5',
  };
  return names[cleanModel] || cleanModel;
}
