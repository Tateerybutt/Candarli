/* ========================================
   ÇANDARLI OS HOME
======================================== */

import {
    auth
} from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    openDatabase,
    getEntries,
    getCoalData,
    getScripts
} from "./db.js";

import {
    getCurrentCoalStats,
    getCalendarDate
} from "./coal.js";


/* ========================================
   DOM ELEMENTS
======================================== */

const greetingElement =
    document.querySelector("#home-greeting");

const dateElement =
    document.querySelector("#os-date");


/* ========================================
   LATEST SCRIPT
======================================== */

const latestNoteWidget =
    document.querySelector("#latest-note-widget");

const latestNoteTitle =
    document.querySelector("#latest-note-title");

const latestNotePreview =
    document.querySelector("#latest-note-preview");

const latestNoteDate =
    document.querySelector("#latest-note-date");


/* ========================================
   COAL
======================================== */

const streakElement =
    document.querySelector("#streak-value");

const smolderElement =
    document.querySelector("#smolder-value");


/* ========================================
   MONTHLY PROGRESS
======================================== */

const progressLabel =
    document.querySelector("#coal-progress-label");

const progressValue =
    document.querySelector("#coal-progress-value");

const progressBar =
    document.querySelector("#coal-progress-bar");


/* ========================================
   DATE
======================================== */

function updateDate() {

    if (!dateElement) {
        return;
    }


    dateElement.textContent =
        new Date().toLocaleDateString(
            undefined,
            {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        );

}


/* ========================================
   USER GREETING
======================================== */

function setupGreeting() {

    if (!greetingElement) {
        return;
    }


    onAuthStateChanged(
        auth,
        user => {

            if (!user) {
                return;
            }


            const name =
                user.displayName
                    ? user.displayName
                        .trim()
                        .split(/\s+/)[0]
                    : "friend";


            const hour =
                new Date().getHours();


            let greetings;


            if (
                hour >= 6 &&
                hour < 12
            ) {

                greetings = [
                    "Good morning",
                    "Günaydın",
                    "Hello",
                    "Merhaba"
                ];

            } else if (
                hour >= 12 &&
                hour < 18
            ) {

                greetings = [
                    "Good afternoon",
                    "İyi günler",
                    "Hello",
                    "Merhaba",
                    "Selam"
                ];

            } else if (
                hour >= 18 &&
                hour < 22
            ) {

                greetings = [
                    "Good evening",
                    "İyi akşamlar",
                    "Hello",
                    "Merhaba",
                    "Selam"
                ];

            } else {

                greetings = [
                    "İyi geceler",
                    "Good night",
                    "Hello",
                    "Merhaba",
                    "Still up"
                ];

            }


            const greeting =
                greetings[
                    Math.floor(
                        Math.random() *
                        greetings.length
                    )
                ];


            greetingElement.textContent =
                `${ greeting }, ${ name }.`;

        }
    );

}


/* ========================================
   DATE KEY
======================================== */

function getDateKey(date) {

    return [
        date.getFullYear(),

        String(
            date.getMonth() + 1
        ).padStart(2, "0"),

        String(
            date.getDate()
        ).padStart(2, "0")

    ].join("-");

}


/* ========================================
   FORMAT DATE
======================================== */

function formatDate(timestamp) {

    if (!timestamp) {
        return "";
    }


    const date =
        new Date(timestamp);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }


    return date.toLocaleDateString(
        undefined,
        {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    );

}


/* ========================================
   PLAIN TEXT PREVIEW
======================================== */

function getPlainTextPreview(
    content,
    maxLength = 280
) {

    const temp =
        document.createElement("div");


    temp.innerHTML =
        content || "";


    const text =
        (
            temp.textContent ||
            temp.innerText ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim();


    if (!text) {
        return "This Script is empty.";
    }


    if (
        text.length <= maxLength
    ) {
        return text;
    }


    return (
        text.slice(
            0,
            maxLength
        ).trim() +
        "…"
    );

}


/* ========================================
   LOAD LATEST SCRIPT
======================================== */

async function loadLatestScript() {

    if (
        !latestNoteTitle &&
        !latestNotePreview &&
        !latestNoteDate
    ) {
        return;
    }


    try {

        const scripts =
            await getScripts();


        if (
            !scripts ||
            scripts.length === 0
        ) {

            if (latestNoteTitle) {

                latestNoteTitle.textContent =
                    "No Scripts yet";

            }


            if (latestNotePreview) {

                latestNotePreview.textContent =
                    "Your latest Script will appear here.";

            }


            if (latestNoteDate) {

                latestNoteDate.textContent =
                    "Start writing";

            }


            if (latestNoteWidget) {

                latestNoteWidget.href =
                    "codes.html";

            }


            return;

        }


        const latestScript =
            scripts[0];


        if (latestNoteTitle) {

            latestNoteTitle.textContent =
                latestScript.title?.trim() ||
                "Untitled Script";

        }


        if (latestNotePreview) {

            latestNotePreview.textContent =
                getPlainTextPreview(
                    latestScript.content
                );

        }


        if (latestNoteDate) {

            latestNoteDate.textContent =
                formatDate(
                    latestScript.updatedAt ||
                    latestScript.createdAt
                );

        }


        if (latestNoteWidget) {

            latestNoteWidget.href =
                "codes.html";

        }

    } catch (error) {

        console.error(
            "Failed to load latest Script:",
            error
        );

    }

}


/* ========================================
   LOAD COAL STATS
======================================== */

async function loadCoalStats() {

    try {

        const stats =
            await getCurrentCoalStats();


        if (streakElement) {

            streakElement.textContent =
                stats?.streak ?? 0;

        }


        if (smolderElement) {

            smolderElement.textContent =
                stats?.smolders ?? 0;

        }

    } catch (error) {

        console.error(
            "Failed to load Coal stats:",
            error
        );

    }

}


/* ========================================
   GET ENTRY DATES
======================================== */

function getEntryDates(entries) {

    const dates =
        new Set();


    if (!Array.isArray(entries)) {
        return dates;
    }


    entries.forEach(
        entry => {

            if (!entry?.createdAt) {
                return;
            }


            const date =
                new Date(
                    entry.createdAt
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return;
            }


            dates.add(
                getDateKey(date)
            );

        }
    );


    return dates;

}


/* ========================================
   UPDATE MONTHLY PROGRESS
======================================== */

async function updateMonthlyProgress() {

    if (
        !progressLabel &&
        !progressValue &&
        !progressBar
    ) {
        return;
    }


    try {

        const entries =
            await getEntries();


        const entryDates =
            getEntryDates(entries);


        /*
           Get the SAME calendar month
           currently being displayed by Coal.
        */

        const calendarDate =
            getCalendarDate();


        const year =
            calendarDate.getFullYear();

        const month =
            calendarDate.getMonth();


        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();


        const monthName =
            calendarDate.toLocaleDateString(
                undefined,
                {
                    month: "long"
                }
            );


        let activeDays = 0;


        for (
            let day = 1;
            day <= daysInMonth;
            day++
        ) {

            const date =
                new Date(
                    year,
                    month,
                    day
                );


            if (
                entryDates.has(
                    getDateKey(date)
                )
            ) {

                activeDays++;

            }

        }


        const percentage =
            daysInMonth > 0
                ? (
                    activeDays /
                    daysInMonth
                ) * 100
                : 0;


        if (progressLabel) {

            progressLabel.textContent =
                `${ monthName } progress`;

        }


        if (progressValue) {

            progressValue.textContent =
                `${ activeDays } / ${daysInMonth} days`;

        }


if (progressBar) {

    progressBar.style.width =
        `${Math.min(
            100,
            percentage
        )}%`;

}

    } catch (error) {

    console.error(
        "Failed to update monthly Coal progress:",
        error
    );

}

}


/* ========================================
   COAL CARD NAVIGATION
======================================== */

const coalCard =
    document.querySelector(
        "#home-coal-card"
    );


coalCard?.addEventListener(
    "click",
    event => {

        /*
           Calendar navigation buttons
           belong to Coal.

           Do not navigate to Journal
           when they are clicked.
        */

        if (
            event.target.closest(
                ".calendar-nav"
            )
        ) {
            return;
        }


        window.location.href =
            "journal.html";

    }
);


/* ========================================
   INITIALIZE
======================================== */

async function initializeHome() {

    updateDate();

    setupGreeting();


    try {

        await openDatabase();


        await Promise.all([
            loadLatestScript(),
            loadCoalStats(),
            updateMonthlyProgress()
        ]);

    } catch (error) {

        console.error(
            "Failed to initialize Çandarli Home:",
            error
        );

    }

}


initializeHome();


/* ========================================
   JOURNAL UPDATED
======================================== */

window.addEventListener(
    "journal-updated",
    () => {

        loadCoalStats();
        updateMonthlyProgress();

    }
);


/* ========================================
   SCRIPT UPDATED
======================================== */

window.addEventListener(
    "script-updated",
    () => {

        loadLatestScript();

    }
);


/* ========================================
   SCRIPT SYNC STATUS
======================================== */

window.addEventListener(
    "script-sync-status-changed",
    () => {

        loadLatestScript();

    }
);


/* ========================================
   COAL UPDATED
======================================== */

window.addEventListener(
    "coal-updated",
    () => {

        loadCoalStats();
        updateMonthlyProgress();

    }
);


/* ========================================
   COAL CALENDAR UPDATED
======================================== */

window.addEventListener(
    "coal-calendar-updated",
    () => {

        updateMonthlyProgress();

    }
);


/* ========================================
   ONLINE
======================================== */

window.addEventListener(
    "online",
    () => {

        setTimeout(
            () => {

                loadLatestScript();
                loadCoalStats();
                updateMonthlyProgress();

            },
            1000
        );

    }
);


/* ========================================
   PAGE BECOMES VISIBLE
======================================== */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "visible"
        ) {

            loadLatestScript();
            loadCoalStats();
            updateMonthlyProgress();

        }

    }
);