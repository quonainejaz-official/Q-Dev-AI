import { $id, showModal, hideModal, confirmModal, showToast } from "./utils.js";
import {
  loadStoredHistory, loadStoredCurrent, normalizeMessages, normalizeChatEntry,
  getCurrentChat, setCurrentChatState, setCurrentChat, getTitleFromMessages,
  ensureCurrentInHistory, persistState, createChat, storeCurrentInHistory
} from "./state.js";
import { initSidebar, renderHistoryList, closeSidebarOnMobile } from "./sidebar.js";
import {
  initChat, renderMessages, appendMessageToUI, addMessageToCurrent,
  setTyping, startStreamEvent, buildMessageContent, setMessageInput, setSendButton,
  getMessageInput, getSendButton, loadChatFromHistory
} from "./chat.js";
import { initMedia, getPendingImages, getPendingAudios, getPendingVideos, getPendingPdfs, clearPendingMedia, hasPendingMedia, isImageGenMode, exitImageMode, generateImageAndAppend, IMG_CMD } from "./media.js";
import { initCanvas } from "./canvas.js";
import { initAuth } from "./auth.js";
import { initSpeech } from "./speech.js";
import { initPdf } from "./pdf.js";
import { initSearchModal } from "./components/SearchModal.js";
import { StorageService } from "./services/StorageService.js";

// --- Message limits ---
const MESSAGE_LIMITS = { maxLines: 5000, maxChars: 50000, maxWords: 50000, maxTextareaHeightPx: 200 };
let lastLimitToastAt = 0;
let lastLimitToastKey = "";
let activeAbortController = null;

window.addEventListener("qai:stopGeneration", () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
    window.dispatchEvent(new CustomEvent("qai:streamAborted"));
  }
});

const countLines = (text) => text ? text.split(/\r\n|\r|\n/).length : 0;
const countWords = (text) => {
  const trimmed = text?.trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/\S+/g);
  return matches ? matches.length : 0;
};
const sliceToMaxWords = (text, max) => {
  if (!text) return text;
  const re = /\S+/g;
  let match, count = 0, endIdx = 0;
  while ((match = re.exec(text)) !== null) {
    count++;
    if (count === max) { endIdx = re.lastIndex; break; }
  }
  return endIdx ? text.slice(0, endIdx) : text;
};
const maybeToastLimit = (key, message) => {
  const now = Date.now();
  if (now - lastLimitToastAt < 1200 && lastLimitToastKey === key) return;
  lastLimitToastAt = now;
  lastLimitToastKey = key;
  showToast(message, "error");
};
const enforceMessageLimits = (value) => {
  let next = value;
  if (next.length > MESSAGE_LIMITS.maxChars) {
    next = next.slice(0, MESSAGE_LIMITS.maxChars);
    maybeToastLimit("chars", `Message too long. Max ${MESSAGE_LIMITS.maxChars.toLocaleString()} characters.`);
  }
  if (countLines(next) > MESSAGE_LIMITS.maxLines) {
    next = next.split(/\r\n|\r|\n/).slice(0, MESSAGE_LIMITS.maxLines).join("\n");
    maybeToastLimit("lines", `Too many lines. Max ${MESSAGE_LIMITS.maxLines.toLocaleString()} lines.`);
  }
  if (countWords(next) > MESSAGE_LIMITS.maxWords) {
    next = sliceToMaxWords(next, MESSAGE_LIMITS.maxWords);
    maybeToastLimit("words", `Too many words. Max ${MESSAGE_LIMITS.maxWords.toLocaleString()} words.`);
  }
  return next;
};

// --- Submit message ---
const submitMessage = async () => {
  const messageInput = getMessageInput();
  const sendButton = getSendButton();
  if (!messageInput) return;

  const enforced = enforceMessageLimits(messageInput.value);
  if (enforced !== messageInput.value) messageInput.value = enforced;
  const message = enforced.trim();
  const hasImages = getPendingImages().length > 0;
  const hasAudios = getPendingAudios().length > 0;
  const hasVideos = getPendingVideos().length > 0;
  const hasPdfs = getPendingPdfs().length > 0;
  const hasMedia = hasImages || hasAudios || hasVideos || hasPdfs;
  if (!message && !hasMedia) return;

  const isImagineCmd = message.startsWith(IMG_CMD) && !hasMedia;
  const shouldGenImage = isImagineCmd || (isImageGenMode() && !hasMedia);
  if (shouldGenImage) {
    const prompt = isImagineCmd ? message.slice(IMG_CMD.length).trim() : message;
    if (prompt) {
      if (isImageGenMode()) exitImageMode();
      addMessageToCurrent("user", message);
      messageInput.value = "";
      messageInput.style.height = "auto";
      sendButton.disabled = true;
      setTyping(true);
      await generateImageAndAppend(prompt);
      setTyping(false);
      sendButton.disabled = false;
      messageInput.focus();
      return;
    }
  }

  const cur = getCurrentChat();
  const historyForRequest = cur.messages.map(m => {
    const { images, audios, videos, pdfs, ...rest } = m;
    return rest;
  });
  const parts = [];
  if (hasImages) parts.push(`${getPendingImages().length} image${getPendingImages().length > 1 ? "s" : ""}`);
  if (hasAudios) parts.push(`${getPendingAudios().length} audio file${getPendingAudios().length > 1 ? "s" : ""}`);
  if (hasVideos) parts.push(`${getPendingVideos().length} video file${getPendingVideos().length > 1 ? "s" : ""}`);
  if (hasPdfs) parts.push(`${getPendingPdfs().length} PDF file${getPendingPdfs().length > 1 ? "s" : ""}`);
  const displayContent = message || `[${parts.join(", ")} attached]`;
  const mediaPayload = {};
  if (hasImages) mediaPayload.images = [...getPendingImages()];
  if (hasAudios) mediaPayload.audios = [...getPendingAudios()];
  if (hasVideos) mediaPayload.videos = [...getPendingVideos()];
  if (hasPdfs) mediaPayload.pdfs = [...getPendingPdfs()];
  addMessageToCurrent("user", displayContent, mediaPayload);
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendButton.disabled = true;

  const body = {
    message,
    history: historyForRequest,
    personalization: {
      customInstructions: StorageService.get("customInstructions") || "",
      responseStyle: StorageService.get("responseStyle") || "balanced",
      memoryEnabled: StorageService.get("memoryEnabled") !== "false"
    }
  };
  if (hasImages) body.images = mediaPayload.images;
  if (hasAudios) body.audios = mediaPayload.audios;
  if (hasVideos) body.videos = mediaPayload.videos;
  if (hasPdfs) body.pdfs = mediaPayload.pdfs;

  clearPendingMedia();
  const imageInput = $id("imageInput");
  const audioInput = $id("audioInput");
  const fileInput = $id("fileInput");
  if (imageInput) imageInput.value = "";
  if (audioInput) audioInput.value = "";
  if (fileInput) fileInput.value = "";
  // Trigger preview re-render (imported from media module)
  window.dispatchEvent(new CustomEvent("qai:clearPreviews"));

  setTyping(true, message);
  activeAbortController = new AbortController();
  try {
    const response = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      signal: activeAbortController.signal
    });
    if (!response.ok) {
      setTyping(false);
      if (response.status === 413) {
        addMessageToCurrent("bot", "File too large. Please use smaller files (max 4.5MB total per message on this hosting plan).");
      } else {
        const data = await response.json().catch(() => ({}));
        addMessageToCurrent("bot", data.error || "Something went wrong.");
      }
      sendButton.disabled = false;
      messageInput.focus();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const stream = startStreamEvent(reader, decoder);
    await stream.readNext();
  } catch (err) {
    setTyping(false);
    if (err && err.name === "AbortError") {
      window.dispatchEvent(new CustomEvent("qai:streamAborted"));
    } else {
      addMessageToCurrent("bot", "Network error. Please try again.");
    }
  } finally {
    activeAbortController = null;
    setTyping(false);
    sendButton.disabled = false;
    messageInput.focus();
  }
};

// Expose for other modules
window.__submitMessage = submitMessage;
window.__getChatHistory = () => {
  try {
    const stored = localStorage.getItem("qai-chat-history");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};
window.__getCurrentChatId = () => getCurrentChat()?.id;

// --- New chat ---
const handleNewChat = () => {
  const cur = getCurrentChat();
  const hasUserMessages = cur.messages.some(m => m.role === "user");
  if (!hasUserMessages) {
    renderMessages(cur.messages);
    closeSidebarOnMobile();
    const input = getMessageInput();
    if (input) input.focus();
    return;
  }
  storeCurrentInHistory();
  const newChat = createChat();
  setCurrentChatState(newChat);
  renderMessages([]);
  renderHistoryList();
  addMessageToCurrent("bot", "Hello! I am Q-Dev-AI, your coding assistant. Ask me anything!");
  persistState();
  closeSidebarOnMobile();
  const input = getMessageInput();
  if (input) input.focus();
  showToast("New chat started.", "success");
};

// --- Initialize ---
const initializeMessages = async () => {
  loadStoredHistory();
  const storedCurrent = loadStoredCurrent();
  const serverMessages = normalizeMessages(window.__INITIAL_MESSAGES__ || []);
  const storedMessages = normalizeMessages(storedCurrent?.messages || []);
  const initialMessages = storedMessages.length ? storedMessages : serverMessages;

  const chat = normalizeChatEntry({
    id: storedCurrent?.id, title: storedCurrent?.title,
    titleIsCustom: storedCurrent?.titleIsCustom, messages: initialMessages
  });
  setCurrentChatState(chat);
  ensureCurrentInHistory();
  renderMessages(initialMessages);
  renderHistoryList();
  persistState();
  if (!initialMessages.length) {
    addMessageToCurrent("bot", "Hello! I am Q-Dev-AI, your coding assistant. Ask me anything!");
  }
};

// --- Boot ---
const boot = () => {
  // Init all modules
  initSidebar();
  initChat();
  initMedia();
  initCanvas();
  initSpeech();
  initPdf();
  initAuth();
  initSearchModal();

  // Wire up message input for limits
  const messageInput = $id("messageInput");
  const sendButton = $id("sendButton");
  setMessageInput(messageInput);
  setSendButton(sendButton);

  if (messageInput) {
    messageInput.addEventListener("input", () => {
      const prev = messageInput.value;
      const next = enforceMessageLimits(prev);
      if (next !== prev) {
        const cursor = messageInput.selectionStart ?? next.length;
        const delta = prev.length - next.length;
        messageInput.value = next;
        const nextCursor = Math.max(0, cursor - Math.max(0, delta));
        messageInput.setSelectionRange(nextCursor, nextCursor);
      }
      messageInput.style.height = "auto";
      const targetHeight = Math.min(messageInput.scrollHeight, MESSAGE_LIMITS.maxTextareaHeightPx);
      messageInput.style.height = `${targetHeight}px`;
      messageInput.style.overflowY = messageInput.scrollHeight > MESSAGE_LIMITS.maxTextareaHeightPx ? "auto" : "hidden";
      if (sendButton) sendButton.disabled = !messageInput.value.trim();
    });
  }

  // New chat buttons
  const newChatButton = $id("newChatButton");
  const newChatButtonMain = $id("newChatButtonMain");
  newChatButton?.addEventListener("click", handleNewChat);
  newChatButtonMain?.addEventListener("click", handleNewChat);

  // Confirm modal
  const modalCancel = $id("modalCancel");
  const modalConfirm = $id("modalConfirm");
  modalCancel?.addEventListener("click", hideModal);
  modalConfirm?.addEventListener("click", confirmModal);

  // Custom events
  window.addEventListener("qai:loadChat", (e) => loadChatFromHistory(e.detail.id));

  // Initialize messages
  initializeMessages();
};

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
