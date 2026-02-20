import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAWi2L7bJewUmTeR_SwGM0sdwjFLdOisCs",
    authDomain: "kasir-128a2.firebaseapp.com",
    projectId: "kasir-128a2",
    storageBucket: "kasir-128a2.firebasestorage.app",
    messagingSenderId: "566922594063",
    appId: "1:566922594063:web:c251d0943a0e20ab51a07a",
    measurementId: "G-NM9MSXY677"
};

// Inisialisasi Firebase & Export agar bisa dipakai di file app.js nanti
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Untuk fitur tambah karyawan oleh Admin tanpa me-logout akun Admin
export const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const secondaryAuth = getAuth(secondaryApp);
