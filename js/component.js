import { auth } from "./firebase.js";

import {
    syncPendingEntries
} from "./db.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ========================================
   SITE PIN SETTINGS
======================================== */

const SITE_PIN = "1728";

const PIN_STORAGE_KEY =
    "candarli-site-unlocked";

/* ========================================
   LOAD COMPONENTS
======================================== */

async function loadComponents() {
    try {
        const response =
            await fetch("components.html");

        if (!response.ok) {
            throw new Error(
                "Failed to load components.html"
            );
        }

        const html =
            await response.text();

        const parser =
            new DOMParser();

        const doc =
            parser.parseFromString(
                html,
                "text/html"
            );

        /* ================================
           NOTIFICATION
        ================================= */

        const notification =
            doc.querySelector(
                "#notification"
            );

        if (notification) {
            document.body.appendChild(
                notification
            );
        }

        /* ================================
           PIN LOCK
        ================================= */

        const pinLock =
            doc.querySelector(
                "#site-pin-lock"
            );

        if (pinLock) {
            document.body.appendChild(
                pinLock
            );

            setupPinLock();
        }

        /* ================================
           CONFIRMATION MODAL
        ================================= */

        const confirmModal =
            doc.querySelector(
                "#confirm-modal"
            );

        if (confirmModal) {
            document.body.appendChild(
                confirmModal
            );
        }

        /* ================================
           NAVBAR
        ================================= */

        const navbar =
            doc.querySelector(
                "#navbar-component"
            );

        const navbarTarget =
            document.querySelector(
                "#navbar"
            );

        if (
            navbar &&
            navbarTarget
        ) {
            navbarTarget.replaceWith(
                navbar
            );

            setupAuthUI();
        }

        /* ================================
           ACTIVE NAVIGATION
        ================================= */

        setActiveNav();

        /* ================================
           FOOTER
        ================================= */

        const footer =
            doc.querySelector(
                "#footer-component"
            );

        const footerTarget =
            document.querySelector(
                "#footer"
            );

        if (
            footer &&
            footerTarget
        ) {
            footerTarget.replaceWith(
                footer
            );
        }

        /* ================================
            EDITOR TOOLBAR
        ================================= */

        const editorToolbar =
            doc.querySelector(
                "#editor-toolbar-component"
            );

        const editorToolbarTarget =
            document.querySelector(
                "#editor-toolbar"
            );

        if (
            editorToolbar &&
            editorToolbarTarget
        ) {
            editorToolbarTarget.replaceWith(
                editorToolbar
            );
        }

        /* ================================
            CONNECTION STATUS
        ================================= */

        updateConnectionStatus();

        /* ================================
           COMPONENTS LOADED
        ================================= */

        window.dispatchEvent(
            new CustomEvent(
                "components-loaded"
            )
        );

    } catch (error) {
        console.error(
            "Component loading error:",
            error
        );
    }
}

/* ========================================
   PIN LOCK
======================================== */

function setupPinLock() {
    const lock =
        document.querySelector(
            "#site-pin-lock"
        );

    const form =
        document.querySelector(
            "#site-pin-form"
        );

    const input =
        document.querySelector(
            "#site-pin-input"
        );

    if (
        !lock ||
        !form ||
        !input
    ) {
        console.error(
            "PIN lock elements missing."
        );

        return;
    }

    /* ================================
       ALREADY UNLOCKED
    ================================= */

    if (
        sessionStorage.getItem(
            PIN_STORAGE_KEY
        ) === "true"
    ) {
        unlockSite();
        return;
    }

    /* ================================
       SHOW LOCK
    ================================= */

    lock.classList.add(
        "open"
    );

    setTimeout(
        () => {
            input.focus();
        },
        100
    );

    /* ================================
       SUBMIT PIN
    ================================= */

    form.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            const enteredPin =
                input.value.trim();

            /* ============================
               CORRECT PIN
            ============================ */

            if (
                enteredPin === SITE_PIN
            ) {
                sessionStorage.setItem(
                    PIN_STORAGE_KEY,
                    "true"
                );

                input.value = "";

                unlockSite();

                return;
            }

            /* ============================
               WRONG PIN
            ============================ */

            input.value = "";

            input.focus();

            showNotification(
                "Incorrect PIN."
            );
        }
    );
}

/* ========================================
   UNLOCK SITE
======================================== */

function unlockSite() {
    const lock =
        document.querySelector(
            "#site-pin-lock"
        );

    if (!lock) {
        return;
    }

    lock.classList.remove(
        "open"
    );

    lock.classList.add(
        "unlocked"
    );

    setTimeout(
        () => {
            if (
                lock.classList.contains(
                    "unlocked"
                )
            ) {
                lock.style.display =
                    "none";
            }
        },
        400
    );
}

/* ========================================
   AUTH UI
======================================== */

function setupAuthUI() {
    const profileButton =
        document.querySelector(
            "#profile-button"
        );

    if (!profileButton) {
        return;
    }

    onAuthStateChanged(
        auth,
        user => {
            /* ================================
               LOGGED IN
            ================================= */

            if (user) {
                const name =
                    user.displayName ||
                    user.email ||
                    "User";

                const initial =
                    name
                        .charAt(0)
                        .toUpperCase();

                profileButton.textContent =
                    initial;

                profileButton.classList.remove(
                    "nav-link"
                );

                profileButton.classList.add(
                    "profile-button"
                );

                /* ============================
                   SIGN OUT
                ============================ */

                profileButton.onclick =
                    async () => {
                        const confirmed =
                            await showConfirmModal({
                                title:
                                    "Sign out?",

                                message:
                                    "Are you sure you want to sign out?",

                                actionText:
                                    "Sign Out"
                            });

                        if (!confirmed) {
                            return;
                        }

                        try {
                            await signOut(
                                auth
                            );

                            console.log(
                                "User signed out."
                            );

                        } catch (error) {
                            console.error(
                                "Sign out failed:",
                                error
                            );

                            showNotification(
                                "Could not sign out."
                            );
                        }
                    };
            }

            /* ================================
               LOGGED OUT
            ================================= */

            else {
                profileButton.textContent =
                    "Sign In";

                profileButton.classList.remove(
                    "profile-button"
                );

                profileButton.classList.add(
                    "nav-link"
                );

                profileButton.onclick =
                    () => {
                        window.location.href =
                            "auth.html";
                    };
            }
        }
    );
}

/* ========================================
   ACTIVE NAVIGATION
======================================== */

function setActiveNav() {
    const page =
        document.body.dataset.page;

    if (!page) {
        return;
    }

    const links =
        document.querySelectorAll(
            ".nav-link"
        );

    links.forEach(
        link => {
            link.classList.remove(
                "active"
            );

            if (
                link.dataset.page === page
            ) {
                link.classList.add(
                    "active"
                );
            }
        }
    );
}

/* ========================================
   CONNECTION STATUS
======================================== */

function updateConnectionStatus() {
    const status =
        document.querySelector(
            "#connection-status"
        );

    if (!status) {
        return;
    }

    const dot =
        status.querySelector(
            ".status-dot"
        );

    const text =
        status.querySelector(
            ".status-text"
        );

    if (
        !dot ||
        !text
    ) {
        return;
    }

    if (navigator.onLine) {
        dot.style.background =
            "#4ADE80";

        text.textContent =
            "Online";
    } else {
        dot.style.background =
            "#F87171";

        text.textContent =
            "Offline";
    }
}

/* ========================================
   CONFIRMATION MODAL
======================================== */

export function showConfirmModal({
    title =
    "Are you sure?",

    message =
    "This action cannot be undone.",

    actionText =
    "Confirm"
}) {
    return new Promise(
        resolve => {
            const modal =
                document.querySelector(
                    "#confirm-modal"
                );

            const titleElement =
                document.querySelector(
                    "#confirm-modal-title"
                );

            const messageElement =
                document.querySelector(
                    "#confirm-modal-message"
                );

            const actionButton =
                document.querySelector(
                    "#confirm-action"
                );

            const cancelButton =
                document.querySelector(
                    "#confirm-cancel"
                );

            if (
                !modal ||
                !titleElement ||
                !messageElement ||
                !actionButton ||
                !cancelButton
            ) {
                resolve(false);
                return;
            }

            titleElement.textContent =
                title;

            messageElement.textContent =
                message;

            actionButton.textContent =
                actionText;

            modal.classList.add(
                "open"
            );

            const close =
                result => {
                    modal.classList.remove(
                        "open"
                    );

                    actionButton.onclick =
                        null;

                    cancelButton.onclick =
                        null;

                    resolve(result);
                };

            cancelButton.onclick =
                () => close(false);

            actionButton.onclick =
                () => close(true);
        }
    );
}

/* ========================================
   NOTIFICATION
======================================== */

export function showNotification(
    message,
    duration = 2500
) {
    const notification =
        document.querySelector(
            "#notification"
        );

    const messageElement =
        document.querySelector(
            "#notification-message"
        );

    if (
        !notification ||
        !messageElement
    ) {
        return;
    }

    messageElement.textContent =
        message;

    notification.classList.add(
        "show"
    );

    clearTimeout(
        notification.timeout
    );

    notification.timeout =
        setTimeout(
            () => {
                notification.classList.remove(
                    "show"
                );
            },
            duration
        );
}

/* ========================================
   NETWORK EVENTS
======================================== */

window.addEventListener(
    "online",
    async () => {
        updateConnectionStatus();

        console.log(
            "Connection restored. Syncing..."
        );

        try {
            await syncPendingEntries();

            console.log(
                "Pending entries synced."
            );

        } catch (error) {
            console.error(
                "Automatic sync failed:",
                error
            );
        }
    }
);

window.addEventListener(
    "offline",
    () => {
        updateConnectionStatus();

        console.log(
            "Offline mode."
        );
    }
);

/* ========================================
   LOAD
======================================== */

document.addEventListener(
    "DOMContentLoaded",
    loadComponents
);