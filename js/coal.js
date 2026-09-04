import {
    openDatabase,
    getEntries,
    getCoalData,
    saveCoalData
} from "./db.js";


/* ========================================
   COAL ELEMENTS
======================================== */

const streakValue =
    document.querySelector("#streak-value");

const streakLabel =
    document.querySelector("#streak-label");

const smolderValue =
    document.querySelector("#smolder-value");

const smolderLabel =
    document.querySelector("#smolder-label");

const calendarPrev =
    document.querySelector("#calendar-prev");

const calendarNext =
    document.querySelector("#calendar-next");

const calendarMonth =
    document.querySelector("#calendar-month");

const calendarGrid =
    document.querySelector("#coal-calendar-grid");


/* ========================================
   STREAK SETTINGS
======================================== */

const STREAK_REWARD_DAYS = 7;

const SMOLDERS_PER_REWARD = 1;

const MAX_SMOLDERS = 3;


/* ========================================
   CALENDAR STATE
======================================== */

let calendarDate =
    new Date();

calendarDate.setDate(1);


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
   GET ENTRY DATES
======================================== */

function getEntryDates(entries) {

    const dates =
        new Set();


    entries.forEach(entry => {

        if (!entry.createdAt) {
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

    });


    return dates;

}


/* ========================================
   NORMALIZE COAL DATA
======================================== */

function normalizeCoalData(data) {

    const streak =
        Number(data?.streak);


    const smolders =
        Number(data?.smolders);


    const rewardedMilestones =
        Array.isArray(
            data?.rewardedMilestones
        )
            ? data.rewardedMilestones
            : [];


    const protectedDates =
        Array.isArray(
            data?.protectedDates
        )
            ? data.protectedDates
            : [];


    return {

        streak:
            Number.isFinite(streak) &&
                streak >= 0
                ? Math.floor(streak)
                : 0,


        smolders:
            Number.isFinite(smolders) &&
                smolders >= 0
                ? Math.min(
                    Math.floor(smolders),
                    MAX_SMOLDERS
                )
                : 0,


        rewardedMilestones:
            rewardedMilestones
                .map(Number)
                .filter(
                    milestone =>
                        Number.isFinite(
                            milestone
                        ) &&
                        milestone > 0
                )
                .map(
                    milestone =>
                        Math.floor(
                            milestone
                        )
                ),


        protectedDates:
            protectedDates
                .filter(
                    date =>
                        typeof date ===
                        "string"
                )

    };

}


/* ========================================
   CALCULATE STREAK WITH SMOLDERS
======================================== */

/*
   Rules:

   - Today MUST have an entry for the
     current streak to be active.

   - Today NEVER consumes a Smolder.

   - Missing previous days can consume
     Smolders.

   Example:

   Day 1  Entry
   Day 2  Entry
   Day 3  Missing
   Day 4  Entry

   Day 3 can be protected by a Smolder.

   Result:

   Streak = 4
   Smolders = previous - 1
*/

function calculateStreak(
    entryDates,
    coalData
) {

    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    let smolders =
        coalData.smolders;


    const protectedDates =
        new Set(
            coalData.protectedDates || []
        );


    let streak = 0;


    /*
       Today is still in progress.

       If today has no entry yet,
       start counting from yesterday.

       Today NEVER consumes a Smolder.
    */

    const cursor =
        new Date(today);


    if (
        !entryDates.has(
            getDateKey(today)
        )
    ) {

        cursor.setDate(
            cursor.getDate() - 1
        );

    }


    /*
       Count backwards through the streak.
    */

    while (true) {

        const dateKey =
            getDateKey(cursor);


        /*
           Entry exists.
        */

        if (
            entryDates.has(dateKey)
        ) {

            streak++;

        }


        /*
           This date was previously protected
           by a Smolder.
        */

        else if (
            protectedDates.has(dateKey)
        ) {

            streak++;

        }


        /*
           Missing completed day.

           Use a Smolder if available.
        */

        else if (
            smolders > 0
        ) {

            smolders--;

            protectedDates.add(
                dateKey
            );

            streak++;

        }


        /*
           No entry, no protection and no
           Smolder.

           Streak ends.
        */

        else {

            break;

        }


        /*
           Move backwards one day.
        */

        cursor.setDate(
            cursor.getDate() - 1
        );

    }


    return {

        streak,

        smolders,

        protectedDates: [
            ...protectedDates
        ]

    };

}


/* ========================================
   PROCESS STREAK REWARDS
======================================== */

async function processStreakRewards(
    rawStreak,
    coalData,
    protectedDates
) {

    let smolders =
        coalData.smolders;


    let rewardedMilestones =
        [
            ...coalData.rewardedMilestones
        ];


    /*
       Milestones from a previous broken
       streak are no longer valid.

       This allows a new 7-day streak to
       earn another Smolder.
    */

    rewardedMilestones =
        rewardedMilestones.filter(
            milestone =>
                milestone <= rawStreak
        );


    /*
       Determine every milestone reached
       by the current streak.

       7  → reward
       14 → reward
       21 → reward
       etc.
    */

    const earnedMilestones =
        [];


    for (
        let milestone =
            STREAK_REWARD_DAYS;

        milestone <= rawStreak;

        milestone +=
        STREAK_REWARD_DAYS
    ) {

        earnedMilestones.push(
            milestone
        );

    }


    let changed = false;


    /*
       Grant rewards that have not already
       been granted during this streak.
    */

    for (
        const milestone
        of earnedMilestones
    ) {

        if (
            rewardedMilestones.includes(
                milestone
            )
        ) {

            continue;

        }


        rewardedMilestones.push(
            milestone
        );


        smolders =
            Math.min(
                smolders +
                SMOLDERS_PER_REWARD,
                MAX_SMOLDERS
            );


        changed = true;


        console.log(
            `Coal milestone reached: ${milestone} days. +${SMOLDERS_PER_REWARD} Smolder.`
        );

    }


    /*
       Sort milestones for clean
       Firestore data.
    */

    rewardedMilestones.sort(
        (a, b) => a - b
    );


    /*
       Detect changes to streak.
    */

    if (
        coalData.streak !== rawStreak
    ) {

        changed = true;

    }


    /*
       Detect changes to Smolders.
    */

    if (
        coalData.smolders !== smolders
    ) {

        changed = true;

    }


    /*
       Detect changes to protected dates.
    */

    const oldProtectedDates =
        [
            ...(coalData.protectedDates || [])
        ].sort();


    const newProtectedDates =
        [
            ...protectedDates
        ].sort();


    if (
        JSON.stringify(
            oldProtectedDates
        ) !==
        JSON.stringify(
            newProtectedDates
        )
    ) {

        changed = true;

    }


    /*
       Detect milestone changes.
    */

    if (
        JSON.stringify(
            coalData.rewardedMilestones
        ) !==
        JSON.stringify(
            rewardedMilestones
        )
    ) {

        changed = true;

    }


    /*
       Save updated Coal state.
    */

    if (changed) {

        await saveCoalData({

            streak:
                rawStreak,

            smolders,

            rewardedMilestones:

                rewardedMilestones,

            protectedDates:

                newProtectedDates

        });

    }


    return {

        streak:
            rawStreak,

        smolders,

        rewardedMilestones:

            rewardedMilestones,

        protectedDates:

            newProtectedDates

    };

}


/* ========================================
   UPDATE COAL UI
======================================== */

function updateCoalUI(
    streak,
    smolders
) {

    if (streakValue) {

        streakValue.textContent =
            streak;

    }


    if (streakLabel) {

        streakLabel.textContent =
            "days";

    }


    if (smolderValue) {

        smolderValue.textContent =
            smolders;

    }


    if (smolderLabel) {

        smolderLabel.textContent =
            "Smolders";

    }

}


/* ========================================
   RENDER CALENDAR
======================================== */

async function renderCalendar() {

    if (!calendarGrid) {
        return;
    }


    try {

        /* ====================================
           GET JOURNAL ENTRIES
        ==================================== */

        const entries =
            await getEntries();


        const entryDates =
            getEntryDates(
                entries
            );


        /* ====================================
           GET COAL DATA
        ==================================== */

        const storedCoalData =
            await getCoalData();


        const coalData =
            normalizeCoalData(
                storedCoalData
            );


        /* ====================================
           CALCULATE STREAK
        ==================================== */

        const streakData =
            calculateStreak(
                entryDates,
                coalData
            );


        /* ====================================
           PROCESS REWARDS
        ==================================== */

        const updatedCoal =
            await processStreakRewards(

                streakData.streak,

                {
                    ...coalData,

                    smolders:
                        streakData.smolders
                },

                streakData.protectedDates

            );


        /* ====================================
           UPDATE UI
        ==================================== */

        updateCoalUI(

            updatedCoal.streak,

            updatedCoal.smolders

        );


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
           MONTH INFORMATION
        ==================================== */

        const firstDay =
            new Date(
                year,
                month,
                1
            );


        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();


        /*
           Calendar starts on Monday.
        */

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

        calendarGrid.innerHTML =
            "";


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
           DAYS
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
                getDateKey(
                    date
                );


            const hasEntry =
                entryDates.has(
                    dateKey
                );


            const isProtected =
                updatedCoal.protectedDates
                    .includes(
                        dateKey
                    );


            const dayElement =
                document.createElement(
                    "div"
                );


            dayElement.className =
                "calendar-day";


            /* ==================================
               DATE LABEL
            ================================== */

            const dateLabel =
                date.toLocaleDateString(
                    undefined,
                    {
                        month: "long",
                        day: "numeric"
                    }
                );


            /* ==================================
               FUTURE
            ================================== */

            if (date > today) {

                dayElement.classList.add(
                    "future"
                );


                dayElement.innerHTML = `
                    <span class="calendar-day-number">
                        ${day}
                    </span>

                    <span class="calendar-tooltip">
                        ${dateLabel}
                    </span>
                `;

            }


            /* ==================================
               ENTRY EXISTS
            ================================== */

            else if (hasEntry) {

                dayElement.classList.add(
                    "fuel"
                );


                dayElement.innerHTML = `
                    <img
                        src="assets/icons/coal-burning.png"
                        alt=""
                        class="calendar-coal-icon"
                    >

                    <span class="calendar-tooltip">
                        ${dateLabel}
                        <br>
                        Fuel Added
                    </span>
                `;

            }


            /* ==================================
               SMOLDER PROTECTED
            ================================== */

            else if (isProtected) {

                dayElement.classList.add(
                    "protected"
                );


                dayElement.innerHTML = `
                    <img
                        src="assets/icons/coal-ember.png"
                        alt=""
                        class="calendar-coal-icon"
                    >

                    <span class="calendar-tooltip">
                        ${dateLabel}
                        <br>
                        Smolder Protected
                    </span>
                `;

            }


            /* ==================================
               TODAY — NO ENTRY
            ================================== */

            else if (
                date.getTime() ===
                today.getTime()
            ) {

                dayElement.classList.add(
                    "today"
                );


                dayElement.innerHTML = `
                    <img
                        src="assets/icons/coal-ember.png"
                        alt=""
                        class="calendar-coal-icon"
                    >

                    <span class="calendar-tooltip">
                        ${dateLabel}
                        <br>
                        No fuel added today
                    </span>
                `;

            }


            /* ==================================
               PREVIOUS DAY — NO ENTRY
            ================================== */

            else {

                dayElement.classList.add(
                    "cold"
                );


                dayElement.innerHTML = `
                    <img
                        src="assets/icons/coal-frozen.png"
                        alt=""
                        class="calendar-coal-icon"
                    >

                    <span class="calendar-tooltip">
                        ${dateLabel}
                        <br>
                        No fuel added
                    </span>
                `;

            }


            calendarGrid.appendChild(
                dayElement
            );

        }


    } catch (error) {

        console.error(
            "Failed to render coal calendar:",
            error
        );

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


        renderCalendar();

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


        renderCalendar();

    }
);


/* ========================================
   JOURNAL UPDATED
======================================== */

window.addEventListener(
    "journal-updated",
    renderCalendar
);


/* ========================================
   COAL UPDATED
======================================== */

window.addEventListener(
    "coal-updated",
    renderCalendar
);


/* ========================================
   ONLINE
======================================== */

window.addEventListener(
    "online",
    () => {

        renderCalendar();

    }
);


/* ========================================
   GET CURRENT COAL STATS
======================================== */

async function getCurrentCoalStats() {

    const entries =
        await getEntries();

    const entryDates =
        getEntryDates(entries);

    const storedCoalData =
        await getCoalData();

    const coalData =
        normalizeCoalData(
            storedCoalData
        );

    const streakData =
        calculateStreak(
            entryDates,
            coalData
        );

    const updatedCoal =
        await processStreakRewards(

            streakData.streak,

            {
                ...coalData,

                smolders:
                    streakData.smolders
            },

            streakData.protectedDates

        );

    return {

        streak:
            updatedCoal.streak,

        smolders:
            updatedCoal.smolders

    };

}


/* ========================================
   INITIALIZE
======================================== */

async function initializeCoal() {

    try {

        await openDatabase();

        await renderCalendar();

    } catch (error) {

        console.error(
            "Failed to initialize Coal:",
            error
        );

    }

}


document.addEventListener(
    "DOMContentLoaded",
    initializeCoal
);

export {
    getCurrentCoalStats
};