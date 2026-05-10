// 🐗 곽두철 — UI 모듈
// - 메인 플로팅 패널 (채팅 인터페이스)
// - ST wand 메뉴(#extensionsMenu)에 진입점 추가
// - 패널 내부 설정 토글

import { buildMessages } from './prompt.js';
import { sendRequest } from './api.js';
import {
    getHistory as dbGetHistory,
    appendMessage as dbAppendMessage,
    deleteHistory as dbDeleteHistory,
} from './db.js';
import { DEFAULT_PERSONA } from './persona.js';
import { loadNote, saveNote as saveNoteData, clearNote as clearNoteData } from './note.js';

/**
 * 현재 ST 채팅 식별자 — chat_metadata에 자체 UUID 박는 방식.
 * ST chat 파일명 변경, 분기 등에 안전. 새 chat이면 새 UUID 자동 발급.
 */
function getCurrentChatKey() {
    try {
        const ctx = SillyTavern.getContext();
        if (!ctx) return 'no_chat';

        // chat_metadata 사용 (가장 robust) — ST가 chat 파일별 자동 보관
        if (ctx.chat_metadata) {
            if (!ctx.chat_metadata.gwakdoocheol_chat_id) {
                ctx.chat_metadata.gwakdoocheol_chat_id = 'gwak_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
                console.log('[곽두철] 새 chat에 ID 발급:', ctx.chat_metadata.gwakdoocheol_chat_id);
                // ST 메타 저장
                if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
                else if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
            }
            return ctx.chat_metadata.gwakdoocheol_chat_id;
        }

        // fallback: 캐릭터 + chat 이름 조합
        if (ctx.groupId) return `group_${ctx.groupId}`;
        const charName = ctx.name2 || 'no_char';
        const chatName = ctx.characters?.[ctx.characterId]?.chat || 'no_chat';
        return `char_${charName}__${chatName}`;
    } catch (e) {
        console.error('[곽두철] getCurrentChatKey 에러:', e);
        return 'no_chat';
    }
}
const SETTINGS_KEY = 'gwak_settings_v1';

let panel = null;
let isLoading = false;

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            return {
                recentChatN: s.recentChatN ?? 10,
                systemPrompt: s.systemPrompt || DEFAULT_PERSONA,
                maxTokens: s.maxTokens ?? 4096,
                profileId: s.profileId || '',
                opacity: s.opacity ?? 100,
                panelWidth: (s.panelWidth >= 240) ? s.panelWidth : 380,
                panelHeight: (s.panelHeight >= 200) ? s.panelHeight : 540,
            };
        }
    } catch (e) {}
    return { recentChatN: 10, systemPrompt: DEFAULT_PERSONA, maxTokens: 4096, profileId: '', opacity: 100, panelWidth: 380, panelHeight: 540 };
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function createPanel() {
    // 기존 패널 DOM이 있으면 제거 (ST reload 시 옛 panel 누적 방지)
    const existingDom = document.getElementById('gwak-panel');
    if (existingDom) {
        existingDom.remove();
        console.log('[곽두철] 기존 패널 DOM 제거 후 재생성');
    }
    panel = null;

    panel = document.createElement('div');
    panel.id = 'gwak-panel';
    panel.classList.add('gwak-panel');
    panel.innerHTML = `
        <div class="gwak-panel-header">
            <span class="gwak-panel-title">🐗 곽두철</span>
            <div class="gwak-panel-controls">
                <button class="gwak-btn gwak-btn-icon" data-action="opacity-down" title="투명도 ↓">🔅</button>
                <span class="gwak-opacity-display" title="패널 투명도">100%</span>
                <button class="gwak-btn gwak-btn-icon" data-action="opacity-up" title="투명도 ↑">🔆</button>
                <button class="gwak-btn gwak-btn-icon" data-action="note" title="RP 노트">📝</button>
                <button class="gwak-btn gwak-btn-icon" data-action="settings" title="설정">⚙️</button>
                <button class="gwak-btn gwak-btn-icon" data-action="reset" title="히스토리 리셋">🔄</button>
                <button class="gwak-btn gwak-btn-icon" data-action="minimize" title="최소화">▼</button>
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
                <span>Connection Profile</span>
                <div class="gwak-inline">
                    <select id="gwak-profile-select"></select>
                    <button class="gwak-btn" data-action="refresh-profiles" title="프로필 새로고침">↻</button>
                </div>
            </label>
            <label class="gwak-field">
                <span>최대 응답 토큰</span>
                <input type="number" id="gwak-max-tokens" min="128" max="32768" step="128" value="4096">
            </label>
            <label class="gwak-field">
                <span>최근 채팅 메시지 N개 (RP 컨텍스트)</span>
                <input type="number" id="gwak-recent-n" min="1" max="100" value="10">
            </label>
            <label class="gwak-field">
                <span>시스템 프롬프트 (페르소나)</span>
                <textarea id="gwak-system-prompt" rows="10"></textarea>
            </label>
            <div class="gwak-field-row">
                <button class="gwak-btn" data-action="reset-prompt">기본값으로</button>
                <button class="gwak-btn gwak-btn-primary" data-action="save-settings">저장</button>
            </div>
        </div>
        <div class="gwak-panel-body gwak-note-pane" data-pane="note" style="display:none;">
            <h4>📝 RP 노트 — 참고용 메모</h4>
            <div style="font-size: 0.85em; opacity: 0.75; margin-bottom: 8px;">
                곽두철과 의논한 합의사항(캐릭터 결, 다음 흐름 등) 박아두면 RP 채팅 LLM이 참고함.<br>
                강제 지시 X, 가이드만. 활성 OFF 시 인젝트 X.
            </div>
            <label class="gwak-field" style="flex-direction:row; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="gwak-note-active" style="width:auto; margin:0;">
                <span style="margin:0;">RP에 적용 (활성)</span>
            </label>
            <textarea id="gwak-note-content" rows="14" placeholder="예) 크리스 캐릭터 결: 툴툴거려도 책임감 있는 베테랑 형. 9mm 안 통하면 바로 무릎부터 작살. 영희한테는 은근한 챙김..."></textarea>
            <div class="gwak-field-row" style="margin-top:10px;">
                <button class="gwak-btn" data-action="clear-note">🗑️ 비우기</button>
                <button class="gwak-btn gwak-btn-primary" data-action="save-note">💾 저장 & 적용</button>
            </div>
        </div>
        <div class="gwak-resize-handle" title="크기 조절"></div>
    `;

    document.body.appendChild(panel);

    panel.addEventListener('click', handlePanelClick);
    panel.querySelector('#gwak-input').addEventListener('keydown', handleInputKeydown);
    panel.querySelector('#gwak-profile-select').addEventListener('change', (e) => {
        const s = loadSettings();
        s.profileId = e.target.value;
        saveSettings(s);
    });

    // 투명도 (+/-) 버튼
    const opacityDisplay = panel.querySelector('.gwak-opacity-display');
    const initialSettings = loadSettings();
    const initOpacity = initialSettings.opacity ?? 100;
    panel.style.setProperty('--gwak-panel-opacity', initOpacity / 100);
    opacityDisplay.textContent = initOpacity + '%';

    // 저장된 크기 복원 (모바일 풀스크린은 미디어 쿼리가 처리)
    if (initialSettings.panelWidth) panel.style.width = initialSettings.panelWidth + 'px';
    if (initialSettings.panelHeight) panel.style.height = initialSettings.panelHeight + 'px';

    // 크기 변경 감지 (debounce — 드래그 중 매 프레임 호출 방지)
    let resizeSaveTimer = null;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeSaveTimer);
        resizeSaveTimer = setTimeout(() => {
            // minimize 모드면 저장 X (작은 헤더 사이즈가 저장되면 다음 열 때 패널 작아짐)
            if (panel.classList.contains('gwak-minimized')) return;
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            // 너무 작으면 저장 X (안전 가드)
            if (w < 240 || h < 200) return;
            const s = loadSettings();
            s.panelWidth = w;
            s.panelHeight = h;
            saveSettings(s);
        }, 300);
    });
    resizeObserver.observe(panel);

    makeDraggable(panel);
    makeResizable(panel);

    return panel;
}

/**
 * 직접 만든 resize 핸들 — CSS resize:both이 모바일에서 잡히지 않는 문제 해결.
 * 우하단에 큰 핸들 + mousedown/touchstart 드래그.
 */
function makeResizable(el) {
    const handle = el.querySelector('.gwak-resize-handle');
    if (!handle) return;

    let isResizing = false;
    let startX, startY, startW, startH;

    function startResize(clientX, clientY) {
        isResizing = true;
        startX = clientX;
        startY = clientY;
        startW = el.offsetWidth;
        startH = el.offsetHeight;
    }

    function moveResize(clientX, clientY) {
        if (!isResizing) return;
        const isMobile = window.innerWidth <= 768;
        const maxW = isMobile ? window.innerWidth * 0.95 : window.innerWidth - 20;
        const maxH = isMobile ? window.innerHeight * 0.85 : window.innerHeight - 20;
        const newW = Math.max(240, Math.min(maxW, startW + (clientX - startX)));
        const newH = Math.max(200, Math.min(maxH, startH + (clientY - startY)));
        el.style.width = newW + 'px';
        el.style.height = newH + 'px';
        el.style.maxWidth = 'none';
        el.style.maxHeight = 'none';
    }

    function endResize() {
        if (!isResizing) return;
        isResizing = false;
        const s = loadSettings();
        s.panelWidth = el.offsetWidth;
        s.panelHeight = el.offsetHeight;
        saveSettings(s);
    }

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startResize(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => moveResize(e.clientX, e.clientY));
    document.addEventListener('mouseup', endResize);

    handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        startResize(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!isResizing) return;
        e.preventDefault();
        const t = e.touches[0];
        moveResize(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', endResize);
}

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
        case 'refresh-profiles': refreshPanelProfileDropdown(); break;
        case 'note': toggleNote(); break;
        case 'save-note': handleSaveNote(); break;
        case 'clear-note': handleClearNote(); break;
        case 'opacity-down': adjustOpacity(-10); break;
        case 'opacity-up': adjustOpacity(+10); break;
        case 'minimize': toggleMinimize(); break;
    }
}

function toggleMinimize() {
    const isMin = panel.classList.toggle('gwak-minimized');
    const btn = panel.querySelector('[data-action="minimize"]');
    if (btn) {
        btn.textContent = isMin ? '▲' : '▼';
        btn.title = isMin ? '펼치기' : '최소화';
    }
}

function adjustOpacity(delta) {
    const s = loadSettings();
    const cur = s.opacity ?? 100;
    const newVal = Math.max(20, Math.min(100, cur + delta));
    panel.style.setProperty('--gwak-panel-opacity', newVal / 100);
    const display = panel.querySelector('.gwak-opacity-display');
    if (display) display.textContent = newVal + '%';
    s.opacity = newVal;
    saveSettings(s);
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

    renderMessage({ role: 'user', content: userInput });
    await dbAppendMessage(getCurrentChatKey(), { role: 'user', content: userInput }, {});

    const loadingEl = renderLoading();

    try {
        const record = await dbGetHistory(getCurrentChatKey());
        const history = (record?.messages || []).slice(0, -1);

        const settings = loadSettings();

        const { messages } = await buildMessages({
            userInput,
            gwakHistory: history,
            persona: settings.systemPrompt,
            contextOptions: { recentChatN: settings.recentChatN },
        });

        const reply = await sendRequest(messages, {
            maxTokens: settings.maxTokens,
            profileId: settings.profileId,
        });

        loadingEl.remove();
        renderMessage({ role: 'assistant', content: reply });
        await dbAppendMessage(getCurrentChatKey(), { role: 'assistant', content: reply }, {});
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
    await dbDeleteHistory(getCurrentChatKey());
    panel.querySelector('#gwak-thread').innerHTML = '';
    renderMessage({
        role: 'assistant',
        content: '🐗 어 리셋됐네 ㅋㅋ. 새로 시작이야. 뭐 떠들고 싶은 거 있음?',
        isWelcome: true,
    });
}

function showPane(paneName) {
    ['chat', 'settings', 'note'].forEach(p => {
        const el = panel.querySelector(`[data-pane="${p}"]`);
        if (el) el.style.display = (p === paneName) ? 'flex' : 'none';
    });
}

function toggleSettings() {
    const settingsPane = panel.querySelector('[data-pane="settings"]');
    if (settingsPane.style.display !== 'none') {
        showPane('chat');
        return;
    }
    const s = loadSettings();
    panel.querySelector('#gwak-recent-n').value = s.recentChatN;
    panel.querySelector('#gwak-max-tokens').value = s.maxTokens;
    panel.querySelector('#gwak-system-prompt').value = s.systemPrompt;
    refreshPanelProfileDropdown();
    showPane('settings');
}

function toggleNote() {
    const notePane = panel.querySelector('[data-pane="note"]');
    if (notePane.style.display !== 'none') {
        showPane('chat');
        return;
    }
    const n = loadNote();
    panel.querySelector('#gwak-note-content').value = n.content;
    panel.querySelector('#gwak-note-active').checked = n.active;
    showPane('note');
}

function handleSaveNote() {
    const content = panel.querySelector('#gwak-note-content').value;
    const active = panel.querySelector('#gwak-note-active').checked;
    saveNoteData(content, active);
    if (window.toastr) {
        const msg = (active && content.trim())
            ? '🐗 노트 저장 + RP에 적용됨'
            : '🐗 노트 저장 (RP 인젝트 비활성)';
        window.toastr.success(msg);
    }
}

function handleClearNote() {
    if (!confirm('노트 비울까? RP 인젝트도 같이 제거.')) return;
    clearNoteData();
    panel.querySelector('#gwak-note-content').value = '';
    panel.querySelector('#gwak-note-active').checked = true;
    if (window.toastr) window.toastr.success('🐗 노트 비움');
}

function refreshPanelProfileDropdown() {
    const select = panel.querySelector('#gwak-profile-select');
    if (!select) return;

    const ctx = SillyTavern.getContext();
    const profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
    const settings = loadSettings();
    const currentProfileId = settings.profileId || '';

    select.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '기본 (ST 활성 프로필 그대로)';
    select.appendChild(defaultOpt);

    profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name || '(이름 없음)'} - ${p.api || p.mode || '?'}`;
        if (p.id === currentProfileId) opt.selected = true;
        select.appendChild(opt);
    });

    if (currentProfileId === '') select.value = '';
}

function handleSaveSettings() {
    const recentN = parseInt(panel.querySelector('#gwak-recent-n').value) || 10;
    const maxTokens = parseInt(panel.querySelector('#gwak-max-tokens').value) || 4096;
    const systemPrompt = panel.querySelector('#gwak-system-prompt').value || DEFAULT_PERSONA;
    const s = loadSettings();
    saveSettings({
        ...s,
        recentChatN: recentN,
        maxTokens,
        systemPrompt,
    });
    if (window.toastr?.success) window.toastr.success('곽두철 설정 저장됨');
    toggleSettings();
}

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
        const record = await dbGetHistory(getCurrentChatKey());
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

export function showPanel() {
    createPanel();
    // 1. 누적된 inline style 깨끗이 리셋 (모바일 위치 꼬임 방지)
    panel.removeAttribute('style');

    const s = loadSettings();
    const isMobile = window.innerWidth <= 768;

    // 2. 저장된 사이즈 적용 (모바일은 화면 안에 fit되게 cap, 데스크톱은 그대로)
    const maxW = isMobile ? window.innerWidth * 0.95 : window.innerWidth - 40;
    const maxH = isMobile ? window.innerHeight * 0.85 : window.innerHeight - 40;

    if (s.panelWidth >= 240) {
        panel.style.width = Math.min(s.panelWidth, maxW) + 'px';
    }
    if (s.panelHeight >= 200) {
        panel.style.height = Math.min(s.panelHeight, maxH) + 'px';
    }

    // 3. 모바일 강제 중앙 정렬 로직 (이미지보다 보강된 버전)
    if (isMobile) {
        panel.style.position = 'fixed';
        panel.style.bottom = '10px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '10001';
    }

    panel.style.display = 'flex';

    // minimize 상태로 닫혔어도 다시 열 때 자동 펼침
    if (panel.classList.contains('gwak-minimized')) {
        panel.classList.remove('gwak-minimized');
        const minBtn = panel.querySelector('[data-action="minimize"]');
        if (minBtn) {
            minBtn.textContent = '▼';
            minBtn.title = '최소화';
        }
    }

    showPane('chat');
    // 4. [핵심] 현재 채팅방의 기록만 불러오기
    loadHistory(); 
    console.log('[곽두철] 패널 표시 (key:', getCurrentChatKey(), ')');
}

export function hidePanel() {
    if (panel) panel.style.display = 'none';
}

export function togglePanel() {
    if (!panel || panel.style.display === 'none') showPanel();
    else hidePanel();
}

/**
 * ST 채팅이 바뀌면 (다른 캐릭터 / 새 chat) 곽두철 히스토리도 자동 전환
 */
export function setupChatChangeListener() {
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.eventSource && ctx.event_types?.CHAT_CHANGED) {
            ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
                // 패널이 열려있을 때만 즉시 갱신
                if (panel && panel.style.display === 'flex') {
                    loadHistory();
                    console.log('[곽두철] 채팅 전환 감지 → 데이터 교체');
                }
            });
        }
    } catch (e) {
        console.warn('[곽두철] CHAT_CHANGED listener 실패:', e);
    }
}

// ─────────────────────────────────────────────────────
// 진입점 관리 (Extension Card, Menu 등)
// ─────────────────────────────────────────────────────

export function setupExtensionCard() {
    if (document.getElementById('gwak-ext-card')) return;
    const container = document.getElementById('extensions_settings');
    if (!container) {
        setTimeout(setupExtensionCard, 1000);
        return;
    }

    const settings = loadSettings();
    const html = `
    <div id="gwak-ext-card" class="inline-drawer">
        <div class="inline-drawer-header inline-drawer-toggle interactable" tabindex="0">
            <b>🐗 곽두철</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none; padding: 10px;">
            <button id="gwak-ext-open-btn" class="menu_button" style="width: 100%;">🐗 곽두철 패널 열기</button>
            <button id="gwak-ext-reset-panel" class="menu_button" style="width: 100%; margin-top:10px; opacity:0.8;">↺ 패널 리셋 (안 뜰 때)</button>
        </div>
    </div>`;
    
    container.insertAdjacentHTML('beforeend', html);
    document.getElementById('gwak-ext-open-btn').addEventListener('click', () => togglePanel());
    document.getElementById('gwak-ext-reset-panel').addEventListener('click', () => {
        const s = loadSettings();
        s.panelWidth = 380; s.panelHeight = 540;
        saveSettings(s);
        if (panel) panel.remove();
        panel = null;
        if (window.toastr) window.toastr.success('🐗 리셋 완료. 다시 열어봐.');
    });
}

export function addMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('gwak-menu-entry')) {
        const item = document.createElement('div');
        item.id = 'gwak-menu-entry';
        item.classList.add('list-group-item');
        item.innerHTML = `🐗 곽두철`;
        item.addEventListener('click', () => {
            togglePanel();
            if (window.jQuery) window.jQuery('#extensionsMenu').fadeOut(200);
        });
        menu.appendChild(item);
    }
    // Floating Button 로직 (기존 파일 하단 참고)
}

window.gwak = window.gwak || {};
window.gwak.ui = { showPanel, hidePanel, togglePanel, addMenuEntry, setupExtensionCard, getCurrentChatKey };
