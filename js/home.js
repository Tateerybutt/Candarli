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
    getScripts,
    getCoalData
} from "./db.js";

import {
    getCurrentCoalStats
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
   CALENDAR
======================================== */

const calendarMonth =
    document.querySelector("#calendar-month");

const calendarPrev =
    document.querySelector("#calendar-prev");

const calendarNext =
    document.querySelector("#calendar-next");

const calendarGrid =
    document.querySelector("#coal-calendar-grid");


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
   CALENDAR STATE
======================================== */

let calendarDate = new Date();

calendarDate.setDate(1);


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
                `${greeting}, ${name}.`;

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
        text
            .slice(0, maxLength)
            .trim() +
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

            return;
        }

        const latestScript =
            scripts[0];

        if (latestNoteTitle) {

            latestNoteTitle.textContent =
                latestScript.title?.trim()
                || "Untitled Script";

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
   GET JOURNAL ENTRY DATES
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
   GET PROTECTED DATES
======================================== */

async function getProtectedDates() {

    try {

        const coalData =
            await getCoalData();

        if (
            Array.isArray(
                coalData?.protectedDates
            )
        ) {

            return new Set(
                coalData.protectedDates
            );

        }

    } catch (error) {

        /*
           Protected dates are optional for
           calendar rendering.

           If this fails, the calendar
           should STILL render normally.
        */

        console.warn(
            "Could not load protected Coal dates:",
            error
        );

    }

    return new Set();

}


/* ========================================
   UPDATE MONTHLY PROGRESS
======================================== */

function updateMonthlyProgress(
    entryDates,
    year,
    month,
    daysInMonth
) {

    if (
        !progressLabel &&
        !progressValue &&
        !progressBar
    ) {
        return;
    }

    const monthName =
        new Date(
            year,
            month,
            1
        ).toLocaleDateString(
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
            `${monthName} progress`;

    }

    if (progressValue) {

        progressValue.textContent =
            `${activeDays} / ${daysInMonth} days`;

    }

    if (progressBar) {

        progressBar.style.width =
            `${Math.min(
                100,
                percentage
            )}%`;

    }

}


/* ========================================
   RENDER HOME CALENDAR
======================================== */

async function renderHomeCalendar() {

    if (!calendarGrid) {
        return;
    }

    try {

        /*
           Get journal entries first.

           The calendar itself depends on
           this data, not on Coal data.
        */

        const entries =
            await getEntries();

        const entryDates =
            getEntryDates(entries);


        /*
           Protected dates are optional.

           If loading them fails, the
           calendar will still render.
        */

        const protectedDates =
            await getProtectedDates();


        /* ====================================
           CURRENT MONTH
        ==================================== */

        const year =
            calendarDate.getFullYear();

        const month =
            calendarDate.getMonth();


        /* ====================================
           MONTH TITLE
        ==================================== */

        if (calendarMonth) {

            calendarMonth.textContent =
                calendarDate.toLocaleDateString(
                    undefined,
                    {
                        month: "long",
                        year: "numeric"
                    }
                );

        }


        /* ====================================
           DAYS IN MONTH
        ==================================== */

        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();


        /* ====================================
           MONTHLY PROGRESS
        ==================================== */

        updateMonthlyProgress(
            entryDates,
            year,
            month,
            daysInMonth
        );


        /* ====================================
           MONDAY-FIRST OFFSET
        ==================================== */

        const firstDay =
            new Date(
                year,
                month,
                1
            );

        const startingDay =
            (
                firstDay.getDay() +
                6
            ) % 7;


        /* ====================================
           TODAY
        ==================================== */

        const today =
            new Date();

        today.setHours(
            0,
            0,
            0,
            0
        );


        /* ====================================
           CLEAR CALENDAR
        ==================================== */

        calendarGrid.innerHTML = "";


        /* ====================================
           EMPTY CELLS
        ==================================== */

        for (
            let i = 0;
            i < startingDay;
            i++
        ) {

            const emptyDay =
                document.createElement(
                    "div"
                );

            emptyDay.className =
                "calendar-day empty";

            calendarGrid.appendChild(
                emptyDay
            );

        }


        /* ====================================
           CALENDAR DAYS
        ==================================== */

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

            date.setHours(
                0,
                0,
                0,
                0
            );

            const dateKey =
                getDateKey(date);

            const hasEntry =
                entryDates.has(
                    dateKey
                );

            const isProtected =
                protectedDates.has(
                    dateKey
                );

            const isToday =
                date.getTime() ===
                today.getTime();

            const isFuture =
                date > today;


            /* ==================================
               DAY ELEMENT
            ================================== */

            const dayElement =
                document.createElement(
                    "div"
                );

            dayElement.className =
                "calendar-day";


            /* ==================================
               STATE
            ================================== */

            if (isFuture) {

                dayElement.classList.add(
                    "future"
                );

            } else if (hasEntry) {

                dayElement.classList.add(
                    "fuel"
                );

            } else if (isProtected) {

                dayElement.classList.add(
                    "protected"
                );

            } else if (isToday) {

                dayElement.classList.add(
                    "today"
                );

            } else {

                dayElement.classList.add(
                    "cold"
                );

            }


            /* ==================================
               DAY NUMBER
            ================================== */

            const numberElement =
                document.createElement(
                    "span"
                );

            numberElement.className =
                "calendar-day-number";

            numberElement.textContent =
                day;


            dayElement.appendChild(
                numberElement
            );


            calendarGrid.appendChild(
                dayElement
            );

        }


    } catch (error) {

        console.error(
            "Failed to render Home calendar:",
            error
        );

        /*
           Don't leave the calendar looking
           completely broken if something
           unexpected happens.
        */

        if (calendarGrid.children.length === 0) {

            calendarGrid.innerHTML = `
                <div
                    style="
                        grid-column: 1 / -1;
                        text-align: center;
                        color: var(--text-muted);
                        font-size: 12px;
                        padding: 10px 0;
                    "
                >
                    Calendar unavailable
                </div>
            `;

        }

    }

}


/* ========================================
   PREVIOUS MONTH
======================================== */

calendarPrev?.addEventListener(
    "click",
    () => {

        calendarDate.setMonth(
            calendarDate.getMonth() - 1
        );

        renderHomeCalendar();

    }
);


/* ========================================
   NEXT MONTH
======================================== */

calendarNext?.addEventListener(
    "click",
    () => {

        calendarDate.setMonth(
            calendarDate.getMonth() + 1
        );

        renderHomeCalendar();

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
            renderHomeCalendar()
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

        renderHomeCalendar();

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

        renderHomeCalendar();

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

                renderHomeCalendar();

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

            renderHomeCalendar();

        }

    }
);