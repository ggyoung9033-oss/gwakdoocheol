# 🐗 곽두철

SillyTavern용 RP 컨설턴트 익스텐션.

트위터 갸르 말투 + 동네 철물점 사장 이름의 **미스매치 코미디** 콘셉트. 캐시트 / 페르소나 / 활성 로어북 / 최근 채팅을 같이 읽고, RP 방향성 잡아주거나 같이 수다 떨어주는 친구.

## 설치

SillyTavern → **Extensions** → **Install Extension** → repo URL 입력:

```
https://github.com/{username}/gwakdoocheol
```

모바일 ST도 같은 URL로 설치 가능.

수동 설치: zip 받아서 `SillyTavern/data/default-user/extensions/` 에 압축 풀기.

## 요구사항

- SillyTavern 1.12+ (ES module 익스텐션 시스템)

## 사용법

🚧 UI 개발 중

## 콘솔 디버그

```js
gwak.db          // IndexedDB 모듈
gwak.context     // RP 컨텍스트 수집

await gwak.db.selfTest()
await gwak.context.selfTest()
```

## 라이선스

TBD
