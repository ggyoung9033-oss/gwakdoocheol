// ============================================================
// 🐗 곽두철 v0.6.0 — RP 컨설턴트 익스텐션
// ============================================================
// - 페르소나 정리 (한국 트위터/여초 톤, 츤데레 결, 마크다운 X)
// - 투명도 슬라이더 작동 수정 + 모바일 풀스크린 + 패널 크기 조절
// - 카드: 시스템 프롬프트 textarea 제거 (Connection Profile/토큰만)
// - NEW: RP 노트 — 곽두철과 의논한 합의사항을 ST RP에 "참고용 메모"로 인젝트
// ST 표준 import — 이게 있으면 ST가 익스텐션 js를 module로 확실히 로드
import { extension_settings, getContext } from '../../../../scripts/extensions.js';

// 모듈 로드 (사이드 이펙트로 window.gwak.* 등록)
import './modules/db.js';
import './modules/persona.js';
import './modules/context.js';
import './modules/prompt.js';
import './modules/api.js';
import { reapplyOnLoad as reapplyNote } from './modules/note.js';
import { addMenuEntry, setupExtensionCard } from './modules/ui.js';

const EXT_NAME = 'gwakdoocheol';
const stContext = getContext();

window.gwak = window.gwak || {};
window.gwak.test = window.gwak.test || {};

jQuery(async () => {
    // 진입점 3중 — 어느 환경에서든 진입 가능
    setupExtensionCard();   // ST 설정 → Extensions 탭 (모바일 진입점 핵심)
    addMenuEntry();          // Wand 메뉴(✨) + 우하단 floating 🐗 버튼

    // 저장된 RP 노트가 있으면 ST에 다시 인젝트 (페이지 로드 후 복원)
    try { reapplyNote(); } catch (e) { console.warn('[곽두철] 노트 reapply 실패:', e); }

    // ST APP_READY 이벤트 — wand 메뉴 / 카드 늦게 생기는 케이스 보강
    try {
        if (stContext.eventSource && stContext.event_types?.APP_READY) {
            stContext.eventSource.on(stContext.event_types.APP_READY, () => {
                setupExtensionCard();
                addMenuEntry();
                try { reapplyNote(); } catch (e) {}
            });
        }
    } catch (e) {
        console.warn('[곽두철] APP_READY listen 실패:', e);
    }

    console.log(
        '%c🐗 곽두철 v0.5.1 로드됨.',
        'color: #4a90e2; font-weight: bold;',
        '\n• ST 설정→Extensions 탭에서 모든 기본 설정 가능 (모바일 OK)',
        '\n• 패널 진입: 카드 "열기" 버튼 / Wand 메뉴(✨) / 우하단 🐗'
    );
});
