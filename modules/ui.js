// 🐗 곽두철 — UI 모듈
// - 메인 플로팅 패널 (채팅 인터페이스)
// - ST wand 메뉴(#extensionsMenu)에 진입점 추가
// - 패널 내부 설정 토글 (시스템 프롬프트, 최근 채팅 N개)

import { buildMessages } from './prompt.js';
import { sendRequest } from './api.js';
import {
    getHistory as dbGetHistory,
    appendMessage as dbAppendMessage,
    deleteHistory as dbDeleteHistory,
} from './db.js';
import { DEFAULT_PERSONA } from './persona.js';

const GWAK_KEY = '__gwak_global__';
const SETTINGS_KEY = 'gwak_settings_v1';

let panel = null;
let isLoading = false;

// ─────────────────────────────────────────────────────
// 설정 로드/저장
// ─────────────────────────────────────────────────────

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            return {
                recentChatN: s.recentChatN ?? 10,
                systemPrompt: s.systemPrompt || DEFAULT_PERSONA,
                maxTokens: s.maxTokens ?? 1024,
            };
        }
    } catch (e) {}
    return { recentChatN: 10, systemPrompt: DEFAULT_PERSONA, maxTokens: 1024 };
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ─────────────────────────────────────────────────────
// 패널 생성
// ─────────────────────────────────────────────────────

function createPanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'gwak-panel';
    panel.classList.add('gwak-panel');
    panel.innerHTML = `
        <div class="gwak-panel-header">
            <span class="gwak-panel-title">🐗 곽두철</span>
            <div class="gwak-panel-controls">
                <button class="gwak-btn gwak-btn-icon" data-action="settings" title="설정">⚙️</button>
                <button class="gwak-btn gwak-btn-icon" data-action="reset" title="히스토리 리셋">🔄</button>
                <button class="gwak-btn gwak-btn-icon" data-action="close" title="닫기">✕</button>
            </div>
        </div>
        <div class="gwak-panel-body" data-pane="chat">
            <div class="gwak-thread" id="gwak-thread"></div>
            <div class="gwak-input-area">
                <textarea class="gwak-input" id="gwak-input" placeholder="곽두철한테 뭐든 떠들어봐... (Enter 전송, Shift+Enter 줄바꿈)" rows="2"></textarea>
                <button class="gwak-btn gwak-btn-send" data-action="send">전송</button>
            </div>
        </div>
        <div class="gwak-panel-body gwak-settings-pane" data-pane="settings" style="display:none;">
            <h4>⚙️ 곽두철 설정</h4>
            <label class="gwak-field">
                <span>최근 채팅 메시지 N개 (RP 컨텍스트로 보낼 양)</span>
                <input type="number" id="gwak-recent-n" min="1" max="50" value="10">
            </label>
            <label class="gwak-field">
                <span>최대 응답 토큰</span>
                <input type="number" id="gwak-max-tokens" min="128" max="8192" step="128" value="1024">
            </label>
            <label class="gwak-field">
                <span>시스템 프롬프트 (페르소나)</span>
                <textarea id="gwak-system-prompt" rows="10"></textarea>
            </label>
            <div class="gwak-field-row">
                <button class="gwak-btn" data-action="reset-prompt">기본 페르소나로 되돌리기</button>
                <button class="gwak-btn gwak-btn-primary" data-action="save-settings">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    panel.addEventListener('click', handlePanelClick);
    panel.querySelector('#gwak-input').addEventListener('keydown', handleInputKeydown);

    makeDraggable(panel);

    return panel;
}

// ─────────────────────────────────────────────────────
// 이벤트 핸들러
// ─────────────────────────────────────────────────────

function handlePanelClick(e) {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (!action) return;
    switch (action) {
        case 'close': hidePanel(); break;
        case 'send': handleSend(); break;
        case 'reset': handleReset(); break;
        case 'settings': toggleSettings(); break;
        case 'save-settings': handleSaveSettings(); break;
        case 'reset-prompt': panel.querySelector('#gwak-system-prompt').value = DEFAULT_PERSONA; break;
    }
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        handleSend();
    }
}

async function handleSend() {
    if (isLoading) return;

    const input = panel.querySelector('#gwak-input');
    const userInput = input.value.trim();
    if (!userInput) return;

    input.value = '';
    isLoading = true;

    // 사용자 메시지 표시 + DB 저장
    renderMessage({ role: 'user', content: userInput });
    await dbAppendMessage(GWAK_KEY, { role: 'user', content: userInput }, {});

    const loadingEl = renderLoading();

    try {
        const record = await dbGetHistory(GWAK_KEY);
        // 방금 추가한 user 메시지 제외 (prompt에서 별도로 박힘)
        const history = (record?.messages || []).slice(0, -1);

        const settings = loadSettings();

        const { messages } = await buildMessages({
            userInput,
            gwakHistory: history,
            persona: settings.systemPrompt,
            contextOptions: { recentChatN: settings.recentChatN },
        });

        const reply = await sendRequest(messages, { maxTokens: settings.maxTokens });

        loadingEl.remove();
        renderMessage({ role: 'assistant', content: reply });
        await dbAppendMessage(GWAK_KEY, { role: 'assistant', content: reply }, {});
    } catch (err) {
        loadingEl.remove();
        renderError(err?.message || String(err));
        console.error('[곽두철] send 실패:', err);
    } finally {
        isLoading = false;
    }
}

async function handleReset() {
    if (!confirm('곽두철과의 모든 대화를 진짜 리셋할까? (복구 안 됨)')) return;
    await dbDeleteHistory(GWAK_KEY);
    panel.querySelector('#gwak-thread').innerHTML = '';
    renderMessage({
        role: 'assistant',
        content: '🐗 어 리셋됐네 ㅋㅋ. 새로 시작이야. 뭐 떠들고 싶은 거 있음?',
        isWelcome: true,
    });
}

function toggleSettings() {
    const chatPane = panel.querySelector('[data-pane="chat"]');
    const settingsPane = panel.querySelector('[data-pane="settings"]');
    const isSettingsOpen = settingsPane.style.display !== 'none';

    if (isSettingsOpen) {
        settingsPane.style.display = 'none';
        chatPane.style.display = 'flex';
    } else {
        // 현재 설정 로드
        const s = loadSettings();
        panel.querySelector('#gwak-recent-n').value = s.recentChatN;
        panel.querySelector('#gwak-max-tokens').value = s.maxTokens;
        panel.querySelector('#gwak-system-prompt').value = s.systemPrompt;
        chatPane.style.display = 'none';
        settingsPane.style.display = 'flex';
    }
}

function handleSaveSettings() {
    const recentN = parseInt(panel.querySelector('#gwak-recent-n').value) || 10;
    const maxTokens = parseInt(panel.querySelector('#gwak-max-tokens').value) || 1024;
    const systemPrompt = panel.querySelector('#gwak-system-prompt').value || DEFAULT_PERSONA;
    saveSettings({ recentChatN: recentN, maxTokens, systemPrompt });
    if (window.toastr?.success) window.toastr.success('곽두철 설정 저장됨');
    toggleSettings();
}

// ─────────────────────────────────────────────────────
// 메시지 렌더링
// ─────────────────────────────────────────────────────

function renderMessage({ role, content, isWelcome }) {
    const thread = panel.querySelector('#gwak-thread');
    const el = document.createElement('div');
    el.classList.add('gwak-msg', role === 'user' ? 'gwak-msg-user' : 'gwak-msg-assistant');
    if (isWelcome) el.classList.add('gwak-msg-welcome');
    el.innerHTML = `
        <div class="gwak-msg-avatar">${role === 'user' ? '🙂' : '🐗'}</div>
        <div class="gwak-msg-content"></div>
    `;
    el.querySelector('.gwak-msg-content').textContent = content;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
}

function renderLoading() {
    const thread = panel.querySelector('#gwak-thread');
    const el = document.createElement('div');
    el.classList.add('gwak-msg', 'gwak-msg-assistant', 'gwak-msg-loading');
    el.innerHTML = `<div class="gwak-msg-avatar">🐗</div><div class="gwak-msg-content">생각 중...</div>`;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
}

function renderError(msg) {
    const thread = panel.querySelector('#gwak-thread');
    const el = document.createElement('div');
    el.classList.add('gwak-msg', 'gwak-msg-error');
    el.innerHTML = `<div class="gwak-msg-content"></div>`;
    el.querySelector('.gwak-msg-content').textContent = '⚠️ ' + msg;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
}

async function loadHistory() {
    try {
        const record = await dbGetHistory(GWAK_KEY);
        const thread = panel.querySelector('#gwak-thread');
        thread.innerHTML = '';
        if (!record || !record.messages?.length) {
            renderMessage({
                role: 'assistant',
                content: '🐗 야 처음 보네 ㅋㅋ. RP 얘기든 뭐든 떠들 거 있으면 말해봐.',
                isWelcome: true,
            });
        } else {
            record.messages.forEach(m => renderMessage(m));
        }
    } catch (e) {
        console.error('[곽두철] loadHistory 실패:', e);
    }
}

// ─────────────────────────────────────────────────────
// 드래그
// ─────────────────────────────────────────────────────

function makeDraggable(el) {
    const header = el.querySelector('.gwak-panel-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    function startDrag(clientX, clientY) {
        isDragging = true;
        startX = clientX;
        startY = clientY;
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        el.style.left = startLeft + 'px';
        el.style.top = startTop + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    function moveDrag(clientX, clientY) {
        if (!isDragging) return;
        el.style.left = (startLeft + clientX - startX) + 'px';
        el.style.top = (startTop + clientY - startY) + 'px';
    }

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        startDrag(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', () => isDragging = false);

    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', () => isDragging = false);
}

// ─────────────────────────────────────────────────────
// 패널 표시/숨김
// ─────────────────────────────────────────────────────

export function showPanel() {
    createPanel();
    panel.style.display = 'flex';
    // 설정 페인 닫기, 채팅 페인 열기
    panel.querySelector('[data-pane="settings"]').style.display = 'none';
    panel.querySelector('[data-pane="chat"]').style.display = 'flex';
    loadHistory();
}

export function hidePanel() {
    if (panel) panel.style.display = 'none';
}

export function togglePanel() {
    if (!panel || panel.style.display === 'none') showPanel();
    else hidePanel();
}

// ─────────────────────────────────────────────────────
// ST wand 메뉴 진입점
// ─────────────────────────────────────────────────────

export function addMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        // ST가 아직 준비 안 됐을 수도 — 잠깐 기다렸다가 재시도
        setTimeout(addMenuEntry, 500);
        return;
    }
    if (document.getElementById('gwak-menu-entry')) return;

    const item = document.createElement('div');
    item.id = 'gwak-menu-entry';
    item.classList.add('list-group-item', 'flex-container', 'flexGap5');
    item.style.cursor = 'pointer';
    item.innerHTML = `<span style="font-size:1.1em;">🐗</span><span>곽두철</span>`;
    item.addEventListener('click', () => {
        togglePanel();
        if (window.jQuery) window.jQuery('#extensionsMenu').fadeOut(200);
    });
    menu.appendChild(item);
}

window.gwak = window.gwak || {};
window.gwak.ui = { showPanel, hidePanel, togglePanel, addMenuEntry };
