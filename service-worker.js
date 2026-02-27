const CACHE_NAME = 'sahabat-usahamu-v19.26'; // Versi dinaikkan agar update
const STATIC_ASSETS = [
  './', 
  './index.html',
  './manifest.json',
  './asset/logokasir.png',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/ai-brain.js'
];

// 1. INSTALL: Simpan Modal Utama Dulu (Static Assets)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Menyimpan Aset Utama...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. ACTIVATE: Bersihkan Sampah Lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    ))
  );
  self.clients.claim();
});

// 3. FETCH: STRATEGI JARING RAKSASA (Dynamic Caching)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 🛑 PENTING: JANGAN SIMPAN REQUEST DATA DATABASE!
  // Biarkan request ke Firestore/Google Auth lewat internet saja (SUDAH SANGAT AMAN)
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('identitytoolkit') || 
      url.href.includes('getAccountInfo')) {
      return; 
  }

  // UNTUK FILE LAIN (HTML, JS, CSS, GAMBAR, LIBRARY):
  event.respondWith(
    caches.match(event.request).then((cachedResp) => {
      if (cachedResp) return cachedResp;

      return fetch(event.request).then((networkResp) => {
        if (!networkResp || networkResp.status !== 200 || networkResp.type === 'error') {
          return networkResp;
        }

        const responseToCache = networkResp.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResp;
      }).catch(() => {
         console.log("Gagal load offline:", event.request.url);
      });
    })
  );
});
