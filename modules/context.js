// 🐗 곽두철 — RP 컨텍스트 수집 모듈
// - 캐시트 + 페르소나 + 활성 로어북 + 최근 채팅 빨아들이기
// - chat_metadata에 자체 UUID 박아서 채팅 식별 (rename/분기 안전)

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

/**
 * chat_metadata 참조 (camelCase / snake_case 둘 다 시도)
 */
function getMetadata(ctx) {
    return ctx.chatMetadata || ctx.chat_metadata || null;
}

// ─────────────────────────────────────────────────────
// 곽두철 자체 UUID (chat_metadata에 박힘)
// ─────────────────────────────────────────────────────

/**
 * 현재 채팅의 곽두철 UUID 가져오기 (없으면 생성)
 * - 분기/rename에 안전하게 채팅 식별
 * - chat_metadata에 영구 저장
 */
export function getOrCreateGwakChatId() {
    const ctx = getContext();
    const metadata = getMetadata(ctx);

    if (!metadata) {
        throw new Error('chat_metadata 접근 불가 — 채팅 띄운 상태 확인');
    }

    if (!metadata[GWAK_META_KEY]) {
        metadata[GWAK_META_KEY] = crypto.randomUUID();
        // ST 메타데이터 저장
        if (typeof ctx.saveMetadataDebounced === 'function') {
            ctx.saveMetadataDebounced();
        } else if (typeof ctx.saveMetadata === 'function') {
            ctx.saveMetadata();
        } else {
            console.warn('[곽두철] saveMetadata(Debounced) 함수 없음 — 메타데이터 저장 안 됨');
        }
        console.log('[곽두철] 새 UUID 발급:', metadata[GWAK_META_KEY]);
    }

    return metadata[GWAK_META_KEY];
}

/**
 * UUID 강제 재발급 (분기 감지 hook에서 사용)
 */
export function regenerateGwakChatId() {
    const ctx = getContext();
    const metadata = getMetadata(ctx);
    if (!metadata) throw new Error('chat_metadata 접근 불가');

    const old = metadata[GWAK_META_KEY];
    metadata[GWAK_META_KEY] = crypto.randomUUID();
    if (typeof ctx.saveMetadataDebounced === 'function') {
        ctx.saveMetadataDebounced();
    } else if (typeof ctx.saveMetadata === 'function') {
        ctx.saveMetadata();
    }
    console.log('[곽두철] UUID 재발급:', old, '→', metadata[GWAK_META_KEY]);
    return metadata[GWAK_META_KEY];
}

// ─────────────────────────────────────────────────────
// RP 컨텍스트 수집
// ─────────────────────────────────────────────────────

/**
 * 현재 캐릭터 시트
 */
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

/**
 * 사용자 페르소나
 */
export function getPersona() {
    const ctx = getContext();
    let description = '';

    // ST 버전마다 페르소나 설명 위치 다름 — 여러 경로 시도
    if (ctx.personaDescription) {
        description = ctx.personaDescription;
    } else if (ctx.power_user?.persona_description) {
        description = ctx.power_user.persona_description;
    } else if (ctx.userAvatar && ctx.personas?.[ctx.userAvatar]) {
        const p = ctx.personas[ctx.userAvatar];
        description = typeof p === 'string' ? p : (p.description || '');
    }

    return {
        name: ctx.name1 || 'User',
        description,
    };
}

/**
 * 활성 로어북 (현재 채팅에 매칭된 엔트리만)
 */
export async function getActiveWorldInfo() {
    const ctx = getContext();

    if (typeof ctx.getWorldInfoPrompt !== 'function') {
        console.warn('[곽두철] getWorldInfoPrompt 함수 없음 — 로어북 스킵');
        return { worldInfoBefore: '', worldInfoAfter: '', entries: [] };
    }

    try {
        const chat = ctx.chat || [];
        // ST의 getWorldInfoPrompt는 messages를 string[]로 받음 (.trim() 호출함)
        // 객체 배열 그대로 넘기면 TypeError 터짐 → .mes 추출
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

/**
 * 최근 채팅 메시지 N개
 */
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

/**
 * ST 채팅 파일명/ID (참고용 — IndexedDB 메타에 저장)
 */
export function getStChatFileName() {
    const ctx = getContext();
    return ctx.chatId || ctx.getCurrentChatId?.() || null;
}

/**
 * 모든 RP 컨텍스트 한 번에
 */
export async function gather({ recentChatN = 10, includeMesExample = false } = {}) {
    return {
        gwakChatId: getOrCreateGwakChatId(),
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
        // 1. UUID 발급/획득
        const id = getOrCreateGwakChatId();
        assert(typeof id === 'string' && id.length > 0, 'gwakChatId 생성/획득');
        console.log('  → UUID:', id);

        // 2. 멱등성
        const id2 = getOrCreateGwakChatId();
        assert(id === id2, 'getOrCreate 멱등성 (같은 ID 반환)');

        // 3. 캐시트
        const charSheet = getCharSheet();
        if (charSheet) {
            assert(typeof charSheet.name === 'string' && charSheet.name.length > 0, '캐시트 name 있음');
            console.log('  → 캐시트:', charSheet);
        } else {
            console.warn('  ⚠️ 캐릭터 미선택 — 캐시트 검증 스킵 (RP 채팅 띄우고 다시 돌려)');
        }

        // 4. 페르소나
        const persona = getPersona();
        assert(typeof persona.name === 'string', '페르소나 name 있음');
        console.log('  → 페르소나:', persona);

        // 5. 로어북
        const wi = await getActiveWorldInfo();
        assert(typeof wi === 'object' && Array.isArray(wi.entries), '로어북 객체 + entries 배열');
        console.log(`  → 로어북: 활성 엔트리 ${wi.entries.length}개`);
        if (wi.entries.length > 0) console.log('     entries:', wi.entries);

        // 6. 최근 채팅
        const recent = getRecentChat(5);
        assert(Array.isArray(recent), '채팅 배열 반환');
        console.log(`  → 최근 채팅 ${recent.length}개:`, recent);

        // 7. ST 파일명
        const fname = getStChatFileName();
        console.log('  → stChatFileName:', fname);

        // 8. 통합 gather
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
