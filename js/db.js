import { auth, db as firestoreDB } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ========================================
   DATABASE
======================================== */

const DB_NAME = "çandarli";
const DB_VERSION = 5;
let localDB;

/* ========================================
   SYNC STATE
======================================== */

let syncInProgress = false;
let scriptsSyncInProgress = false;

/* ========================================
   COAL DATA
======================================== */

const DEFAULT_COAL_DATA = {
    streak: 0,
    smolders: 0,
    rewardedMilestones: [],
    protectedDates: []
};

/* ========================================
   AUTH STATE
======================================== */

onAuthStateChanged(auth, async user => {
    if (!user) {
        console.log("No authenticated user.");
        return;
    }

    console.log("Authenticated:", user.email);

    try {
        if (!localDB) await openDatabase();
    } catch (error) {
        console.error("Failed to open local database:", error);
        return;
    }

    if (!navigator.onLine) {
        console.log("Offline. Cloud sync postponed.");
        return;
    }

    try {
        await loadCloudEntries();
        await syncPendingEntries();
        await loadCloudScripts();
        await syncPendingScripts();
        await getCoalData();
    } catch (error) {
        console.error("Authentication sync failed:", error);
    }
});

/* ========================================
   OPEN INDEXEDDB
======================================== */

function openDatabase() {
    if (localDB) return Promise.resolve(localDB);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = event => {
            const database = event.target.result;
            let store;

            if (!database.objectStoreNames.contains("entries")) {
                store = database.createObjectStore("entries", { keyPath: "id" });
                store.createIndex("createdAt", "createdAt");
                store.createIndex("updatedAt", "updatedAt");
                store.createIndex("syncStatus", "syncStatus");
            } else {
                store = event.target.transaction.objectStore("entries");

                if (!store.indexNames.contains("syncStatus")) {
                    store.createIndex("syncStatus", "syncStatus");
                }
            }

            if (!database.objectStoreNames.contains("syncQueue")) {
                const queue = database.createObjectStore("syncQueue", { keyPath: "id" });
                queue.createIndex("createdAt", "createdAt");
            }

            if (!database.objectStoreNames.contains("scripts")) {
                const scriptsStore = database.createObjectStore("scripts", { keyPath: "id" });
                scriptsStore.createIndex("createdAt", "createdAt");
                scriptsStore.createIndex("updatedAt", "updatedAt");
                scriptsStore.createIndex("syncStatus", "syncStatus");
            } else {
                const scriptsStore = event.target.transaction.objectStore("scripts");

                if (!scriptsStore.indexNames.contains("syncStatus")) {
                    scriptsStore.createIndex("syncStatus", "syncStatus");
                }
            }

            if (!database.objectStoreNames.contains("scriptsSyncQueue")) {
                const scriptsQueue = database.createObjectStore("scriptsSyncQueue", { keyPath: "id" });
                scriptsQueue.createIndex("createdAt", "createdAt");
            }
        };

        request.onsuccess = event => {
            localDB = event.target.result;

            localDB.onversionchange = () => {
                localDB.close();
                localDB = null;
            };

            resolve(localDB);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   CREATE ENTRY
======================================== */

async function addEntry(entry) {
    const localEntry = {
        ...entry,
        syncStatus: "pending"
    };

    await saveLocalEntry(localEntry);
    await addToSyncQueue({
        type: "create",
        entry: localEntry
    });

    if (navigator.onLine) syncPendingEntries();

    return localEntry;
}

/* ========================================
   READ ALL ENTRIES
======================================== */

function getEntries() {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("entries", "readonly");
        const store = transaction.objectStore("entries");
        const request = store.getAll();

        request.onsuccess = () => {
            const entries = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(entries);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   READ ONE ENTRY
======================================== */

function getEntry(id) {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("entries", "readonly");
        const store = transaction.objectStore("entries");
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   UPDATE ENTRY
======================================== */

async function updateEntry(entry) {
    const localEntry = {
        ...entry,
        syncStatus: "pending"
    };

    await saveLocalEntry(localEntry);
    await addToSyncQueue({
        type: "update",
        entry: localEntry
    });

    if (navigator.onLine) syncPendingEntries();

    return localEntry;
}

/* ========================================
   DELETE ENTRY
======================================== */

async function deleteEntry(id) {
    const queue = await getSyncQueue();

    const relatedOperations = queue.filter(
        operation => operation.entry && operation.entry.id === id
    );

    const hasCreateOperation = relatedOperations.some(
        operation => operation.type === "create"
    );

    if (hasCreateOperation) {
        for (const operation of relatedOperations) {
            await removeFromSyncQueue(operation.id);
        }
    } else {
        await addToSyncQueue({
            type: "delete",
            entry: { id }
        });
    }

    await new Promise((resolve, reject) => {
        const transaction = localDB.transaction("entries", "readwrite");
        const store = transaction.objectStore("entries");
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });

    if (navigator.onLine) syncPendingEntries();
}

/* ========================================
   FURNACE SYNC QUEUE
======================================== */

async function addToSyncQueue(operation) {
    const queue = await getSyncQueue();

    const relatedOperations = queue.filter(
        item => item.entry && item.entry.id === operation.entry.id
    );

    if (operation.type === "create") {
        const existingCreate = relatedOperations.find(
            item => item.type === "create"
        );

        if (existingCreate) {
            await updateQueueItem(existingCreate.id, {
                ...existingCreate,
                entry: operation.entry
            });
            return;
        }
    }

    if (operation.type === "update") {
        const existingCreate = relatedOperations.find(
            item => item.type === "create"
        );

        if (existingCreate) {
            await updateQueueItem(existingCreate.id, {
                ...existingCreate,
                entry: operation.entry
            });
            return;
        }

        const existingUpdate = relatedOperations.find(
            item => item.type === "update"
        );

        if (existingUpdate) {
            await updateQueueItem(existingUpdate.id, {
                ...existingUpdate,
                entry: operation.entry
            });
            return;
        }
    }

    if (operation.type === "delete") {
        const existingCreate = relatedOperations.find(
            item => item.type === "create"
        );

        if (existingCreate) {
            for (const item of relatedOperations) {
                await removeFromSyncQueue(item.id);
            }
            return;
        }

        for (const item of relatedOperations) {
            if (item.type === "update") {
                await removeFromSyncQueue(item.id);
            }
        }

        const existingDelete = relatedOperations.find(
            item => item.type === "delete"
        );

        if (existingDelete) return;
    }

    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction("syncQueue", "readwrite");
        const store = transaction.objectStore("syncQueue");

        const queueItem = {
            id: crypto.randomUUID(),
            type: operation.type,
            entry: operation.entry,
            createdAt: Date.now()
        };

        const request = store.add(queueItem);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   UPDATE QUEUE ITEM
======================================== */

function updateQueueItem(id, item) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction("syncQueue", "readwrite");
        const store = transaction.objectStore("syncQueue");
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   GET SYNC QUEUE
======================================== */

function getSyncQueue() {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("syncQueue", "readonly");
        const store = transaction.objectStore("syncQueue");
        const request = store.getAll();

        request.onsuccess = () => {
            const queue = request.result.sort(
                (a, b) => a.createdAt - b.createdAt
            );
            resolve(queue);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   REMOVE FROM SYNC QUEUE
======================================== */

function removeFromSyncQueue(id) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction("syncQueue", "readwrite");
        const store = transaction.objectStore("syncQueue");
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   FIRESTORE JOURNAL SYNC
======================================== */

async function syncEntry(entry) {
    const user = auth.currentUser;

    if (!user || !navigator.onLine) return false;

    try {
        const entryRef = doc(
            firestoreDB,
            "users",
            user.uid,
            "journals",
            entry.id
        );

        await setDoc(entryRef, {
            id: entry.id,
            title: entry.title,
            content: entry.content,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt
        });

        await updateSyncStatus(entry.id, "synced");
        return true;
    } catch (error) {
        console.error("Firestore sync failed:", error);
        return false;
    }
}

/* ========================================
   SYNC PENDING ENTRIES
======================================== */

async function syncPendingEntries() {
    if (syncInProgress || !localDB || !navigator.onLine) {
        if (!navigator.onLine) console.log("Offline. Sync postponed.");
        return;
    }

    const user = auth.currentUser;

    if (!user) {
        console.log("No authenticated user. Sync postponed.");
        return;
    }

    syncInProgress = true;

    try {
        const queue = await getSyncQueue();
        console.log("Pending operations:", queue.length);

        for (const operation of queue) {
            if (!navigator.onLine) break;

            let success = false;

            if (
                operation.type === "create" ||
                operation.type === "update"
            ) {
                success = await syncEntry(operation.entry);
            } else if (operation.type === "delete") {
                success = await syncDelete(operation.entry.id);
            }

            if (success) {
                await removeFromSyncQueue(operation.id);
            } else {
                break;
            }
        }
    } catch (error) {
        console.error("Sync process failed:", error);
    } finally {
        syncInProgress = false;
    }
}

/* ========================================
   SYNC DELETE
======================================== */

async function syncDelete(id) {
    const user = auth.currentUser;

    if (!user || !navigator.onLine) return false;

    try {
        const entryRef = doc(
            firestoreDB,
            "users",
            user.uid,
            "journals",
            id
        );

        await deleteDoc(entryRef);
        console.log("Cloud entry deleted:", id);
        return true;
    } catch (error) {
        console.error("Firestore delete failed:", error);
        return false;
    }
}

/* ========================================
   UPDATE SYNC STATUS
======================================== */

function updateSyncStatus(id, status) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction("entries", "readwrite");
        const store = transaction.objectStore("entries");
        const request = store.get(id);

        request.onsuccess = () => {
            const entry = request.result;

            if (!entry) {
                resolve();
                return;
            }

            entry.syncStatus = status;

            const updateRequest = store.put(entry);

            updateRequest.onsuccess = () => {
                window.dispatchEvent(
                    new CustomEvent("entry-sync-status-changed", {
                        detail: {
                            id,
                            syncStatus: status
                        }
                    })
                );

                resolve();
            };

            updateRequest.onerror = () => reject(updateRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   LOAD JOURNALS FROM FIRESTORE
======================================== */

async function loadCloudEntries() {
    const user = auth.currentUser;

    if (!user) {
        console.log("No authenticated user.");
        return;
    }

    if (!navigator.onLine) {
        console.log("Offline. Cloud loading postponed.");
        return;
    }

    if (!localDB) await openDatabase();

    try {
        const journalsRef = collection(
            firestoreDB,
            "users",
            user.uid,
            "journals"
        );

        const snapshot = await getDocs(journalsRef);

        for (const document of snapshot.docs) {
            const cloudEntry = document.data();
            const localEntry = await getEntry(cloudEntry.id);

            if (
                localEntry &&
                localEntry.syncStatus === "pending"
            ) {
                continue;
            }

            await saveLocalEntry({
                ...cloudEntry,
                syncStatus: "synced"
            });
        }

        console.log("Cloud entries loaded:", snapshot.size);
    } catch (error) {
        console.error("Failed to load cloud entries:", error);
    }
}

/* ========================================
   CODES — SCRIPTS
======================================== */

/* ========================================
   SCRIPT LOCAL SAVE
======================================== */

function saveLocalScript(script) {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("scripts", "readwrite");
        const store = transaction.objectStore("scripts");
        const request = store.put(script);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   GET ALL SCRIPTS
======================================== */

function getScripts() {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("scripts", "readonly");
        const store = transaction.objectStore("scripts");
        const request = store.getAll();

        request.onsuccess = () => {
            const scripts = request.result.sort(
                (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
            );
            resolve(scripts);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   GET ONE SCRIPT
======================================== */

function getScript(id) {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction("scripts", "readonly");
        const store = transaction.objectStore("scripts");
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   SCRIPT QUEUE
======================================== */

function getScriptsSyncQueue() {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction(
            "scriptsSyncQueue",
            "readonly"
        );

        const store = transaction.objectStore("scriptsSyncQueue");
        const request = store.getAll();

        request.onsuccess = () => {
            const queue = request.result.sort(
                (a, b) => a.createdAt - b.createdAt
            );
            resolve(queue);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   ADD SCRIPT QUEUE ITEM
======================================== */

function addToScriptsSyncQueue(operation) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction(
            "scriptsSyncQueue",
            "readwrite"
        );

        const store = transaction.objectStore("scriptsSyncQueue");

        const queueItem = {
            id: crypto.randomUUID(),
            type: operation.type,
            script: operation.script || null,
            createdAt: Date.now()
        };

        const request = store.add(queueItem);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   UPDATE SCRIPT QUEUE ITEM
======================================== */

function updateScriptQueueItem(id, item) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction(
            "scriptsSyncQueue",
            "readwrite"
        );

        const store = transaction.objectStore("scriptsSyncQueue");

        const request = store.put({
            ...item,
            id
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   REMOVE SCRIPT QUEUE ITEM
======================================== */

function removeFromScriptsSyncQueue(id) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction(
            "scriptsSyncQueue",
            "readwrite"
        );

        const store = transaction.objectStore("scriptsSyncQueue");
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   ADD SCRIPT
======================================== */

async function addScript(script) {
    const localScript = {
        ...script,
        syncStatus: "pending"
    };

    await saveLocalScript(localScript);

    await addToScriptsSyncQueue({
        type: "create",
        script: localScript
    });

    if (navigator.onLine && auth.currentUser) {
        syncPendingScripts();
    }

    return localScript;
}

/* ========================================
   UPDATE SCRIPT
======================================== */

async function updateScript(script) {
    const localScript = {
        ...script,
        updatedAt: script.updatedAt || Date.now(),
        syncStatus: "pending"
    };

    await saveLocalScript(localScript);

    const queue = await getScriptsSyncQueue();

    const relatedOperations = queue.filter(
        operation =>
            operation.script &&
            operation.script.id === script.id
    );

    const existingCreate = relatedOperations.find(
        operation => operation.type === "create"
    );

    if (existingCreate) {
        await updateScriptQueueItem(existingCreate.id, {
            ...existingCreate,
            script: localScript
        });
    } else {
        const existingUpdate = relatedOperations.find(
            operation => operation.type === "update"
        );

        if (existingUpdate) {
            await updateScriptQueueItem(existingUpdate.id, {
                ...existingUpdate,
                script: localScript
            });
        } else {
            await addToScriptsSyncQueue({
                type: "update",
                script: localScript
            });
        }
    }

    if (navigator.onLine && auth.currentUser) {
        syncPendingScripts();
    }

    return localScript;
}

/* ========================================
   DELETE SCRIPT
======================================== */

async function deleteScript(id) {

    if (!localDB) {
        throw new Error("IndexedDB is not open.");
    }


    /*
       Get all pending operations for this Script.
    */

    const queue =
        await getScriptsSyncQueue();


    const relatedOperations =
        queue.filter(
            operation =>
                operation.script &&
                operation.script.id === id
        );


    const hasCreateOperation =
        relatedOperations.some(
            operation =>
                operation.type === "create"
        );


    /*
       If the Script was created locally but
       has not synced yet, simply remove all
       pending operations.

       There is no reason to send a delete
       operation to Firestore because the
       Script may not exist there yet.
    */

    if (hasCreateOperation) {

        for (const operation of relatedOperations) {

            await removeFromScriptsSyncQueue(
                operation.id
            );
        }

    } else {

        /*
           Remove any pending update operations.
        */

        for (const operation of relatedOperations) {

            if (
                operation.type === "update"
            ) {

                await removeFromScriptsSyncQueue(
                    operation.id
                );
            }
        }


        /*
           Check whether a delete operation
           already exists.
        */

        const hasDeleteOperation =
            relatedOperations.some(
                operation =>
                    operation.type === "delete"
            );


        /*
           Add a delete operation so Firestore
           will also remove the Script.
        */

        if (!hasDeleteOperation) {

            await addToScriptsSyncQueue({

                type: "delete",

                script: {
                    id
                }
            });
        }
    }


    /*
       Delete the Script from IndexedDB immediately.
    */

    await new Promise((resolve, reject) => {

        const transaction =
            localDB.transaction(
                "scripts",
                "readwrite"
            );


        const store =
            transaction.objectStore(
                "scripts"
            );


        const request =
            store.delete(id);


        request.onsuccess = () => {
            resolve();
        };


        request.onerror = () => {
            reject(request.error);
        };
    });


    /*
       Sync immediately when online.

       Awaiting this prevents the delete sync
       from racing with the next database load.
    */

    if (
        navigator.onLine &&
        auth.currentUser
    ) {

        await syncPendingScripts();
    }
}

/* ========================================
   SCRIPT SYNC STATUS
======================================== */

function updateScriptSyncStatus(id, status) {
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction(
            "scripts",
            "readwrite"
        );

        const store = transaction.objectStore("scripts");
        const request = store.get(id);

        request.onsuccess = () => {
            const script = request.result;

            if (!script) {
                resolve();
                return;
            }

            script.syncStatus = status;

            const updateRequest = store.put(script);

            updateRequest.onsuccess = () => {
                window.dispatchEvent(
                    new CustomEvent("script-sync-status-changed", {
                        detail: {
                            id,
                            syncStatus: status
                        }
                    })
                );

                resolve();
            };

            updateRequest.onerror = () => reject(updateRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   SYNC SCRIPT TO FIRESTORE
======================================== */

async function syncScript(script) {
    const user = auth.currentUser;

    if (!user || !navigator.onLine) return false;

    try {
        const scriptRef = doc(
            firestoreDB,
            "users",
            user.uid,
            "scripts",
            script.id
        );

        await setDoc(scriptRef, {
            id: script.id,
            title: script.title,
            content: script.content,
            createdAt: script.createdAt,
            updatedAt: script.updatedAt
        });

        await updateScriptSyncStatus(script.id, "synced");
        return true;
    } catch (error) {
        console.error("Script Firestore sync failed:", error);
        await updateScriptSyncStatus(script.id, "error");
        return false;
    }
}

/* ========================================
   DELETE SCRIPT FROM FIRESTORE
======================================== */

async function syncScriptDelete(id) {
    const user = auth.currentUser;

    if (!user || !navigator.onLine) return false;

    try {
        const scriptRef = doc(
            firestoreDB,
            "users",
            user.uid,
            "scripts",
            id
        );

        await deleteDoc(scriptRef);
        console.log("Cloud Script deleted:", id);
        return true;
    } catch (error) {
        console.error("Script Firestore delete failed:", error);
        return false;
    }
}

/* ========================================
   SYNC PENDING SCRIPTS
======================================== */

async function syncPendingScripts() {
    if (scriptsSyncInProgress || !localDB || !navigator.onLine) return;

    const user = auth.currentUser;
    if (!user) return;

    scriptsSyncInProgress = true;

    try {
        const queue = await getScriptsSyncQueue();
        console.log("Pending Script operations:", queue.length);

        for (const operation of queue) {
            if (!navigator.onLine) break;

            let success = false;

            if (
                operation.type === "create" ||
                operation.type === "update"
            ) {
                success = await syncScript(operation.script);
            } else if (operation.type === "delete") {
                success = await syncScriptDelete(operation.script.id);
            }

            if (success) {
                await removeFromScriptsSyncQueue(operation.id);
            } else {
                break;
            }
        }
    } catch (error) {
        console.error("Scripts sync process failed:", error);
    } finally {
        scriptsSyncInProgress = false;
    }
}

/* ========================================
   LOAD SCRIPTS FROM FIRESTORE
======================================== */

async function loadCloudScripts() {
    const user = auth.currentUser;

    if (!user || !navigator.onLine) return;

    if (!localDB) await openDatabase();

    try {
        const scriptsRef = collection(
            firestoreDB,
            "users",
            user.uid,
            "scripts"
        );

        const snapshot = await getDocs(scriptsRef);

        for (const document of snapshot.docs) {
            const cloudScript = document.data();
            const localScript = await getScript(cloudScript.id);

            if (
                localScript &&
                localScript.syncStatus === "pending"
            ) {
                continue;
            }

            await saveLocalScript({
                ...cloudScript,
                syncStatus: "synced"
            });
        }

        console.log("Cloud Scripts loaded:", snapshot.size);
    } catch (error) {
        console.error("Failed to load cloud Scripts:", error);
    }
}

/* ========================================
   COAL
======================================== */

/*
   Coal data lives directly inside:
   users/{uid}

   Example:
   {
       streak: 7,
       smolders: 2,
       rewardedMilestones: [7],
       protectedDates: ["2026-09-01"]
   }

   Firestore is the source of truth.
*/

/* ========================================
   GET COAL DATA
======================================== */

async function getCoalData() {
    const user = auth.currentUser;

    if (!user) {
        return {
            ...DEFAULT_COAL_DATA
        };
    }

    if (!navigator.onLine) {
        return getCachedCoalData();
    }

    try {
        const userRef = doc(
            firestoreDB,
            "users",
            user.uid
        );

        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            const initialData = {
                ...DEFAULT_COAL_DATA
            };

            await setDoc(userRef, initialData, {
                merge: true
            });

            cacheCoalData(initialData);
            return initialData;
        }

        const data = snapshot.data();

        const coalData = {
            streak: Number.isFinite(Number(data.streak))
                ? Math.max(0, Number(data.streak))
                : 0,

            smolders: Number.isFinite(Number(data.smolders))
                ? Math.max(0, Math.min(Number(data.smolders), 3))
                : 0,

            rewardedMilestones: Array.isArray(data.rewardedMilestones)
                ? data.rewardedMilestones
                : [],

            protectedDates: Array.isArray(data.protectedDates)
                ? data.protectedDates
                : []
        };

        cacheCoalData(coalData);
        return coalData;
    } catch (error) {
        console.error("Failed to load Coal data:", error);
        return getCachedCoalData();
    }
}

/* ========================================
   SAVE COAL DATA
======================================== */

async function saveCoalData(data) {
    const user = auth.currentUser;

    if (!user) {
        console.log("No authenticated user. Coal data not saved.");
        return false;
    }

    const coalData = {
        streak: Math.max(0, Number(data?.streak) || 0),

        smolders: Math.max(
            0,
            Math.min(Number(data?.smolders) || 0, 3)
        ),

        rewardedMilestones: Array.isArray(data?.rewardedMilestones)
            ? data.rewardedMilestones
            : [],

        protectedDates: Array.isArray(data?.protectedDates)
            ? data.protectedDates
            : []
    };

    cacheCoalData(coalData);

    if (!navigator.onLine) {
        console.log("Offline. Coal data cached locally.");
        return false;
    }

    try {
        const userRef = doc(
            firestoreDB,
            "users",
            user.uid
        );

        await setDoc(userRef, coalData, {
            merge: true
        });

        console.log("Coal data synced to Firestore:", coalData);
        return true;
    } catch (error) {
        console.error("Failed to save Coal data:", error);
        return false;
    }
}

/* ========================================
   COAL CACHE
======================================== */

function cacheCoalData(data) {
    try {
        localStorage.setItem(
            "coal-user-data",
            JSON.stringify(data)
        );
    } catch (error) {
        console.error("Failed to cache Coal data:", error);
    }
}

/* ========================================
   GET CACHED COAL DATA
======================================== */

function getCachedCoalData() {
    try {
        const cached = JSON.parse(
            localStorage.getItem("coal-user-data") || "null"
        );

        if (cached) {
            return {
                ...DEFAULT_COAL_DATA,
                ...cached,

                streak: Math.max(
                    0,
                    Number(cached.streak) || 0
                ),

                smolders: Math.max(
                    0,
                    Math.min(Number(cached.smolders) || 0, 3)
                ),

                rewardedMilestones: Array.isArray(
                    cached.rewardedMilestones
                )
                    ? cached.rewardedMilestones
                    : [],

                protectedDates: Array.isArray(
                    cached.protectedDates
                )
                    ? cached.protectedDates
                    : []
            };
        }
    } catch (error) {
        console.error("Failed to read Coal cache:", error);
    }

    return {
        ...DEFAULT_COAL_DATA
    };
}

/* ========================================
   SAVE LOCAL ENTRY
======================================== */

function saveLocalEntry(entry) {
    return new Promise((resolve, reject) => {
        if (!localDB) {
            reject(new Error("IndexedDB is not open."));
            return;
        }

        const transaction = localDB.transaction(
            "entries",
            "readwrite"
        );

        const store = transaction.objectStore("entries");
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ========================================
   ONLINE EVENT
======================================== */

window.addEventListener("online", async () => {
    console.log("Internet connection restored.");

    setTimeout(async () => {
        try {
            if (!localDB) await openDatabase();

            await loadCloudEntries();
            await syncPendingEntries();

            await loadCloudScripts();
            await syncPendingScripts();

            await getCoalData();

            window.dispatchEvent(
                new CustomEvent("coal-updated")
            );
        } catch (error) {
            console.error("Automatic sync failed:", error);
        }
    }, 1000);
});

/* ========================================
   EXPORTS
======================================== */

export {
    openDatabase,

    /* FURNACE */
    addEntry,
    getEntries,
    getEntry,
    updateEntry,
    deleteEntry,
    loadCloudEntries,
    syncPendingEntries,

    /* CODES */
    addScript,
    getScripts,
    getScript,
    updateScript,
    deleteScript,
    loadCloudScripts,
    syncPendingScripts,

    /* COAL */
    getCoalData,
    saveCoalData
};