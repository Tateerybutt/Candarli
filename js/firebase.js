import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* ========================================
   FIREBASE CONFIG
======================================== */

const firebaseConfig = {
    apiKey: "AIzaSyCiovYu7p-SJEXKGI9XBsewsaxFaLfN9d0",
    authDomain: "candarli-app.firebaseapp.com",
    projectId: "candarli-app",
    storageBucket: "candarli-app.firebasestorage.app",
    messagingSenderId: "64180297721",
    appId: "1:64180297721:web:6f675a6ba6e2e07576a728"
};


/* ========================================
   INITIALIZE FIREBASE
======================================== */

const app = initializeApp(firebaseConfig);


/* ========================================
   SERVICES
======================================== */

const auth = getAuth(app);

const googleProvider =
    new GoogleAuthProvider();

const db = getFirestore(app);


/* ========================================
   EXPORTS
======================================== */

export {
    app,
    auth,
    googleProvider,
    db
};