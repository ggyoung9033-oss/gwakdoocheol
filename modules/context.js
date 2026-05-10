// 🐗 곽두철 — RP 컨텍스트 수집 모듈
// 캐시트 + 페르소나 + 활성 로어북 + 최근 채팅을 현재 ST 상태에서 동적으로 수집
// chat_metadata UUID 시스템 없음 — 곽두철 기억은 글로벌 단일 thread

function getContext() {
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
        return SillyTavern.getContext();
    }
    throw new Error('SillyTavern.getContext() 접근 불가');
}

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
    if (ctx.personaDescription) description = ctx.personaDescription;
    else if (ctx.power_user?.persona_description) description = ctx.power_user.persona_description;
    else if (ctx.userAvatar && ctx.personas?.[ctx.userAvatar]) {
        const p = ctx.personas[ctx.userAvatar];
        description = typeof p === 'string' ? p : (p.description || '');
    }
    return { name: ctx.name1 || 'User', description };
}

export async function getActiveWorldInfo() {
    const ctx = getContext();
    if (typeof ctx.getWorldInfoPrompt !== 'function') {
        return { worldInfoBefore: '', worldInfoAfter: '', entries: [] };
    }
    try {
        const chat = ctx.chat || [];
        const chatMessages = chat.map(m => m?.mes ?? '');
        const result = await ctx.getWorldInfoPrompt(chatMessages, ctx.maxContext || 4096, false);
        return {
            worldInfoBefore: result?.worldInfoBefore || '',
            worldInfoAfter: result?.worldInfoAfter || '',
            entries: result?.allActivatedEntries
                ? Array.from(result.allActivatedEntries).map(e => ({
                    key: e.key, content: e.content, comment: e.comment,
                }))
                : [],
        };
    } catch (e) {
        console.warn('[곽두철] getWorldInfoPrompt 실패:', e);
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
    }));
}

export function getStChatFileName() {
    const ctx = getContext();
    return ctx.chatId || ctx.getCurrentChatId?.() || null;
}

export async function gather({ recentChatN = 10, includeMesExample = false } = {}) {
    return {
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

window.gwak = window.gwak || {};
window.gwak.context = {
    getCharSheet, getPersona, getActiveWorldInfo, getRecentChat,
    getStChatFileName, gather,
};
