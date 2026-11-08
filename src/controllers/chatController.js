const { registry } = require("../providers/registry");
const { SYSTEM_PROMPT } = require("../prompt/layers/system");
const { buildUserContent } = require("../prompt/promptBuilder");
const { generateImage } = require("../services/imageGenService");
const { validateMedia } = require("../utils/mediaValidation");
const {
  MAX_HISTORY_LENGTH,
  validateMessage,
  sanitizeMessage
} = require("../utils/messageUtils");

const getHistoryHandler = (req, res) => {
  res.json({ messages: [] });
};

const clearHistoryHandler = (req, res) => {
  res.json({ status: "success", message: "Chat history cleared." });
};

const setHistoryHandler = (req, res) => {
  res.json({ status: "success", messages: [] });
};

const normalizeIncomingHistory = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .map((item) => ({
      role: item?.role === "bot" ? "bot" : "user",
      content: String(item?.content ?? ""),
      timestamp: typeof item?.timestamp === "number" ? item.timestamp : Date.now()
    }))
    .filter((item) => item.content.trim().length > 0)
    .slice(-MAX_HISTORY_LENGTH);
};

const getProviderErrorMessage = (error) => {
  if (process.env.NODE_ENV === "production") {
    return "Unable to generate a response. Please try again.";
  }

  const detail = error?.message ? ` (${error.message})` : "";
  return `Unable to generate a response. Please check your AI provider connection or API key${detail}.`;
};

const postGenerateImage = async (req, res, next) => {
  const prompt = req.body?.prompt;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("typing", { active: true });

  try {
    const result = await generateImage(prompt.trim());
    sendEvent("typing", { active: false });
    sendEvent("image", { dataUrl: result.dataUrl, prompt: prompt.trim(), method: result.method });
    sendEvent("done", {});
    res.end();
  } catch (error) {
    sendEvent("typing", { active: false });
    sendEvent("error", { message: `Image generation failed: ${error.message}` });
    res.end();
    next(error);
  }
};

const postMessage = async (req, res, next) => {
  // Server-side media validation (1.1) — counts, sizes, total cap.
  const mediaCheck = validateMedia(req.body || {});
  if (!mediaCheck.valid) {
    return res.status(400).json({ error: mediaCheck.errors.join(" ") });
  }

  const images = req.body?.images;
  const audios = req.body?.audios;
  const videos = req.body?.videos;
  const pdfs = req.body?.pdfs;
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasAudios = Array.isArray(audios) && audios.length > 0;
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  const hasPdfs = Array.isArray(pdfs) && pdfs.length > 0;
  const hasMedia = hasImages || hasAudios || hasVideos || hasPdfs;
  const validation = validateMessage(req.body?.message || "");
  if (!validation.valid && !hasMedia) {
    return res.status(400).json({ error: validation.error });
  }

  const cleanMessage = hasMedia ? (validation.value || "") : validation.value;

  // SSE (text/event-stream) — the standard for real-time streaming (2.3).
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // SSE helper: send typed events as `event: <type>\ndata: <json>\n\n`.
  const sendEvent = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("typing", { active: true });

  // In non-test environments, send rich status phases to engage the user
  const isTest = process.env.NODE_ENV === "test";
  const STATUS_PHASES = [
    { delay: 1200, phase: "understanding", text: "Understanding your question..." },
    { delay: 3000, phase: "analyzing", text: "Analyzing context..." },
    { delay: 5500, phase: "generating", text: "Crafting response..." },
    { delay: 9000, phase: "deep-thinking", text: "Deep thinking..." },
    { delay: 14000, phase: "processing", text: "Still working on it..." }
  ];
  const phaseTimers = !isTest
    ? STATUS_PHASES.map((s) => setTimeout(() => sendEvent("status", s), s.delay))
    : [];
  const clearPhaseTimers = () => phaseTimers.forEach(clearTimeout);

    try {
      const incomingHistory = normalizeIncomingHistory(req.body?.history);
      const lastMessage = incomingHistory[incomingHistory.length - 1];
      const historyForModel =
        lastMessage?.role === "user" && lastMessage.content === cleanMessage
          ? incomingHistory.slice(0, -1)
          : incomingHistory;

      const personalization = req.body?.personalization || {};
      const customInstructions = typeof personalization.customInstructions === "string"
        ? personalization.customInstructions.trim().slice(0, 4000)
        : "";
      const allowedStyles = new Set(["concise", "balanced", "detailed"]);
      const responseStyle = allowedStyles.has(personalization.responseStyle)
        ? personalization.responseStyle
        : "balanced";
      const styleInstruction = {
        concise: "Keep responses concise and action-oriented unless detail is requested.",
        balanced: "Use a balanced level of detail with clear explanations and practical examples when useful.",
        detailed: "Provide thorough, step-by-step responses with helpful context and examples."
      }[responseStyle];
      const personalizationPrompt = [
        personalization.memoryEnabled !== false && customInstructions
          ? `User custom instructions:\n${customInstructions}`
          : "",
        `Preferred response style: ${styleInstruction}`
      ].filter(Boolean).join("\n\n");

      const media = hasMedia ? { images, audios, videos, pdfs } : { images: [], audios: [], videos: [], pdfs: [] };
      const modelMessages = [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${personalizationPrompt}` },
        ...historyForModel.map((item) => ({
          role: item.role === "bot" ? "assistant" : "user",
          content: item.content
        })),
        { role: "user", content: buildUserContent(cleanMessage, media) }
      ];
      const streamArgs = {
        message: cleanMessage,
        history: historyForModel,
        ...media,
        messages: modelMessages,
        personalizationPrompt
      };

      // Select providers for fallback (2.2) based on capabilities needed.
      const providers = registry.selectAll({ vision: hasMedia, streaming: true });

      // If no AI providers are configured, return a clear SSE error so the
      // frontend can display a helpful message instead of silently finishing.
      if (!providers || providers.length === 0) {
        clearPhaseTimers();
        sendEvent("typing", { active: false });
        sendEvent("error", { message: "No AI providers configured on the server. Please set an API key." });
        res.end();
        return;
      }
      let lastError = null;
      let usage = null;

      for (const provider of providers) {
        try {
          let started = false;
          for await (const event of provider.stream(streamArgs)) {
            if (event.type === "token" && event.text) {
              if (!started) {
                clearPhaseTimers();
                sendEvent("typing", { active: false });
                if (!isTest) { sendEvent("status", { phase: "streaming", text: "" }); }
                sendEvent("start", {});
                started = true;
              }
              sendEvent("chunk", { text: sanitizeMessage(event.text) });
            } else if (event.type === "done") {
              usage = event.usage;
            } else if (event.type === "error") {
              throw new Error(event.error || `${provider.name} stream error`);
            }
          }

          if (!started) {
            throw new Error(`Provider ${provider.name} returned no content.`);
          }

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`[chat] Provider ${provider.name} failed: ${error.message}`);
          usage = null;
        }
      }

      if (lastError) {
        throw lastError;
      }

      sendEvent("typing", { active: false });
      sendEvent("done", { usage });
      res.end();
    } catch (error) {
      clearPhaseTimers();
      sendEvent("typing", { active: false });
      sendEvent("error", { message: getProviderErrorMessage(error) });
      res.end();
      next(error);
    }
};

module.exports = {
  getHistory: getHistoryHandler,
  clearHistory: clearHistoryHandler,
  setHistory: setHistoryHandler,
  postMessage,
  postGenerateImage
};
