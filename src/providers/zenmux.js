const { BaseProvider } = require("./base");
const { SYSTEM_PROMPT } = require("../prompt/layers/system");

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "atria-asi/atria-dawn";

const hasAnyMedia = ({ images, audios, videos, pdfs }) =>
  (Array.isArray(images) && images.length > 0) ||
  (Array.isArray(audios) && audios.length > 0) ||
  (Array.isArray(videos) && videos.length > 0) ||
  (Array.isArray(pdfs) && pdfs.length > 0);

class ZenmuxProvider extends BaseProvider {
  constructor(config = {}) {
    super("zenmux", config);
    this.apiKey = config.apiKey || process.env.ZENMUX_API_KEY;
    this.apiUrl = config.apiUrl || process.env.ZENMUX_API_URL || ZENMUX_API_URL;
    this.model = config.model || process.env.ZENMUX_MODEL || DEFAULT_MODEL;
  }

  get capabilities() {
    return {
      chat: true,
      streaming: true,
      vision: false,
      audio: false,
      embeddings: false,
      tools: false,
      maxContext: 512000,
      models: [this.model]
    };
  }

  _getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "X-Title": "Q-Dev-AI"
    };
    if (process.env.CORS_ORIGIN) {
      headers["HTTP-Referer"] = process.env.CORS_ORIGIN;
    }
    return headers;
  }

  _buildMessages(history, text, personalizationPrompt = "") {
    const messages = [{ role: "system", content: `${SYSTEM_PROMPT}\n\n${personalizationPrompt}`.trim() }];

    if (Array.isArray(history)) {
      for (const item of history) {
        messages.push({
          role: item.role === "bot" ? "assistant" : "user",
          content: item.content
        });
      }
    }

    messages.push({ role: "user", content: text });
    return messages;
  }

  async *stream({ message, history, images, audios, videos, pdfs, personalizationPrompt }) {
    if (hasAnyMedia({ images, audios, videos, pdfs })) {
      throw new Error("Zenmux Atria Dawn is currently text-only.");
    }

    const response = await this.fetchWithRetry(this.apiUrl, {
      method: "POST",
      headers: this._getHeaders(),
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: this._buildMessages(history, message, personalizationPrompt)
      })
    });

    yield* this.parseSSEStream(response);
  }
}

module.exports = { ZenmuxProvider, DEFAULT_MODEL, ZENMUX_API_URL };
