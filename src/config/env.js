const DEV_JWT_FALLBACKS = ["local-dev-jwt-secret", "change-me", "changeme"];

const validateEnv = () => {
  const errors = [];
  const warnings = [];
  const isProd = process.env.NODE_ENV === "production";

  // Required: at least one provider API key must be set for the app to function.
  // We validate this after checking all vars — see provider check below.
  const required = {};

  // Conditional: required in production.
  const prodRequired = {
    JWT_SECRET: "Secret used to sign login JWTs.",
    MONGODB_URI: "MongoDB connection string.",
  };

  // Optional: app can run without them (guest mode / degraded).
  const optional = {
    PORT: "Server port (default 3001).",
    CORS_ORIGIN: "Allowed CORS origin.",
    GOOGLE_CLIENT_ID: "Google OAuth client ID.",
    GOOGLE_CLIENT_SECRET: "Google OAuth client secret.",
    CLOUDINARY_CLOUD_NAME: "Cloudinary cloud name.",
    CLOUDINARY_API_KEY: "Cloudinary API key.",
    CLOUDINARY_API_SECRET: "Cloudinary API secret.",
    MAX_MESSAGE_LENGTH: "Max characters per message.",
    MAX_HISTORY_LENGTH: "Max messages in context.",
    DNS_SERVERS: "Comma-separated DNS servers for MongoDB SRV.",
    ZENMUX_API_KEY: "API key for Zenmux (Atria Dawn chat).",
    ZENMUX_MODEL: "Zenmux chat model (default: atria-asi/atria-dawn).",
    ZENMUX_API_URL: "Zenmux OpenAI-compatible chat completions URL.",
    HF_API_KEY: "API key for Hugging Face Inference Providers.",
    HF_TOKEN: "API token for Hugging Face Inference Providers.",
    HF_MODEL: "Hugging Face chat model (default: openai/gpt-oss-20b:fastest).",
    HF_API_URL: "Hugging Face OpenAI-compatible router URL.",
    OPENCODE_API_KEY: "API key for OpenCode Zen provider.",
    OPENAI_API_KEY: "API key for OpenAI provider.",
    OPENAI_MODEL: "Default OpenAI model (default: gpt-4o).",
    ANTHROPIC_API_KEY: "API key for Anthropic Claude provider.",
    ANTHROPIC_MODEL: "Default Anthropic model (default: claude-sonnet-4-20250514).",
    GEMINI_API_KEY: "API key for Google Gemini provider.",
    GEMINI_MODEL: "Default Gemini model (default: gemini-2.0-flash).",
    BRAVE_API_KEY: "API key for Brave Search (enables web search feature).",
  };

  // Check required vars.
  for (const [key, desc] of Object.entries(required)) {
    if (!process.env[key]) {
      errors.push(`Missing required env var: ${key} — ${desc}`);
    }
  }

  // In production, these are also required.
  if (isProd) {
    for (const [key, desc] of Object.entries(prodRequired)) {
      if (!process.env[key]) {
        errors.push(`Missing production env var: ${key} — ${desc}`);
      }
    }
  }

  // JWT_SECRET security check: refuse insecure fallback in production.
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    const isDevFallback = DEV_JWT_FALLBACKS.includes(jwtSecret.toLowerCase());
    if (isProd && isDevFallback) {
      errors.push(
        "JWT_SECRET is an insecure default value in production. Set a long random string."
      );
    } else if (!isProd && isDevFallback) {
      warnings.push(
        "JWT_SECRET is a dev fallback — fine for local development, but NOT safe for production."
      );
    }
    if (jwtSecret.length < 16) {
      if (isProd) {
        errors.push("JWT_SECRET must be at least 16 characters in production.");
      } else {
        warnings.push("JWT_SECRET is short (<16 chars) — increase it before deploying.");
      }
    }
  }

  // MongoDB URI format sanity check.
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && !mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    errors.push("MONGODB_URI does not look like a valid MongoDB connection string.");
  }

  // NODE_ENV warning if missing.
  if (!process.env.NODE_ENV) {
    warnings.push("NODE_ENV is not set — defaulting to development behavior.");
  }

  // At least one AI provider API key must be set.
  const providerKeys = ["ZENMUX_API_KEY", "OPENCODE_API_KEY", "HF_API_KEY", "HF_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"];
  const hasProvider = providerKeys.some((k) => process.env[k]);
  if (!hasProvider) {
    const msg = "No AI provider API key set. Set at least one: " + providerKeys.join(", ");
    if (isProd) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  // Report.
  for (const w of warnings) {
    console.warn(`[env] WARNING: ${w}`);
  }

  if (errors.length) {
    if (isProd) {
      // In production, refuse to boot with missing/bad config.
      for (const e of errors) {
        console.error(`[env] ERROR: ${e}`);
      }
      throw new Error(
        `[env] Refusing to start — ${errors.length} configuration error(s). Fix the above and retry.`
      );
    }
    // In development, warn but allow boot (guest mode).
    for (const e of errors) {
      console.warn(`[env] WARNING (dev): ${e}`);
    }
    console.warn("[env] Continuing in degraded/guest mode.");
  } else {
    console.log("[env] Environment validation passed.");
  }
};

module.exports = { validateEnv };
