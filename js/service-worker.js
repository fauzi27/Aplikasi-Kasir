const CACHE_NAME = 'kasir-safe-v2'; // Ganti nama versi biar cache lama terhapus
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/ai-brain.js',
  './asset/logokasir.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// 1. INSTALL (Simpan Aset Penting)
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Paksa aktif segera
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching App Shell...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE (Bersihkan Cache Lama)
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
});

// 3. FETCH (Logika Cerdas: Cache vs Network)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 🔥 BYPASS PENTING: JANGAN CACHE KONEKSI FIREBASE/GOOGLE
  // Ini kunci agar LOGIN TIDAK STUCK. Biarkan request ini langsung ke internet (atau gagal jika offline)
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') || 
      url.hostname.includes('identitytoolkit')) {
      return; // Langsung ke network, jangan diutak-atik SW
  }

  // Untuk file aplikasi (HTML/JS/CSS), ambil dari Cache dulu
  event.respondWith(
    caches.match(event.request).then((cachedResp) => {
      // Jika ada di cache, pakai itu. Jika tidak, ambil dari internet.
      return cachedResp || fetch(event.request).catch((err) => {
          // Jika internet mati dan file tidak ada di cache, biarkan error (atau tampilkan halaman offline custom)
          console.log("Offline & not cached:", event.request.url);
      });
    })
  );
});
