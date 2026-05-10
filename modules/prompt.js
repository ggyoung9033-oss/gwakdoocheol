// 🐗 곽두철 — 메시지 빌더
// 시스템 프롬프트 + RP 컨텍스트(내부 분석 자료) + 곽두철 ↔ 사용자 히스토리 + 사용자 새 입력

import { gather } from './context.js';
import { DEFAULT_PERSONA } from './persona.js';

function formatRpContext(rpData) {
    const parts = [];
    parts.push('[이하 정보는 너의 내부 분석 자료다. {{user}}는 이미 다 알고 있는 것들이니 답변에 그대로 옮기거나 인용하지 말 것. 분석/판단/제안의 근거로만 활용해서 핵심만 짧게 짚어줘.]');
    parts.push('');

    if (rpData.charSheet) {
        const cs = rpData.charSheet;
        parts.push('## 캐릭터(NPC) 시트');
        parts.push(`이름: ${cs.name}`);
        if (cs.description) parts.push(`설명:\n${cs.description}`);
        if (cs.personality) parts.push(`성격:\n${cs.personality}`);
        if (cs.scenario) parts.push(`시나리오:\n${cs.scenario}`);
        if (cs.first_mes) parts.push(`첫 메시지:\n${cs.first_mes}`);
        if (cs.mes_example) parts.push(`예시 메시지:\n${cs.mes_example}`);
    }

    if (rpData.persona) {
        parts.push('\n## 사용자 페르소나');
        parts.push(`이름: ${rpData.persona.name}`);
        if (rpData.persona.description) parts.push(`설명: ${rpData.persona.description}`);
    }

    const wi = rpData.worldInfo;
    if (wi?.entries?.length > 0) {
        parts.push('\n## 활성 로어북 (참고만)');
        wi.entries.forEach((e, i) => {
            parts.push(`[${i + 1}] ${e.comment || e.key}`);
            parts.push(e.content);
        });
    } else if (wi?.worldInfoBefore || wi?.worldInfoAfter) {
        parts.push('\n## 로어북 컨텍스트 (참고만)');
        if (wi.worldInfoBefore) parts.push(wi.worldInfoBefore);
        if (wi.worldInfoAfter) parts.push(wi.worldInfoAfter);
    }

    if (rpData.recentChat?.length > 0) {
        parts.push('\n## 최근 RP 채팅 (시간순) — 흐름 파악용');
        rpData.recentChat.forEach(m => {
            parts.push(`${m.name} (${m.role}): ${m.content}`);
        });
    }

    if (rpData.meta?.stChatFileName) {
        parts.push(`\n_(현재 ST 채팅: ${rpData.meta.stChatFileName})_`);
    }

    return parts.join('\n');
}

export async function buildMessages({
    userInput,
    gwakHistory = [],
    persona = DEFAULT_PERSONA,
    contextOptions = {},
}) {
    const ctx = SillyTavern.getContext();
    const userName = ctx.name1 || 'User';

    const personaResolved = persona.replace(/\{\{user\}\}/g, userName);
    const rpData = await gather(contextOptions);
    const rpBlock = formatRpContext(rpData).replace(/\{\{user\}\}/g, userName);

    const systemContent = `${personaResolved}\n\n---\n\n# 현재 RP 컨텍스트 (내부 분석 자료)\n\n${rpBlock}`;

    const messages = [
        { role: 'system', content: systemContent },
        ...gwakHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userInput },
    ];

    return { messages, rpData };
}

window.gwak = window.gwak || {};
window.gwak.prompt = { buildMessages, formatRpContext };
