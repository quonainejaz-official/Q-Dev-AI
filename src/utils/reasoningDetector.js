/**
 * Reasoning Mode (4.9) — detects complex queries and routes to reasoning models.
 *
 * Heuristics for detecting reasoning tasks:
 * - Math/code problems (equations, algorithms)
 * - Multi-step analysis
 * - "think step by step" / "explain why" / "compare X and Y"
 * - Long complex questions
 *
 * When detected, the router picks a reasoning-capable model (higher cost).
 */

const REASONING_PATTERNS = [
  // Math and logic
  /(?:solve|calculate|prove|derive|compute)\s/i,
  /(?:equation|formula|theorem|proof|derivative|integral)/i,
  /\b(?:if|given|assume|suppose)\b.*\b(?:then|what|find|show)\b/i,

  // Code analysis
  /(?:debug|optimize|refactor|analyze|review)\s+(?:this|the|my)\s+(?:code|function|algorithm)/i,
  /(?:time|space)\s+complexity/i,
  /(?:big.o|o\(n\)|o\(n\s*log)/i,

  // Multi-step reasoning
  /(?:think|reason|work)\s+(?:step.by.step|through|carefully)/i,
  /(?:explain|describe)\s+(?:why|how|the\s+(?:reason|logic|mechanism))/i,
  /(?:compare|contrast|difference\s+between|pros?\s+and\s+cons?)/i,

  // Analysis
  /(?:analyze|evaluate|assess|critique|review)\s/i,
  /(?:trade.?offs?|implications?|consequences?|risks?)\s+(?:of|for|associated)/i,

  // Complex questions (long + multiple clauses)
  /(?:what|how|why)\s+.{50,}/i,
];

/**
 * Detect if a message requires reasoning/thinking.
 * @param {string} message
 * @returns {{ isReasoning: boolean, confidence: number }}
 */
const detectReasoning = (message) => {
  if (!message || typeof message !== "string") {
    return { isReasoning: false, confidence: 0 };
  }

  let matches = 0;
  for (const pattern of REASONING_PATTERNS) {
    if (pattern.test(message)) matches++;
  }

  // Length-based heuristic: very long questions are likely complex.
  const lengthBonus = message.length > 200 ? 0.2 : 0;

  // Multiple question marks suggest multi-part questions.
  const questionMarks = (message.match(/\?/g) || []).length;
  const questionBonus = questionMarks >= 2 ? 0.15 : 0;

  const confidence = Math.min(1, (matches * 0.3) + lengthBonus + questionBonus);

  return {
    isReasoning: confidence >= 0.3,
    confidence
  };
};

/**
 * Get the best reasoning model for a provider.
 * @param {Object} provider
 * @returns {string|null} model name or null if no reasoning model
 */
const getReasoningModel = (provider) => {
  const name = provider.name;
  const models = provider.capabilities?.models || [];

  // Provider-specific reasoning models.
  const reasoningModels = {
    openai: "gpt-4o",
    anthropic: "claude-sonnet-4-20250514",
    gemini: "gemini-2.0-flash",
    opencode: "big-pickle",
    zenmux: "atria-asi/atria-dawn"
  };

  const preferred = reasoningModels[name];
  if (preferred && models.includes(preferred)) return preferred;

  // Fallback: first model in the list.
  return models[0] || null;
};

module.exports = { detectReasoning, getReasoningModel, REASONING_PATTERNS };
