<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Pesan Makanan Online</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
</head>
<body class="bg-gray-100 font-sans pb-24">

    <header class="bg-blue-600 text-white p-4 sticky top-0 z-50 shadow-md flex justify-between items-center">
        <div>
            <h1 class="text-xl font-bold" id="shop-title">Warung Sahabat</h1>
            <p class="text-xs text-blue-200">Pesan, Bayar QRIS, Tinggal Duduk Manis</p>
        </div>
        <i class="fas fa-utensils text-2xl opacity-80"></i>
    </header>

    <main class="p-4">
        <h2 class="font-bold text-gray-700 mb-3 flex items-center gap-2">
            <i class="fas fa-fire text-orange-500"></i> Menu Kami
        </h2>
        
        <div id="loading-menu" class="text-center mt-10 text-gray-400 text-sm">
            <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500 mb-2"></i><br>Memuat Menu...
        </div>

        <div class="grid grid-cols-2 gap-3" id="menu-container">
            </div>
    </main>

    <div class="fixed bottom-0 w-full bg-white border-t p-3 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-40 flex justify-between items-center pb-safe">
        <div>
            <p class="text-xs text-gray-500 font-bold">Total Pesanan (<span id="cart-count">0</span> item)</p>
            <p class="text-xl font-bold text-blue-600" id="cart-total">Rp 0</p>
        </div>
        <button onclick="showCheckout()" class="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition active:scale-95 flex items-center gap-2">
            Checkout <i class="fas fa-arrow-right"></i>
        </button>
    </div>

    <div id="checkout-modal" class="fixed inset-0 bg-black bg-opacity-80 hidden z-[100] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
        <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col my-auto relative">
            
            <button onclick="closeCheckout()" class="absolute top-3 right-3 text-gray-400 hover:text-red-500 bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center">
                <i class="fas fa-times"></i>
            </button>

            <div class="p-5 border-b text-center">
                <h3 class="font-bold text-lg text-gray-800">Selesaikan Pesanan</h3>
            </div>
            
            <div class="p-5 overflow-y-auto max-h-[60vh]">
                <input type="text" id="cust-name" placeholder="Nama Pemesan" class="w-full p-3 border rounded-lg mb-3 bg-gray-50 outline-none focus:border-blue-500 text-sm font-bold">
                <input type="text" id="cust-table" placeholder="Nomor Meja / Alamat" class="w-full p-3 border rounded-lg mb-4 bg-gray-50 outline-none focus:border-blue-500 text-sm font-bold">

                <div id="receipt-content" class="bg-white p-4 font-mono text-sm border-2 border-dashed border-gray-300 rounded-lg mb-4">
                    </div>

                <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                    <p class="text-xs font-bold text-blue-800 mb-2">SCAN QRIS UNTUK MEMBAYAR</p>
                    <p class="text-2xl font-extrabold text-blue-600 mb-3" id="qris-amount">Rp 0</p>
                    
                    <img id="qris-image" src="" alt="QRIS" class="w-48 h-48 mx-auto rounded-lg shadow-sm border p-2 bg-white object-contain">
                    
                    <p class="text-[10px] text-gray-500 mt-2 mt-2">*Pastikan nominal sesuai sebelum membayar</p>
                </div>
            </div>
            
            <div class="p-4 bg-gray-50 border-t rounded-b-2xl">
                <button onclick="processOrder()" class="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold shadow-lg transition active:scale-95 flex items-center justify-center gap-2">
                    <i class="fab fa-whatsapp text-xl"></i> Konfirmasi & Kirim Bukti
                </button>
            </div>
        </div>
    </div>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

        // ==========================================
        // 🔴 DATA CONFIG BOSKU
        // ==========================================
        const firebaseConfig = {
            apiKey: "AIzaSyAWi2L7bJewUmTeR_SwGM0sdwjFLdOisCs",
            authDomain: "kasir-128a2.firebaseapp.com",
            projectId: "kasir-128a2",
            storageBucket: "kasir-128a2.firebasestorage.app",
            messagingSenderId: "566922594063",
            appId: "1:566922594063:web:c251d0943a0e20ab51a07a",
            measurementId: "G-NM9MSXY677"
        };
        
        // PASTE UID DARI MENU AUTHENTICATION FIREBASE DI BAWAH INI:
        const ID_ADMIN_KASIR = "zy8AUA4PUdhj4LSrxzMgfT270Ut2"; 
        
        const NOMOR_WA_TOKO = "6285939939449"; 
        const LINK_GAMBAR_QRIS = "https://collection.cloudinary.com/dsutaioqw/7c864692b44804a2f1c27aecc23fcbf5"; 
        // ==========================================

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        let menus = [];
        let cart = [];

        // 1. Ambil Menu dari Firebase Kasir Bosku
        const menuCol = collection(db, "users", ID_ADMIN_KASIR, "menus");
        onSnapshot(menuCol, (snapshot) => {
            menus = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            document.getElementById('loading-menu').classList.add('hidden');
            renderMenus();
        }, (error) => {
            console.error("Error mengambil menu:", error);
            document.getElementById('loading-menu').innerHTML = `<p class="text-red-500 text-xs">Gagal memuat menu. Pastikan aturan Firebase (Rules) sudah disetting ke "allow read: if true;"</p>`;
        });

        // Set QRIS Image
        document.getElementById('qris-image').src = LINK_GAMBAR_QRIS;

        function renderMenus() {
            const container = document.getElementById('menu-container');
            container.innerHTML = '';
            
            // Saring menu, hanya tampilkan yang stoknya lebih dari 0 atau yang stoknya tidak dibatasi
            const availableMenus = menus.filter(m => m.stock > 0 || m.stock === undefined);

            if(availableMenus.length === 0) {
                container.innerHTML = '<p class="col-span-2 text-center text-gray-500 text-sm py-10">Maaf, menu sedang tidak tersedia atau toko tutup.</p>';
                return;
            }

            availableMenus.forEach(item => {
                const el = document.createElement('div');
                el.className = 'bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col justify-between';
                el.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 bg-gray-50 border">
                                <i class="fas ${item.icon || 'fa-utensils'} text-lg"></i>
                            </div>
                            <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Tersedia</span>
                        </div>
                        <h3 class="font-bold text-sm text-gray-800 leading-tight mb-1">${item.name}</h3>
                        <p class="text-xs text-blue-600 font-bold mb-3">Rp ${(item.price || 0).toLocaleString('id-ID')}</p>
                    </div>
                    <button onclick="addToCart('${item.id}')" class="w-full bg-blue-50 text-blue-600 border border-blue-200 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition active:scale-95">
                        <i class="fas fa-plus"></i> Tambah
                    </button>
                `;
                container.appendChild(el);
            });
        }

        window.addToCart = function(id) {
            const item = menus.find(m => m.id === id);
            if (!item) return;

            const existing = cart.find(c => c.id === id);
            if (existing) {
                existing.qty++;
            } else {
                cart.push({ id: item.id, name: item.name, price: parseInt(item.price), qty: 1 });
            }
            updateCartUI();
            
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: `${item.name} ditambahkan!`, showConfirmButton: false, timer: 800});
        }

        function updateCartUI() {
            let total = 0;
            let count = 0;
            cart.forEach(item => {
                total += (item.price * item.qty);
                count += item.qty;
            });

            document.getElementById('cart-total').innerText = 'Rp ' + total.toLocaleString('id-ID');
            document.getElementById('cart-count').innerText = count;
            document.getElementById('qris-amount').innerText = 'Rp ' + total.toLocaleString('id-ID');
        }

        window.showCheckout = function() {
            if (cart.length === 0) return Swal.fire('Keranjang Kosong', 'Pilih menu dulu ya kak!', 'warning');
            
            generateReceiptPreview();
            document.getElementById('checkout-modal').classList.remove('hidden');
        }

        window.closeCheckout = function() {
            document.getElementById('checkout-modal').classList.add('hidden');
        }

        function generateReceiptPreview() {
            const container = document.getElementById('receipt-content');
            let total = 0;
            let date = new Date().toLocaleString('id-ID');
            
            let html = `
                <div class="text-center mb-2 border-b border-dashed pb-2">
                    <h2 class="font-bold text-sm">Pesanan Online</h2>
                    <p class="text-[10px] text-gray-500">${date}</p>
                </div>
                <div class="space-y-1 mb-2 border-b border-dashed pb-2">
            `;

            cart.forEach(i => {
                let sub = i.price * i.qty;
                total += sub;
                html += `<div class="flex justify-between text-xs"><span>${i.qty}x ${i.name}</span><span>${sub.toLocaleString()}</span></div>`;
            });

            html += `
                </div>
                <div class="flex justify-between font-bold text-sm"><span>TOTAL (QRIS)</span><span>Rp ${total.toLocaleString('id-ID')}</span></div>
            `;
            
            container.innerHTML = html;
        }

        window.processOrder = function() {
            const nama = document.getElementById('cust-name').value.trim();
            const meja = document.getElementById('cust-table').value.trim();

            if (!nama || !meja) {
                return Swal.fire('Data Kurang', 'Mohon isi Nama dan Nomor Meja/Alamat!', 'error');
            }

            const receipt = document.getElementById('receipt-content');
            receipt.innerHTML = `<div class="text-xs font-bold mb-2 pb-2 border-b border-dashed">Pemesan: ${nama} <br>Meja/Alamat: ${meja}</div>` + receipt.innerHTML;

            let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

            let textWA = `*Pesanan Baru (QRIS)*%0A%0A`;
            textWA += `*Nama:* ${nama}%0A`;
            textWA += `*Meja/Alamat:* ${meja}%0A%0A`;
            textWA += `*Pesanan:*%0A`;
            cart.forEach(i => textWA += `- ${i.qty}x ${i.name} (Rp ${(i.price * i.qty).toLocaleString()})%0A`);
            textWA += `%0A*Total Bayar:* Rp ${total.toLocaleString('id-ID')}%0A%0A`;
            textWA += `_Catatan untuk Penjual: Saya melampirkan gambar Struk & Bukti Transfer QRIS._`;

            let waLink = `https://wa.me/${NOMOR_WA_TOKO}?text=${textWA}`;

            Swal.fire({
                title: 'Menyiapkan Struk...',
                text: 'Struk akan didownload, mohon lampirkan struk ini & bukti transfer QRIS di WhatsApp.',
                timer: 2500,
                showConfirmButton: false,
                allowOutsideClick: false
            });

            html2canvas(receipt, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
                const link = document.createElement('a');
                link.download = `Pesanan_${nama}_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
                
                setTimeout(() => {
                    window.location.href = waLink;
                }, 1000);
            });
        }
    </script>
</body>
</html>
