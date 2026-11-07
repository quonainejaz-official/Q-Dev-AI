const { ZenmuxProvider } = require("./zenmux");
const { OpenCodeProvider } = require("./opencode");
const { OpenAIProvider } = require("./openai");
const { AnthropicProvider } = require("./anthropic");
const { GeminiProvider } = require("./gemini");
const { HuggingFaceProvider } = require("./huggingface");

/**
 * Provider registry — manages configured providers, selects the best one,
 * and provides fallback ordering for retry (2.2).
 */
class ProviderRegistry {
  constructor() {
    this._providers = new Map();
  }

  register(provider) {
    this._providers.set(provider.name, provider);
    return this;
  }

  get(name) {
    return this._providers.get(name) || null;
  }

  list() {
    return Array.from(this._providers.values());
  }

  /** Select the single best provider for the given requirements. */
  select(requirements = {}) {
    for (const provider of this._providers.values()) {
      if (provider.canHandle(requirements)) return provider;
    }
    for (const provider of this._providers.values()) {
      return provider;
    }
    throw new Error("No AI providers configured.");
  }

  /**
   * Return an ordered list of providers for fallback (2.2).
   * First match is primary; rest are fallbacks.
   * Deduplicates so the same provider isn't tried twice.
   */
  selectAll(requirements = {}) {
    const result = [];
    const seen = new Set();

    // Prefer providers that match requirements.
    for (const provider of this._providers.values()) {
      if (provider.canHandle(requirements) && !seen.has(provider.name)) {
        result.push(provider);
        seen.add(provider.name);
      }
    }
    // Then remaining providers as deeper fallbacks.
    for (const provider of this._providers.values()) {
      if (!seen.has(provider.name)) {
        result.push(provider);
        seen.add(provider.name);
      }
    }
    return result;
  }
}

const registry = new ProviderRegistry();

const initProviders = () => {
  // Register providers based on available API keys.
  // Order defines fallback priority: Zenmux → OpenCode → Hugging Face → OpenAI → Anthropic → Gemini.
  if (process.env.ZENMUX_API_KEY) {
    registry.register(new ZenmuxProvider());
  }
  if (process.env.OPENCODE_API_KEY) {
    registry.register(new OpenCodeProvider());
  }
  if (process.env.HF_API_KEY || process.env.HF_TOKEN) {
    registry.register(new HuggingFaceProvider());
  }
  if (process.env.OPENAI_API_KEY) {
    registry.register(new OpenAIProvider());
  }
  if (process.env.ANTHROPIC_API_KEY) {
    registry.register(new AnthropicProvider());
  }
  if (process.env.GEMINI_API_KEY) {
    registry.register(new GeminiProvider());
  }

  if (registry.list().length === 0) {
    console.warn("[providers] No AI providers configured. Set at least one: ZENMUX_API_KEY, OPENCODE_API_KEY, HF_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY.");
  } else {
    const names = registry.list().map((p) => p.name);
    console.log(`[providers] Registered: ${names.join(", ")}`);
  }
};

module.exports = { registry, initProviders };
