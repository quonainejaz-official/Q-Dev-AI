import { $id, showToast, escapeHtml, decodeEntities, decodeHtml, highlightCode, formatText, copyToClipboard } from "./utils.js";
import {
  getCurrentChat, setCurrentChatState, setCurrentChat, getTitleFromMessages,
  normalizeMessages, normalizeChatEntry, ensureCurrentInHistory,
  syncCurrentChatToHistoryIfExists, persistState, createChat, storeCurrentInHistory
} from "./state.js";
import { renderHistoryList, closeSidebarOnMobile } from "./sidebar.js";

let messagesContainer, chatForm, messageInput, sendButton, typingIndicator;
let welcomeScreen, chatArea, currentChatTitle;
let editChatTitleBtn;
let thinkingStatusTextEl, thinkingElapsedEl, stopButton, scrollToBottomBtn;
let thinkingStartTime = null;
let thinkingInterval = null;
let clientPhaseTimers = [];
let currentThinkingDuration = null;

export const detectQueryIntent = (text) => {
  if (!text || typeof text !== "string") {
    return { text: "Thinking...", phase: "thinking" };
  }
  const lower = text.toLowerCase();
  if (/(?:fix|error|bug|exception|traceback|syntax|debug|undefined|null|cannot read|fail|crash)/i.test(lower)) {
    return { text: "Analyzing code & debugging...", phase: "analyzing" };
  }
  if (/(?:function|component|class|api|endpoint|sql|database|query|react|node|python|docker|css|html|regex|algorithm)/i.test(lower)) {
    return { text: "Analyzing code structure...", phase: "analyzing" };
  }
  if (/(?:search|find|lookup|who|when|where|what is|how to|latest|news|history|tell me about)/i.test(lower)) {
    return { text: "Searching knowledge base...", phase: "searching" };
  }
  if (/(?:solve|math|calculate|derive|formula|complexity|proof|theorem|logic)/i.test(lower)) {
    return { text: "Formulating logical steps...", phase: "deep-thinking" };
  }
  if (/(?:write|draft|generate|create|compose|story|email|essay|blog|poem)/i.test(lower)) {
    return { text: "Crafting response...", phase: "generating" };
  }
  if (/(?:compare|vs|difference|pros and cons|analyze|evaluate|review)/i.test(lower)) {
    return { text: "Evaluating & analyzing...", phase: "analyzing" };
  }
  return { text: "Thinking...", phase: "thinking" };
};

export const updateThinkingStatus = (text, phase) => {
  if (!typingIndicator) typingIndicator = $id("typingIndicator");
  if (phase && typingIndicator) {
    typingIndicator.dataset.phase = phase;
  }
  if (!thinkingStatusTextEl) thinkingStatusTextEl = $id("thinkingStatusText");
  if (thinkingStatusTextEl && text) {
    thinkingStatusTextEl.style.opacity = "0";
    setTimeout(() => {
      if (thinkingStatusTextEl) {
        thinkingStatusTextEl.textContent = text;
        thinkingStatusTextEl.style.opacity = "1";
      }
    }, 120);
  }
};

export const setTyping = (active, queryText = "") => {
  if (!typingIndicator) typingIndicator = $id("typingIndicator");
  if (!stopButton) stopButton = $id("stopButton");
  if (!thinkingStatusTextEl) thinkingStatusTextEl = $id("thinkingStatusText");
  if (!thinkingElapsedEl) thinkingElapsedEl = $id("thinkingElapsed");

  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  clientPhaseTimers.forEach(clearTimeout);
  clientPhaseTimers = [];

  if (active) {
    const intent = detectQueryIntent(queryText);
    if (typingIndicator) {
      typingIndicator.classList.remove("hidden");
      typingIndicator.dataset.phase = intent.phase;
    }

    if (thinkingStatusTextEl) {
      thinkingStatusTextEl.textContent = intent.text;
      thinkingStatusTextEl.style.opacity = "1";
    }

    thinkingStartTime = Date.now();
    currentThinkingDuration = null;
    if (thinkingElapsedEl) {
      thinkingElapsedEl.textContent = "0.0s";
      thinkingInterval = setInterval(() => {
        if (!thinkingStartTime || !thinkingElapsedEl) return;
        const elapsedSec = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
        thinkingElapsedEl.textContent = `${elapsedSec}s`;
      }, 100);
    }

    // Dynamic progression phases (Claude/Codex style)
    const phases = [
      { delay: 1400, text: "Analyzing context & semantics...", phase: "analyzing" },
      { delay: 3400, text: "Searching relevant patterns...", phase: "searching" },
      { delay: 6000, text: "Structuring solution...", phase: "generating" },
      { delay: 9500, text: "Deep thinking & refining...", phase: "deep-thinking" },
      { delay: 14000, text: "Synthesizing comprehensive response...", phase: "processing" }
    ];
    phases.forEach((p) => {
      const t = setTimeout(() => {
        if (typingIndicator && !typingIndicator.classList.contains("hidden")) {
          updateThinkingStatus(p.text, p.phase);
        }
      }, p.delay);
      clientPhaseTimers.push(t);
    });

    if (stopButton) {
      stopButton.classList.remove("hidden");
      stopButton.classList.add("visible");
    }

    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } else {
    if (thinkingStartTime) {
      currentThinkingDuration = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
    }
    if (typingIndicator) {
      typingIndicator.classList.add("hidden");
    }
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
    clientPhaseTimers.forEach(clearTimeout);
    clientPhaseTimers = [];
    if (stopButton) {
      stopButton.classList.add("hidden");
      stopButton.classList.remove("visible");
    }
  }
};

export const renderTokenInfo = (bubble, usage, provider) => {
  if (!bubble) return;
  let meta = bubble.querySelector(".message-token-info");
  if (!meta) {
    meta = document.createElement("div");
    meta.className = "message-token-info";
    bubble.appendChild(meta);
  }
  const parts = [];
  if (provider) {
    parts.push(`<span>${escapeHtml(provider)}</span>`);
  }
  if (usage?.tokensOut) {
    parts.push(`<span>${usage.tokensOut} tokens</span>`);
  } else if (usage?.totalTokens) {
    parts.push(`<span>${usage.totalTokens} tokens</span>`);
  }
  if (parts.length > 0) {
    meta.innerHTML = parts.join('<span class="token-dot"></span>');
  }
};

export const buildMessageContent = (content) => {
  const wrapper = document.createElement("div");
  wrapper.className = "message-content";
  const decoded = decodeEntities(content);
  const segments = decoded.split(/```/);

  segments.forEach((segment, index) => {
    if (!segment) return;
    if (index % 2 === 1) {
      const container = document.createElement("div");
      container.className = "code-block-container";
      let language = "code";
      let codeText = segment;
      const nl = segment.indexOf("\n");
      if (nl !== -1) {
        language = segment.slice(0, nl).trim() || "code";
        codeText = segment.slice(nl + 1);
      }
      const header = document.createElement("div");
      header.className = "code-block-header";
      const langLabel = document.createElement("span");
      langLabel.className = "code-lang";
      langLabel.textContent = language;
      const copyBtn = document.createElement("button");
      copyBtn.className = "code-copy-btn";
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
      copyBtn.addEventListener("click", async () => {
        if (await copyToClipboard(codeText.trim())) {
          copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>';
          copyBtn.classList.add("success");
          setTimeout(() => {
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
            copyBtn.classList.remove("success");
          }, 2000);
        }
      });
      header.append(langLabel, copyBtn);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.dataset.language = language;
      code.innerHTML = highlightCode(codeText.replace(/\n$/, ""));
      pre.appendChild(code);
      container.append(header, pre);
      wrapper.appendChild(container);

      // Canvas button for HTML/CSS/JS
      const lang = language.toLowerCase();
      if (["html", "css", "javascript", "js"].includes(lang)) {
        const canvasBtn = document.createElement("button");
        canvasBtn.className = "code-canvas-btn";
        canvasBtn.textContent = "Canvas";
        canvasBtn.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("qai:openCanvas", {
            detail: { code: codeText.trim(), language: lang }
          }));
        });
        header.appendChild(canvasBtn);
      }
      return;
    }
    const textBlock = document.createElement("div");
    textBlock.className = "message-text";
    const lines = segment.split("\n");
    let currentList = null;
    let htmlContent = "";
    let inTable = false;

    const closeList = () => {
      if (currentList) { htmlContent += `</${currentList}>`; currentList = null; }
    };
    const flushTable = () => {
      if (inTable) { htmlContent += "</tbody></table>"; inTable = false; }
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) { flushTable(); closeList(); return; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushTable(); closeList(); htmlContent += "<hr>"; return; }
      if (/^\|.+\|$/.test(trimmed)) {
        closeList();
        const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
        if (cells.every(c => /^-+\s*:?$/.test(c))) return;
        if (!inTable) {
          htmlContent += "<table><thead><tr>";
          cells.forEach(c => { htmlContent += "<th>" + formatText(c) + "</th>"; });
          htmlContent += "</tr></thead><tbody>";
          inTable = true;
        } else {
          htmlContent += "<tr>";
          cells.forEach(c => { htmlContent += "<td>" + formatText(c) + "</td>"; });
          htmlContent += "</tr>";
        }
        return;
      }
      flushTable();
      if (/^>\s/.test(trimmed)) {
        closeList();
        htmlContent += "<blockquote><p>" + formatText(trimmed.replace(/^>\s*/, "")) + "</p></blockquote>";
        return;
      }
      const hm = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (hm) {
        closeList();
        const lvl = hm[1].length;
        htmlContent += `<h${lvl} class="msg-h${lvl}">${formatText(hm[2])}</h${lvl}>`;
        return;
      }
      if (/^\d+\.\s/.test(trimmed)) {
        flushTable();
        if (currentList !== "ol") { closeList(); htmlContent += "<ol>"; currentList = "ol"; }
        htmlContent += `<li>${formatText(trimmed.replace(/^\d+\.\s/, ""))}</li>`;
        return;
      }
      if (/^[\-\*]\s/.test(trimmed)) {
        flushTable();
        if (currentList !== "ul") { closeList(); htmlContent += "<ul>"; currentList = "ul"; }
        htmlContent += `<li>${formatText(trimmed.slice(2))}</li>`;
        return;
      }
      closeList();
      htmlContent += `<p>${formatText(trimmed)}</p>`;
    });
    flushTable();
    closeList();
    if (currentList) htmlContent += `</${currentList}>`;
    textBlock.innerHTML = htmlContent || segment;
    wrapper.appendChild(textBlock);
  });

  if (!wrapper.childNodes.length) {
    const tb = document.createElement("div");
    tb.className = "message-text";
    tb.textContent = decoded;
    wrapper.appendChild(tb);
  }
  return wrapper;
};

export const appendMessageToUI = (message) => {
  if (!messagesContainer) return;
  const bubble = document.createElement("div");
  bubble.className = `message ${message.role}`;

  if (message.role === "user") {
    if (message.images?.length) {
      const wrap = document.createElement("div");
      wrap.className = "message-images";
      message.images.forEach(src => {
        const img = document.createElement("img");
        img.className = "message-image";
        img.src = src;
        img.alt = "Attached image";
        wrap.appendChild(img);
      });
      bubble.appendChild(wrap);
    }
    if (message.audios?.length) {
      const wrap = document.createElement("div");
      wrap.className = "message-audios";
      message.audios.forEach(() => {
        const tag = document.createElement("div");
        tag.className = "message-audio-tag";
        tag.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>Audio file</span>';
        wrap.appendChild(tag);
      });
      bubble.appendChild(wrap);
    }
    if (message.videos?.length) {
      const wrap = document.createElement("div");
      wrap.className = "message-audios";
      message.videos.forEach(() => {
        const tag = document.createElement("div");
        tag.className = "message-audio-tag";
        tag.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span>Video file</span>';
        wrap.appendChild(tag);
      });
      bubble.appendChild(wrap);
    }
    if (message.pdfs?.length) {
      const wrap = document.createElement("div");
      wrap.className = "message-audios";
      message.pdfs.forEach(() => {
        const tag = document.createElement("div");
        tag.className = "message-audio-tag";
        tag.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>PDF file</span>';
        wrap.appendChild(tag);
      });
      bubble.appendChild(wrap);
    }
  }

  if (message.role === "bot" && message.thoughtDuration && Number(message.thoughtDuration) >= 0.3) {
    const thoughtHeader = document.createElement("div");
    thoughtHeader.className = "thought-badge";
    thoughtHeader.innerHTML = `
      <svg class="thought-badge-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>Thought for ${escapeHtml(String(message.thoughtDuration))}s</span>
    `;
    bubble.appendChild(thoughtHeader);
  }

  const content = buildMessageContent(message.content);
  bubble.appendChild(content);

  if (message.role === "bot" && (message.usage || message.provider)) {
    renderTokenInfo(bubble, message.usage, message.provider);
  }

  if (message.generatedImage) {
    const imgContainer = document.createElement("div");
    imgContainer.style.textAlign = "center";
    imgContainer.style.padding = "12px 0";
    const img = document.createElement("img");
    img.src = message.generatedImage;
    img.alt = message.generatedPrompt || "";
    img.style.cssText = "max-width:100%;max-height:400px;border-radius:12px;border:1px solid var(--border-color);cursor:pointer";
    img.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("qai:openImageViewer", {
        detail: { dataUrl: message.generatedImage, prompt: message.generatedPrompt || "" }
      }));
    });
    imgContainer.appendChild(img);
    content.appendChild(imgContainer);
  }

  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "message-action-btn copy-btn";
  copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copyBtn.title = "Copy message";
  copyBtn.addEventListener("click", async () => {
    if (await copyToClipboard(message.content)) {
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      }, 2000);
    }
  });
  const editBtn = document.createElement("button");
  editBtn.className = "message-action-btn edit-btn";
  editBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  editBtn.title = "Edit message";
  editBtn.addEventListener("click", () => {
    if (messageInput) {
      messageInput.value = message.content;
      messageInput.focus();
      messageInput.style.height = "auto";
      messageInput.style.height = messageInput.scrollHeight + "px";
    }
  });
  actions.append(copyBtn, editBtn);
  bubble.appendChild(actions);
  messagesContainer.appendChild(bubble);

  const cur = getCurrentChat();
  if (cur.messages.length > 0) {
    welcomeScreen?.classList.add("hidden");
    chatArea?.classList.remove("hidden");
  } else {
    welcomeScreen?.classList.remove("hidden");
    chatArea?.classList.add("hidden");
  }
};

export const renderMessages = (messages) => {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = "";
  if (messages?.length) {
    messages.forEach(appendMessageToUI);
    welcomeScreen?.classList.add("hidden");
    chatArea?.classList.remove("hidden");
  } else {
    welcomeScreen?.classList.remove("hidden");
    chatArea?.classList.add("hidden");
  }
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

export const addMessageToCurrent = (role, content, media) => {
  const cur = getCurrentChat();
  const message = { role, content, timestamp: Date.now() };
  if (media) {
    if (media.images?.length) message.images = media.images;
    if (media.audios?.length) message.audios = media.audios;
    if (media.videos?.length) message.videos = media.videos;
    if (media.pdfs?.length) message.pdfs = media.pdfs;
    if (media.generatedImage) message.generatedImage = media.generatedImage;
    if (media.generatedPrompt) message.generatedPrompt = media.generatedPrompt;
  }
  cur.messages.push(message);
  if (!cur.titleIsCustom) {
    cur.title = getTitleFromMessages(cur.messages);
    if (currentChatTitle) currentChatTitle.textContent = cur.title;
  }
  appendMessageToUI(message);
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (scrollToBottomBtn) scrollToBottomBtn.classList.add("hidden");
  }
  syncCurrentChatToHistoryIfExists();
  persistState();
};

// --- Streaming ---
const isNearBottom = () => {
  if (!messagesContainer) return true;
  return (
    messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120
  );
};

export const startStreamEvent = (reader, decoder) => {
  let buffer = "";
  let streamingMsg = null;
  let sseType = null;
  let isStreamActive = true;

  const handleSSEMessage = (msg) => {
    if (!msg || !isStreamActive) return null;

    if (msg.type === "status") {
      updateThinkingStatus(msg.text, msg.phase);
    } else if (msg.type === "typing") {
      setTyping(msg.active);
    } else if (msg.type === "start") {
      setTyping(false);
      const thoughtTime = currentThinkingDuration || (thinkingStartTime ? ((Date.now() - thinkingStartTime) / 1000).toFixed(1) : null);
      streamingMsg = {
        role: "bot",
        content: "",
        thoughtDuration: thoughtTime && Number(thoughtTime) >= 0.3 ? thoughtTime : null,
        provider: msg.provider || null,
        timestamp: Date.now()
      };
      getCurrentChat().messages.push(streamingMsg);
      appendMessageToUI(streamingMsg);
    } else if (msg.type === "chunk" && streamingMsg) {
      const stick = isNearBottom();
      streamingMsg.content += decodeHtml(msg.text);
      const lastBubble = messagesContainer?.lastElementChild;
      if (lastBubble) {
        const wrapper = lastBubble.querySelector(".message-content");
        if (wrapper) {
          const rebuilt = buildMessageContent(streamingMsg.content);
          const cursor = document.createElement("span");
          cursor.className = "streaming-cursor";
          rebuilt.appendChild(cursor);
          wrapper.innerHTML = "";
          while (rebuilt.firstChild) wrapper.appendChild(rebuilt.firstChild);
        }
        if (stick) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    } else if (msg.type === "done") {
      if (streamingMsg) {
        const lastBubble = messagesContainer?.lastElementChild;
        if (lastBubble) {
          const wrapper = lastBubble.querySelector(".message-content");
          if (wrapper) {
            const rebuilt = buildMessageContent(streamingMsg.content);
            wrapper.innerHTML = "";
            while (rebuilt.firstChild) wrapper.appendChild(rebuilt.firstChild);
          }
          const cursor = lastBubble.querySelector(".streaming-cursor");
          if (cursor) cursor.remove();

          if (msg.usage || streamingMsg.provider) {
            renderTokenInfo(lastBubble, msg.usage, streamingMsg.provider);
          }
        }
        const cur = getCurrentChat();
        if (!cur.titleIsCustom) {
          cur.title = getTitleFromMessages(cur.messages);
          if (currentChatTitle) currentChatTitle.textContent = cur.title;
        }
        syncCurrentChatToHistoryIfExists();
        persistState();
        streamingMsg = null;
      }
      return "done";
    } else if (msg.type === "error") {
      if (streamingMsg) {
        const cur = getCurrentChat();
        const idx = cur.messages.indexOf(streamingMsg);
        if (idx !== -1) cur.messages.splice(idx, 1);
        if (messagesContainer?.lastElementChild?.classList.contains("message")) {
          messagesContainer.lastElementChild.remove();
        }
        streamingMsg = null;
      }
      addMessageToCurrent("bot", msg.message || "Something went wrong.");
      return "error";
    }
    return null;
  };

  const abortHandler = () => {
    isStreamActive = false;
    setTyping(false);
    if (streamingMsg) {
      const lastBubble = messagesContainer?.lastElementChild;
      if (lastBubble) {
        const cursor = lastBubble.querySelector(".streaming-cursor");
        if (cursor) cursor.remove();
        const wrapper = lastBubble.querySelector(".message-content");
        if (wrapper) {
          const rebuilt = buildMessageContent(streamingMsg.content);
          wrapper.innerHTML = "";
          while (rebuilt.firstChild) wrapper.appendChild(rebuilt.firstChild);
        }
      }
      const cur = getCurrentChat();
      if (!cur.titleIsCustom) {
        cur.title = getTitleFromMessages(cur.messages);
        if (currentChatTitle) currentChatTitle.textContent = cur.title;
      }
      syncCurrentChatToHistoryIfExists();
      persistState();
      streamingMsg = null;
    }
  };
  window.addEventListener("qai:streamAborted", abortHandler, { once: true });

  return {
    readNext: async () => {
      while (true) {
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("event: ")) {
            sseType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const rawData = line.slice(6);
            let msg;
            try { msg = JSON.parse(rawData); } catch { sseType = null; continue; }
            msg.type = msg.type || sseType;
            sseType = null;
            const res = handleSSEMessage(msg);
            if (res) return res;
            continue;
          }
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          const res = handleSSEMessage(msg);
          if (res) return res;
        }

        let readResult;
        try { readResult = await reader.read(); } catch (err) {
          window.removeEventListener("qai:streamAborted", abortHandler);
          if (err && err.name === "AbortError") {
            abortHandler();
            return "done";
          }
          if (streamingMsg?.content.trim()) {
            const cur = getCurrentChat();
            if (!cur.titleIsCustom) {
              cur.title = getTitleFromMessages(cur.messages);
              if (currentChatTitle) currentChatTitle.textContent = cur.title;
            }
            syncCurrentChatToHistoryIfExists();
            persistState();
            streamingMsg = null;
            return "done";
          }
          throw err;
        }
        if (readResult.done) {
          window.removeEventListener("qai:streamAborted", abortHandler);
          return "done";
        }
        buffer += decoder.decode(readResult.value, { stream: true });
      }
    }
  };
};

// --- Load chat from history ---
export const loadChatFromHistory = async (id) => {
  const { getChatHistory } = await import("./state.js");
  const chat = getChatHistory().find(c => c.id === id);
  if (!chat) { showToast("Chat not found.", "error"); return; }
  storeCurrentInHistory();
  const updated = setCurrentChat(chat);
  renderMessages(updated.messages);
  renderHistoryList();
  closeSidebarOnMobile();
  showToast("Chat loaded.", "success");
};

// --- Handle edit title ---
const handleEditChatTitle = () => {
  if (!currentChatTitle || !editChatTitleBtn) return;
  const cur = getCurrentChat();
  const input = document.createElement("input");
  input.className = "chat-title-input";
  input.value = cur.title || "New Chat";
  const save = () => {
    const newTitle = input.value.trim() || "New Chat";
    cur.title = newTitle;
    cur.titleIsCustom = true;
    const idx = getHistory().findIndex(c => c.id === cur.id);
    if (idx !== -1) { getHistory()[idx].title = newTitle; getHistory()[idx].titleIsCustom = true; }
    currentChatTitle.textContent = newTitle;
    currentChatTitle.style.display = "block";
    editChatTitleBtn.style.display = "flex";
    input.remove();
    persistState();
    renderHistoryList();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") { currentChatTitle.style.display = "block"; editChatTitleBtn.style.display = "flex"; input.remove(); }
  });
  input.addEventListener("blur", save);
  currentChatTitle.style.display = "none";
  editChatTitleBtn.style.display = "none";
  currentChatTitle.parentNode.insertBefore(input, currentChatTitle.nextSibling);
  input.focus();
  input.select();
};

const getHistory = () => {
  // Dynamic import to avoid circular dependency
  return (window.__getChatHistory || (() => []))();
};

// --- Init ---
export const initChat = () => {
  messagesContainer = $id("messages");
  chatForm = $id("chatForm");
  messageInput = $id("messageInput");
  sendButton = $id("sendButton");
  typingIndicator = $id("typingIndicator");
  welcomeScreen = $id("welcomeScreen");
  chatArea = $id("chatArea");
  currentChatTitle = $id("currentChatTitle");
  editChatTitleBtn = $id("editChatTitleBtn");
  stopButton = $id("stopButton");
  thinkingStatusTextEl = $id("thinkingStatusText");
  thinkingElapsedEl = $id("thinkingElapsed");
  scrollToBottomBtn = $id("scrollToBottomBtn");

  if (scrollToBottomBtn && messagesContainer) {
    messagesContainer.addEventListener("scroll", () => {
      const nearBottom = isNearBottom();
      scrollToBottomBtn.classList.toggle("hidden", nearBottom);
    });

    scrollToBottomBtn.addEventListener("click", () => {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth"
      });
      scrollToBottomBtn.classList.add("hidden");
    });
  }

  if (stopButton) {
    stopButton.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("qai:stopGeneration"));
    });
  }

  if (editChatTitleBtn) editChatTitleBtn.addEventListener("click", handleEditChatTitle);

  if (chatForm) {
    chatForm.addEventListener("submit", (e) => { e.preventDefault(); submitMessage(); });
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitMessage(); }
    });
  }

  // Listen for custom events
  window.addEventListener("qai:loadChat", (e) => loadChatFromHistory(e.detail.id));
};

// Submit message (exported for media.js to call)
export const submitMessage = async () => {
  // Will be wired up by app.js after all modules init
  if (window.__submitMessage) return window.__submitMessage();
};

export const setMessageInput = (el) => { messageInput = el; };
export const setSendButton = (el) => { sendButton = el; };
export const getMessageInput = () => messageInput;
export const getSendButton = () => sendButton;
