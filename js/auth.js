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
    openDatabase
} from "./db.js";

import {
    getCurrentCoalStats
} from "./coal.js";


/* ========================================
   DATE
======================================== */

const dateElement =
    document.querySelector("#os-date");

if (dateElement) {

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

const greetingElement =
    document.querySelector("#home-greeting");


onAuthStateChanged(
    auth,
    user => {

        if (
            !greetingElement ||
            !user
        ) {

            return;

        }


        const name =
            user.displayName ||
            "there";


        greetingElement.textContent =
            `Welcome back, ${name}.`;

    }
);


/* ========================================
   FURNACE STATS
======================================== */

async function loadFurnaceStats() {

    const streakElement =
        document.querySelector("#home-streak");

    const smolderElement =
        document.querySelector("#home-smolders");


    if (
        !streakElement &&
        !smolderElement
    ) {

        return;

    }


    try {

        await openDatabase();


        const stats =
            await getCurrentCoalStats();


        if (streakElement) {

            streakElement.textContent =
                stats.streak;

        }


        if (smolderElement) {

            smolderElement.textContent =
                stats.smolders;

        }


    } catch (error) {

        console.error(
            "Failed to load Furnace stats:",
            error
        );

    }

}


/* ========================================
   INITIALIZE
======================================== */

loadFurnaceStats();


/* ========================================
   REFRESH WHEN FURNACE CHANGES
======================================== */

window.addEventListener(
    "journal-updated",
    loadFurnaceStats
);


window.addEventListener(
    "coal-updated",
    loadFurnaceStats
);


window.addEventListener(
    "online",
    loadFurnaceStats
);