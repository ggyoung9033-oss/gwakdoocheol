// ============================================================
// 🐗 곽두철 v0.5.0 — RP 컨설턴트 익스텐션
// ============================================================
// ST 표준 import — 이게 있으면 ST가 익스텐션 js를 module로 확실히 로드
import { extension_settings, getContext } from '../../../../scripts/extensions.js';

// 모듈 로드 (사이드 이펙트로 window.gwak.* 등록)
import './modules/db.js';
import './modules/persona.js';
import './modules/context.js';
import './modules/prompt.js';
import './modules/api.js';
import { addMenuEntry, setupExtensionCard } from './modules/ui.js';

const EXT_NAME = 'gwakdoocheol';
const stContext = getContext();

window.gwak = window.gwak || {};
window.gwak.test = window.gwak.test || {};

jQuery(async () => {
    // 진입점 3중 — 어느 환경에서든 진입 가능
    setupExtensionCard();   // ST 설정 → Extensions 탭 (모바일 진입점 핵심)
    addMenuEntry();          // Wand 메뉴(✨) + 우하단 floating 🐗 버튼

    // ST APP_READY 이벤트 — wand 메뉴 / 카드 늦게 생기는 케이스 보강
    try {
        if (stContext.eventSource && stContext.event_types?.APP_READY) {
            stContext.eventSource.on(stContext.event_types.APP_READY, () => {
                setupExtensionCard();
                addMenuEntry();
            });
        }
    } catch (e) {
        console.warn('[곽두철] APP_READY listen 실패:', e);
    }

    console.log(
        '%c🐗 곽두철 v0.5.0 로드됨.',
        'color: #4a90e2; font-weight: bold;',
        '\n• 진입점 3중: ST 설정→Extensions 카드, Wand 메뉴(✨), 우하단 🐗 floating',
        '\n• 패널 헤더 슬라이더로 투명도, ⚙️에서 Connection Profile/시스템 프롬프트'
    );
});
