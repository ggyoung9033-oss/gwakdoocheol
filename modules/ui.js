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

const GWAK_KEY = '__gwak_global__';
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
                maxTokens: s.maxTokens ?? 1024,
                profileId: s.profileId || '',
                opacity: s.opacity ?? 100,
                panelWidth: s.panelWidth ?? 380,
                panelHeight: s.panelHeight ?? 540,
                compactMode: s.compactMode ?? false,
            };
        }
    } catch (e) {}
    return { recentChatN: 10, systemPrompt: DEFAULT_PERSONA, maxTokens: 1024, profileId: '', opacity: 100, panelWidth: 380, panelHeight: 540, compactMode: false };
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function createPanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'gwak-panel';
    panel.classList.add('gwak-panel');
    panel.innerHTML = `
        <div class="gwak-panel-header">
            <span class="gwak-panel-title">🐗 곽두철</span>
            <div class="gwak-panel-controls">
                <input type="range" class="gwak-opacity-slider" min="20" max="100" value="100" title="투명도">
                <button class="gwak-btn gwak-btn-icon" data-action="note" title="RP 노트">📝</button>
                <button class="gwak-btn gwak-btn-icon" data-action="settings" title="설정">⚙️</button>
                <button class="gwak-btn gwak-btn-icon" data-action="reset" title="히스토리 리셋">🔄</button>
                <button class="gwak-btn gwak-btn-icon" data-action="toggle-compact" title="작은 모드">⬇</button>
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
                <input type="number" id="gwak-max-tokens" min="128" max="32768" step="128" value="1024">
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
    `;

    document.body.appendChild(panel);

    panel.addEventListener('click', handlePanelClick);
    panel.querySelector('#gwak-input').addEventListener('keydown', handleInputKeydown);
    panel.querySelector('#gwak-profile-select').addEventListener('change', (e) => {
        const s = loadSettings();
        s.profileId = e.target.value;
        saveSettings(s);
    });

    // 투명도 슬라이더
    const opacitySlider = panel.querySelector('.gwak-opacity-slider');
    const initialSettings = loadSettings();
    opacitySlider.value = initialSettings.opacity;
    panel.style.setProperty('--gwak-panel-opacity', initialSettings.opacity / 100);
    opacitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        panel.style.setProperty('--gwak-panel-opacity', val / 100);
        const s = loadSettings();
        s.opacity = val;
        saveSettings(s);
    });

    // 모바일은 inline 사이즈 절대 안 박음 — CSS !important가 두 모드 다 처리
    const isMobileInit = window.innerWidth <= 768;
    if (isMobileInit) {
        if (initialSettings.compactMode) {
            panel.classList.add('gwak-compact');
            const tBtn = panel.querySelector('[data-action="toggle-compact"]');
            if (tBtn) { tBtn.textContent = '⬆'; tBtn.title = '풀스크린'; }
        }
    } else {
        if (initialSettings.panelWidth) panel.style.width = initialSettings.panelWidth + 'px';
        if (initialSettings.panelHeight) panel.style.height = initialSettings.panelHeight + 'px';
    }

    // 크기 변경 감지 (debounce — PC에서만 저장)
    let resizeSaveTimer = null;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeSaveTimer);
        resizeSaveTimer = setTimeout(() => {
            if (window.innerWidth > 768) {
                const s = loadSettings();
                s.panelWidth = panel.offsetWidth;
                s.panelHeight = panel.offsetHeight;
                saveSettings(s);
            }
        }, 300);
    });
    resizeObserver.observe(panel);

    makeDraggable(panel);

    return panel;
}

/**
 * 풀스크린 ↔ 작은 모드 전환. 모바일에서만 의미 있음.
 * 모드는 CSS class로만 통제 — inline style 안 박음 (안 사라지게 보장).
 */
function toggleCompactMode() {
    if (!panel) return;
    const wasCompact = panel.classList.contains('gwak-compact');
    panel.classList.toggle('gwak-compact');

    const btn = panel.querySelector('[data-action="toggle-compact"]');
    if (btn) {
        btn.textContent = wasCompact ? '⬇' : '⬆';
        btn.title = wasCompact ? '작은 모드' : '풀스크린';
    }

    const s = loadSettings();
    s.compactMode = !wasCompact;
    saveSettings(s);
}

function handlePanelClick(e) {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (!action) return;
    switch (action) {
        case 'close': hidePanel(); break;
        case 'toggle-compact': toggleCompactMode(); break;
        case 'send': handleSend(); break;
        case 'reset': handleReset(); break;
        case 'settings': toggleSettings(); break;
        case 'save-settings': handleSaveSettings(); break;
        case 'reset-prompt': panel.querySelector('#gwak-system-prompt').value = DEFAULT_PERSONA; break;
        case 'refresh-profiles': refreshPanelProfileDropdown(); break;
        case 'note': toggleNote(); break;
        case 'save-note': handleSaveNote(); break;
        case 'clear-note': handleClearNote(); break;
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

    renderMessage({ role: 'user', content: userInput });
    await dbAppendMessage(GWAK_KEY, { role: 'user', content: userInput }, {});

    const loadingEl = renderLoading();

    try {
        const record = await dbGetHistory(GWAK_KEY);
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
    const maxTokens = parseInt(panel.querySelector('#gwak-max-tokens').value) || 1024;
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
    panel.style.display = 'flex';
    panel.style.display = 'flex';
    showPane('chat');
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
// 진입점 — ST Extensions 카드 + Wand 메뉴 + Floating 버튼
// 모바일에서도 무조건 진입 가능하도록 3중 진입점
// ─────────────────────────────────────────────────────

/**
 * ST 익스텐션 설정 페이지(#extensions_settings)에 카드 추가.
 * 카드 안에 기본 설정 UI 다 들어감 (Connection Profile, 토큰, 시스템 프롬프트 등).
 * → 모바일에서도 ST 설정→Extensions 탭에서 다 만질 수 있음.
 */
export function setupExtensionCard() {
    if (document.getElementById('gwak-ext-card')) return;
    const container = document.getElementById('extensions_settings');
    if (!container) {
        setTimeout(setupExtensionCard, 1000);
        return;
    }

    const settings = loadSettings();

    // Connection Profile 옵션 만들기
    let profileOptions = '<option value="">⚡ 활성 프로필 사용</option>';
    try {
        const ctx = SillyTavern.getContext();
        const profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
        profiles.forEach(p => {
            const sel = settings.profileId === p.id ? 'selected' : '';
            profileOptions += `<option value="${p.id}" ${sel}>${p.name}</option>`;
        });
    } catch (e) {}

    const html = `
    <div id="gwak-ext-card" class="inline-drawer">
        <div class="inline-drawer-header inline-drawer-toggle interactable" tabindex="0">
            <b>🐗 곽두철</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none; padding: 10px;">
            <div style="margin-bottom: 12px; opacity: 0.75; font-size: 0.85em;">
                RP 컨설턴트. 채팅 분석 · 진행 의논 · 캐릭터 역학 짚기.
            </div>

            <div style="margin-bottom: 10px;">
                <label style="display:block; margin-bottom:4px; font-size:0.9em;">연결 프로필</label>
                <select id="gwak-ext-profile" class="text_pole" style="width:100%;">
                    ${profileOptions}
                </select>
            </div>

            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <div style="flex:1;">
                    <label style="display:block; margin-bottom:4px; font-size:0.9em;">최대 토큰</label>
                    <input type="number" id="gwak-ext-max-tokens" class="text_pole" style="width:100%;"
                           value="${settings.maxTokens}" min="256" max="20000" step="256">
                </div>
                <div style="flex:1;">
                    <label style="display:block; margin-bottom:4px; font-size:0.9em;">최근 채팅 N개 참조</label>
                    <input type="number" id="gwak-ext-recent-n" class="text_pole" style="width:100%;"
                           value="${settings.recentChatN}" min="0" max="50" step="1">
                </div>
            </div>

            <button id="gwak-ext-save" class="menu_button" style="width: 100%; margin-bottom:10px;">💾 설정 저장</button>

            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin: 10px 0;">

            <button id="gwak-ext-open-btn" class="menu_button" style="width: 100%; margin-bottom:6px;">
                🐗 곽두철 패널 열기
            </button>

            <button id="gwak-ext-clear-history" class="menu_button" style="width: 100%; opacity: 0.7; font-size: 0.85em;">
                🗑️ 곽두철 대화 기록 전체 삭제
            </button>
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    // 이벤트 와이어링
    document.getElementById('gwak-ext-save').addEventListener('click', () => {
        const s = loadSettings();
        s.profileId = document.getElementById('gwak-ext-profile').value;
        s.maxTokens = parseInt(document.getElementById('gwak-ext-max-tokens').value) || 1024;
        s.recentChatN = parseInt(document.getElementById('gwak-ext-recent-n').value) || 10;
        saveSettings(s);
        if (window.toastr) window.toastr.success('🐗 곽두철 설정 저장됨');
    });

    document.getElementById('gwak-ext-open-btn').addEventListener('click', () => togglePanel());

    document.getElementById('gwak-ext-clear-history').addEventListener('click', async () => {
        if (!confirm('곽두철과의 대화 기록을 전부 지울까? 되돌릴 수 없음.')) return;
        try {
            if (window.gwak?.db?.deleteHistory) {
                await window.gwak.db.deleteHistory();
                if (window.toastr) window.toastr.success('🐗 기록 삭제됨');
            }
        } catch (e) {
            console.error('[곽두철] 기록 삭제 실패:', e);
            if (window.toastr) window.toastr.error('기록 삭제 실패');
        }
    });

    console.log('[곽두철] ST Extensions 카드 추가됨 (전체 설정 UI 포함)');
}

let wandRetryCount = 0;
const WAND_MAX_RETRIES = 30;

export function addMenuEntry() {
    addWandMenuEntry();
    addFloatingButton();
}

function addWandMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (menu) {
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
        console.log('[곽두철] wand 메뉴에 항목 추가됨');
        return;
    }
    if (wandRetryCount < WAND_MAX_RETRIES) {
        wandRetryCount++;
        setTimeout(addWandMenuEntry, 500);
    } else {
        console.warn('[곽두철] wand 메뉴 못 찾음 — floating 버튼만 사용');
    }
}

function addFloatingButton() {
    if (document.getElementById('gwak-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'gwak-fab';
    fab.title = '🐗 곽두철';
    fab.innerHTML = '🐗';
    document.body.appendChild(fab);

    makeFabDraggable(fab);
    console.log('[곽두철] floating 버튼 추가됨 (드래그 가능)');
}

function makeFabDraggable(fab) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, startLeft, startTop;

    function start(clientX, clientY) {
        const rect = fab.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = clientX;
        startY = clientY;
        isDragging = true;
        hasMoved = false;
    }

    function move(clientX, clientY) {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) hasMoved = true;
        if (hasMoved) {
            fab.style.left = (startLeft + dx) + 'px';
            fab.style.top = (startTop + dy) + 'px';
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
        }
    }

    function end() {
        if (isDragging && !hasMoved) {
            togglePanel();
        }
        isDragging = false;
    }

    fab.addEventListener('mousedown', (e) => { e.preventDefault(); start(e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    document.addEventListener('mouseup', end);

    fab.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        start(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const t = e.touches[0];
        move(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', end);
}

window.gwak = window.gwak || {};
window.gwak.ui = { showPanel, hidePanel, togglePanel, addMenuEntry, setupExtensionCard };
