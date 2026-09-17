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
   GET CALENDAR DATE
======================================== */

function getCalendarDate() {

    return new Date(
        calendarDate
    );

}


/* ========================================
   DATE HELPERS
======================================== */

function normalizeDate(date) {

    const normalized =
        new Date(date);

    normalized.setHours(
        0,
        0,
        0,
        0
    );

    return normalized;

}


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


function parseDateKey(dateKey) {

    if (
        typeof dateKey !== "string"
    ) {
        return null;
    }


    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            dateKey
        );


    if (!match) {
        return null;
    }


    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    const day =
        Number(match[3]);


    const date =
        new Date(
            year,
            month - 1,
            day
        );


    date.setHours(
        0,
        0,
        0,
        0
    );


    /*
       Reject impossible dates such as:

       2026-02-31
    */

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {

        return null;

    }


    return date;

}


function addDays(date, amount) {

    const result =
        new Date(date);

    result.setDate(
        result.getDate() + amount
    );

    result.setHours(
        0,
        0,
        0,
        0
    );

    return result;

}


/* ========================================
   GET ENTRY DATES
======================================== */

function getEntryDates(entries) {

    const dates =
        new Set();


    entries.forEach(entry => {

        if (!entry?.createdAt) {
            return;
        }


        let date;


        /*
           JavaScript Date
        */

        if (
            entry.createdAt instanceof Date
        ) {

            date =
                new Date(
                    entry.createdAt
                );

        }


        /*
           Firestore Timestamp
        */

        else if (
            typeof entry.createdAt?.toDate ===
            "function"
        ) {

            date =
                entry.createdAt.toDate();

        }


        /*
           Numeric timestamp /
           date string
        */

        else {

            date =
                new Date(
                    entry.createdAt
                );

        }


        if (
            !date ||
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


    const lastActiveDate =
        typeof data?.lastActiveDate ===
            "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(
                data.lastActiveDate
            )
            ? data.lastActiveDate
            : null;


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
            [
                ...new Set(
                    protectedDates.filter(
                        date =>
                            typeof date ===
                            "string" &&
                            /^\d{4}-\d{2}-\d{2}$/
                                .test(date)
                    )
                )
            ],


        lastActiveDate

    };

}


/* ========================================
   CALCULATE STREAK
======================================== */

/*
   COAL STREAK RULES
   -----------------

   1. A journal entry fuels the day.

   2. A completed day with no entry:
        - Smolder available:
            consume ONE Smolder
            preserve streak
        - No Smolder:
            break streak

   3. TODAY is never treated as missed
      until the day is actually complete.

   4. A protected date never consumes
      another Smolder.

   5. Stored streak is the source of truth.

   6. lastActiveDate means:
      "The last calendar day Coal has
       completely processed."

*/

function calculateStreak(
    entryDates,
    coalData
) {

    const today =
        normalizeDate(
            new Date()
        );


    const todayKey =
        getDateKey(
            today
        );


    let streak =
        coalData.streak;


    let smolders =
        coalData.smolders;


    const protectedDates =
        new Set(
            coalData.protectedDates || []
        );


    let lastActiveDate =
        coalData.lastActiveDate;


    /*
       ----------------------------------------
       FIRST-TIME MIGRATION
       ----------------------------------------

       Old Coal data didn't have
       lastActiveDate.

       Preserve the existing streak.

       We use the latest journal date as
       the baseline instead of rebuilding
       the streak from scratch.

       IMPORTANT:
       We do not punish today here.
    */

    if (!lastActiveDate) {

        const sortedEntryDates =
            [...entryDates]
                .map(parseDateKey)
                .filter(Boolean)
                .sort(
                    (a, b) =>
                        a.getTime() -
                        b.getTime()
                );


        if (
            sortedEntryDates.length === 0
        ) {

            return {

                streak,

                smolders,

                protectedDates: [
                    ...protectedDates
                ],

                lastActiveDate: null

            };

        }


        const latestEntryDate =
            sortedEntryDates[
            sortedEntryDates.length - 1
            ];


        lastActiveDate =
            getDateKey(
                latestEntryDate
            );


        return {

            streak,

            smolders,

            protectedDates: [
                ...protectedDates
            ],

            lastActiveDate

        };

    }


    let lastProcessedDate =
        parseDateKey(
            lastActiveDate
        );


    /*
       Invalid date.
    */

    if (!lastProcessedDate) {

        return {

            streak,

            smolders,

            protectedDates: [
                ...protectedDates
            ],

            lastActiveDate: null

        };

    }


    /*
       ----------------------------------------
       WHAT IS THE LAST DAY WE CAN PROCESS?
       ----------------------------------------

       If today has an entry:
           today can be processed.

       If today has NO entry:
           only yesterday and earlier can
           be processed.

       Therefore today's missing journal
       can NEVER consume a Smolder.
    */

    const processUntil =
        entryDates.has(todayKey)
            ? today
            : addDays(
                today,
                -1
            );


    /*
       Nothing new to process.
    */

    if (
        lastProcessedDate >=
        processUntil
    ) {

        return {

            streak,

            smolders,

            protectedDates: [
                ...protectedDates
            ],

            lastActiveDate

        };

    }


    /*
       ----------------------------------------
       PROCESS EACH COMPLETED DAY
       ----------------------------------------
    */

    let cursor =
        addDays(
            lastProcessedDate,
            1
        );


    while (
        cursor <= processUntil
    ) {

        const dateKey =
            getDateKey(
                cursor
            );


        const hasEntry =
            entryDates.has(
                dateKey
            );


        /*
           ====================================
           JOURNAL ENTRY
           ====================================
        */

        if (hasEntry) {

            /*
               If streak is broken,
               this entry starts a new streak.
            */

            if (streak <= 0) {

                streak = 1;

            }

            else {

                streak++;

            }


            console.log(
                `Coal: ${dateKey} fueled. Streak = ${streak}`
            );

        }


        /*
           ====================================
           ALREADY PROTECTED
           ====================================
        */

        else if (
            protectedDates.has(
                dateKey
            )
        ) {

            /*
               Already protected.

               Do NOT consume another Smolder.

               Do NOT increase the streak again.
            */

            console.log(
                `Coal: ${dateKey} already protected.`
            );

        }


        /*
           ====================================
           MISSED COMPLETED DAY
           ====================================
        */

        else {

            /*
               --------------------------------
               SMOLDER AVAILABLE
               --------------------------------
            */

            if (
                smolders > 0 &&
                streak > 0
            ) {

                smolders--;

                protectedDates.add(
                    dateKey
                );


                console.log(
                    `Coal: 🪨 Smolder consumed for ${dateKey}. Streak preserved at ${streak}.`
                );

            }


            /*
               --------------------------------
               NO SMOLDER
               --------------------------------
            */

            else {

                /*
                   Streak is broken.

                   We set it to zero immediately.

                   The next fueled day will start
                   a new streak at 1.
                */

                streak = 0;


                console.log(
                    `Coal: ❌ Streak broken on ${dateKey}. No Smolders available.`
                );

            }

        }


        /*
           This day has now been processed.
        */

        lastProcessedDate =
            cursor;


        cursor =
            addDays(
                cursor,
                1
            );

    }


    /*
       ----------------------------------------
       SAVE LAST PROCESSED DATE
       ----------------------------------------
    */

    lastActiveDate =
        getDateKey(
            lastProcessedDate
        );


    return {

        streak,

        smolders,

        protectedDates: [
            ...protectedDates
        ],

        lastActiveDate

    };

}


/* ========================================
   PROCESS STREAK REWARDS
======================================== */

async function processStreakRewards(
    rawStreak,
    coalData,
    protectedDates,
    lastActiveDate
) {

    let smolders =
        coalData.smolders;


    let rewardedMilestones =
        [
            ...coalData.rewardedMilestones
        ];


    /*
       Remove milestones that are above
       the current streak.

       This allows a future streak to
       earn them again after a break.
    */

    rewardedMilestones =
        rewardedMilestones.filter(
            milestone =>
                milestone <= rawStreak
        );


    /*
       Determine milestones reached.
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


    let changed =
        false;


    /*
       Grant rewards.
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
       Sort.
    */

    rewardedMilestones.sort(
        (a, b) =>
            a - b
    );


    /*
       ----------------------------------------
       DETECT CHANGES
       ----------------------------------------
    */

    if (
        coalData.streak !==
        rawStreak
    ) {

        changed = true;

    }


    if (
        coalData.smolders !==
        smolders
    ) {

        changed = true;

    }


    const oldProtectedDates =
        [
            ...(coalData.protectedDates || [])
        ].sort();


    const newProtectedDates =
        [
            ...new Set(
                protectedDates
            )
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


    if (
        coalData.lastActiveDate !==
        lastActiveDate
    ) {

        changed = true;

    }


    /*
       ----------------------------------------
       SAVE
       ----------------------------------------
    */

    if (changed) {

        await saveCoalData({

            streak:
                rawStreak,

            smolders,

            rewardedMilestones,

            protectedDates:
                newProtectedDates,

            lastActiveDate

        });

    }


    return {

        streak:
            rawStreak,

        smolders,

        rewardedMilestones,

        protectedDates:
            newProtectedDates,

        lastActiveDate

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

    console.log("🔥 renderCalendar() STARTED");


    if (!calendarGrid) {

        console.warn(
            "⚠️ Coal calendar grid not found."
        );

        return;

    }


    try {

        /*
           ------------------------------------
           GET JOURNAL ENTRIES
           ------------------------------------
        */

        const entries =
            await getEntries();


        const entryDates =
            getEntryDates(
                entries
            );


        console.log(
            "🔥 Coal entry dates:",
            [...entryDates]
        );


        /*
           ------------------------------------
           GET COAL DATA
           ------------------------------------
        */

        const storedCoalData =
            await getCoalData();


        const coalData =
            normalizeCoalData(
                storedCoalData
            );


        console.log(
            "🔥 Stored Coal data:",
            coalData
        );


        /*
           ------------------------------------
           CALCULATE
           ------------------------------------
        */

        const streakData =
            calculateStreak(
                entryDates,
                coalData
            );


        console.log(
            "🔥 Calculated Coal:",
            streakData
        );


        /*
           ------------------------------------
           REWARDS + SAVE
           ------------------------------------
        */

        const updatedCoal =
            await processStreakRewards(

                streakData.streak,

                {
                    ...coalData,

                    smolders:
                        streakData.smolders,

                    protectedDates:
                        streakData.protectedDates,

                    lastActiveDate:
                        streakData.lastActiveDate

                },

                streakData.protectedDates,

                streakData.lastActiveDate

            );


        console.log(
            "🔥 Final Coal state:",
            updatedCoal
        );


        /*
           ------------------------------------
           UPDATE UI
           ------------------------------------
        */

        updateCoalUI(

            updatedCoal.streak,

            updatedCoal.smolders

        );


        /*
           Check DOM immediately after
           Coal updates it.
        */

        console.log(
            "🔥 DOM immediately after update:",
            {

                streak:
                    document.querySelector(
                        "#streak-value"
                    )?.textContent,

                smolders:
                    document.querySelector(
                        "#smolder-value"
                    )?.textContent

            }
        );


        /*
           ------------------------------------
           CALENDAR MONTH
           ------------------------------------
        */

        const year =
            calendarDate.getFullYear();


        const month =
            calendarDate.getMonth();


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


        /*
           ------------------------------------
           MONTH INFORMATION
           ------------------------------------
        */

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
           Monday-first calendar.
        */

        const startingDay =
            (
                firstDay.getDay() +
                6
            ) % 7;


        /*
           ------------------------------------
           TODAY
           ------------------------------------
        */

        const today =
            normalizeDate(
                new Date()
            );


        /*
           ------------------------------------
           CLEAR CALENDAR
           ------------------------------------
        */

        calendarGrid.innerHTML =
            "";


        /*
           ------------------------------------
           EMPTY CELLS
           ------------------------------------
        */

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


        /*
           ------------------------------------
           DAYS
           ------------------------------------
        */

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


            const dateLabel =
                date.toLocaleDateString(
                    undefined,
                    {
                        month: "long",
                        day: "numeric"
                    }
                );


            /*
               =================================
               FUTURE
               =================================
            */

            if (
                date > today
            ) {

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


            /*
               =================================
               JOURNAL ENTRY
               =================================
            */

            else if (
                hasEntry
            ) {

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
                        Fueled
                    </span>
                `;

            }


            /*
               =================================
               SMOLDER PROTECTED
               =================================
            */

            else if (
                isProtected
            ) {

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


            /*
               =================================
               TODAY — NOT FUELED
               =================================
            */

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
                        Not Fueled today
                    </span>
                `;

            }


            /*
               =================================
               PREVIOUS UNFUELED DAY
               =================================
            */

            else {

                dayElement.classList.add(
                    "cold"
                );


                dayElement.innerHTML = `
                    <img
                        src="assets/icons/coal-frozen.png"
                        alt=""
                        class="calendar-coal-icon
                    `;

            }


            calendarGrid.appendChild(
                dayElement
            );

        }


        /*
           ------------------------------------
           CALENDAR UPDATED
           ------------------------------------
        */

        window.dispatchEvent(
            new CustomEvent(
                "coal-calendar-updated"
            )
        );


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
    event => {

        event.stopPropagation();


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
    event => {

        event.stopPropagation();


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
        getEntryDates(
            entries
        );


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
                    streakData.smolders,

                protectedDates:
                    streakData.protectedDates,

                lastActiveDate:
                    streakData.lastActiveDate

            },

            streakData.protectedDates,

            streakData.lastActiveDate

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


/* ========================================
   DEV TEST
======================================== */

/*
   IMPORTANT:

   This test DOES NOT modify your real
   Coal data.

   It creates a fake scenario in memory:

       streak = 13
       Smolders = 1
       yesterday = missed

   Then it runs the SAME calculateStreak()
   function used by real Coal.

   Usage:

       window.testSmolder()

*/

window.testSmolder = function () {

    try {

        const today =
            normalizeDate(
                new Date()
            );


        const yesterday =
            addDays(
                today,
                -1
            );


        const dayBefore =
            addDays(
                today,
                -2
            );


        /*
           Fake journal history:

           Day before yesterday = fueled
           Yesterday = missed
           Today = not processed
        */

        const fakeEntryDates =
            new Set([
                getDateKey(
                    dayBefore
                )
            ]);


        const fakeCoalData = {

            streak: 13,

            smolders: 1,

            rewardedMilestones: [
                7
            ],

            protectedDates: [],

            lastActiveDate:
                getDateKey(
                    dayBefore
                )

        };


        console.group(
            "🔥 Çandarli Smolder Test"
        );


        console.log(
            "Scenario:"
        );


        console.log(
            `• Streak: ${fakeCoalData.streak}`
        );


        console.log(
            `• Smolders: ${fakeCoalData.smolders}`
        );


        console.log(
            `• Last active: ${fakeCoalData.lastActiveDate}`
        );


        console.log(
            `• Missed day: ${getDateKey(yesterday)}`
        );


        /*
           Run the REAL streak engine.
        */

        const result =
            calculateStreak(
                fakeEntryDates,
                fakeCoalData
            );


        console.log(
            "Result:",
            result
        );


        /*
           Expected:
        */

        if (
            result.streak === 13 &&
            result.smolders === 0 &&
            result.protectedDates.includes(
                getDateKey(
                    yesterday
                )
            )
        ) {

            console.log(
                "✅ TEST PASSED"
            );


            console.log(
                "13-day streak preserved."
            );


            console.log(
                "1 Smolder consumed."
            );


            console.log(
                "Yesterday protected."
            );


            console.log(
                "Today's streak was NOT touched."
            );

        }

        else {

            console.error(
                "❌ TEST FAILED"
            );

        }


        console.groupEnd();


        return result;

    } catch (error) {

        console.error(
            "❌ Smolder test failed:",
            error
        );

    }

};


/* ========================================
   EXPORTS
======================================== */

export {
    getCurrentCoalStats,
    getCalendarDate
};