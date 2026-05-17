import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyAob-Y_lscLcFt-VEPXO7j5_ZSYFAZ2yyA",
  authDomain: "kittachat.firebaseapp.com",
  projectId: "kittachat",
  storageBucket: "kittachat.firebasestorage.app",
  messagingSenderId: "560289961793",
  appId: "1:560289961793:web:39eb22bce0425e6c49f3c0",
  measurementId: "G-T5CTFXQQRH",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
// function login Google
export const loginWithGoogleFirebase = async () => {
  const result = await signInWithPopup(auth, provider);
  return result.user;
};
