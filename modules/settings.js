// 🐗 곽두철 — ST Extensions 메뉴 설정 카드
// 활성 connection profile 표시 + 시스템 프롬프트 / 토큰 / 히스토리 리셋

import { getActiveProfile } from './api.js';
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
            };
        }
    } catch (e) {}
    return { recentChatN: 10, systemPrompt: DEFAULT_PERSONA, maxTokens: 1024 };
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
                    <strong>활성 Connection Profile:</strong>
                    <span id="gwak-active-profile">로딩 중…</span>
                    <button id="gwak-refresh-profile" class="menu_button">↻</button>
                </div>
                <hr>
                <div class="gwak-st-row">
                    <label for="gwak-st-prompt">시스템 프롬프트 (페르소나)</label>
                    <textarea id="gwak-st-prompt" rows="10"></textarea>
                    <div class="gwak-st-row-buttons">
                        <button id="gwak-st-prompt-reset" class="menu_button">기본값으로</button>
                        <button id="gwak-st-prompt-save" class="menu_button">저장</button>
                    </div>
                </div>
                <hr>
                <div class="gwak-st-row">
                    <label for="gwak-st-recent">최근 채팅 메시지 N개</label>
                    <input type="number" id="gwak-st-recent" min="1" max="50" value="10">
                </div>
                <div class="gwak-st-row">
                    <label for="gwak-st-tokens">최대 응답 토큰</label>
                    <input type="number" id="gwak-st-tokens" min="128" max="8192" step="128" value="1024">
                </div>
                <button id="gwak-st-misc-save" class="menu_button">기본 설정 저장</button>
                <hr>
                <div class="gwak-st-row">
                    <button id="gwak-st-reset-history" class="menu_button gwak-st-danger">곽두철 전체 히스토리 리셋</button>
                </div>
            </div>
        </div>
    `;
    target.appendChild(card);

    refreshActiveProfile();

    const settings = loadSettings();
    document.getElementById('gwak-st-prompt').value = settings.systemPrompt;
    document.getElementById('gwak-st-recent').value = settings.recentChatN;
    document.getElementById('gwak-st-tokens').value = settings.maxTokens;

    document.getElementById('gwak-refresh-profile').addEventListener('click', refreshActiveProfile);

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

function refreshActiveProfile() {
    const el = document.getElementById('gwak-active-profile');
    if (!el) return;
    try {
        const p = getActiveProfile();
        if (p) {
            el.textContent = `${p.name || '(이름 없음)'} (${p.api || p.mode || '?'})`;
            el.style.color = '';
        } else {
            el.textContent = '없음 — ST에서 Connection Profile 설정 필요';
            el.style.color = 'orange';
        }
    } catch (e) {
        el.textContent = '추출 실패: ' + e.message;
        el.style.color = 'red';
    }
}

window.gwak = window.gwak || {};
window.gwak.settings = { injectSettings, refreshActiveProfile };
