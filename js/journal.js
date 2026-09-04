import {
    openDatabase,
    addEntry,
    getEntries,
    getEntry,
    updateEntry,
    deleteEntry
} from "./db.js";

import {
    showConfirmModal
} from "./component.js";


/* ========================================
   DOM ELEMENTS
======================================== */

const journalList =
    document.querySelector("#journal-list");

const journalEditor =
    document.querySelector("#journal-editor");

const journalReader =
    document.querySelector("#journal-reader");

const newEntryButton =
    document.querySelector("#new-entry-button");

const backButton =
    document.querySelector("#back-to-journal");

const saveButton =
    document.querySelector("#save-entry-button");

const titleInput =
    document.querySelector("#entry-title");

const editorMeta =
    document.querySelector("#editor-meta");

const contentInput =
    document.querySelector("#entry-content");

const entriesContainer =
    document.querySelector("#entries-container");

const monthButton =
    document.querySelector("#journal-month-button");

const monthMenu =
    document.querySelector("#journal-month-menu");

const monthSelect =
    document.querySelector("#journal-month-select");

const yearSelect =
    document.querySelector("#journal-year-select");

const allMonthsButton =
    document.querySelector("#journal-all-months");

const sortFilter =
    document.querySelector("#journal-sort-filter");

const backFromReader =
    document.querySelector("#back-from-reader");

const editFromReader =
    document.querySelector("#edit-from-reader");

const readerTitle =
    document.querySelector("#reader-title");

const readerMeta =
    document.querySelector("#reader-meta");

const readerBody =
    document.querySelector("#reader-body");


/* ========================================
   STATE
======================================== */

let readingEntryId = null;
let editingEntryId = null;

let allEntries = [];

let selectedSort = "newest";
let selectedMonth = "all";
let selectedYear = "all";


/* ========================================
   DATE FORMATTING
======================================== */

function formatEntryDate(timestamp) {

    const date =
        new Date(timestamp);

    return date.toLocaleString(
        undefined,
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


/* ========================================
   SYNC STATUS
======================================== */

function getSyncStatusLabel(status) {

    switch (status) {

        case "synced":
            return "Synced";

        case "pending":
            return "Waiting to sync";

        case "error":
            return "Sync failed";

        default:
            return "Sync status unknown";
    }
}


function getSyncStatusIcon(status) {

    switch (status) {

        case "synced":
            return "✓";

        case "pending":
            return "↻";

        case "error":
            return "!";

        default:
            return "•";
    }
}


/* ========================================
   HTML ESCAPING
======================================== */

function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value || "";

    return div.innerHTML;
}


/* ========================================
   RICH TEXT SANITIZER
======================================== */

function sanitizeRichContent(html) {

    const template =
        document.createElement("template");

    template.innerHTML =
        html || "";

    const allowedTags =
        new Set([
            "P",
            "BR",
            "STRONG",
            "B",
            "EM",
            "I",
            "U",
            "H1",
            "H2",
            "H3"
        ]);

    function sanitizeNode(parent) {

        [...parent.childNodes]
            .forEach(node => {

                if (
                    node.nodeType ===
                    Node.TEXT_NODE
                ) {
                    return;
                }

                if (
                    node.nodeType !==
                    Node.ELEMENT_NODE
                ) {
                    node.remove();
                    return;
                }

                if (
                    !allowedTags.has(
                        node.tagName
                    )
                ) {

                    const children =
                        [...node.childNodes];

                    node.replaceWith(
                        ...children
                    );

                    children.forEach(
                        child => {

                            if (
                                child.nodeType ===
                                Node.ELEMENT_NODE
                            ) {
                                sanitizeNode(
                                    child.parentNode
                                );
                            }

                        }
                    );

                    return;
                }

                [...node.attributes]
                    .forEach(attribute => {

                        node.removeAttribute(
                            attribute.name
                        );

                    });

                sanitizeNode(node);
            });
    }

    sanitizeNode(
        template.content
    );

    return template.innerHTML;
}


/* ========================================
   PLAIN TEXT PREVIEW
======================================== */

function getPlainTextPreview(
    content,
    maxLength = 100
) {

    const div =
        document.createElement("div");

    div.innerHTML =
        content || "";

    const text =
        (
            div.textContent ||
            div.innerText ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim();

    return text.length > maxLength
        ? `${text.slice(0, maxLength)}...`
        : text;
}



/* ========================================
   EDITOR TOOLBAR
======================================== */

function initializeEditorToolbar() {

    const editorToolbar =
        document.querySelector(
            "#editor-toolbar-component"
        );

    const editorHeading =
        document.querySelector(
            "#editor-heading"
        );

    if (
        !editorToolbar ||
        !editorHeading ||
        !contentInput
    ) {
        console.error(
            "Editor toolbar elements missing."
        );

        return;
    }


    let savedRange = null;


    /* ================================
       SAVE SELECTION
    ================================= */

    function saveSelection() {

        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        if (
            contentInput.contains(
                range.commonAncestorContainer
            )
        ) {
            savedRange =
                range.cloneRange();
        }
    }


    /* ================================
       RESTORE SELECTION
    ================================= */

    function restoreSelection() {

        if (!savedRange) {
            return;
        }

        contentInput.focus();

        const selection =
            window.getSelection();

        selection.removeAllRanges();

        selection.addRange(
            savedRange
        );
    }


    /* ================================
       SAVE SELECTION WHEN LEAVING EDITOR
    ================================= */

    contentInput.addEventListener(
        "mouseup",
        saveSelection
    );

    contentInput.addEventListener(
        "keyup",
        saveSelection
    );

    contentInput.addEventListener(
        "focus",
        saveSelection
    );


    /* ================================
       FORMAT BUTTONS
    ================================= */

    editorToolbar
        .querySelectorAll(".editor-tool")
        .forEach(button => {

            button.addEventListener(
                "mousedown",
                event => {

                    event.preventDefault();

                    saveSelection();

                    restoreSelection();
                }
            );


            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    const command =
                        button.dataset.command;

                    restoreSelection();

                    document.execCommand(
                        command,
                        false,
                        null
                    );

                    saveSelection();
                }
            );
        });


    /* ================================
       HEADINGS
    ================================= */

    editorHeading.addEventListener(
        "mousedown",
        event => {

            event.preventDefault();

            saveSelection();

            restoreSelection();
        }
    );


    editorHeading.addEventListener(
        "change",
        event => {

            const value =
                event.target.value;

            restoreSelection();

            document.execCommand(
                "formatBlock",
                false,
                `<${value}>`
            );

            saveSelection();

            event.target.value =
                "p";
        }
    );


    console.log(
        "Editor toolbar initialized."
    );
}


/* ========================================
   VIEW: JOURNAL
======================================== */

function showJournal() {

    journalEditor.classList.add(
        "hidden"
    );

    journalReader.classList.add(
        "hidden"
    );

    journalList.classList.remove(
        "hidden"
    );

    editingEntryId = null;
    readingEntryId = null;

    loadEntries();
}


function showJournalFromReader() {

    journalReader.classList.add(
        "hidden"
    );

    journalEditor.classList.add(
        "hidden"
    );

    journalList.classList.remove(
        "hidden"
    );

    readingEntryId = null;

    loadEntries();
}


/* ========================================
   VIEW: EDITOR
======================================== */

function showEditor(entry = null) {

    journalList.classList.add(
        "hidden"
    );

    journalReader.classList.add(
        "hidden"
    );

    journalEditor.classList.remove(
        "hidden"
    );


    const editorHeading =
        document.querySelector(
            "#editor-heading"
        );


    if (entry) {

        editingEntryId =
            entry.id;

        titleInput.value =
            entry.title || "";

        contentInput.innerHTML =
            entry.content || "";

        if (editorHeading) {
            editorHeading.value = "p";
        }


        editorMeta.innerHTML =
            `Created ${formatEntryDate(entry.createdAt)}
            <span
                class="entry-sync-status ${entry.syncStatus || "pending"}"
                title="${getSyncStatusLabel(entry.syncStatus)}">
                ${getSyncStatusIcon(entry.syncStatus)}
            </span>`;


        if (
            entry.updatedAt &&
            entry.updatedAt !==
            entry.createdAt
        ) {

            editorMeta.innerHTML +=
                ` · Edited ${formatEntryDate(entry.updatedAt)}`;
        }

    } else {

        editingEntryId = null;

        titleInput.value = "";

        contentInput.innerHTML = "";

        if (editorHeading) {
            editorHeading.value = "p";
        }

        editorMeta.textContent =
            "New fuel";
    }


    titleInput.focus();
}


/* ========================================
   VIEW: READER
======================================== */

async function showReader(entry) {

    journalList.classList.add(
        "hidden"
    );

    journalEditor.classList.add(
        "hidden"
    );

    journalReader.classList.remove(
        "hidden"
    );


    readingEntryId =
        entry.id;


    readerTitle.textContent =
        entry.title || "";


    readerMeta.innerHTML =
        `Created ${formatEntryDate(entry.createdAt)}
        <span
            class="entry-sync-status ${entry.syncStatus || "pending"}"
            title="${getSyncStatusLabel(entry.syncStatus)}">
            ${getSyncStatusIcon(entry.syncStatus)}
        </span>`;


    if (
        entry.updatedAt &&
        entry.updatedAt !==
        entry.createdAt
    ) {

        readerMeta.innerHTML +=
            ` · Edited ${formatEntryDate(entry.updatedAt)}`;
    }


    readerBody.innerHTML =
        sanitizeRichContent(
            entry.content || ""
        );
}


/* ========================================
   SAVE ENTRY
======================================== */

async function saveCurrentEntry() {

    const title =
        titleInput.value.trim();

    const content =
        contentInput.innerHTML.trim();

    const plainText =
        contentInput.textContent.trim();


    if (
        !title ||
        !plainText
    ) {

        showNotification(
            "Please add a title and some content."
        );

        return;
    }


    const now =
        Date.now();


    try {

        if (editingEntryId) {

            const existingEntry =
                await getEntry(
                    editingEntryId
                );


            await updateEntry({

                ...existingEntry,

                title,

                content,

                updatedAt: now,

                syncStatus: "pending"

            });

        } else {

            await addEntry({

                id:
                    crypto.randomUUID(),

                title,

                content,

                createdAt: now,

                updatedAt: now,

                syncStatus: "pending"

            });
        }


        showJournal();

    } catch (error) {

        console.error(
            "Failed to save fuel:",
            error
        );

        showNotification(
            "Could not save the fuel."
        );
    }
}


/* ========================================
   LOAD ENTRIES
======================================== */

async function loadEntries() {

    try {

        allEntries =
            await getEntries();

        renderEntries();

    } catch (error) {

        console.error(
            "Failed to load fuels:",
            error
        );

        showNotification(
            "Could not load your fuels."
        );
    }
}


/* ========================================
   FILTER + SORT
======================================== */

function getFilteredEntries() {

    let entries =
        [...allEntries];


    if (
        selectedMonth !== "all"
    ) {

        entries =
            entries.filter(
                entry => {

                    const date =
                        new Date(
                            entry.createdAt
                        );

                    return (
                        date.getMonth() ===
                        Number(
                            selectedMonth
                        )
                    );
                }
            );
    }


    if (
        selectedYear !== "all"
    ) {

        entries =
            entries.filter(
                entry => {

                    const date =
                        new Date(
                            entry.createdAt
                        );

                    return (
                        date.getFullYear() ===
                        Number(
                            selectedYear
                        )
                    );
                }
            );
    }


    entries.sort(
        (a, b) => {

            if (
                selectedSort ===
                "oldest"
            ) {

                return (
                    a.createdAt -
                    b.createdAt
                );
            }

            return (
                b.createdAt -
                a.createdAt
            );
        }
    );


    return entries;
}


/* ========================================
   RENDER ENTRIES
======================================== */

function renderEntries() {

    if (!entriesContainer) {
        return;
    }


    const entries =
        getFilteredEntries();


    entriesContainer.innerHTML =
        "";


    const emptyState =
        document.querySelector(
            "#empty-state"
        );


    if (!entries.length) {

        if (emptyState) {
            emptyState.classList.remove(
                "hidden"
            );
        }

        return;
    }


    if (emptyState) {
        emptyState.classList.add(
            "hidden"
        );
    }


    entries.forEach(
        entry => {

            const article =
                document.createElement(
                    "article"
                );

            article.className =
                "entry-card";

            article.dataset.id =
                entry.id;


            const formattedDate =
                formatEntryDate(
                    entry.createdAt
                );


            const preview =
                getPlainTextPreview(
                    entry.content
                );


            article.innerHTML =
                `
                <div class="entry-card-header">

                    <div>

                        <h2 class="entry-card-title">
                            ${escapeHTML(
                    entry.title
                )}
                        </h2>

                        <p class="entry-card-date">

                            ${formattedDate}

                            <span
                                class="entry-sync-status ${entry.syncStatus || "pending"}"
                                title="${getSyncStatusLabel(entry.syncStatus)}">

                                ${getSyncStatusIcon(
                    entry.syncStatus
                )}

                            </span>

                        </p>

                    </div>


                    <div class="entry-card-actions">

                        <button
                            class="entry-action edit-entry"
                            type="button"
                        >
                            Edit
                        </button>

                        <button
                            class="entry-action delete-entry"
                            type="button"
                        >
                            Delete
                        </button>

                    </div>

                </div>


                <p class="entry-card-content">
                    ${escapeHTML(
                    preview
                )}
                </p>
                `;


            entriesContainer.appendChild(
                article
            );
        }
    );
}


/* ========================================
   DELETE ENTRY
======================================== */

async function deleteEntryById(id) {

    const entry =
        await getEntry(id);


    if (!entry) {
        return;
    }


    showConfirmModal(
        "Delete this fuel?",
        "This entry will be permanently deleted.",
        async () => {

            try {

                await deleteEntry(
                    id
                );

                showNotification(
                    "Fuel deleted."
                );

                await loadEntries();

            } catch (error) {

                console.error(
                    "Failed to delete fuel:",
                    error
                );

                showNotification(
                    "Could not delete the fuel."
                );
            }
        }
    );
}


/* ========================================
   ENTRY CLICK HANDLING
======================================== */

entriesContainer.addEventListener(
    "click",
    async event => {

        const card =
            event.target.closest(
                ".entry-card"
            );


        if (!card) {
            return;
        }


        const id =
            card.dataset.id;


        if (
            event.target.closest(
                ".edit-entry"
            )
        ) {

            const entry =
                await getEntry(id);

            if (entry) {
                showEditor(entry);
            }

            return;
        }


        if (
            event.target.closest(
                ".delete-entry"
            )
        ) {

            await deleteEntryById(
                id
            );

            return;
        }


        const entry =
            await getEntry(id);


        if (entry) {
            showReader(entry);
        }
    }
);


/* ========================================
   MONTH MENU
======================================== */

if (monthButton) {

    monthButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            monthMenu.classList.toggle(
                "hidden"
            );
        }
    );
}


if (monthSelect) {

    monthSelect.addEventListener(
        "change",
        () => {

            selectedMonth =
                monthSelect.value;

            renderEntries();
        }
    );
}


if (yearSelect) {

    yearSelect.addEventListener(
        "change",
        () => {

            selectedYear =
                yearSelect.value;

            renderEntries();
        }
    );
}


if (allMonthsButton) {

    allMonthsButton.addEventListener(
        "click",
        () => {

            selectedMonth = "all";
            selectedYear = "all";

            if (monthSelect) {
                monthSelect.value =
                    "all";
            }

            if (yearSelect) {
                yearSelect.value =
                    "all";
            }

            renderEntries();

            monthMenu.classList.add(
                "hidden"
            );
        }
    );
}


document.addEventListener(
    "click",
    event => {

        if (
            monthMenu &&
            monthButton &&
            !monthMenu.contains(
                event.target
            ) &&
            !monthButton.contains(
                event.target
            )
        ) {

            monthMenu.classList.add(
                "hidden"
            );
        }
    }
);


/* ========================================
   SORT
======================================== */

if (sortFilter) {

    sortFilter.addEventListener(
        "change",
        () => {

            selectedSort =
                sortFilter.value;

            renderEntries();
        }
    );
}


/* ========================================
   NAVIGATION
======================================== */

if (newEntryButton) {

    newEntryButton.addEventListener(
        "click",
        () => {

            showEditor();
        }
    );
}


if (backButton) {

    backButton.addEventListener(
        "click",
        () => {

            showJournal();
        }
    );
}


if (saveButton) {

    saveButton.addEventListener(
        "click",
        () => {

            saveCurrentEntry();
        }
    );
}


if (backFromReader) {

    backFromReader.addEventListener(
        "click",
        () => {

            showJournalFromReader();
        }
    );
}


if (editFromReader) {

    editFromReader.addEventListener(
        "click",
        async () => {

            if (!readingEntryId) {
                return;
            }


            const entry =
                await getEntry(
                    readingEntryId
                );


            if (entry) {
                showEditor(entry);
            }
        }
    );
}


/* ========================================
   SYNC STATUS UPDATES
======================================== */

window.addEventListener(
    "entry-sync-status-changed",
    async event => {

        const {
            id,
            syncStatus
        } = event.detail;


        const card =
            document.querySelector(
                `.entry-card[data-id="${id}"]`
            );


        if (card) {

            const statusElement =
                card.querySelector(
                    ".entry-sync-status"
                );


            if (statusElement) {

                statusElement.className =
                    `entry-sync-status ${syncStatus}`;

                statusElement.title =
                    getSyncStatusLabel(
                        syncStatus
                    );

                statusElement.textContent =
                    getSyncStatusIcon(
                        syncStatus
                    );
            }
        }


        if (
            readingEntryId === id
        ) {

            const statusElement =
                readerMeta.querySelector(
                    ".entry-sync-status"
                );


            if (statusElement) {

                statusElement.className =
                    `entry-sync-status ${syncStatus}`;

                statusElement.title =
                    getSyncStatusLabel(
                        syncStatus
                    );

                statusElement.textContent =
                    getSyncStatusIcon(
                        syncStatus
                    );
            }
        }


        if (
            editingEntryId === id
        ) {

            const statusElement =
                editorMeta.querySelector(
                    ".entry-sync-status"
                );


            if (statusElement) {

                statusElement.className =
                    `entry-sync-status ${syncStatus}`;

                statusElement.title =
                    getSyncStatusLabel(
                        syncStatus
                    );

                statusElement.textContent =
                    getSyncStatusIcon(
                        syncStatus
                    );
            }
        }
    }
);


/* ========================================
   INITIALIZATION
======================================== */

async function initializeFurnace() {

    try {

        await openDatabase();

        await loadEntries();

    } catch (error) {

        console.error(
            "Furnace initialization failed:",
            error
        );
    }
}


window.addEventListener(
    "components-loaded",
    initializeEditorToolbar
);


document.addEventListener(
    "DOMContentLoaded",
    initializeFurnace
);