const CACHE_NAME = 'kasir-offline-v3'; // Versi baru biar cache lama terhapus
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/ai-brain.js',
  './asset/logokasir.png',
  './manifest.json',
  
  // --- LIBRARY EKSTERNAL (WAJIB DISIMPAN AGAR TIDAK ERROR SAAT OFFLINE) ---
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',

  // --- FIREBASE SDK (NYAWA APLIKASI) ---
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
];

// 1. INSTALL: Download semua file penting di atas
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⏳ Mendownload aset offline...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE: Hapus cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH: Strategi Cerdas (Cache First, Network Fallback)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 🔥 PENTING: Jangan cache request ke DATABASE Firestore/Google Auth
  // Biarkan request data (bukan file JS) gagal secara alami jika offline
  // Agar logika "navigator.onLine" di app.js bisa menangani error-nya.
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('identitytoolkit') ||
      url.href.includes('getAccountInfo')) {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResp) => {
      // Jika ada di cache, pakai itu (Cepat & Offline Ready)
      if (cachedResp) return cachedResp;

      // Jika tidak ada, ambil dari internet
      return fetch(event.request).catch((err) => {
          // Jika internet mati dan file tidak ada di cache
          console.log("Gagal fetch offline:", event.request.url);
          // Bisa return file offline.html custom jika mau
      });
    })
  );
});
