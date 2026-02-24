import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// 🔥 1. Tambahkan enableIndexedDbPersistence di sini
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// ==========================================================
// 🔥 2. AKTIFKAN BRANKAS OFFLINE (PENYIMPANAN INTERNAL HP)
// ==========================================================
enableIndexedDbPersistence(db)
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          // Biasanya terjadi jika web dibuka di banyak Tab sekaligus (di Laptop/PC)
          console.warn("Peringatan Offline: Tab aplikasi terbuka ganda.");
      } else if (err.code == 'unimplemented') {
          // Jika browser HP sangat jadul dan tidak mendukung memori internal
          console.warn("Browser ini tidak mendukung fitur penyimpanan offline permanen.");
      }
  });
// ==========================================================

// Untuk fitur tambah karyawan oleh Admin tanpa me-logout akun Admin
export const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const secondaryAuth = getAuth(secondaryApp);
