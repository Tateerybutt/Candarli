import {
    openDatabase,
    addScript,
    getScripts,
    getScript,
    updateScript,
    deleteScript
} from "./db.js";

import {
    showConfirmModal,
    showNotification
} from "./component.js";


/* ========================================
   STATE
======================================== */

let allScripts = [];
let editingScriptId = null;

let toolbarInitialized = false;


/* ========================================
   DOM
======================================== */

const codesList =
    document.getElementById("codes-list");

const codesEditor =
    document.getElementById("codes-editor");

const scriptsContainer =
    document.getElementById("scripts-container");

const codesEmptyState =
    document.getElementById("codes-empty-state");

const newScriptButton =
    document.getElementById("new-script-button");

const emptyNewScriptButton =
    document.getElementById("empty-new-script-button");

const backToCodesButton =
    document.getElementById("back-to-codes");

const saveScriptButton =
    document.getElementById("save-script-button");

const scriptContent =
    document.getElementById("script-content");

const editorMeta =
    document.getElementById("codes-editor-meta");


/* ========================================
   DATE
======================================== */

function formatScriptDate(timestamp) {

    if (!timestamp) {
        return "";
    }

    return new Date(timestamp).toLocaleString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}


/* ========================================
   HTML HELPERS
======================================== */

function escapeHTML(value = "") {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function sanitizeRichContent(html = "") {

    const temp =
        document.createElement("div");

    temp.innerHTML = html;


    const allowedTags = new Set([
        "P",
        "BR",
        "STRONG",
        "B",
        "EM",
        "I",
        "U",
        "H1",
        "H2",
        "H3",
        "UL",
        "OL",
        "LI",
        "BLOCKQUOTE"
    ]);


    temp.querySelectorAll("*").forEach(element => {

        if (!allowedTags.has(element.tagName)) {

            element.replaceWith(
                document.createTextNode(
                    element.textContent || ""
                )
            );

            return;
        }


        [...element.attributes].forEach(attribute => {

            element.removeAttribute(
                attribute.name
            );
        });
    });


    return temp.innerHTML;
}


function getPlainTextPreview(
    content,
    maxLength = 130
) {

    const temp =
        document.createElement("div");

    temp.innerHTML =
        content || "";


    const text =
        (temp.textContent || "")
            .replace(/\s+/g, " ")
            .trim();


    if (text.length <= maxLength) {
        return text;
    }


    return (
        text.slice(0, maxLength).trim() +
        "…"
    );
}


/* ========================================
   EDITOR PARTS
======================================== */

/*
   The FIRST "." is the separator.

   Example:

   My Script Title. This is my content.

   Saves as:

   title:
   My Script Title

   content:
   This is my content.
*/

function getEditorParts() {

    const temp =
        document.createElement("div");

    temp.innerHTML =
        sanitizeRichContent(
            scriptContent.innerHTML || ""
        );


    const text =
        temp.textContent || "";


    const separatorIndex =
        text.indexOf(".");


    /*
       No period = invalid Script.
    */

    if (separatorIndex === -1) {

        return {
            title: "",
            contentHTML: "",
            contentText: ""
        };
    }


    const title =
        text
            .slice(0, separatorIndex)
            .trim();


    const contentText =
        text
            .slice(separatorIndex + 1)
            .trim();


    /*
       Find the first period in the
       formatted DOM.
    */

    const walker =
        document.createTreeWalker(
            temp,
            NodeFilter.SHOW_TEXT
        );


    let currentNode = null;
    let periodOffset = -1;


    while (
        (currentNode = walker.nextNode())
    ) {

        const index =
            currentNode.nodeValue.indexOf(".");


        if (index !== -1) {

            periodOffset = index;

            break;
        }
    }


    /*
       Fallback to plain text if the
       separator could not be located.
    */

    if (
        !currentNode ||
        periodOffset === -1
    ) {

        return {
            title,
            contentHTML: escapeHTML(
                contentText
            ),
            contentText
        };
    }


    /*
       Remove everything before and
       including the first period.

       Range is used here so formatting
       after the separator remains intact.
    */

    const range =
        document.createRange();


    range.setStart(
        temp,
        0
    );


    range.setEnd(
        currentNode,
        periodOffset + 1
    );


    range.deleteContents();


    /*
       Remove whitespace immediately
       following the separator.
    */

    while (
        temp.firstChild &&
        (
            temp.firstChild.nodeType ===
            Node.TEXT_NODE
        ) &&
        /^\s*$/.test(
            temp.firstChild.nodeValue
        )
    ) {

        temp.removeChild(
            temp.firstChild
        );
    }


    const contentHTML =
        sanitizeRichContent(
            temp.innerHTML.trim()
        );


    return {
        title,
        contentHTML,
        contentText
    };
}


/* ========================================
   SYNC STATUS
======================================== */

function getSyncStatus(status) {

    if (status === "synced") {

        return {
            icon: "✓",
            text: "Synced"
        };
    }


    if (status === "pending") {

        return {
            icon: "↻",
            text: "Waiting to sync"
        };
    }


    if (status === "error") {

        return {
            icon: "!",
            text: "Sync failed"
        };
    }


    return {
        icon: "•",
        text: "Sync status unknown"
    };
}


/* ========================================
   VIEWS
======================================== */

function showList() {

    codesList.classList.remove("hidden");

    codesEditor.classList.add("hidden");

    editingScriptId = null;

    loadScripts();
}


function showEditor() {

    codesList.classList.add("hidden");

    codesEditor.classList.remove("hidden");
}


/* ========================================
   EDITOR
======================================== */

function createNewScriptEditor() {

    editingScriptId = null;


    scriptContent.innerHTML = "";


    editorMeta.textContent =
        "New Script";


    showEditor();


    requestAnimationFrame(() => {

        scriptContent.focus();
    });
}


function loadScriptIntoEditor(script) {

    editingScriptId =
        script.id;


    const title =
        script.title || "";


    const content =
        sanitizeRichContent(
            script.content || ""
        );


    scriptContent.innerHTML = `
        ${escapeHTML(title)}.
        ${content}
    `;


    editorMeta.textContent =
        `Created ${formatScriptDate(
            script.createdAt
        )}`;


    showEditor();


    requestAnimationFrame(() => {

        scriptContent.focus();

        /*
           Put cursor at the end when
           opening an existing Script.
        */

        const selection =
            window.getSelection();

        const range =
            document.createRange();

        range.selectNodeContents(
            scriptContent
        );

        range.collapse(false);

        selection.removeAllRanges();

        selection.addRange(range);
    });
}


/* ========================================
   TOOLBAR
======================================== */

function initializeScriptToolbar() {

    if (toolbarInitialized) {
        return;
    }


    const toolbar =
        document.getElementById(
            "editor-toolbar-component"
        );


    const headingSelect =
        document.getElementById(
            "editor-heading"
        );


    if (!toolbar) {
        return;
    }


    toolbarInitialized = true;


    let savedRange = null;


    function saveSelection() {

        const selection =
            window.getSelection();


        if (!selection.rangeCount) {
            return;
        }


        const range =
            selection.getRangeAt(0);


        if (
            scriptContent.contains(
                range.commonAncestorContainer
            )
        ) {

            savedRange =
                range.cloneRange();
        }
    }


    function restoreSelection() {

        if (!savedRange) {
            return;
        }


        const selection =
            window.getSelection();


        selection.removeAllRanges();


        selection.addRange(
            savedRange
        );
    }


    scriptContent.addEventListener(
        "mouseup",
        saveSelection
    );


    scriptContent.addEventListener(
        "keyup",
        saveSelection
    );


    toolbar
        .querySelectorAll("[data-command]")
        .forEach(button => {

            button.addEventListener(
                "mousedown",
                event => {

                    event.preventDefault();
                }
            );


            button.addEventListener(
                "click",
                () => {

                    restoreSelection();


                    const command =
                        button.dataset.command;


                    document.execCommand(
                        command,
                        false,
                        null
                    );


                    saveSelection();


                    scriptContent.focus();
                }
            );
        });


    if (headingSelect) {

        headingSelect.addEventListener(
            "change",
            () => {

                restoreSelection();


                const value =
                    headingSelect.value;


                document.execCommand(
                    "formatBlock",
                    false,
                    value === "p"
                        ? "P"
                        : value
                );


                saveSelection();


                scriptContent.focus();
            }
        );
    }
}


/* ========================================
   SAVE
======================================== */

async function saveCurrentScript() {

    const parts =
        getEditorParts();


    const title =
        parts.title;


    const contentHTML =
        parts.contentHTML;


    const contentText =
        parts.contentText;


    if (!title) {

        showNotification(
            "Please add a Script title before the first period."
        );

        return;
    }


    if (!contentText) {

        showNotification(
            "Please add some Script content after the first period."
        );

        return;
    }


    const now =
        Date.now();


    try {

        if (editingScriptId) {

            const existing =
                await getScript(
                    editingScriptId
                );


            if (!existing) {

                throw new Error(
                    "Script not found."
                );
            }


            await updateScript({

                ...existing,

                title,

                content: contentHTML,

                updatedAt: now
            });


            showNotification(
                "Script updated."
            );

        } else {

            await addScript({

                id: crypto.randomUUID(),

                title,

                content: contentHTML,

                createdAt: now,

                updatedAt: now
            });


            showNotification(
                "Script saved."
            );
        }


        showList();

    } catch (error) {

        console.error(
            "Failed to save Script:",
            error
        );


        showNotification(
            "Could not save Script."
        );
    }
}


/* ========================================
   LOAD SCRIPTS
======================================== */

async function loadScripts() {

    try {

        allScripts =
            await getScripts();


        renderScripts();

    } catch (error) {

        console.error(
            "Failed to load Scripts:",
            error
        );
    }
}


/* ========================================
   RENDER
======================================== */

function renderScripts() {

    scriptsContainer.innerHTML = "";


    if (!allScripts.length) {

        scriptsContainer.appendChild(
            codesEmptyState
        );


        codesEmptyState.classList.remove(
            "hidden"
        );


        return;
    }


    codesEmptyState.classList.add(
        "hidden"
    );


    allScripts.forEach(script => {

        const card =
            document.createElement(
                "article"
            );


        card.className =
            "script-card";


        const sync =
            getSyncStatus(
                script.syncStatus
            );


        card.innerHTML = `

            <div class="script-card-top">

                <h2 class="script-card-title">
                    ${escapeHTML(
            script.title ||
            "Untitled Script"
        )}
                </h2>

                <span class="script-card-date">
                    ${formatScriptDate(
            script.updatedAt ||
            script.createdAt
        )}
                </span>

            </div>


            <p class="script-card-preview">
                ${escapeHTML(
            getPlainTextPreview(
                script.content
            )
        )}
            </p>


            <div class="script-card-bottom">

                <span class="script-sync-status">

                    <span>
                        ${sync.icon}
                    </span>

                    <span>
                        ${sync.text}
                    </span>

                </span>


                <div class="script-card-actions">

                    <button
                        class="script-action"
                        data-action="edit"
                        title="Edit"
                        type="button"
                    >
                        <i class="fa-solid fa-pen"></i>
                    </button>


                    <button
                        class="script-action delete"
                        data-action="delete"
                        title="Delete"
                        type="button"
                    >
                        <i class="fa-solid fa-trash"></i>
                    </button>

                </div>

            </div>
        `;


        /*
           CLICK CARD
           
           Clicking anywhere on the card,
           except action buttons, opens
           the Script directly in the editor.
        */

        card.addEventListener(
            "click",
            async event => {

                if (
                    event.target.closest(
                        ".script-action"
                    )
                ) {
                    return;
                }


                const current =
                    await getScript(
                        script.id
                    );


                if (current) {

                    loadScriptIntoEditor(
                        current
                    );
                }
            }
        );


        /*
           EDIT
        */

        card
            .querySelector(
                '[data-action="edit"]'
            )
            .addEventListener(
                "click",
                async () => {

                    const current =
                        await getScript(
                            script.id
                        );


                    if (current) {

                        loadScriptIntoEditor(
                            current
                        );
                    }
                }
            );

        /*
            Delete
        */

        const deleteButton =
            card.querySelector(
                '[data-action="delete"]'
            );

        deleteButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();
                event.stopPropagation();

                const confirmed =
                    await showConfirmModal({
                        title: "Delete this Script?",
                        message:
                            "This Script will be permanently deleted.",
                        actionText: "Delete"
                    });

                if (!confirmed) {
                    return;
                }

                try {

                    await deleteScript(
                        script.id
                    );

                    showNotification(
                        "Script deleted."
                    );

                    await loadScripts();

                } catch (error) {

                    console.error(
                        "Failed to delete Script:",
                        error
                    );

                    showNotification(
                        "Could not delete Script."
                    );
                }
            }
        );


        scriptsContainer.appendChild(
            card
        );
    });
}


/* ========================================
   EVENTS
======================================== */

newScriptButton.addEventListener(
    "click",
    createNewScriptEditor
);


emptyNewScriptButton.addEventListener(
    "click",
    createNewScriptEditor
);


backToCodesButton.addEventListener(
    "click",
    showList
);


saveScriptButton.addEventListener(
    "click",
    saveCurrentScript
);


/* ========================================
   SYNC STATUS
======================================== */

window.addEventListener(
    "script-sync-status-changed",
    event => {

        const {
            id,
            syncStatus
        } = event.detail;


        const script =
            allScripts.find(
                item => item.id === id
            );


        if (!script) {
            return;
        }


        script.syncStatus =
            syncStatus;


        renderScripts();
    }
);


/* ========================================
   COMPONENTS
======================================== */

window.addEventListener(
    "components-loaded",
    () => {

        initializeScriptToolbar();
    }
);


/* ========================================
   INITIALIZATION
======================================== */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await openDatabase();

            await loadScripts();

        } catch (error) {

            console.error(
                "Codes initialization failed:",
                error
            );
        }
    }
);