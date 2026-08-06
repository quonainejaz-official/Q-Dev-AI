import { $id, showModal } from "./utils.js";
import {
  getCurrentChat, setCurrentChatState, persistState,
  getChatHistory as getHistory, deleteHistory
} from "./state.js";

const SIDEBAR_COLLAPSED_KEY = "qai-sidebar-collapsed";
const THEME_KEY = "qai_theme";

let appContainer, sidebarToggle, sidebarToggleMain, sidebarOverlay;
let chatHistoryList, newChatButton, newChatButtonMain;
let openHistoryMenu = null;

const closeHistoryMenu = () => {
  if (!openHistoryMenu) return;
  openHistoryMenu.menu.classList.remove("open");
  openHistoryMenu.button.setAttribute("aria-expanded", "false");
  openHistoryMenu = null;
};

export const closeSidebarOnMobile = () => {
  if (window.innerWidth <= 768 && appContainer) {
    appContainer.classList.add("sidebar-collapsed");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
  }
};

const toggleSidebar = () => {
  if (!appContainer) return;
  const isCollapsed = appContainer.classList.toggle("sidebar-collapsed");
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed);
  if (window.innerWidth <= 768) {
    if (isCollapsed) sidebarOverlay?.classList.remove("active");
    else sidebarOverlay?.classList.add("active");
  }
};

const loadSidebarState = () => {
  if (!appContainer) return;
  let isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (isCollapsed === null && window.innerWidth <= 768) isCollapsed = "true";
  else isCollapsed = isCollapsed === "true";
  if (isCollapsed) {
    appContainer.classList.add("sidebar-collapsed");
    sidebarOverlay?.classList.remove("active");
  } else if (window.innerWidth <= 768) {
    sidebarOverlay?.classList.add("active");
  }
};

// --- Theme ---
export const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
};

const loadTheme = () => {
  let saved = localStorage.getItem(THEME_KEY);
  if (saved?.startsWith('"')) {
    try { saved = JSON.parse(saved); } catch { saved = null; }
  }
  if (saved === "system") {
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", sys);
  } else if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
  }
};

// --- Logo ---
const renderWordmark = (containerId, isLarge = false) => {
  const container = $id(containerId);
  if (!container) return;
  const wrap = document.createElement("div");
  wrap.className = `wordmark-wrapper ${isLarge ? "large" : ""}`;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "wordmark-icon");
  const circle = document.createElementNS(svgNS, "circle");
  circle.setAttribute("cx", "12"); circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9"); circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "2.5"); circle.setAttribute("fill", "none");
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", "18"); line.setAttribute("y1", "18");
  line.setAttribute("x2", "22"); line.setAttribute("y2", "22");
  line.setAttribute("stroke", "currentColor"); line.setAttribute("stroke-width", "2.5");
  line.setAttribute("stroke-linecap", "round");
  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("cx", "12"); dot.setAttribute("cy", "12");
  dot.setAttribute("r", "3"); dot.setAttribute("fill", "var(--accent-blue)");
  svg.append(circle, line, dot);
  const text = document.createElement("div");
  text.className = "wordmark-text";
  text.innerHTML = '<span class="q-letter">Q</span><span class="dev-part">-Dev</span><span class="ai-part">-AI</span>';
  wrap.append(svg, text);
  container.innerHTML = "";
  container.appendChild(wrap);
};

// --- History list ---

const lastActivity = (chat) => {
  const msgs = chat?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return 0;
  const ts = msgs[msgs.length - 1]?.timestamp;
  return typeof ts === "number" ? ts : 0;
};

// The sidebar used to print a hardcoded "Today" heading over every chat.
// Bucket by real last-activity instead.
const bucketFor = (ts) => {
  if (!ts) return "Older";
  const day = 24 * 60 * 60 * 1000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const start = midnight.getTime();
  if (ts >= start) return "Today";
  if (ts >= start - day) return "Yesterday";
  if (ts >= start - 7 * day) return "Previous 7 days";
  if (ts >= start - 30 * day) return "Previous 30 days";
  return "Older";
};

export const renderHistoryList = () => {
  if (!chatHistoryList) return;
  const history = getHistory();
  const current = getCurrentChat();
  chatHistoryList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No chats yet.";
    chatHistoryList.appendChild(empty);
    return;
  }

  let currentBucket = null;
  [...history]
    .sort((a, b) => lastActivity(b) - lastActivity(a))
    .forEach((chat) => {
    const bucket = bucketFor(lastActivity(chat));
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      const label = document.createElement("p");
      label.className = "history-label";
      label.textContent = bucket;
      chatHistoryList.appendChild(label);
    }
    const item = document.createElement("div");
    item.className = "history-item" + (chat.id === current.id ? " active" : "");
    const titleContainer = document.createElement("div");
    titleContainer.className = "history-title-container";
    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = chat.title || "New Chat";
    const historyIcon = document.createElement("span");
    historyIcon.className = "history-icon";
    historyIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
    const startRename = () => {
      const input = document.createElement("input");
      input.className = "history-title-input";
      input.value = chat.title || "New Chat";
      let saved = false;
      const save = () => {
        if (saved) return;
        saved = true;
        const newTitle = input.value.trim() || "New Chat";
        chat.title = newTitle;
        chat.titleIsCustom = true;
        const cur = getCurrentChat();
        if (chat.id === cur.id) {
          cur.title = newTitle;
          cur.titleIsCustom = true;
          setCurrentChatState(cur);
          const titleEl = $id("currentChatTitle");
          if (titleEl) titleEl.textContent = newTitle;
        }
        persistState();
        renderHistoryList();
      };
      input.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter") save();
        if (e2.key === "Escape") {
          saved = true;
          renderHistoryList();
        }
      });
      input.addEventListener("blur", save);
      titleContainer.replaceChild(input, title);
      input.focus();
      input.select();
    };

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "history-menu-btn";
    menuButton.setAttribute("aria-label", `Manage ${chat.title || "chat"}`);
    menuButton.setAttribute("aria-haspopup", "menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

    const menu = document.createElement("div");
    menu.className = "history-menu";
    menu.setAttribute("role", "menu");

    const addMenuAction = (label, icon, handler, danger = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `history-menu-item${danger ? " danger" : ""}`;
      button.setAttribute("role", "menuitem");
      button.innerHTML = `${icon}<span>${label}</span>`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeHistoryMenu();
        handler();
      });
      menu.appendChild(button);
    };

    addMenuAction("Rename", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>', startRename);
    addMenuAction("Share", '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>', () => {
      document.querySelector("share-modal")?.open(chat.id);
    });
    addMenuAction("Delete", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>', () => {
      showModal("Delete Chat", `Delete “${chat.title || "New Chat"}”? This cannot be undone.`, () => {
        deleteHistory(chat.id);
        renderHistoryList();
      });
    }, true);

    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = openHistoryMenu?.menu === menu;
      closeHistoryMenu();
      if (!wasOpen) {
        menu.classList.add("open");
        menuButton.setAttribute("aria-expanded", "true");
        openHistoryMenu = { menu, button: menuButton };
      }
    });

    titleContainer.append(historyIcon, title);
    item.addEventListener("click", () => {
      closeHistoryMenu();
      window.dispatchEvent(new CustomEvent("qai:loadChat", { detail: { id: chat.id } }));
    });
    item.append(titleContainer, menuButton, menu);
    chatHistoryList.appendChild(item);
  });
};

// --- Init ---
export const initSidebar = () => {
  appContainer = $id("appContainer") || document.querySelector(".app-container");
  sidebarToggle = $id("sidebarToggle") || document.querySelector(".sidebar-toggle");
  sidebarToggleMain = $id("sidebarToggleMain") || document.querySelector(".sidebar-toggle-main");
  sidebarOverlay = $id("sidebarOverlay");
  chatHistoryList = $id("chatHistory");
  newChatButton = $id("newChatButton");
  newChatButtonMain = $id("newChatButtonMain");

  if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
  if (sidebarToggleMain) sidebarToggleMain.addEventListener("click", toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebarOnMobile);
  document.addEventListener("click", closeHistoryMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHistoryMenu();
  });

  loadSidebarState();
  loadTheme();
  renderWordmark("sidebarLogo");
  renderWordmark("welcomeLogo", true);
};
