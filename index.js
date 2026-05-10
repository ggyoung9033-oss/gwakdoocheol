// 🐗 곽두철 — SillyTavern RP 컨설턴트 익스텐션
// v0.4.0 — UI + API + 글로벌 단일 thread

window.gwak = window.gwak || {};
window.gwak.test = window.gwak.test || {};

// 모듈 로드 (사이드 이펙트로 window.gwak.* 등록)
import './modules/db.js';
import './modules/persona.js';
import './modules/context.js';
import './modules/prompt.js';
import './modules/api.js';
import { addMenuEntry } from './modules/ui.js';
import { injectSettings } from './modules/settings.js';

function init() {
    addMenuEntry();
    injectSettings();
    console.log(
        '%c🐗 곽두철 v0.4.0 로드됨.',
        'color: #4a90e2; font-weight: bold;',
        '\n• Wand 메뉴(✨)에서 "🐗 곽두철" 클릭 → 패널 열기',
        '\n• ST Extensions 패널에 "🐗 곽두철" 카드 (시스템 프롬프트, 설정)',
        '\n• 콘솔 검증: gwak.db / gwak.context / gwak.api / gwak.ui'
    );
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
