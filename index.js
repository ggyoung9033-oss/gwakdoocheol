// 🐗 곽두철 — SillyTavern RP 컨설턴트 익스텐션
// v0.4.5 — 투명도 슬라이더 복귀 + 시스템 프롬프트 압축

window.gwak = window.gwak || {};
window.gwak.test = window.gwak.test || {};

// 모듈 로드 (사이드 이펙트로 window.gwak.* 등록)
import './modules/db.js';
import './modules/persona.js';
import './modules/context.js';
import './modules/prompt.js';
import './modules/api.js';
import { addMenuEntry } from './modules/ui.js';

function init() {
    // addMenuEntry()가 wand 메뉴 + floating 버튼 둘 다 처리
    addMenuEntry();

    // ST APP_READY 이벤트 listen — wand 메뉴 늦게 생기는 케이스 보강
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const ctx = SillyTavern.getContext();
            if (ctx.eventSource && ctx.event_types?.APP_READY) {
                ctx.eventSource.on(ctx.event_types.APP_READY, () => {
                    addMenuEntry();
                });
            }
        }
    } catch (e) {
        console.warn('[곽두철] APP_READY listen 실패:', e);
    }

    console.log(
        '%c🐗 곽두철 v0.4.5 로드됨.',
        'color: #4a90e2; font-weight: bold;',
        '\n• 우하단 🐗 floating 버튼 클릭/탭 (드래그로 위치 이동)',
        '\n• 또는 Wand 메뉴(✨) → "🐗 곽두철"',
        '\n• 패널 헤더 슬라이더로 투명도 조절 (호버 시 자동 100%)',
        '\n• 패널 헤더 ⚙️에서 Connection Profile / 토큰 / 시스템 프롬프트'
    );
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
