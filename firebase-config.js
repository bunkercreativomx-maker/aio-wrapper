const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyD3X2npEyrc5D1SAe9Bv4Q0HpVLQJVp4WI",
    authDomain: "wrapper-one.firebaseapp.com",
    projectId: "wrapper-one",
    storageBucket: "wrapper-one.firebasestorage.app",
    messagingSenderId: "630195478390",
    appId: "1:630195478390:web:78f5f6779ed2c6abe9e457"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

module.exports = {
    auth,
    db,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    doc,
    setDoc,
    getDoc
};
