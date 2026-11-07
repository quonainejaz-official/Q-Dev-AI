const { registry } = require("../providers/registry");
const { detectReasoning, getReasoningModel } = require("../utils/reasoningDetector");

/**
 * Model Router (3.7) — picks the cheapest capable provider+model for each request.
 *
 * Routing decisions based on:
 * - Media presence → vision-capable provider
 * - Message complexity → simple vs reasoning model (4.9)
 * - Available providers → fallback chain
 *
 * Heuristic-first approach (no LLM classifier needed for v1).
 */

// Provider cost tiers (lower = cheaper). Adjust as pricing changes.
const COST_TIERS = {
  zenmux: 1,     // free Atria Dawn via Zenmux
  opencode: 1,   // free/cheap
  gemini: 2,     // free tier available
  openai: 3,     // moderate
  anthropic: 4   // premium
};

/**
 * Route to the best provider+model for the given request.
 *
 * @param {Object} params
 * @param {boolean} params.hasMedia - Whether the request includes images/audio/video
 * @param {string}  params.complexity - 'simple' | 'complex' (optional, default 'simple')
 * @param {string}  params.message - Original message text (for reasoning detection)
 * @param {number}  params.contextTokens - Approximate context size (optional)
 * @returns {{ provider: Object, model: string }}
 */
const route = ({ hasMedia = false, complexity = "simple", message = "", contextTokens = 0 } = {}) => {
  // Get all available providers sorted by cost.
  const providers = registry.list().sort((a, b) => {
    return (COST_TIERS[a.name] || 99) - (COST_TIERS[b.name] || 99);
  });

  if (!providers.length) {
    throw new Error("No AI providers available for routing.");
  }

  // Auto-detect reasoning if complexity not explicitly set.
  let effectiveComplexity = complexity;
  if (complexity === "simple" && message) {
    const { isReasoning, confidence } = detectReasoning(message);
    if (isReasoning && confidence >= 0.5) {
      effectiveComplexity = "complex";
    }
  }

  // Filter by capability requirements.
  const requirements = {};
  if (hasMedia) requirements.vision = true;
  requirements.streaming = true;

  const capable = providers.filter((p) => p.canHandle(requirements));

  if (!capable.length) {
    const fallback = providers.filter((p) => p.canHandle({ streaming: true }));
    if (!fallback.length) {
      throw new Error("No provider supports the required capabilities.");
    }
    return pickModel(fallback[0], hasMedia, effectiveComplexity);
  }

  return pickModel(capable[0], hasMedia, effectiveComplexity);
};

/**
 * Pick the best model from a provider based on request characteristics.
 */
function pickModel(provider, hasMedia, complexity) {
  const caps = provider.capabilities;
  const models = caps.models || [];

  if (!models.length) {
    throw new Error(`Provider ${provider.name} has no models.`);
  }

  // For complex/reasoning tasks, prefer the reasoning model (4.9).
  if (complexity === "complex") {
    const reasoningModel = getReasoningModel(provider);
    if (reasoningModel) return { provider, model: reasoningModel };
  }

  // For vision requests, prefer vision-optimized models.
  if (hasMedia && caps.vision) {
    if (provider.name === "opencode") return { provider, model: "mimo-v2.5-free" };
    if (provider.name === "openai") return { provider, model: "gpt-4o" };
    if (provider.name === "anthropic") return { provider, model: "claude-sonnet-4-20250514" };
    if (provider.name === "gemini") return { provider, model: "gemini-2.0-flash" };
  }

  // Default: pick the first (cheapest) available model.
  return { provider, model: models[0] };
}

/**
 * Get routing info without executing (for logging/quota checks).
 */
const getRoutingInfo = (params) => {
  try {
    const { provider, model } = route(params);
    return {
      provider: provider.name,
      model,
      costTier: COST_TIERS[provider.name] || 99
    };
  } catch (err) {
    return { provider: null, model: null, costTier: 99, error: err.message };
  }
};

module.exports = { route, getRoutingInfo, COST_TIERS };
