// 🐗 곽두철 — RP 노트 모듈
// 곽두철과 의논한 합의사항을 ST의 RP 채팅에 "참고용 메모"로 인젝트.
// 강제 지시 X. 참고만.

const NOTE_KEY = 'gwakdoocheol_note';
const STORAGE_KEY = 'gwak_rp_note_v1';

function getCtx() {
    return SillyTavern.getContext();
}

/**
 * 노트 텍스트 + 활성 여부 로드
 */
export function loadNote() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const o = JSON.parse(raw);
            return { content: o.content || '', active: o.active ?? true };
        }
    } catch (e) {}
    return { content: '', active: true };
}

/**
 * 노트 저장 + (활성 시) ST에 자동 인젝트
 */
export function saveNote(content, active = true) {
    const data = { content: (content || '').trim(), active };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
    syncToST(data);
    return data;
}

/**
 * 노트 비우기 + ST에서 제거
 */
export function clearNote() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    removeFromST();
}

/**
 * 활성 토글
 */
export function setActive(active) {
    const cur = loadNote();
    return saveNote(cur.content, !!active);
}

/**
 * 현재 저장된 노트 상태대로 ST 인젝트 (페이지 로드 시 호출)
 */
export function reapplyOnLoad() {
    const cur = loadNote();
    syncToST(cur);
}

// ─── 내부 함수 ────────────────────────────────────────

function syncToST({ content, active }) {
    if (!active || !content || !content.trim()) {
        removeFromST();
        return;
    }
    const wrapped = `[곽두철 메모 — 참고용]
${content.trim()}
[참고만 하세요. 강제 지시가 아닙니다. 자연스러운 RP 흐름이 우선.]`;

    try {
        const ctx = getCtx();
        if (typeof ctx.setExtensionPrompt === 'function') {
            // setExtensionPrompt(key, value, position, depth, scan, role)
            // position: 0 = IN_PROMPT (system block), 1 = IN_CHAT (with depth)
            // depth: 4 = 채팅 4번째 위에 인젝트 (ST 기본값과 호환)
            ctx.setExtensionPrompt(NOTE_KEY, wrapped, 1, 4);
            console.log('[곽두철] 노트 ST 인젝트됨:', content.substring(0, 30) + '...');
        } else {
            console.warn('[곽두철] setExtensionPrompt 미지원');
        }
    } catch (e) {
        console.error('[곽두철] 노트 인젝트 실패:', e);
    }
}

function removeFromST() {
    try {
        const ctx = getCtx();
        if (typeof ctx.setExtensionPrompt === 'function') {
            ctx.setExtensionPrompt(NOTE_KEY, '', 1, 4);
            console.log('[곽두철] 노트 ST에서 제거됨');
        }
    } catch (e) {}
}

window.gwak = window.gwak || {};
window.gwak.note = { loadNote, saveNote, clearNote, setActive, reapplyOnLoad };
