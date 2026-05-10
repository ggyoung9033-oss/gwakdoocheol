// 🐗 곽두철 — IndexedDB 모듈
// 곽두철-사용자 대화 히스토리 영구 저장
// - 채팅별 분리 (gwakChatId 기준 = chat_metadata에 박은 자체 UUID)
// - 사용자 명시 삭제 전까지 자동 정리 X
// - 분기/rename에 안전 (ST 채팅 파일명에 의존 안 함)

const DB_NAME = 'gwakdoocheol_db';
const DB_VERSION = 1;
const STORE_NAME = 'history';

let dbPromise = null;

/**
 * IndexedDB 연결 (lazy, 캐시됨)
 */
function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'gwakChatId' });
                store.createIndex('characterId', 'characterId', { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => {
            dbPromise = null; // 실패 시 재시도 가능하게
            console.error('[곽두철 DB] open 실패:', e.target.error);
            reject(e.target.error);
        };
    });

    return dbPromise;
}

/**
 * IDBRequest → Promise 래퍼
 */
function reqPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 트랜잭션 헬퍼 — 짧게 유지 (await 사이에 트랜잭션 끊기는 거 방지)
 */
async function withStore(mode, fn) {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    return fn(store);
}

// ─────────────────────────────────────────────────────
// CRUD API
// ─────────────────────────────────────────────────────

/**
 * 채팅 히스토리 가져오기
 * @param {string} gwakChatId
 * @returns {Promise<Object|null>}
 *   { gwakChatId, stChatFileName, characterId, characterName, messages, createdAt, updatedAt }
 */
export async function getHistory(gwakChatId) {
    if (!gwakChatId) return null;
    return withStore('readonly', store =>
        reqPromise(store.get(gwakChatId)).then(r => r || null)
    );
}

/**
 * 메시지 1개 추가 (없으면 새 레코드 생성)
 * @param {string} gwakChatId
 * @param {Object} message - { role: 'user'|'assistant', content: string, ts?: number }
 * @param {Object} meta - { stChatFileName, characterId, characterName }
 */
export async function appendMessage(gwakChatId, message, meta = {}) {
    if (!gwakChatId) throw new Error('gwakChatId required');
    if (!message?.role || !message?.content) {
        throw new Error('message {role, content} required');
    }

    const now = Date.now();
    const msg = { ...message, ts: message.ts || now };

    const existing = await getHistory(gwakChatId);

    const record = existing
        ? {
            ...existing,
            messages: [...existing.messages, msg],
            updatedAt: now,
            // 메타 갱신 (rename 등 추적)
            stChatFileName: meta.stChatFileName ?? existing.stChatFileName,
            characterId: meta.characterId ?? existing.characterId,
            characterName: meta.characterName ?? existing.characterName,
        }
        : {
            gwakChatId,
            stChatFileName: meta.stChatFileName ?? null,
            characterId: meta.characterId ?? null,
            characterName: meta.characterName ?? null,
            messages: [msg],
            createdAt: now,
            updatedAt: now,
        };

    return withStore('readwrite', store =>
        reqPromise(store.put(record)).then(() => record)
    );
}

/**
 * 히스토리 전체 덮어쓰기 (수동 편집/리셋용)
 */
export async function setHistory(gwakChatId, messages, meta = {}) {
    if (!gwakChatId) throw new Error('gwakChatId required');

    const now = Date.now();
    const existing = await getHistory(gwakChatId);

    const record = {
        gwakChatId,
        stChatFileName: meta.stChatFileName ?? existing?.stChatFileName ?? null,
        characterId: meta.characterId ?? existing?.characterId ?? null,
        characterName: meta.characterName ?? existing?.characterName ?? null,
        messages: messages || [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    return withStore('readwrite', store =>
        reqPromise(store.put(record)).then(() => record)
    );
}

/**
 * 한 채팅의 곽두철 히스토리 삭제
 */
export async function deleteHistory(gwakChatId) {
    if (!gwakChatId) return false;
    return withStore('readwrite', store =>
        reqPromise(store.delete(gwakChatId)).then(() => true)
    );
}

/**
 * 여러 채팅 히스토리 일괄 삭제 (고아 정리용)
 */
export async function deleteHistories(gwakChatIds) {
    if (!Array.isArray(gwakChatIds) || gwakChatIds.length === 0) return 0;
    return withStore('readwrite', async store => {
        let count = 0;
        for (const id of gwakChatIds) {
            await reqPromise(store.delete(id));
            count++;
        }
        return count;
    });
}

/**
 * 전체 히스토리 리스트 (기본은 메타데이터만, messages 제외)
 * @param {Object} options - { withMessages: boolean }
 */
export async function getAllHistories({ withMessages = false } = {}) {
    return withStore('readonly', async store => {
        const all = await reqPromise(store.getAll());
        if (!withMessages) {
            return all.map(({ messages, ...meta }) => ({
                ...meta,
                messageCount: messages?.length ?? 0,
            }));
        }
        return all;
    });
}

// ─────────────────────────────────────────────────────
// Self-test (콘솔 검증용)
// ─────────────────────────────────────────────────────

export async function selfTest() {
    console.group('🐗 곽두철 DB self-test');
    const testId = '__test_' + Date.now();
    let pass = 0, fail = 0;

    const assert = (cond, label) => {
        if (cond) { console.log('✅', label); pass++; }
        else { console.error('❌', label); fail++; }
    };

    try {
        // 1. 빈 상태
        let h = await getHistory(testId);
        assert(h === null, '빈 ID 조회 → null');

        // 2. 메시지 추가 + 메타데이터
        await appendMessage(testId,
            { role: 'user', content: '안녕' },
            { characterId: 'char_test', characterName: '레온', stChatFileName: 'test.jsonl' }
        );
        h = await getHistory(testId);
        assert(h?.messages?.length === 1, '메시지 1개 추가됨');
        assert(h?.characterName === '레온', '메타데이터 저장됨 (characterName)');
        assert(h?.stChatFileName === 'test.jsonl', '메타데이터 저장됨 (stChatFileName)');
        assert(typeof h?.messages?.[0]?.ts === 'number', 'timestamp 자동 부여됨');

        // 3. 메시지 누적
        await appendMessage(testId, { role: 'assistant', content: 'ㄹㅇ?' });
        h = await getHistory(testId);
        assert(h?.messages?.length === 2, '메시지 2개 누적');
        assert(h?.messages[1].role === 'assistant', '두 번째 role 맞음');

        // 4. updatedAt 갱신
        const firstUpdate = h.updatedAt;
        await new Promise(r => setTimeout(r, 5));
        await appendMessage(testId, { role: 'user', content: '한 번 더' });
        h = await getHistory(testId);
        assert(h?.updatedAt > firstUpdate, 'updatedAt 갱신됨');

        // 5. setHistory 덮어쓰기
        await setHistory(testId, [{ role: 'user', content: '리셋', ts: Date.now() }]);
        h = await getHistory(testId);
        assert(h?.messages?.length === 1, 'setHistory 덮어쓰기 동작');
        assert(h?.characterName === '레온', '메타데이터 유지됨 (덮어쓰기 후)');

        // 6. getAllHistories
        const all = await getAllHistories();
        assert(all.some(r => r.gwakChatId === testId), 'getAllHistories 포함');
        const orphan = all.find(r => r.gwakChatId === testId);
        assert(orphan?.messageCount === 1, 'messageCount 정확');
        assert(!('messages' in orphan), 'withMessages: false 일 때 messages 제외');

        const allFull = await getAllHistories({ withMessages: true });
        const full = allFull.find(r => r.gwakChatId === testId);
        assert(Array.isArray(full?.messages), 'withMessages: true 옵션');

        // 7. 삭제
        await deleteHistory(testId);
        h = await getHistory(testId);
        assert(h === null, '삭제 후 → null');

        // 8. 일괄 삭제
        const id1 = '__test_bulk_1_' + Date.now();
        const id2 = '__test_bulk_2_' + Date.now();
        await appendMessage(id1, { role: 'user', content: 'a' });
        await appendMessage(id2, { role: 'user', content: 'b' });
        const count = await deleteHistories([id1, id2]);
        assert(count === 2, '일괄 삭제 카운트');
        assert((await getHistory(id1)) === null && (await getHistory(id2)) === null, '일괄 삭제 확인');

        console.log(`\n결과: ${pass} pass / ${fail} fail`);
        return { pass, fail };
    } catch (e) {
        console.error('테스트 중 에러:', e);
        return { pass, fail, error: e };
    } finally {
        try { await deleteHistory(testId); } catch { /* noop */ }
        console.groupEnd();
    }
}

// ─────────────────────────────────────────────────────
// 글로벌 노출 (검증용)
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
// 글로벌 노출 (기존 코드를 이 내용으로 교체하세요)
// ─────────────────────────────────────────────────────

// db.js 파일 맨 아래에 있는 window.gwak.db 부분을 이걸로 교체하세요
window.gwak = window.gwak || {};
window.gwak.db = {
    getHistory,
    appendMessage,
    setHistory,
    deleteHistory,
    deleteHistories,
    getAllHistories,
    selfTest,
    
    // [핵심 추가] 현재 채팅방 기록만 삭제하는 기능
    clearCurrentChat: async () => {
        // window.gwak.ui를 통해 ui.js에 있는 키를 안전하게 가져옴
        const currentId = window.gwak?.ui?.getCurrentChatKey?.();
        if (!currentId) {
            console.error('[곽두철 DB] 현재 채팅방 키를 찾을 수 없습니다.');
            return false;
        }
        return await deleteHistory(currentId);
    }
};

window.gwak.test = window.gwak.test || {};
window.gwak.test.db = selfTest;
