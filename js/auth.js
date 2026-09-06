import {
    auth
} from "./firebase.js";

import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


/* ========================================
   GOOGLE SIGN IN
======================================== */

function setupGoogleSignIn() {

    const button =
        document.querySelector("#google-sign-in");

    const message =
        document.querySelector("#auth-message");


    if (!button) return;


    /* ================================
       AUTH STATE
    ================================= */

    onAuthStateChanged(auth, user => {

        if (!user) return;

        // User is already signed in.
        // Redirect away from auth page.
        if (
            window.location.pathname.endsWith(
                "auth.html"
            ) ||
            window.location.pathname.endsWith(
                "auth.html"
            )
        ) {
            window.location.href = index.html;
        }

    });


    /* ================================
       GOOGLE AUTHENTICATION
    ================================= */

    button.addEventListener(
        "click",
        async () => {

            try {

                button.disabled = true;

                button.classList.add("loading");


                if (message) {

                    message.textContent =
                        "Signing in...";

                    message.className =
                        "auth-message";

                }


                const provider =
                    new GoogleAuthProvider();


                // Optional but useful:
                // Always ask Google to show account selection.
                provider.setCustomParameters({
                    prompt: "select_account"
                });


                await signInWithPopup(
                    auth,
                    provider
                );


                /*
                 * Authentication succeeded.
                 *
                 * onAuthStateChanged()
                 * handles the redirect.
                 */

            } catch (error) {

                console.error(
                    "Google sign-in failed:",
                    error
                );


                if (message) {

                    message.textContent =
                        getAuthErrorMessage(
                            error
                        );

                    message.className =
                        "auth-message error";

                }


                button.disabled = false;

                button.classList.remove(
                    "loading"
                );

            }

        }
    );

}


/* ========================================
   AUTH ERROR MESSAGE
======================================== */

function getAuthErrorMessage(error) {

    switch (error.code) {

        case "auth/popup-closed-by-user":

            return "Sign-in was cancelled.";


        case "auth/popup-blocked":

            return "Your browser blocked the sign-in popup. Please allow popups for this site.";


        case "auth/cancelled-popup-request":

            return "Another sign-in popup is already open.";


        case "auth/account-exists-with-different-credential":

            return "An account already exists with a different sign-in method.";


        case "auth/unauthorized-domain":

            return "This website domain is not authorized in Firebase. Add it in Firebase Authentication → Settings → Authorized domains.";


        case "auth/network-request-failed":

            return "Network error. Please check your internet connection.";


        case "auth/operation-not-allowed":

            return "Google Sign-In is not enabled in Firebase Authentication.";


        case "auth/invalid-api-key":

            return "Firebase configuration is invalid. Check your Firebase API key.";


        case "auth/app-not-authorized":

            return "This app is not authorized to use Firebase Authentication.";


        default:

            return error.message ||
                "Unable to sign in. Please try again.";

    }

}


/* ========================================
   NAVBAR AUTH UI
======================================== */

function setupAuthUI() {

    const profileButton =
        document.querySelector("#profile-button");


    if (!profileButton) return;


    /*
     * Prevent registering multiple listeners
     * if componentsLoaded fires more than once.
     */

    if (
        profileButton.dataset.authInitialized ===
        "true"
    ) {
        return;
    }


    profileButton.dataset.authInitialized =
        "true";


    onAuthStateChanged(
        auth,
        user => {

            if (user) {

                /* ================================
                   LOGGED IN
                ================================= */

                const firstName =
                    user.displayName
                        ? user.displayName
                            .trim()
                            .split(/\s+/)[0]
                        : "Account";


                profileButton.textContent =
                    firstName;


                profileButton.classList.add(
                    "authenticated"
                );


                profileButton.onclick =
                    async () => {

                        const confirmed =
                            window.confirm(
                                "Sign out?"
                            );


                        if (!confirmed) return;


                        try {

                            await signOut(auth);


                            /*
                             * Firebase auth state
                             * listener will update
                             * the navbar automatically.
                             */

                        } catch (error) {

                            console.error(
                                "Sign out failed:",
                                error
                            );

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
   INITIALIZE GOOGLE SIGN IN
======================================== */

setupGoogleSignIn();


/* ========================================
   WAIT FOR NAVBAR
======================================== */

window.addEventListener(
    "componentsLoaded",
    setupAuthUI
);