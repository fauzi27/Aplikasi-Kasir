import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// Tambahkan 'enableIndexedDbPersistence' di import ini
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// secondaryAuth dihapus dulu disini kalau tidak dipakai, atau sesuaikan jika ada

// ============================================================
// 🔥 AKTIFKAN MODE OFFLINE (PERSISTENCE)
// ============================================================
enableIndexedDbPersistence(db)
  .then(() => {
      console.log("🔥 Database Offline Mode: AKTIF");
  })
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          // Biasanya terjadi jika membuka banyak tab aplikasi sekaligus
          console.warn('Mode offline gagal: Terlalu banyak tab terbuka.');
      } else if (err.code == 'unimplemented') {
          // Browser jadul tidak mendukung
          console.warn('Browser ini tidak mendukung mode offline.');
      }
  });

export { auth, db, app };