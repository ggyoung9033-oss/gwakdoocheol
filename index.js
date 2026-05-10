// 🐗 곽두철 — SillyTavern RP 컨설턴트 익스텐션
// v0.1.0

// 글로벌 namespace 초기화
window.gwak = window.gwak || {};
window.gwak.test = window.gwak.test || {};

// 모듈 로드 (사이드 이펙트로 window.gwak.* 등록)
import './modules/db.js';
import './modules/context.js';

console.log(
    '%c🐗 곽두철 v0.2.2 로드됨.',
    'color: #d97706; font-weight: bold;',
    '\n검증:',
    '\n  await gwak.db.selfTest()',
    '\n  await gwak.context.selfTest()'
);
