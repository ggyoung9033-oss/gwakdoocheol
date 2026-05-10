// 🐗 곽두철 — API 호출 모듈
// SillyTavern의 ConnectionManagerRequestService로 호출.
// 🚨 ConnectionManagerRequestService는 systemInstruction 미지원 →
//    system 메시지를 첫 user 메시지에 합쳐서 전송.

function getCtx() {
    return SillyTavern.getContext();
}

/**
 * Gemini 호환을 위한 system 메시지 평탄화.
 * 모든 system 메시지를 첫 user 메시지 앞에 붙여서 user 하나로 만듦.
 */
function flattenSystemMessages(messages) {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const others = messages.filter(m => m.role !== 'system');

    if (systemMsgs.length === 0) return others;

    const systemText = systemMsgs.map(m => m.content).join('\n\n');
    const firstUserIdx = others.findIndex(m => m.role === 'user');

    if (firstUserIdx === -1) {
        // user 없으면 system을 user 메시지로 변환
        return [...others, { role: 'user', content: systemText }];
    }

    return others.map((m, i) =>
        i === firstUserIdx
            ? { ...m, content: systemText + '\n\n---\n\n' + m.content }
            : m
    );
}

/**
 * 메시지 배열로 LLM 호출
 * @param {Array} messages - { role, content }[]
 * @param {Object} options - { maxTokens, profileId }
 * @returns {Promise<string>} LLM 응답 텍스트
 */
export async function sendRequest(messages, { maxTokens = 4096, profileId = '' } = {}) {
    const ctx = getCtx();
    const cm = ctx.ConnectionManagerRequestService;

    if (!cm || typeof cm.sendRequest !== 'function') {
        throw new Error(
            'ConnectionManagerRequestService 미지원. SillyTavern 1.13+ 필요.'
        );
    }

    // 🚨 system을 user에 합쳐서 전송 (트랜슬레이터 검증 패턴)
    const flatMessages = flattenSystemMessages(messages);

    try {
        const result = await cm.sendRequest(profileId || '', flatMessages, maxTokens);

        if (typeof result === 'string') return result;
        if (result?.content) return result.content;
        if (result?.text) return result.text;
        if (result?.message?.content) return result.message.content;
        if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
        if (result?.choices?.[0]?.text) return result.choices[0].text;

        console.warn('[곽두철 API] 응답 형태 인식 못함:', result);
        return JSON.stringify(result);
    } catch (e) {
        console.error('[곽두철 API] sendRequest 실패:', e);
        throw e;
    }
}

window.gwak = window.gwak || {};
window.gwak.api = { sendRequest, flattenSystemMessages };
