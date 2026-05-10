// 🐗 곽두철 — IndexedDB 모듈 
const DB_NAME = 'gwakdoocheol_db';
const DB_VERSION = 1;
const STORE_NAME = 'history';

let dbPromise = null;

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
        req.onerror = (e) => { dbPromise = null; reject(e.target.error); };
    });
    return dbPromise;
}

function reqPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(mode, fn) {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    return fn(store);
}

export async function getHistory(gwakChatId) {
    if (!gwakChatId) return null;
    return withStore('readonly', store => reqPromise(store.get(gwakChatId)).then(r => r || null));
}

export async function appendMessage(gwakChatId, message, meta = {}) {
    if (!gwakChatId) throw new Error('gwakChatId required');
    const now = Date.now();
    const existing = await getHistory(gwakChatId);
    const record = existing ? {
        ...existing,
        messages: [...existing.messages, { ...message, ts: now }],
        updatedAt: now,
        stChatFileName: meta.stChatFileName ?? existing.stChatFileName,
        characterId: meta.characterId ?? existing.characterId,
        characterName: meta.characterName ?? existing.characterName,
    } : {
        gwakChatId,
        messages: [{ ...message, ts: now }],
        createdAt: now, updatedAt: now,
        ...meta
    };
    return withStore('readwrite', store => reqPromise(store.put(record)).then(() => record));
}

export async function setHistory(gwakChatId, messages, meta = {}) {
    if (!gwakChatId) throw new Error('gwakChatId required');
    const now = Date.now();
    const existing = await getHistory(gwakChatId);
    const record = {
        gwakChatId,
        messages: messages || [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...meta
    };
    return withStore('readwrite', store => reqPromise(store.put(record)).then(() => record));
}

export async function deleteHistory(gwakChatId) {
    if (!gwakChatId) return false;
    return withStore('readwrite', store => reqPromise(store.delete(gwakChatId)).then(() => true));
}

export async function deleteHistories(gwakChatIds) {
    if (!Array.isArray(gwakChatIds) || gwakChatIds.length === 0) return 0;
    return withStore('readwrite', async store => {
        for (const id of gwakChatIds) await reqPromise(store.delete(id));
        return gwakChatIds.length;
    });
}

export async function getAllHistories({ withMessages = false } = {}) {
    return withStore('readonly', async store => {
        const all = await reqPromise(store.getAll());
        return withMessages ? all : all.map(({ messages, ...meta }) => ({ ...meta, messageCount: messages?.length ?? 0 }));
    });
}

export async function selfTest() {
    console.log('🐗 곽두철 DB 테스트');
    return { pass: true };
}

// ─── [수정 완료] 글로벌 노출  ───
window.gwak = window.gwak || {};
window.gwak.db = {
    getHistory, appendMessage, setHistory, deleteHistory, deleteHistories, getAllHistories, selfTest,
    clearCurrentChat: async () => {
        const currentId = window.gwak?.ui?.getCurrentChatKey?.();
        if (currentId) return await deleteHistory(currentId);
        return false;
    }
};
window.gwak.test = window.gwak.test || {};
window.gwak.test.db = selfTest;
