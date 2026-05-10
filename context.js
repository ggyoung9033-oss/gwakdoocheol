// 🐗 곽두철 — RP 컨텍스트 수집 모듈
// - 캐시트 + 페르소나 + 활성 로어북 + 최근 채팅 빨아들이기
// - chat_metadata에 자체 UUID 박아서 채팅 식별
// - ★ 분기 감지 hook: ST가 chat_metadata 복사하는 분기 케이스 처리

import {
    getHistory as dbGetHistory,
    setHistory as dbSetHistory,
} from './db.js';

const GWAK_META_KEY = 'gwak_chat_id';

/**
 * SillyTavern getContext 가져오기
 */
function getContext() {
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
        return SillyTavern.getContext();
    }
    throw new Error('SillyTavern.getContext() 접근 불가 — ST 환경 확인 필요');
}

function getMetadata(ctx) {
    return ctx.chatMetadata || ctx.chat_metadata || null;
}

function persistMetadata(ctx) {
    if (typeof ctx.saveMetadataDebounced === 'function') {
        ctx.saveMetadataDebounced();
    } else if (typeof ctx.saveMetadata === 'function') {
        ctx.saveMetadata();
    } else {
        console.warn('[곽두철] saveMetadata(Debounced) 함수 없음');
    }
}

function getCharacterMeta(ctx) {
    const charId = ctx.characterId;
    const char = (charId !== undefined && charId !== null)
        ? ctx.characters?.[charId]
        : null;
    return {
        characterId: (charId !== undefined && charId !== null) ? String(charId) : null,
        characterName: char?.name || null,
    };
}

// ─────────────────────────────────────────────────────
// 곽두철 자체 UUID + 분기 감지 hook
// ─────────────────────────────────────────────────────

/**
 * 현재 채팅의 곽두철 UUID 가져오기 (없으면 생성)
 *
 * 흐름:
 *  1. metadata에 UUID 없음 → 새 발급 + IndexedDB 마커 레코드 (stChatFileName 페어)
 *  2. metadata에 UUID 있음 → IndexedDB의 stChatFileName과 현재 ST chat_id 비교
 *     - 같음: 기존 UUID 유지
 *     - 다름: 분기/rename → 새 UUID + 새 마커
 *     - DB 레코드 없음: 마커만 보강
 */
export async function getOrCreateGwakChatId() {
    const ctx = getContext();
    const metadata = getMetadata(ctx);
    if (!metadata) {
        throw new Error('chat_metadata 접근 불가 — 채팅 띄운 상태 확인');
    }

    const currentStChatId = getStChatFileName();
    const charMeta = getCharacterMeta(ctx);

    // (1) UUID 없음 → 새로 발급
    if (!metadata[GWAK_META_KEY]) {
        const newUuid = crypto.randomUUID();
        metadata[GWAK_META_KEY] = newUuid;
        persistMetadata(ctx);
        await dbSetHistory(newUuid, [], {
            stChatFileName: currentStChatId,
            ...charMeta,
        });
        console.log('[곽두철] 새 UUID 발급:', newUuid, '(ST chat:', currentStChatId, ')');
        return newUuid;
    }

    // (2) UUID 있음 — 분기 검증
    const existingUuid = metadata[GWAK_META_KEY];
    const record = await dbGetHistory(existingUuid);

    // (2-a) DB 레코드 없음 (옛 데이터, IndexedDB 초기화 후 등) → 마커만 박음
    if (!record) {
        await dbSetHistory(existingUuid, [], {
            stChatFileName: currentStChatId,
            ...charMeta,
        });
        return existingUuid;
    }

    // (2-b) stChatFileName mismatch → 분기/rename 감지
    if (record.stChatFileName && currentStChatId &&
        record.stChatFileName !== currentStChatId) {
        const newUuid = crypto.randomUUID();
        metadata[GWAK_META_KEY] = newUuid;
        persistMetadata(ctx);
        await dbSetHistory(newUuid, [], {
            stChatFileName: currentStChatId,
            ...charMeta,
        });
        console.warn(
            '[곽두철] 분기/rename 감지 — 새 UUID 발급\n' +
            `  옛: ${existingUuid} (was at: ${record.stChatFileName})\n` +
            `  새: ${newUuid} (now at: ${currentStChatId})`
        );
        return newUuid;
    }

    // (2-c) 정상 — stChatFileName 비어있으면 보강
    if (!record.stChatFileName && currentStChatId) {
        await dbSetHistory(existingUuid, record.messages || [], {
            stChatFileName: currentStChatId,
            ...charMeta,
        });
    }
    return existingUuid;
}

/**
 * UUID 강제 재발급 (수동 리셋용)
 */
export async function regenerateGwakChatId() {
    const ctx = getContext();
    const metadata = getMetadata(ctx);
    if (!metadata) throw new Error('chat_metadata 접근 불가');

    const currentStChatId = getStChatFileName();
    const charMeta = getCharacterMeta(ctx);

    const old = metadata[GWAK_META_KEY];
    const newUuid = crypto.randomUUID();
    metadata[GWAK_META_KEY] = newUuid;
    persistMetadata(ctx);

    await dbSetHistory(newUuid, [], {
        stChatFileName: currentStChatId,
        ...charMeta,
    });

    console.log('[곽두철] UUID 재발급:', old, '→', newUuid);
    return newUuid;
}

// ─────────────────────────────────────────────────────
// RP 컨텍스트 수집
// ─────────────────────────────────────────────────────

export function getCharSheet({ includeMesExample = false, includeFirstMes = false } = {}) {
    const ctx = getContext();
    const charId = ctx.characterId;
    if (charId === undefined || charId === null) return null;

    const char = ctx.characters?.[charId];
    if (!char) return null;

    const sheet = {
        name: char.name || '',
        description: char.description || '',
        personality: char.personality || '',
        scenario: char.scenario || '',
    };
    if (includeFirstMes) sheet.first_mes = char.first_mes || '';
    if (includeMesExample) sheet.mes_example = char.mes_example || '';

    return sheet;
}

export function getPersona() {
    const ctx = getContext();
    let description = '';

    if (ctx.personaDescription) {
        description = ctx.personaDescription;
    } else if (ctx.power_user?.persona_description) {
        description = ctx.power_user.persona_description;
    } else if (ctx.userAvatar && ctx.personas?.[ctx.userAvatar]) {
        const p = ctx.personas[ctx.userAvatar];
        description = typeof p === 'string' ? p : (p.description || '');
    }

    return { name: ctx.name1 || 'User', description };
}

export async function getActiveWorldInfo() {
    const ctx = getContext();

    if (typeof ctx.getWorldInfoPrompt !== 'function') {
        console.warn('[곽두철] getWorldInfoPrompt 함수 없음 — 로어북 스킵');
        return { worldInfoBefore: '', worldInfoAfter: '', entries: [] };
    }

    try {
        const chat = ctx.chat || [];
        const chatMessages = chat.map(m => m?.mes ?? '');
        const maxCtx = ctx.maxContext || 4096;
        const result = await ctx.getWorldInfoPrompt(chatMessages, maxCtx, false);
        return {
            worldInfoBefore: result?.worldInfoBefore || '',
            worldInfoAfter: result?.worldInfoAfter || '',
            entries: result?.allActivatedEntries
                ? Array.from(result.allActivatedEntries).map(e => ({
                    key: e.key,
                    content: e.content,
                    comment: e.comment,
                }))
                : [],
        };
    } catch (e) {
        console.warn('[곽두철 context] getWorldInfoPrompt 실패:', e);
        return { worldInfoBefore: '', worldInfoAfter: '', entries: [], error: e.message };
    }
}

export function getRecentChat(n = 10) {
    const ctx = getContext();
    const chat = ctx.chat || [];
    return chat.slice(-n).map(m => ({
        role: m.is_user ? 'user' : 'assistant',
        name: m.name,
        content: m.mes,
        is_user: !!m.is_user,
        is_system: !!m.is_system,
    }));
}

export function getStChatFileName() {
    const ctx = getContext();
    return ctx.chatId || ctx.getCurrentChatId?.() || null;
}

export async function gather({ recentChatN = 10, includeMesExample = false } = {}) {
    return {
        gwakChatId: await getOrCreateGwakChatId(),
        charSheet: getCharSheet({ includeMesExample }),
        persona: getPersona(),
        worldInfo: await getActiveWorldInfo(),
        recentChat: getRecentChat(recentChatN),
        meta: {
            stChatFileName: getStChatFileName(),
            timestamp: Date.now(),
        },
    };
}

// ─────────────────────────────────────────────────────
// Self-test
// ─────────────────────────────────────────────────────

export async function selfTest() {
    console.group('🐗 곽두철 context self-test');
    let pass = 0, fail = 0;
    const assert = (cond, label) => {
        if (cond) { console.log('✅', label); pass++; }
        else { console.error('❌', label); fail++; }
    };

    try {
        const id = await getOrCreateGwakChatId();
        assert(typeof id === 'string' && id.length > 0, 'gwakChatId 생성/획득');
        console.log('  → UUID:', id);

        const id2 = await getOrCreateGwakChatId();
        assert(id === id2, 'getOrCreate 멱등성 (같은 ID 반환)');

        const charSheet = getCharSheet();
        if (charSheet) {
            assert(typeof charSheet.name === 'string' && charSheet.name.length > 0, '캐시트 name 있음');
            console.log('  → 캐시트:', charSheet);
        } else {
            console.warn('  ⚠️ 캐릭터 미선택 — 캐시트 검증 스킵');
        }

        const persona = getPersona();
        assert(typeof persona.name === 'string', '페르소나 name 있음');
        console.log('  → 페르소나:', persona);

        const wi = await getActiveWorldInfo();
        assert(typeof wi === 'object' && Array.isArray(wi.entries), '로어북 객체 + entries 배열');
        console.log(`  → 로어북: 활성 엔트리 ${wi.entries.length}개`);

        const recent = getRecentChat(5);
        assert(Array.isArray(recent), '채팅 배열 반환');
        console.log(`  → 최근 채팅 ${recent.length}개`);

        const fname = getStChatFileName();
        console.log('  → stChatFileName:', fname);

        const all = await gather();
        assert(all.gwakChatId === id, 'gather 통합 호출 동작');
        assert(typeof all.charSheet === 'object' || all.charSheet === null, 'gather.charSheet 정상');
        assert(Array.isArray(all.recentChat), 'gather.recentChat 배열');
        console.log('  → 전체 gather():', all);

        console.log(`\n결과: ${pass} pass / ${fail} fail`);
        return { pass, fail, sample: all };
    } catch (e) {
        console.error('테스트 중 에러:', e);
        return { pass, fail, error: e };
    } finally {
        console.groupEnd();
    }
}

// ─────────────────────────────────────────────────────
// 글로벌 노출
// ─────────────────────────────────────────────────────

window.gwak = window.gwak || {};
window.gwak.context = {
    getOrCreateGwakChatId,
    regenerateGwakChatId,
    getCharSheet,
    getPersona,
    getActiveWorldInfo,
    getRecentChat,
    getStChatFileName,
    gather,
    selfTest,
};
window.gwak.test = window.gwak.test || {};
window.gwak.test.context = selfTest;
