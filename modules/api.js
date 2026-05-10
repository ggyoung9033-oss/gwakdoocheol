// 🐗 곽두철 — API 호출 모듈
// SillyTavern의 활성 connection profile 재활용
// ST 1.13+ 의 ConnectionManagerRequestService 사용

function getContext() {
    return SillyTavern.getContext();
}

/**
 * 메시지 배열로 LLM 호출
 * @param {Array} messages - { role: 'system'|'user'|'assistant', content: string }[]
 * @param {Object} options - { maxTokens, profileId }
 * @returns {Promise<string>} LLM 응답 텍스트
 */
export async function sendRequest(messages, { maxTokens = 1024, profileId = null } = {}) {
    const ctx = getContext();
    const cm = ctx.ConnectionManagerRequestService;

    if (!cm || typeof cm.sendRequest !== 'function') {
        throw new Error(
            'ConnectionManagerRequestService 미지원. SillyTavern 1.13+ 필요. ' +
            'ST 업데이트 후 다시 시도하거나, 활성 Connection Profile이 설정됐는지 확인.'
        );
    }

    try {
        // ST의 sendRequest: (profileId, prompt, max_tokens, customOptions?)
        // profileId 가 null/undefined 면 활성 프로필 자동 사용
        // prompt 는 string 또는 messages 배열 (ST가 내부 변환)
        const result = await cm.sendRequest(profileId, messages, maxTokens);

        // 응답 형태는 ST 버전 / 백엔드마다 다름 — 방어적으로 처리
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

/**
 * 현재 활성 connection profile 정보 (UI 표시용)
 */
export function getActiveProfile() {
    const ctx = getContext();
    const settings = ctx.extensionSettings?.connectionManager;
    if (!settings) return null;
    const profileId = settings.selectedProfile;
    const profile = settings.profiles?.find(p => p.id === profileId);
    return profile || null;
}

window.gwak = window.gwak || {};
window.gwak.api = { sendRequest, getActiveProfile };
