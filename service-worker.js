const CACHE_NAME = 'kasir-super-v10'; // Ganti nama biar refresh total
const ASSETS = [
  './', 
  './index.html',
  './manifest.json',
  './asset/logokasir.png',
  
  // PERHATIKAN PATH INI (Harus pakai nama folder karena SW ada di luar)
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/ai-brain.js',
  
  // Library External (Wajib simpan biar offline jalan)
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  
  // Firebase SDK (Penting untuk login tidak stuck)
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
];

// 1. INSTALL
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching App Shell...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE (Bersih-bersih cache lama)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    ))
  );
  self.clients.claim();
});

// 3. FETCH (Cache First, Network Fallback)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // JANGAN CACHE Request ke Database (Biar login & data transaksi realtime jalan)
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('identitytoolkit') || 
      url.href.includes('getAccountInfo')) {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResp) => {
      // Jika ada di cache (offline), pakai itu. Jika tidak, ambil online.
      return cachedResp || fetch(event.request).catch((err) => {
          console.log("Offline & file not found:", event.request.url);
      });
    })
  );
});
