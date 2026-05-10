// 🐗 곽두철 — API 호출 모듈
// SillyTavern의 ConnectionManagerRequestService로 호출
// 곽두철 전용 profileId 사용 (없으면 ST 활성 프로필)

function getContext() {
    return SillyTavern.getContext();
}

/**
 * 메시지 배열로 LLM 호출
 * @param {Array} messages - { role, content }[]
 * @param {Object} options - { maxTokens, profileId }
 * @returns {Promise<string>} LLM 응답 텍스트
 */
export async function sendRequest(messages, { maxTokens = 1024, profileId = '' } = {}) {
    const ctx = getContext();
    const cm = ctx.ConnectionManagerRequestService;

    if (!cm || typeof cm.sendRequest !== 'function') {
        throw new Error(
            'ConnectionManagerRequestService 미지원. SillyTavern 1.13+ 필요. ' +
            'ST 업데이트 후 다시 시도해줘.'
        );
    }

    const useProfileId = profileId || '';

    try {
        // ST: sendRequest(profileId, prompt, max_tokens, customOptions?)
        const result = await cm.sendRequest(useProfileId, messages, maxTokens);

        // 응답 형태는 ST 버전 / 백엔드마다 다를 수 있음
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
window.gwak.api = { sendRequest };
