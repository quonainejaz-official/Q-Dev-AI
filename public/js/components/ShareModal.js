/**
 * ShareModal — share chat with a public link.
 * <share-modal></share-modal>
 */
import { bus } from '../events/EventBus.js';
import { EVENTS } from '../events/events.js';
import { store } from '../store/Store.js';
import { ConversationService } from '../services/ConversationService.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { getServerId, getChatHistory, getCurrentChat } from '../state.js';

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host { display: none; position: fixed; inset: 0; z-index: 9998; }
  :host(.open) { display: flex; align-items: center; justify-content: center; }

  .backdrop {
    position: absolute; inset: 0; background: rgba(0,0,0,0.6);
    animation: fadeIn 0.15s ease;
  }

  .modal {
    position: relative; background: var(--modal-bg, var(--surface-bg, #202020));
    border: 1px solid var(--border-color, #333);
    border-radius: 16px; padding: 28px; max-width: 440px; width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: slideUp 0.2s ease;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px;
  }

  .title { font-size: 18px; font-weight: 600; color: var(--text-primary, #e0e0e0); }

  .close-btn {
    background: none; border: none; cursor: pointer; padding: 6px;
    color: var(--text-muted, #888); border-radius: 6px; display: flex;
    transition: color 0.15s, background 0.15s;
  }
  .close-btn:hover { color: var(--text-primary, #e0e0e0); background: rgba(255,255,255,0.1); }

  .share-options { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }

  .share-option {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px;
    background: var(--surface-elevated, var(--hover-bg, #272727)); border-radius: 10px;
    border: 1px solid var(--border-color, #333); cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .share-option:hover {
    border-color: var(--accent-color, #6c63ff);
    background: color-mix(in srgb, var(--accent-color, #6c63ff) 10%, var(--surface-elevated, #272727));
  }
  .share-option.active {
    border-color: var(--accent-color, #6c63ff);
    background: color-mix(in srgb, var(--accent-color, #6c63ff) 14%, var(--surface-elevated, #272727));
  }

  .share-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: var(--accent-color, #6c63ff); display: flex;
    align-items: center; justify-content: center; color: #fff; flex-shrink: 0;
  }

  .share-info { flex: 1; }
  .share-label { font-size: 14px; font-weight: 500; color: var(--text-primary, #e0e0e0); }
  .share-desc { font-size: 12px; color: var(--text-muted, #888); margin-top: 2px; }

  .link-section {
    background: var(--surface-elevated, var(--hover-bg, #272727)); border-radius: 10px;
    padding: 16px; border: 1px solid var(--border-color, #333);
  }

  .link-label {
    font-size: 12px; font-weight: 500; color: var(--text-muted, #888);
    margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
  }

  .link-row {
    display: flex; gap: 8px;
  }

  .link-input {
    flex: 1; padding: 10px 12px; border-radius: 8px;
    border: 1px solid var(--border-color, #333); background: var(--input-bg, #0d1117);
    color: var(--text-primary, #e0e0e0); font-size: 13px; outline: none;
    font-family: monospace;
  }
  .link-input:focus { border-color: var(--accent-color, #6c63ff); }

  .copy-btn {
    padding: 10px 16px; border-radius: 8px; border: none;
    background: var(--accent-color, #6c63ff); color: #fff; font-size: 13px;
    font-weight: 500; cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
  }
  .copy-btn:hover { opacity: 0.9; }
  .copy-btn.copied { background: #2ecc71; }

  .share-stats {
    display: flex; gap: 16px; margin-top: 12px; padding-top: 12px;
    border-top: 1px solid var(--border-color, #333);
  }
  .stat { font-size: 12px; color: var(--text-muted, #888); }
  .stat-value { font-weight: 600; color: var(--text-primary, #e0e0e0); }

  .error-msg {
    text-align: center; padding: 12px; color: #ef4444; font-size: 13px;
  }
</style>

<div class="backdrop"></div>
<div class="modal">
  <div class="header">
    <span class="title">Share Chat</span>
    <button class="close-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <div class="share-options">
    <div class="share-option active" data-share="link">
      <div class="share-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </div>
      <div class="share-info">
        <div class="share-label">Copy link</div>
        <div class="share-desc">Anyone with the link can view this chat</div>
      </div>
    </div>

    <div class="share-option" data-share="embed">
      <div class="share-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </div>
      <div class="share-info">
        <div class="share-label">Embed</div>
        <div class="share-desc">Embed this chat in your website</div>
      </div>
    </div>

  </div>

  <div class="link-section">
    <div class="link-label">Shareable Link</div>
    <div class="link-row">
      <input type="text" class="link-input" readonly placeholder="Generating link...">
      <button class="copy-btn">Copy</button>
    </div>
    <div class="share-stats">
      <div class="stat"><span class="stat-value views">0</span> views</div>
      <div class="stat">Created <span class="stat-date">just now</span></div>
    </div>
  </div>
</div>
`;

export class ShareModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._shareUrl = '';
    this._activeType = 'link';
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => this.close());
    this.shadowRoot.querySelector('.backdrop').addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.classList.contains('open')) this.close();
    });

    const input = this.shadowRoot.querySelector('.link-input');
    if (input) {
      input.addEventListener('click', () => {
        if (input.value) input.select();
      });
    }

    this.shadowRoot.querySelector('.copy-btn').addEventListener('click', () => {
      const textToCopy = input?.value || this._shareUrl;
      if (textToCopy) {
        copyToClipboard(textToCopy);
        const btn = this.shadowRoot.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }
    });

    this.shadowRoot.querySelectorAll('.share-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.share-option').forEach((o) => o.classList.remove('active'));
        opt.classList.add('active');
        this._activeType = opt.dataset.share || 'link';
        this._updateContent();
      });
    });
  }

  _updateContent() {
    const input = this.shadowRoot.querySelector('.link-input');
    const label = this.shadowRoot.querySelector('.link-label');
    if (!input || !label) return;

    if (this._activeType === 'embed') {
      label.textContent = 'Embed Code';
      if (this._shareUrl) {
        input.value = `<iframe src="${this._shareUrl}" width="100%" height="600" frameborder="0"></iframe>`;
      } else {
        input.value = '';
        input.placeholder = 'Generating embed code...';
      }
    } else {
      label.textContent = 'Shareable Link';
      if (this._shareUrl) {
        input.value = this._shareUrl;
      } else {
        input.value = '';
        input.placeholder = 'Generating link...';
      }
    }
  }

  async open(conversationId) {
    this.classList.add('open');
    this._activeType = 'link';
    this._shareUrl = '';
    const input = this.shadowRoot.querySelector('.link-input');
    const btn = this.shadowRoot.querySelector('.copy-btn');
    input.value = '';
    input.style.color = '';
    btn.textContent = 'Copy';
    btn.disabled = true;
    btn.classList.remove('copied');

    this.shadowRoot.querySelectorAll('.share-option').forEach((o) => {
      o.classList.toggle('active', o.dataset.share === 'link');
    });
    this._updateContent();

    try {
      const cacheKey = `qai_share_${conversationId}`;
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached?.shareId && cached?.shareUrl) {
        const statusRes = await fetch(`/api/shared/${encodeURIComponent(cached.shareId)}`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          this._shareUrl = cached.shareUrl;
          this._updateContent();
          btn.disabled = false;
          this.shadowRoot.querySelector('.views').textContent = status.views || 0;
          return;
        }
        localStorage.removeItem(cacheKey);
      }

      const serverId = getServerId(conversationId);
      let result;

      if (serverId) {
        result = await ConversationService.share(serverId);
      } else {
        const currentChat = getCurrentChat();
        const chat = currentChat?.id === conversationId
          ? currentChat
          : getChatHistory().find(c => c.id === conversationId) || null;

        if (!chat || !chat.messages || chat.messages.length === 0) {
          throw new Error('No messages to share');
        }

        const body = {
          title: chat.title || 'Shared Chat',
          messages: chat.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
          }))
        };

        const res = await fetch('/api/public/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to create public share');
        }
        result = await res.json();
      }

      this._shareUrl = result.shareUrl || `${window.location.origin}/shared/${result.shareId}`;
      this._updateContent();
      btn.disabled = false;
      this.shadowRoot.querySelector('.views').textContent = result.views || 0;
      localStorage.setItem(cacheKey, JSON.stringify({ shareId: result.shareId, shareUrl: this._shareUrl }));
    } catch (err) {
      input.value = 'Failed to generate link';
      this.shadowRoot.querySelector('.link-input').style.color = '#ef4444';
      btn.disabled = true;
      bus.emit(EVENTS.UI.TOAST, { message: err.message || 'Failed to generate share link', type: 'error' });
    }
  }

  close() {
    this.classList.remove('open');
    this._shareUrl = '';
    this._activeType = 'link';
  }
}

customElements.define('share-modal', ShareModal);
