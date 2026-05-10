// 🐗 곽두철 — ST Extensions 메뉴 설정 카드

import { deleteHistory as dbDeleteHistory } from './db.js';
import { DEFAULT_PERSONA } from './persona.js';

const GWAK_KEY = '__gwak_global__';
const SETTINGS_KEY = 'gwak_settings_v1';

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
            };
        }
    } catch (e) {}
    return { recentChatN: 10, systemPrompt: DEFAULT_PERSONA, maxTokens: 1024, profileId: '' };
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function injectSettings() {
    const target = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!target) {
        setTimeout(injectSettings, 500);
        return;
    }
    if (document.getElementById('gwak-settings-card')) return;

    const card = document.createElement('div');
    card.id = 'gwak-settings-card';
    card.classList.add('extension_settings');
    card.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🐗 곽두철</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="gwak-st-row">
                    <label for="gwak-st-profile">곽두철 전용 Connection Profile</label>
                    <div class="gwak-st-inline">
                        <select id="gwak-st-profile"></select>
                        <button id="gwak-refresh-profiles" class="menu_button" title="프로필 목록 새로고침">↻</button>
                    </div>
                    <small class="gwak-st-hint">"기본" 선택 시 ST 활성 프로필 그대로 사용</small>
                </div>
                <hr>
                <div class="gwak-st-row">
                    <label for="gwak-st-prompt">시스템 프롬프트 (페르소나)</label>
                    <textarea id="gwak-st-prompt" rows="14"></textarea>
                    <div class="gwak-st-row-buttons">
                        <button id="gwak-st-prompt-reset" class="menu_button">기본값으로</button>
                        <button id="gwak-st-prompt-save" class="menu_button">저장</button>
                    </div>
                </div>
                <hr>
                <div class="gwak-st-row">
                    <label for="gwak-st-tokens">최대 응답 토큰</label>
                    <input type="number" id="gwak-st-tokens" min="128" max="32768" step="128" value="1024">
                </div>
                <div class="gwak-st-row">
                    <label for="gwak-st-recent">최근 채팅 메시지 N개 (RP 컨텍스트로 포함)</label>
                    <input type="number" id="gwak-st-recent" min="1" max="100" value="10">
                </div>
                <button id="gwak-st-misc-save" class="menu_button">설정 저장</button>
                <hr>
                <div class="gwak-st-row">
                    <button id="gwak-st-reset-history" class="menu_button gwak-st-danger">곽두철 전체 히스토리 리셋</button>
                </div>
            </div>
        </div>
    `;
    target.appendChild(card);

    const settings = loadSettings();
    document.getElementById('gwak-st-prompt').value = settings.systemPrompt;
    document.getElementById('gwak-st-recent').value = settings.recentChatN;
    document.getElementById('gwak-st-tokens').value = settings.maxTokens;

    refreshProfileDropdown();

    document.getElementById('gwak-refresh-profiles').addEventListener('click', refreshProfileDropdown);

    document.getElementById('gwak-st-profile').addEventListener('change', (e) => {
        const s = loadSettings();
        s.profileId = e.target.value;
        saveSettings(s);
        if (window.toastr?.success) window.toastr.success('Connection Profile 저장됨');
    });

    document.getElementById('gwak-st-prompt-reset').addEventListener('click', () => {
        document.getElementById('gwak-st-prompt').value = DEFAULT_PERSONA;
    });
    document.getElementById('gwak-st-prompt-save').addEventListener('click', () => {
        const s = loadSettings();
        s.systemPrompt = document.getElementById('gwak-st-prompt').value;
        saveSettings(s);
        if (window.toastr?.success) window.toastr.success('곽두철 페르소나 저장됨');
    });
    document.getElementById('gwak-st-misc-save').addEventListener('click', () => {
        const s = loadSettings();
        s.recentChatN = parseInt(document.getElementById('gwak-st-recent').value) || 10;
        s.maxTokens = parseInt(document.getElementById('gwak-st-tokens').value) || 1024;
        saveSettings(s);
        if (window.toastr?.success) window.toastr.success('곽두철 설정 저장됨');
    });
    document.getElementById('gwak-st-reset-history').addEventListener('click', async () => {
        if (!confirm('곽두철과의 모든 대화를 진짜 리셋할까? (복구 안 됨)')) return;
        await dbDeleteHistory(GWAK_KEY);
        if (window.toastr?.success) window.toastr.success('곽두철 히스토리 리셋 완료');
    });
}

function refreshProfileDropdown() {
    const select = document.getElementById('gwak-st-profile');
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

    if (profiles.length === 0) {
        const noneOpt = document.createElement('option');
        noneOpt.value = '__none__';
        noneOpt.textContent = '(등록된 Connection Profile 없음)';
        noneOpt.disabled = true;
        select.appendChild(noneOpt);
    } else {
        profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name || '(이름 없음)'} - ${p.api || p.mode || '?'}`;
            if (p.id === currentProfileId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    if (currentProfileId === '') select.value = '';
}

window.gwak = window.gwak || {};
window.gwak.settings = { injectSettings, refreshProfileDropdown };
