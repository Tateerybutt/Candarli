import {
    auth
} from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


/* ========================================
   AUTH UI
======================================== */

function setupAuthUI() {

    const profileButton =
        document.querySelector("#profile-button");

    if (!profileButton) return;


    onAuthStateChanged(auth, user => {

        if (user) {

            /* ================================
               LOGGED IN
            ================================= */

            profileButton.textContent =
                user.displayName
                    ? user.displayName.split(" ")[0]
                    : "Account";

            profileButton.classList.add(
                "authenticated"
            );

            profileButton.onclick = () => {

                const confirmed =
                    confirm("Sign out?");

                if (confirmed) {
                    signOut(auth);
                }

            };

        } else {

            /* ================================
               LOGGED OUT
            ================================= */

            profileButton.textContent =
                "Sign In";

            profileButton.classList.remove(
                "authenticated"
            );

            profileButton.onclick = () => {
                window.location.href =
                    "auth.html";
            };

        }

    });

}


/* ========================================
   WAIT FOR NAVBAR
======================================== */

window.addEventListener(
    "componentsLoaded",
    setupAuthUI
);