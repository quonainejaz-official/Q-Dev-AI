const { OpenAIProvider } = require("../src/providers/openai");
const { AnthropicProvider } = require("../src/providers/anthropic");
const { GeminiProvider } = require("../src/providers/gemini");
const { OpenCodeProvider } = require("../src/providers/opencode");
const { ZenmuxProvider } = require("../src/providers/zenmux");
const { BaseProvider } = require("../src/providers/base");

describe("OpenAIProvider", () => {
  let provider;

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: "test-key" });
  });

  test("has correct capabilities", () => {
    const caps = provider.capabilities;
    expect(caps.chat).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.tools).toBe(true);
    expect(caps.models).toContain("gpt-4o");
  });

  test("canHandle returns true for supported capabilities", () => {
    expect(provider.canHandle({ chat: true })).toBe(true);
    expect(provider.canHandle({ vision: true })).toBe(true);
    expect(provider.canHandle({ streaming: true })).toBe(true);
  });

  test("canHandle returns false for unsupported capabilities", () => {
    expect(provider.canHandle({ audio: true })).toBe(false);
    expect(provider.canHandle({ embeddings: true })).toBe(false);
  });
});

describe("AnthropicProvider", () => {
  let provider;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: "test-key" });
  });

  test("has correct capabilities", () => {
    const caps = provider.capabilities;
    expect(caps.chat).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.tools).toBe(true);
    expect(caps.maxContext).toBe(200000);
    expect(caps.models).toContain("claude-sonnet-4-20250514");
  });

  test("canHandle returns true for supported capabilities", () => {
    expect(provider.canHandle({ chat: true })).toBe(true);
    expect(provider.canHandle({ vision: true })).toBe(true);
  });

  test("canHandle returns false for unsupported capabilities", () => {
    expect(provider.canHandle({ audio: true })).toBe(false);
  });
});

describe("GeminiProvider", () => {
  let provider;

  beforeEach(() => {
    provider = new GeminiProvider({ apiKey: "test-key" });
  });

  test("has correct capabilities", () => {
    const caps = provider.capabilities;
    expect(caps.chat).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.tools).toBe(false);
    expect(caps.maxContext).toBe(1000000);
    expect(caps.models).toContain("gemini-2.0-flash");
  });

  test("canHandle returns true for supported capabilities", () => {
    expect(provider.canHandle({ chat: true })).toBe(true);
    expect(provider.canHandle({ vision: true })).toBe(true);
  });

  test("canHandle returns false for unsupported capabilities", () => {
    expect(provider.canHandle({ tools: true })).toBe(false);
    expect(provider.canHandle({ audio: true })).toBe(false);
  });
});

describe("ZenmuxProvider", () => {
  test("defaults to atria-asi/atria-dawn", () => {
    const provider = new ZenmuxProvider({ apiKey: "test-key" });
    expect(provider.model).toBe("atria-asi/atria-dawn");
    expect(provider.capabilities.models).toContain("atria-asi/atria-dawn");
    expect(provider.capabilities.streaming).toBe(true);
    expect(provider.capabilities.vision).toBe(false);
  });

  test("builds text chat messages", () => {
    const provider = new ZenmuxProvider({ apiKey: "test-key" });
    const messages = provider._buildMessages([{ role: "user", content: "Hi" }], "Hello");
    expect(messages[0].role).toBe("system");
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "Hello",
    });
  });
});

describe("OpenCodeProvider", () => {
  test("uses plain string content for big-pickle text chat", async () => {
    const provider = new OpenCodeProvider({ apiKey: "test-key" });
    const messages = await provider._buildMessages([], "Hello", [], [], [], []);

    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "Hello",
    });
  });

  test("uses multimodal content array when attachments are present", async () => {
    const provider = new OpenCodeProvider({ apiKey: "test-key" });
    const messages = await provider._buildMessages([], "What is this?", ["data:image/png;base64,abc"], [], [], []);
    const userMessage = messages[messages.length - 1];

    expect(userMessage.role).toBe("user");
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual([
      { type: "text", text: "What is this?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    ]);
  });
});

describe("BaseProvider SSE parsing", () => {
  test("emits final content even when stream closes without DONE marker", async () => {
    const provider = new BaseProvider("mock");
    const encoder = new TextEncoder();
    const response = {
      body: [
        encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
        encoder.encode('data: {"choices":[{"message":{"content":" there"}}]}\n\n'),
      ],
    };

    const events = [];
    for await (const event of provider.parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "token", text: "Hi" },
      { type: "token", text: " there" },
      { type: "done", usage: null },
    ]);
  });

  test("surfaces provider error payloads", async () => {
    const provider = new BaseProvider("mock");
    const encoder = new TextEncoder();
    const response = {
      body: [
        encoder.encode('data: {"error":{"message":"bad model"}}\n\n'),
      ],
    };

    const events = [];
    for await (const event of provider.parseSSEStream(response)) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "error", error: "bad model" });
  });
});
