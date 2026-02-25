import { auth, db, secondaryAuth } from './firebase.js?v=18.06';
import { generateContext, askGroqAI } from './ai-brain.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// STATE
let menus = [];
let categories = [];
let transactions = [];
let cart = [];
let currentCategory = 'all';
let currentViewedTrx = null;
let calcValue = "0";
let manualSessionCart = [];
let reportFilterMode = 'today';
let reportFilterDate = null;
let reportPaymentFilter = 'all'; 
let sortMode = 'default'; 
let editingTransactionId = null; 
let currentUser = null;
let businessData = {};
let stockSortMode = 'default';
let adminSortMode = 'default';
let filteredTrx = [];
let queryFilterMode = 'none';
let currentUserRole = 'admin'; 
let shopOwnerId = null; 

// --- AUTH LISTENERS (VERSI ANTI-MACET SAAT OFFLINE) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // 1. SIAPKAN WADAH DATA
        let loadedFrom = "server"; // Debugging flag
        businessData = {}; // Reset dulu

        // 2. LOGIKA CERDAS: AMBIL DATA PROFIL
        try {
            if (navigator.onLine) {
                // A. JIKA ONLINE: Ambil data segar dari Server
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    businessData = docSnap.data();
                    // PENTING: Simpan salinan ke memori HP untuk jaga-jaga kalau offline nanti
                    localStorage.setItem('cached_user_profile', JSON.stringify(businessData));
                    
                    // Cek Owner jika user adalah kasir
                    shopOwnerId = businessData.ownerId || user.uid; 
                    if (businessData.role === 'kasir') {
                        // Ambil data owner juga
                        const ownerSnap = await getDoc(doc(db, "users", shopOwnerId));
                        if(ownerSnap.exists()) {
                            const ownerData = ownerSnap.data();
                            // Gabungkan data toko owner ke cache
                            businessData.shopName = ownerData.name;
                            businessData.shopAddress = ownerData.address;
                            localStorage.setItem('cached_user_profile', JSON.stringify(businessData));
                        }
                    }
                }
            } else {
                // B. JIKA OFFLINE: Ambil dari saku (LocalStorage)
                // Jangan panggil getDoc() karena pasti error/stuck tanpa persistence
                loadedFrom = "cache";
                const cached = localStorage.getItem('cached_user_profile');
                if (cached) {
                    businessData = JSON.parse(cached);
                    console.log("Offline Mode: Menggunakan profil tersimpan.");
                } else {
                    // Kalau offline DAN tidak ada cache (kasus langka: baru install langsung offline)
                    Swal.fire("Offline", "Anda butuh internet untuk login pertama kali.", "warning");
                    return; 
                }
            }
        } catch (e) {
            console.error("Gagal load profil:", e);
            // Fallback terakhir: Coba baca cache kalau server error
            const cached = localStorage.getItem('cached_user_profile');
            if (cached) businessData = JSON.parse(cached);
        }

        // 3. SETTING VARIABEL GLOBAL
        currentUserRole = businessData.role || 'admin';
        shopOwnerId = businessData.ownerId || user.uid; 
        
        // 4. ATUR TAMPILAN (UI)
        // Gunakan data dari businessData (entah dari server atau cache)
        if (currentUserRole === 'kasir') {
            window.shopNameAsli = businessData.shopName || 'SAHABAT USAHAMU';
            window.shopAddressAsli = businessData.shopAddress || 'Nusadua Bali';
        } else {
            window.shopNameAsli = businessData.name || 'SAHABAT USAHAMU';
            window.shopAddressAsli = businessData.address || 'Nusadua Bali';
        }
        
        updateBusinessNameUI();

        // Atur menu navigasi sesuai Role
        const navDisplay = currentUserRole === 'kasir' ? 'none' : 'flex';
        ['view-admin', 'view-database', 'view-settings'].forEach(id => {
            const el = document.querySelector(`[onclick="navigate('${id}')"]`);
            if(el) el.style.display = navDisplay;
        });

        // 5. BUKA PINTU LOBI (PENTING: Ini yang bikin stuck kalau code di atas error)
        document.getElementById('view-auth').classList.remove('show'); 
        document.getElementById('view-auth').classList.add('hide');
        document.getElementById('view-lobby').classList.remove('hide'); 
        document.getElementById('view-lobby').classList.add('show');
        
        // 6. LOAD DATA LAIN (Menu & Transaksi)
        // initUserData sudah kita modifikasi sebelumnya untuk handle local storage
        initUserData(shopOwnerId); 
        if (localStorage.getItem('darkMode') === 'true') toggleDarkMode();

    } else {
        // BELUM LOGIN
        currentUser = null;
        shopOwnerId = null;
        window.shopNameAsli = null;
        document.getElementById('view-auth').classList.remove('hide'); 
        document.getElementById('view-auth').classList.add('show');
        document.getElementById('view-lobby').classList.add('hide');
    }
});

// --- DATA INIT ---
function initUserData(uid) {
    const catCol = collection(db, "users", uid, "categories");
    onSnapshot(catCol, (snapshot) => {
        // 🔥 Langsung ambil data, JANGAN buat kategori default otomatis
        categories = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        renderCategoryTiles(); 
    });

    const menuCol = collection(db, "users", uid, "menus");
        onSnapshot(menuCol, (snapshot) => {
        menus = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(!document.getElementById('view-cashier').classList.contains('hide')) renderMenuGrid();
        if(!document.getElementById('view-admin').classList.contains('hide')) renderAdminList();
        if(!document.getElementById('view-stock').classList.contains('hide')) renderStockList();
        document.getElementById('loading-menu').classList.add('hidden');
    });

    const trxCol = collection(db, "users", uid, "transactions");
    const qTrx = query(trxCol, orderBy("timestamp", "desc"));
    onSnapshot(qTrx, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(!document.getElementById('view-database').classList.contains('hide')) renderTransactions();
    });
}

// --- AUTH FUNCTIONS ---
window.toggleAuth = function(mode) {
    if(mode === 'register') {
        document.getElementById('form-login').classList.add('hidden');
        document.getElementById('form-register').classList.remove('hidden');
    } else {
        document.getElementById('form-login').classList.remove('hidden');
        document.getElementById('form-register').classList.add('hidden');
    }
}

window.togglePass = function(id) {
    const input = document.getElementById(id);
    input.type = input.type === "password" ? "text" : "password";
}

window.doLogin = function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    if(!email || !pass) return Swal.fire('Error', 'Isi email dan password', 'error');
    
    Swal.fire({title: 'Masuk...', didOpen: () => Swal.showLoading()});
    signInWithEmailAndPassword(auth, email, pass)
        .then(() => Swal.close())
        .catch((error) => handleAuthError(error));
}

window.doRegister = function() {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const name = document.getElementById('reg-business-name').value;
    const address = document.getElementById('reg-address').value;

    if(!email || !pass || !name) return Swal.fire('Error', 'Data usaha dan login wajib diisi', 'error');

    Swal.fire({title: 'Mendaftar...', didOpen: () => Swal.showLoading()});
    createUserWithEmailAndPassword(auth, email, pass)
        .then(async (userCredential) => {
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                address: address,
                email: email,
                role: 'admin',
                ownerId: user.uid,
                joinedAt: Date.now()
            });
            Swal.fire('Berhasil', 'Akun dibuat! Selamat datang.', 'success');
        })
        .catch((error) => handleAuthError(error));
}

window.tambahKaryawan = async function() {
    if (currentUserRole !== 'admin') return Swal.fire('Akses Ditolak', 'Hanya Admin yang bisa menambah karyawan', 'error');

    const nama = document.getElementById('new-emp-name').value;
    const email = document.getElementById('new-emp-email').value;
    const pass = document.getElementById('new-emp-pass').value;
    const role = document.getElementById('new-emp-role').value;

    if(!email || !nama || !pass) return Swal.fire('Error', 'Semua kolom wajib diisi!', 'error');

    Swal.fire({title: 'Mendaftarkan Karyawan...', didOpen: () => Swal.showLoading()});
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
        const newUser = userCredential.user;

        await setDoc(doc(db, "users", newUser.uid), {
            name: nama,
            email: email,
            role: role,
            ownerId: shopOwnerId,
            joinedAt: Date.now()
        });

        await signOut(secondaryAuth);
        Swal.fire('Sukses', `Karyawan ${nama} berhasil ditambahkan!`, 'success');
        
        document.getElementById('new-emp-name').value = '';
        document.getElementById('new-emp-email').value = '';
        document.getElementById('new-emp-pass').value = '';
    } catch (error) {
        handleAuthError(error);
    }
}

function handleAuthError(error) {
    let msg = error.message;
    if(error.code === 'auth/wrong-password') msg = 'Password salah.';
    if(error.code === 'auth/user-not-found') msg = 'Email tidak terdaftar.';
    if(error.code === 'auth/email-already-in-use') msg = 'Email sudah digunakan.';
    if(error.code === 'auth/weak-password') msg = 'Password terlalu lemah (min 6 karakter).';
    if(error.code === 'auth/invalid-email') msg = 'Format email salah.';
    if(error.code === 'auth/configuration-not-found') msg = 'Login Email belum aktif di Firebase Console.';
    Swal.fire('Gagal', msg, 'error');
}

window.doLogout = function() {
    Swal.fire({
        title: 'Keluar?',
        text: "Anda harus login lagi nanti",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Keluar'
    }).then((result) => {
        if (result.isConfirmed) {
            signOut(auth).then(() => {
                location.reload(); 
            });
        }
    });
}

// --- WINDOW FUNCTIONS ---
window.navigate = function(viewId) {
    document.querySelectorAll('.page-container').forEach(el => {
        if(el.id !== 'view-auth') {
            el.classList.remove('show');
            el.classList.add('hide');
        }
    });
    document.getElementById(viewId).classList.remove('hide');
    document.getElementById(viewId).classList.add('show');

    if(viewId === 'view-cashier') renderMenuGrid();
    if(viewId === 'view-admin') { renderCategoryTiles(); renderAdminList(); }
    if(viewId === 'view-database') { 
        window.setReportFilter('today');
    }
    if(viewId === 'view-stock') { renderCategoryTiles(); renderStockList(); } 
    if(viewId === 'view-settings') { 
        document.getElementById('edit-business-name').value = window.shopNameAsli || businessData.name || ''; 
        document.getElementById('edit-business-address').value = window.shopAddressAsli || businessData.address || ''; 
    }
    if(viewId !== 'view-calculator') window.clearCalc();
    
    if (viewId === 'view-lobby' && editingTransactionId) {
        if(!confirm("Batalkan edit transaksi?")) {
            window.navigate('view-cashier'); 
            return;
        }
        exitEditMode();
    }
}

// --- LOGIKA KATEGORI DINAMIS ---
function renderCategoryTiles() {
    const cashierTabs = document.getElementById('cashier-cat-tabs');
    const adminTabs = document.getElementById('admin-cat-tiles');
    const stockTabs = document.getElementById('stock-cat-tiles'); 
    
    // 1. HTML Normal (Untuk Kasir & Stok)
    let normalHtml = `<button onclick="window.setCategory('all')" class="category-btn ${currentCategory === 'all' ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">Semua</button>`;
    
    categories.forEach(cat => {
        const isActive = currentCategory === cat.name.toLowerCase();
        normalHtml += `<button onclick="window.setCategory('${cat.name.toLowerCase()}')" class="category-btn ${isActive ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">${cat.name}</button>`;
    });

    if(cashierTabs) cashierTabs.innerHTML = normalHtml;
    if(stockTabs) stockTabs.innerHTML = normalHtml; 

    // 2. HTML KHUSUS ADMIN (Tambah Tombol + dan Tombol X)
    if(adminTabs) {
        let adminHtml = `<div class="flex gap-2 items-center w-full">`; 
        
        // Bagian Kiri: Tombol [+] dan [X]
        adminHtml += `
            <div class="flex gap-1 border-r border-gray-300 pr-2 flex-none">
                <button onclick="window.addCategoryPrompt()" class="px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200 hover:bg-green-200 transition active:scale-95"><i class="fas fa-plus"></i></button>
                <button onclick="window.showDeleteCategoryModal()" class="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 transition active:scale-95"><i class="fas fa-times"></i></button>
            </div>
        `;

        // Bagian Kanan: Daftar Kategori
        adminHtml += `<div class="flex gap-2 overflow-x-auto pb-1 flex-1">`;
        adminHtml += `<button onclick="window.setCategory('all')" class="category-btn ${currentCategory === 'all' ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">Semua</button>`;
        
        categories.forEach(cat => {
            const isActive = currentCategory === cat.name.toLowerCase();
            adminHtml += `<button onclick="window.setCategory('${cat.name.toLowerCase()}')" class="category-btn ${isActive ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">${cat.name}</button>`;
        });
        
        adminHtml += `</div></div>`; // Penutup div
        adminTabs.innerHTML = adminHtml;
    }
}

window.setCategory = function(cat) {
    currentCategory = cat;
    renderCategoryTiles(); 
    renderMenuGrid();
    renderAdminList(); 
    renderStockList(); 
    
    const adminHidden = document.getElementById('selected-admin-cat');
    if(adminHidden && cat !== 'all') adminHidden.value = cat;
}

window.addCategoryPrompt = async function() {
    const { value: catName } = await Swal.fire({ title: 'Tambah Kategori', input: 'text', showCancelButton: true });
    if (catName) {
        try {
            await addDoc(collection(db, "users", shopOwnerId, "categories"), { name: catName, id: catName.toLowerCase() });
            Swal.fire('Sukses', 'Kategori ditambahkan', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Terjadi kesalahan: ' + (e.message || 'Unknown'), 'error');
        }
    }
}

// ============================================================
// 🔥 FITUR HAPUS KATEGORI (MODAL POP-UP TOMBOL X)
// ============================================================
window.showDeleteCategoryModal = function() {
    if (categories.length === 0) return Swal.fire('Info', 'Tidak ada kategori untuk dihapus.', 'info');

    // Buat HTML List Kategori
    let listHtml = '<div class="flex flex-col gap-2 max-h-60 overflow-y-auto mt-2 text-left">';
    
    categories.forEach(cat => {
        listHtml += `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                <span class="text-sm font-semibold text-gray-700">${cat.name}</span>
                <button onclick="window.executeDeleteCategory('${cat.uid}', '${cat.name}')" class="bg-red-500 text-white w-8 h-8 rounded flex items-center justify-center hover:bg-red-600 active:scale-95 transition">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        `;
    });
    listHtml += '</div>';

    Swal.fire({
        title: 'Hapus Kategori',
        html: listHtml,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: { popup: 'rounded-xl' }
    });
};

// Eksekusi hapus dari dalam modal
window.executeDeleteCategory = async function(uid, name) {
    const res = await Swal.fire({
        title: 'Yakin?',
        text: `Hapus kategori "${name}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'Batal',
        confirmButtonText: 'Ya, Hapus'
    });

    if (res.isConfirmed) {
        Swal.fire({title: 'Menghapus...', didOpen: () => Swal.showLoading()});
        try {
            await deleteDoc(doc(db, "users", shopOwnerId, "categories", uid));
            Swal.fire({icon: 'success', title: 'Terhapus!', timer: 1000, showConfirmButton: false});
            
            // Pindahkan tampilan ke "Semua" jika kategori yg dihapus sedang aktif
            if (currentCategory === name.toLowerCase()) window.setCategory('all');
            
            // Refresh modal dengan memanggilnya lagi (kalau mau hapus yang lain)
            setTimeout(() => { window.showDeleteCategoryModal(); }, 1200);

        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Gagal hapus: ' + e.message, 'error');
        }
    } else {
        // Buka lagi modal list kalau batal hapus
        window.showDeleteCategoryModal();
    }
};

// --- RENDER MENU GRID ---
function renderMenuGrid() {
    const container = document.getElementById('menu-grid-container');
    container.innerHTML = '';
    
    const searchVal = document.getElementById('cashier-search') ? document.getElementById('cashier-search').value.toLowerCase() : '';
    let filteredMenus = menus.filter(m => m.name.toLowerCase().includes(searchVal));
    filteredMenus = currentCategory === 'all' ? filteredMenus : filteredMenus.filter(m => (m.category || '').toLowerCase() === currentCategory);
    
    let favorites = filteredMenus.filter(m => m.favorite);
    let others = filteredMenus.filter(m => !m.favorite);
    favorites = getSortedMenus(favorites);
    others = getSortedMenus(others);
    filteredMenus = favorites.concat(others);

    if(filteredMenus.length === 0) {
         container.innerHTML = '<p class="col-span-3 text-center text-gray-400 mt-10 text-xs">Kosong</p>';
        return;
    }

    filteredMenus.forEach(item => {
        const el = document.createElement('div');
        const stockDisplay = item.stock !== undefined ? `<span class="text-[9px] ${item.stock < 5 ? 'text-red-500 font-bold' : 'text-gray-400'} block mt-0.5">Stok: ${item.stock}</span>` : '';
        
        // 🔥 PERBAIKAN 1: Hapus tinggi mati (h-32), ganti dengan min-h-[130px] agar bisa menyesuaikan diri
        // 🔥 PERBAIKAN 2: Gunakan justify-between agar elemen tersebar rapi dari atas ke bawah
        el.className = `menu-card ${item.color || 'bg-white'} p-2 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-between cursor-pointer min-h-[130px] text-center transition active:scale-95`;
        el.onclick = () => window.addToCart(item.id);
        
        let mediaHtml = `<div class="w-11 h-11 flex items-center justify-center mb-1 flex-none"><i class="fas ${item.icon || 'fa-utensils'} text-2xl text-gray-700 opacity-70"></i></div>`;
        if (item.image) {
            const compressedUrl = item.image.replace('/upload/', '/upload/w_150,h_150,c_fill,q_auto,f_auto/');
            mediaHtml = `<img src="${compressedUrl}" alt="${item.name}" class="w-11 h-11 object-cover rounded-full shadow-sm mb-1 border border-gray-200 flex-none">`;
        }

        // 🔥 PERBAIKAN 3: Struktur HTML dipecah jadi 3 blok yang tidak akan saling bertabrakan
        el.innerHTML = `
            ${mediaHtml}
            <div class="flex-1 flex flex-col justify-center w-full my-0.5">
                <h4 class="font-bold text-[10px] leading-snug text-gray-800 break-words">${item.name}</h4>
            </div>
            <div class="w-full flex-none mt-auto pt-1 border-t border-gray-50 border-dashed">
                <p class="text-[11px] text-blue-700 font-extrabold">Rp ${(item.price || 0).toLocaleString('id-ID')}</p>
                ${stockDisplay}
            </div>
        `;
        container.appendChild(el);
    });
}


// --- LOGIKA ADD TO CART ---
window.addToCart = function(itemId) {
    const item = menus.find(m => m.id === itemId);
    if(!item) return;
    
    if(item.stock !== undefined && item.stock <= 0) {
        Swal.fire({toast: true, position: 'center', icon: 'warning', title: 'Stok Habis/Minus!', timer: 800, showConfirmButton: false});
    }

    const existing = cart.find(c => c.id === item.id);
    if(existing) {
        existing.qty++;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: parseInt(item.price),
            qty: 1,
            isManual: false
        });
    }
    renderCart();
}

// --- RENDER CART ---
function renderCart() {
    const list = document.getElementById('cart-list');
    const totalEl = document.getElementById('cart-total');
    list.innerHTML = '';
    
    let total = 0;
    if(cart.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs mt-4 italic">Belum ada pesanan</p>';
        totalEl.innerText = 'Rp 0';
        return;
    }
    
    cart.forEach((item, index) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center mb-2 bg-white p-2 rounded shadow-sm border border-gray-100';
        
        let itemNameHTML = `<div class="font-bold text-xs text-gray-800">${item.name}</div>`;
        if(item.isManual) itemNameHTML = `<div class="font-bold text-xs text-teal-700"><i class="fas fa-edit mr-1"></i>${item.name}</div>`;

        row.innerHTML = `
            <div>
                ${itemNameHTML}
                <div class="text-[10px] text-gray-500">${item.qty} x ${item.price.toLocaleString('id-ID')}</div>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-gray-700">Rp ${subtotal.toLocaleString('id-ID')}</span>
                <div class="flex items-center bg-gray-100 rounded">
                     <button onclick="window.updateQty(${index}, -1)" class="w-8 h-8 text-red-500 text-sm font-bold hover:bg-gray-200 rounded active:bg-gray-300">-</button>
                     <button onclick="window.updateQty(${index}, 1)" class="w-8 h-8 text-blue-500 text-sm font-bold hover:bg-gray-200 rounded active:bg-gray-300">+</button>
                </div>
            </div>
        `;
        list.appendChild(row);
    });
    totalEl.innerText = 'Rp ' + total.toLocaleString('id-ID');
}

// --- MANAJEMEN STOK ---
window.renderStockList = function() {
    const list = document.getElementById('stock-list');
    const searchVal = document.getElementById('stock-search').value.toLowerCase();
    list.innerHTML = '';
    
    let filtered = menus.filter(m => m.name.toLowerCase().includes(searchVal));
    filtered = currentCategory === 'all' ? filtered : filtered.filter(m => (m.category || '').toLowerCase() === currentCategory);
    
    let favorites = filtered.filter(m => m.favorite);
    let others = filtered.filter(m => !m.favorite);
    if(stockSortMode === 'name_asc') {
        favorites.sort((a,b) => a.name.localeCompare(b.name));
        others.sort((a,b) => a.name.localeCompare(b.name));
    } else if(stockSortMode === 'stock_low') {
        favorites.sort((a,b) => (a.stock||0) - (b.stock||0));
        others.sort((a,b) => (a.stock||0) - (b.stock||0));
    } else if(stockSortMode === 'stock_high') {
        favorites.sort((a,b) => (b.stock||0) - (a.stock||0));
        others.sort((a,b) => (b.stock||0) - (a.stock||0));
    }
    filtered = favorites.concat(others);

    if(filtered.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-xs">Menu tidak ditemukan</p>';
        return;
    }

    filtered.forEach(item => {
        const el = document.createElement('div');
        el.className = 'bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center';
        const currentStock = item.stock !== undefined ? item.stock : 0;
        
        el.innerHTML = `
            <div>
                <div class="font-bold text-gray-800">${item.name}</div>
                <div class="text-xs text-gray-500">${item.category}</div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.promptStockChange('${item.id}', 'sub')" class="w-8 h-8 bg-red-100 text-red-600 rounded flex items-center justify-center font-bold active:bg-red-200">-</button>
                <button onclick="window.promptStockChange('${item.id}', 'set')" class="min-w-[40px] px-2 h-8 bg-gray-50 border rounded text-center font-bold text-sm text-gray-700">${currentStock}</button>
                <button onclick="window.promptStockChange('${item.id}', 'add')" class="w-8 h-8 bg-green-100 text-green-600 rounded flex items-center justify-center font-bold active:bg-green-200">+</button>
            </div>
        `;
        list.appendChild(el);
    });
}

window.promptStockChange = async function(docId, type) {
    let title = 'Ubah Stok';
    let inputLabel = '';
    
    if (type === 'add') { title = 'Tambah Stok'; inputLabel = 'Jumlah penambahan'; }
    if (type === 'sub') { title = 'Kurangi Stok'; inputLabel = 'Jumlah pengurangan'; }
    if (type === 'set') { title = 'Atur Stok'; inputLabel = 'Masukkan jumlah stok baru'; }

    const { value: quantity } = await Swal.fire({
        title: title,
        input: 'number',
        inputLabel: inputLabel,
        showCancelButton: true,
        inputValidator: (value) => {
            if (!value) return 'Harus diisi!';
        }
    });

    if (quantity) {
        const qty = parseInt(quantity);
        const item = menus.find(m => m.id === docId);
        let newStock = item.stock || 0;

        if (type === 'add') newStock += qty;
        if (type === 'sub') newStock -= qty;
        if (type === 'set') newStock = qty;

        try {
            await setDoc(doc(db, "users", shopOwnerId, "menus", docId), { stock: newStock }, { merge: true });
            Swal.fire({icon: 'success', title: 'Stok Terupdate', timer: 1000, showConfirmButton: false});
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Terjadi kesalahan: ' + (e.message || 'Unknown'), 'error');
        }
    }
}

window.toggleStockSort = function() {
    const label = document.getElementById('stock-sort-label');
    if(stockSortMode === 'default') { stockSortMode = 'name_asc'; label.innerText = "Nama A-Z"; }
    else if(stockSortMode === 'name_asc') { stockSortMode = 'stock_low'; label.innerText = "Stok Rendah"; }
    else if(stockSortMode === 'stock_low') { stockSortMode = 'stock_high'; label.innerText = "Stok Tinggi"; }
    else { stockSortMode = 'default'; label.innerText = "Default"; }
    renderStockList();
}

// --- FITUR EDIT TRANSAKSI ---
window.editTransaction = function() {
    if(!currentViewedTrx) return;
    editingTransactionId = currentViewedTrx.id;
    
    cart = currentViewedTrx.items.map(item => ({
        id: item.id || ('manual_' + Date.now()),
        name: item.name,
        price: parseInt(item.price),
        qty: parseInt(item.qty),
        isManual: item.isManual || false
    }));
    
    document.getElementById('buyer-name').value = currentViewedTrx.buyer;
    
    document.getElementById('edit-mode-indicator').classList.remove('hidden');
    document.getElementById('btn-main-pay').innerHTML = 'Simpan Revisi <i class="fas fa-save ml-1"></i>';
    document.getElementById('btn-main-pay').classList.replace('bg-green-500', 'bg-yellow-500');
    document.getElementById('btn-main-pay').classList.replace('hover:bg-green-600', 'hover:bg-yellow-600');
    
    window.closeBillModal();
    window.navigate('view-cashier');
    renderCart();
    
    Swal.fire({ title: 'Mode Edit', text: 'Silakan revisi pesanan', icon: 'info', timer: 1500, showConfirmButton: false });
}

function exitEditMode() {
    editingTransactionId = null;
    document.getElementById('edit-mode-indicator').classList.add('hidden');
    document.getElementById('btn-main-pay').innerHTML = 'Bayar <i class="fas fa-chevron-right text-[10px]"></i>';
    document.getElementById('btn-main-pay').classList.replace('bg-yellow-500', 'bg-green-500');
    document.getElementById('btn-main-pay').classList.replace('hover:bg-yellow-600', 'hover:bg-green-600');
    document.getElementById('buyer-name').value = '';
    cart = [];
    renderCart();
}

// --- PROCESS PAYMENT (VERSI OPTIMISTIC UI - SUPER NGEBUT 0 DETIK) ---
window.processPayment = async function(method) {
    // 1. SIAPKAN DATA AWAL
    const buyer = document.getElementById('buyer-name').value.trim() || "Pelanggan";
    let total = 0;
    cart.forEach(i => total += ((parseInt(i.price)||0) * (parseInt(i.qty)||0)));
    
    let paidAmount = 0;
    let changeAmount = 0;
    let remaining = 0;

    // 2. INPUT JUMLAH UANG
    if (method === 'TUNAI') {
        const { value: money } = await Swal.fire({
            title: `Total: Rp ${total.toLocaleString('id-ID')}`,
            input: 'number',
            inputLabel: 'Masukkan Jumlah Uang Diterima (atau klik Uang Pas)',
            showCancelButton: true,
            confirmButtonText: 'Proses',
            showDenyButton: true,
            denyButtonText: 'Uang Pas',
            inputValidator: (value) => { if (!value) return 'Harus diisi!'; }
        });

        if (money === false) { paidAmount = total; } 
        else if (money) { paidAmount = parseInt(money); } 
        else { return; }

        if (paidAmount > total) { changeAmount = paidAmount - total; } 
        else if (paidAmount < total) {
            method = 'HUTANG'; 
            remaining = total - paidAmount;
            // Peringatan ini tetap ada karena butuh persetujuan kasir
            await Swal.fire('Info', `Uang kurang, dicatat sebagai Hutang dengan sisa Rp ${remaining.toLocaleString()}`, 'info');
        }
    } else if (method === 'QRIS') {
        paidAmount = total;
    } else if (method === 'HUTANG') {
        remaining = total;
    }

    // 🔥 HAPUS LOADING SWAL DI SINI (Biar tidak ada jeda muter-muter)

    try {
        // A. UPDATE STOK SECARA INSTAN (Fire & Forget)
        if (!editingTransactionId) {
            for (const item of cart) {
                if (!item.isManual && item.id) {
                    const menuItem = menus.find(m => m.id === item.id);
                    if (menuItem) {
                        // 1. Kurangi di UI Lokal langsung
                        menuItem.stock = (menuItem.stock || 0) - item.qty;
                        
                        // 2. Lempar ke background tanpa await!
                        const stockRef = doc(db, "users", shopOwnerId, "menus", item.id);
                        setDoc(stockRef, { stock: menuItem.stock }, { merge: true }); 
                    }
                }
            }
        }

        // B. SIAPKAN DATA TRANSAKSI
        const trxData = {
            buyer: buyer,
            items: cart,
            total: total,
            method: method,
            paid: paidAmount, 
            change: changeAmount, 
            partialPaid: paidAmount,
            remaining: remaining || (method === 'HUTANG' ? total : 0),
            timestamp: Date.now(),
            date: new Date().toLocaleString('id-ID'),
            operatorName: businessData.name || 'Admin',
            operatorUid: currentUser.uid,
            operatorRole: currentUserRole
        };

        // C. KIRIM KE DATABASE (TANPA AWAIT - JALAN DI LATAR BELAKANG)
        if (editingTransactionId) {
            // --- MODE EDIT ---
            delete trxData.timestamp; 
            delete trxData.date;
            trxData.updatedAt = Date.now();
            
            const docRef = doc(db, "users", shopOwnerId, "transactions", editingTransactionId);
            
            // Lempar update ke background
            setDoc(docRef, trxData, { merge: true }); 
            
            Swal.fire({icon: 'success', title: 'Revisi Disimpan', timer: 1200, showConfirmButton: false});
            exitEditMode();

        } else {
            // --- MODE TRANSAKSI BARU ---
            const colRef = collection(db, "users", shopOwnerId, "transactions");
            
            // 🔥 Lempar ke Firebase tanpa menunggu (Background Upload)
            addDoc(colRef, trxData); 
            
            // 🔥 Karena tidak tunggu server, kita suntikkan data palsu ke UI agar langsung tampil di Laporan
            const optimisticTrx = { id: 'local_' + Date.now(), ...trxData };
            transactions.unshift(optimisticTrx); 
            if(document.getElementById('view-database').classList.contains('show')) {
                 renderTransactions(); 
            }

            // Tampilkan Notif Berhasil Sekejap
            let msg = method === 'TUNAI' ? `Kembali: Rp ${changeAmount.toLocaleString('id-ID')}` : 'Berhasil Disimpan';
            Swal.fire({
                icon: 'success', 
                title: 'Transaksi Sukses', 
                text: msg,
                timer: 1500, 
                showConfirmButton: false // Hilangkan tombol OK biar kasir bisa langsung klik pesanan baru
            });
            
            // Instan bersihkan keranjang
            cart = [];
            document.getElementById('buyer-name').value = '';
            renderCart();
        }

        window.closeBillModal();
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Sistem gagal mencatat: ' + (e.message || 'Unknown'), 'error');
    }
}


// --- HELPER FUNCTIONS ---
window.updateQty = function(idx, change) {
    cart[idx].qty += change;
    if(cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
}

window.clearCart = function() {
    if(cart.length > 0) {
        if(confirm("Hapus semua pesanan?")) {
            cart = [];
            document.getElementById('buyer-name').value = '';
            renderCart();
        }
    } else {
        cart = [];
        renderCart();
    }
}

window.toggleSort = function() {
    const label = document.getElementById('sort-label');
    if(sortMode === 'default') { sortMode = 'name_asc'; label.innerText = "Nama A-Z"; }
    else if(sortMode === 'name_asc') { sortMode = 'price_high'; label.innerText = "Termahal"; }
    else if(sortMode === 'price_high') { sortMode = 'price_low'; label.innerText = "Termurah"; }
    else { sortMode = 'default'; label.innerText = "Default"; }
    renderMenuGrid();
}

window.toggleAdminSort = function() {
    const label = document.getElementById('admin-sort-label');
    if(adminSortMode === 'default') { adminSortMode = 'name_asc'; label.innerText = "Nama A-Z"; }
    else if(adminSortMode === 'name_asc') { adminSortMode = 'price_high'; label.innerText = "Termahal"; }
    else if(adminSortMode === 'price_high') { adminSortMode = 'price_low'; label.innerText = "Termurah"; }
    else { adminSortMode = 'default'; label.innerText = "Default"; }
    renderAdminList();
}

function getSortedMenus(menuList) {
    let sorted = [...menuList];
    if(sortMode === 'name_asc') sorted.sort((a,b) => a.name.localeCompare(b.name));
    if(sortMode === 'price_high') sorted.sort((a,b) => b.price - a.price);
    if(sortMode === 'price_low') sorted.sort((a,b) => a.price - b.price);
    return sorted;
}
// ==========================================
// 🌟 MESIN UPLOAD CLOUDINARY
// ==========================================
window.previewImage = function(input, previewId) {
    const previewContainer = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewContainer.innerHTML = `<img src="${e.target.result}" class="h-16 w-auto rounded shadow-sm object-cover mx-auto">`;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

window.uploadToCloudinary = async function(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "menu_warung"); // Preset Unsigned bosku

    try {
        // Tembak langsung ke Cloudinary dsutaioqw
        const response = await fetch("https://api.cloudinary.com/v1_1/dsutaioqw/image/upload", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        return data.secure_url; // Mengembalikan Link URL gambar asli
    } catch (error) {
        console.error("Error upload Cloudinary:", error);
        throw new Error("Gagal mengunggah gambar ke server media");
    }
}

window.addNewMenu = async function() {
    const name = document.getElementById('new-menu-name').value;
    const price = document.getElementById('new-menu-price').value;
    const stock = document.getElementById('new-menu-stock').value;
    const imageInput = document.getElementById('new-menu-image'); // Tangkap file foto
    let cat = document.getElementById('selected-admin-cat').value;
    if(!cat || cat === 'all') cat = 'makanan';

    if(!name || !price) return Swal.fire('Error', 'Lengkapi data nama dan harga', 'error');

    let icon = 'fa-utensils';
    let color = 'bg-white';
    if(cat.includes('minum')) { icon = 'fa-glass-water'; color = 'bg-blue-50'; }
    if(cat.includes('camil')) { icon = 'fa-bread-slice'; color = 'bg-yellow-50'; }
    
    Swal.fire({title: 'Menyimpan Menu...', text: 'Mengunggah foto & data...', didOpen: () => Swal.showLoading()});
    try {
        let imageUrl = ""; 
        
        // JIKA ADA FOTO YANG DIPILIH, UPLOAD DULU!
        if (imageInput.files && imageInput.files[0]) {
            imageUrl = await window.uploadToCloudinary(imageInput.files[0]);
        }

        // SIMPAN KE FIREBASE
        await addDoc(collection(db, "users", shopOwnerId, "menus"), {
            name: name, 
            price: parseInt(price), 
            category: cat, 
            icon: icon, 
            color: color, 
            stock: parseInt(stock) || 0, 
            favorite: false,
            image: imageUrl // Menyimpan URL gambar dari Cloudinary
        });

        // RESET FORM TAMPILAN
        document.getElementById('new-menu-name').value = '';
        document.getElementById('new-menu-price').value = '';
        imageInput.value = '';
        document.getElementById('preview-add-img').innerHTML = `
            <i class="fas fa-cloud-upload-alt text-2xl text-blue-400 mb-1"></i>
            <span class="text-xs text-gray-500 font-bold">Tap untuk Upload Foto Menu</span>
        `;
        
        Swal.fire({icon: 'success', title: 'Tersimpan', timer: 1000, showConfirmButton: false});
    } catch (e) { 
        console.error(e);
        Swal.fire('Error', 'Terjadi kesalahan: ' + (e.message || 'Unknown'), 'error');
    }
}

window.deleteMenu = async function(docId) {
    if(confirm('Hapus menu ini permanen?')) {
        try {
            await deleteDoc(doc(db, "users", shopOwnerId, "menus", String(docId)));
            Swal.fire({icon: 'success', title: 'Terhapus', timer: 1000, showConfirmButton: false});
        } catch(e) {
            Swal.fire('Error', 'Gagal hapus: ' + e.message, 'error');
        }
    }
}

window.toggleFavorite = async function(docId) {
    const item = menus.find(m => m.id === docId);
    if (!item) return;
    try {
        await setDoc(doc(db, "users", shopOwnerId, "menus", docId), { favorite: !item.favorite }, { merge: true });
        Swal.fire({icon: 'success', title: 'Favorit Diupdate', timer: 1000, showConfirmButton: false});
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Gagal update favorit', 'error');
    }
};

window.deleteTransaction = async function() {
    if(!currentViewedTrx) return;
    if(confirm('Hapus transaksi ini permanen?')) {
        try {
            await deleteDoc(doc(db, "users", shopOwnerId, "transactions", currentViewedTrx.id));
            window.closeBillModal();
            Swal.fire({icon: 'success', title: 'Terhapus', timer: 1000, showConfirmButton: false});
        } catch(e) {
            Swal.fire('Error', 'Gagal hapus transaksi', 'error');
        }
    }
}

window.appendCalc = function(val) {
    if(calcValue === "0") calcValue = val; else calcValue += val;
    document.getElementById('calc-display').innerText = parseInt(calcValue).toLocaleString('id-ID');
}
window.clearCalc = function() { calcValue = "0"; document.getElementById('calc-display').innerText = "0"; }
window.backspaceCalc = function() {
    if(calcValue.length > 1) calcValue = calcValue.slice(0, -1); else calcValue = "0";
    document.getElementById('calc-display').innerText = parseInt(calcValue).toLocaleString('id-ID');
}
window.addToManualList = async function() {
    const price = parseInt(calcValue);
    if(price <= 0) return;
    const { value: keterangan } = await Swal.fire({
        title: 'Keterangan Item',
        input: 'text',
        inputLabel: 'Item apa ini? (opsional)',
        showCancelButton: true
    });
    manualSessionCart.push({ price: price, id: Date.now(), name: keterangan || "Item Manual" });
    window.clearCalc();
    renderManualHistory();
}
function renderManualHistory() {
    const container = document.getElementById('manual-history-list');
    const footer = document.getElementById('manual-footer');
    const totalDisplay = document.getElementById('manual-total-display');
    if(manualSessionCart.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-xs mt-10">Kosong</p>';
        footer.classList.add('hidden');
        return;
    }
    let html = '';
    let total = 0;
    [...manualSessionCart].reverse().forEach((item, index) => {
        total += item.price;
        html += `<div class="flex justify-between p-2 border-b"><span class="text-sm">${item.name}</span><span class="font-bold">Rp ${item.price.toLocaleString('id-ID')}</span></div>`;
    });
    container.innerHTML = html;
    totalDisplay.innerText = 'Rp ' + total.toLocaleString('id-ID');
    footer.classList.remove('hidden');
}
window.finishManualSession = function() {
    if(manualSessionCart.length === 0) return;
    manualSessionCart.forEach(m => {
        cart.push({ id: 'manual_' + m.id, name: m.name, price: m.price, qty: 1, isManual: true });
    });
    manualSessionCart = [];
    window.navigate('view-cashier');
    renderCart();
}

// --- ADMIN RENDER ---
function renderAdminList() {
    const list = document.getElementById('admin-menu-list');
    list.innerHTML = '';
    const searchVal = document.getElementById('admin-search') ? document.getElementById('admin-search').value.toLowerCase() : '';
    
    let filteredAdminMenus = menus.filter(m => m.name.toLowerCase().includes(searchVal));
    filteredAdminMenus = currentCategory === 'all' ? filteredAdminMenus : filteredAdminMenus.filter(m => (m.category || '').toLowerCase() === currentCategory);
    
    const label = document.getElementById('admin-filter-label');
    if(label) label.innerText = currentCategory === 'all' ? 'Semua' : currentCategory;
    
    // Logika sorting bawaan tetap dipertahankan
    let favorites = filteredAdminMenus.filter(m => m.favorite);
    let others = filteredAdminMenus.filter(m => !m.favorite);
    if(adminSortMode === 'name_asc') {
        favorites.sort((a,b) => a.name.localeCompare(b.name));
        others.sort((a,b) => a.name.localeCompare(b.name));
    } else if(adminSortMode === 'price_high') {
        favorites.sort((a,b) => b.price - a.price);
        others.sort((a,b) => b.price - a.price);
    } else if(adminSortMode === 'price_low') {
        favorites.sort((a,b) => a.price - b.price);
        others.sort((a,b) => a.price - b.price);
    }
    filteredAdminMenus = favorites.concat(others);
    
    filteredAdminMenus.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'bg-white border rounded p-3 flex justify-between items-center shadow-sm mb-2';
        
        // 🔥 LOGIKA FOTO UNTUK ADMIN:
        let mediaAdminHtml = `<div class="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 bg-gray-100 flex-none"><i class="fas ${item.icon || 'fa-utensils'}"></i></div>`;
        if (item.image) {
            // Kompresi ukurannya diatur jadi w_100,h_100 (100x100 pixel) biar pas dan super ringan untuk list admin
            const compressedUrl = item.image.replace('/upload/', '/upload/w_100,h_100,c_fill,q_auto,f_auto/');
            mediaAdminHtml = `<img src="${compressedUrl}" alt="${item.name}" class="w-10 h-10 object-cover rounded-lg shadow-sm border border-gray-200 flex-none">`;
        }

        row.innerHTML = `
            <div class="flex items-center gap-3">
                ${mediaAdminHtml}
                <div>
                    <div class="font-bold text-sm text-gray-800">${item.name}</div>
                    <div class="text-xs text-blue-600 font-bold">Rp ${(item.price || 0).toLocaleString('id-ID')}</div>
                    <div class="text-xs text-gray-500">${item.category} • Stok: ${item.stock || 0}</div>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="window.toggleFavorite('${item.id}')" class="text-${item.favorite ? 'red' : 'gray'}-500 text-xl">
                    ${item.favorite ? '❤️' : '♡'}
                </button>
                <button onclick="window.editMenuPrompt('${item.id}')" class="text-blue-500 px-3 py-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition active:scale-95">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="window.deleteMenu('${item.id}')" class="text-red-500 px-3 py-2 bg-red-50 rounded-lg hover:bg-red-100 transition active:scale-95">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        list.appendChild(row);
    });
}


// --- FUNGSI EDIT MENU (POPUP MODAL DENGAN UPLOAD FOTO) ---
window.editMenuPrompt = async function(docId) {
    const item = menus.find(m => m.id === docId);
    if (!item) return;

    // 1. Ambil list kategori dari database untuk opsi dropdown
    let catOptions = `<option value="makanan">makanan</option>
                      <option value="minuman">minuman</option>
                      <option value="camilan">camilan</option>`;
                      
    categories.forEach(c => {
        const catName = c.name.toLowerCase();
        if(!['makanan', 'minuman', 'camilan'].includes(catName)) {
            catOptions += `<option value="${catName}">${c.name}</option>`;
        }
    });

    catOptions = catOptions.replace(`value="${item.category}"`, `value="${item.category}" selected`);

    // 🔥 Tampilkan foto lama (jika ada) di modal popup
    let currentImageHtml = '';
    if (item.image) {
        // Kompres agar fotonya kecil di dalam popup
        const imgThumb = item.image.replace('/upload/', '/upload/w_150,h_150,c_fill,q_auto,f_auto/');
        currentImageHtml = `<img src="${imgThumb}" class="h-16 w-16 object-cover mx-auto mb-2 rounded shadow-sm border border-gray-300">`;
    }

    // 2. Munculkan Popup SweetAlert
    const { value: formValues } = await Swal.fire({
        title: 'Edit Item',
        html: `
            ${currentImageHtml}
            <div class="text-left mb-1 mt-2 text-xs font-bold text-gray-700">Ganti Foto (Kosongkan jika tidak diganti)</div>
            <input type="file" id="edit-image" accept="image/*" class="w-full text-xs p-1 mb-2 border rounded bg-gray-50 cursor-pointer">
            
            <div class="text-left mb-1 mt-2 text-xs font-bold text-gray-700">Nama Menu</div>
            <input id="edit-name" class="swal2-input !m-0 !w-full" placeholder="Nama Menu" value="${item.name}">
            
            <div class="text-left mb-1 mt-3 text-xs font-bold text-gray-700">Harga (Rp)</div>
            <input id="edit-price" type="number" class="swal2-input !m-0 !w-full" placeholder="Harga" value="${item.price}">
            
            <div class="text-left mb-1 mt-3 text-xs font-bold text-gray-700">Stok Menu</div>
            <input id="edit-stock" type="number" class="swal2-input !m-0 !w-full" placeholder="Stok" value="${item.stock || 0}">
            
            <div class="text-left mb-1 mt-3 text-xs font-bold text-gray-700">Kategori</div>
            <select id="edit-category" class="swal2-input !m-0 !w-full h-[54px]">${catOptions}</select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            return {
                name: document.getElementById('edit-name').value,
                price: parseInt(document.getElementById('edit-price').value),
                stock: parseInt(document.getElementById('edit-stock').value),
                category: document.getElementById('edit-category').value,
                // 🔥 Tangkap file foto baru jika Admin mengunggahnya
                imageFile: document.getElementById('edit-image').files[0] 
            }
        }
    });

    // 3. Eksekusi Penyimpanan ke Firebase
    if (formValues) {
        if (!formValues.name || isNaN(formValues.price)) {
            return Swal.fire('Error', 'Nama dan Harga harus diisi dengan angka yang valid!', 'error');
        }

        let newIcon = item.icon || 'fa-utensils';
        let newColor = item.color || 'bg-white';
        if(formValues.category.includes('minum')) { newIcon = 'fa-glass-water'; newColor = 'bg-blue-50'; }
        else if(formValues.category.includes('camil')) { newIcon = 'fa-bread-slice'; newColor = 'bg-yellow-50'; }
        else { newIcon = 'fa-utensils'; newColor = 'bg-white'; }

        Swal.fire({title: 'Menyimpan...', text: 'Memperbarui data & foto...', didOpen: () => Swal.showLoading()});
        try {
            let updateData = {
                name: formValues.name,
                price: formValues.price,
                stock: formValues.stock,
                category: formValues.category,
                icon: newIcon,
                color: newColor
            };

            // 🔥 Jika admin memilih foto baru, upload dulu ke Cloudinary
            if (formValues.imageFile) {
                const newImageUrl = await window.uploadToCloudinary(formValues.imageFile);
                updateData.image = newImageUrl;
            }

            // Simpan ke Firestore
            await setDoc(doc(db, "users", shopOwnerId, "menus", docId), updateData, { merge: true });
            
            Swal.fire({icon: 'success', title: 'Berhasil Diupdate', timer: 1200, showConfirmButton: false});
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Gagal update: ' + (e.message || 'Unknown'), 'error');
        }
    }
}
// --- MESIN DASHBOARD LAPORAN (ZONA BAWAH + ZONA TENGAH) ---
function renderTransactions() {
    const list = document.getElementById('transaction-list');
    list.innerHTML = '';
    
    const now = new Date();
    filteredTrx = transactions;
    let filterLabel = "Semua Waktu";

    // 1. FILTER BERDASARKAN TANGGAL
    if (reportFilterMode === 'today') {
        const todayStr = now.toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === todayStr);
        filterLabel = "Hari Ini";
    } else if (reportFilterMode === 'yesterday') {
        const yest = new Date(now); yest.setDate(yest.getDate() - 1);
        const yestStr = yest.toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === yestStr);
        filterLabel = "Kemarin";
    } else if (reportFilterMode === '7days') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        filteredTrx = transactions.filter(t => new Date(t.timestamp) >= sevenDaysAgo);
        filterLabel = "7 Hari Terakhir";
    } else if (reportFilterMode === 'month') {
        filteredTrx = transactions.filter(t => { const d = new Date(t.timestamp); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
        filterLabel = "Bulan Ini";
    } else if (reportFilterMode === 'custom' && reportFilterDate) {
        const selStr = new Date(reportFilterDate).toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === selStr);
        filterLabel = selStr;
    }

    // 2. KALKULATOR DASHBOARD KARTU RINGKASAN
    let totalKotor = 0, sumTunai = 0, sumQris = 0, sumHutang = 0;
    
    filteredTrx.forEach(trx => {
        totalKotor += (trx.total || 0); 
        if (trx.method === 'TUNAI') {
            let tunaiMurni = trx.total - (trx.remaining || 0);
            sumTunai += (tunaiMurni > 0 ? tunaiMurni : 0); 
        } else if (trx.method === 'QRIS') {
            sumQris += (trx.total || 0);
        }
        sumHutang += (trx.remaining || 0); 
    });

    document.getElementById('report-period-label').innerText = "Omzet Kotor " + filterLabel;
    document.getElementById('report-grand-total').innerText = 'Rp ' + totalKotor.toLocaleString('id-ID');
    document.getElementById('dash-tunai').innerText = 'Rp ' + sumTunai.toLocaleString('id-ID');
    document.getElementById('dash-qris').innerText = 'Rp ' + sumQris.toLocaleString('id-ID');
    document.getElementById('dash-hutang').innerText = 'Rp ' + sumHutang.toLocaleString('id-ID');
    document.getElementById('dash-count').innerText = filteredTrx.length + ' Nota';

    // 3. RENDER DAFTAR RIWAYAT (ZONA BAWAH)
    if(filteredTrx.length === 0) { 
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center mt-10 p-6 bg-white rounded-xl border border-dashed border-gray-300">
                <i class="fas fa-receipt text-3xl text-gray-300 mb-2"></i>
                <p class="text-center text-gray-400 text-sm font-bold">Belum ada transaksi</p>
                <p class="text-center text-gray-400 text-[10px]">Pilih tanggal lain atau mulai jualan.</p>
            </div>`;
        return; 
    }

    if (queryFilterMode === 'none') {
        filteredTrx.forEach(trx => {
            const el = document.createElement('div');
            el.onclick = () => window.viewTransactionDetail(trx.id);
            
            let borderColor = 'border-green-500';
            let methodIcon = '<i class="fas fa-money-bill-wave text-green-500 w-5"></i>';
            if (trx.method === 'QRIS') { borderColor = 'border-blue-500'; methodIcon = '<i class="fas fa-qrcode text-blue-500 w-5"></i>'; }
            if (trx.method === 'HUTANG' || trx.remaining > 0) { borderColor = 'border-red-500'; methodIcon = '<i class="fas fa-book-open text-red-500 w-5"></i>'; }
            
            el.className = `bg-white p-3 rounded-xl border-l-4 ${borderColor} cursor-pointer shadow-sm hover:shadow-md transition relative`;
            let hutangBadge = trx.remaining > 0 ? `<span class="bg-red-100 text-red-600 text-[9px] font-bold px-2 py-0.5 rounded ml-2">Ngutang Rp ${trx.remaining.toLocaleString('id-ID')}</span>` : '';

            // 🔥 PERBAIKAN 1: Tampilkan Jam DAN Tanggal (Dipisahkan strip)
            let fullDateStr = trx.date.replace(',', ' -'); 

            el.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <div class="font-bold text-sm text-gray-800 flex items-center">${trx.buyer} ${hutangBadge}</div>
                    <div class="font-extrabold text-gray-800">Rp ${trx.total.toLocaleString('id-ID')}</div>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <div class="flex items-center gap-1">${methodIcon} ${trx.items ? trx.items.length : 0} Item</div>
                    <div><i class="far fa-clock mr-1"></i>${fullDateStr}</div>
                </div>
            `;
            list.appendChild(el);
        });
    } else {
        list.innerHTML = ''; 
        if (queryFilterMode === 'top_menus') {
            let menuSales = {};
            filteredTrx.forEach(trx => {
                trx.items.forEach(item => {
                    if (!menuSales[item.name]) menuSales[item.name] = { qty: 0, revenue: 0 };
                    menuSales[item.name].qty += item.qty;
                    menuSales[item.name].revenue += item.price * item.qty;
                });
            });
            const sorted = Object.entries(menuSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
            sorted.forEach(([name, data]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded-xl border-l-4 border-yellow-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${name}</div><div class="text-xs text-gray-500">Terjual: ${data.qty} porsi | Omzet: Rp ${data.revenue.toLocaleString('id-ID')}</div>`;
                list.appendChild(el);
            });
        } else if (queryFilterMode === 'top_hutang') {
            let custHutang = {};
            filteredTrx.forEach(trx => {
                if (trx.remaining > 0) {
                    if (!custHutang[trx.buyer]) custHutang[trx.buyer] = { sisa: 0, count: 0 };
                    custHutang[trx.buyer].sisa += trx.remaining;
                    custHutang[trx.buyer].count += 1;
                }
            });
            const sorted = Object.entries(custHutang).sort((a, b) => b[1].sisa - a[1].sisa).slice(0, 10);
            sorted.forEach(([buyer, data]) => {
                const el = document.createElement('div');
                // 🔥 PERBAIKAN 2: Tambah class hover & onclick untuk List Hutang
                el.className = 'bg-white p-3 mb-2 rounded-xl border-l-4 border-red-500 shadow-sm cursor-pointer hover:bg-red-50 transition active:scale-95';
                el.onclick = () => window.showCustomerDetail(buyer, 'HUTANG');
                
                el.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-bold text-sm text-gray-800">${buyer}</div>
                            <div class="text-xs text-gray-500">Sisa: Rp ${data.sisa.toLocaleString('id-ID')} | ${data.count} Bon</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-300"></i>
                    </div>`;
                list.appendChild(el);
            });
        } else if (queryFilterMode === 'pelanggan_setia') {
            let custFreq = {};
            filteredTrx.forEach(trx => {
                if (!custFreq[trx.buyer]) custFreq[trx.buyer] = { count: 0, total: 0 };
                custFreq[trx.buyer].count += 1;
                custFreq[trx.buyer].total += trx.total;
            });
            const sorted = Object.entries(custFreq).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
            sorted.forEach(([buyer, data]) => {
                const el = document.createElement('div');
                // 🔥 PERBAIKAN 2: Tambah class hover & onclick untuk Pelanggan Setia
                el.className = 'bg-white p-3 mb-2 rounded-xl border-l-4 border-blue-500 shadow-sm cursor-pointer hover:bg-blue-50 transition active:scale-95';
                el.onclick = () => window.showCustomerDetail(buyer, 'ALL');
                
                el.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-bold text-sm text-gray-800">${buyer}</div>
                            <div class="text-xs text-gray-500">Transaksi: ${data.count} kali | Belanja: Rp ${data.total.toLocaleString('id-ID')}</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-300"></i>
                    </div>`;
                list.appendChild(el);
            });
        }
    }
}

// 🔥 FUNGSI BARU: Melihat List Transaksi Khusus 1 Pelanggan
window.showCustomerDetail = function(buyerName, type) {
    const list = document.getElementById('transaction-list');
    list.innerHTML = ''; 

    // Tombol Kembali
    list.innerHTML = `
        <div class="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
            <h4 class="font-bold text-gray-800 text-sm">Bon: <span class="${type === 'HUTANG' ? 'text-red-600' : 'text-blue-600'}">${buyerName}</span></h4>
            <button onclick="renderTransactions()" class="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 active:scale-95 transition hover:bg-gray-300">
                <i class="fas fa-arrow-left"></i> Kembali
            </button>
        </div>
    `;

    // Filter transaksi murni untuk pelanggan ini di rentang waktu terpilih
    let customerTrx = filteredTrx.filter(t => t.buyer === buyerName);
    if (type === 'HUTANG') {
        customerTrx = customerTrx.filter(t => t.remaining > 0);
    }

    customerTrx.forEach(trx => {
        const el = document.createElement('div');
        el.onclick = () => window.viewTransactionDetail(trx.id);

        let borderColor = 'border-green-500';
        let methodIcon = '<i class="fas fa-money-bill-wave text-green-500 w-5"></i>';
        if (trx.method === 'QRIS') { borderColor = 'border-blue-500'; methodIcon = '<i class="fas fa-qrcode text-blue-500 w-5"></i>'; }
        if (trx.method === 'HUTANG' || trx.remaining > 0) { borderColor = 'border-red-500'; methodIcon = '<i class="fas fa-book-open text-red-500 w-5"></i>'; }

        el.className = `bg-white p-3 rounded-xl border-l-4 ${borderColor} cursor-pointer shadow-sm hover:shadow-md transition relative mb-2`; 

        let hutangBadge = trx.remaining > 0 ? `<span class="bg-red-100 text-red-600 text-[9px] font-bold px-2 py-0.5 rounded ml-2">Ngutang Rp ${trx.remaining.toLocaleString('id-ID')}</span>` : '';
        let fullDateStr = trx.date.replace(',', ' -');

        el.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <div class="font-bold text-sm text-gray-800 flex items-center">${trx.buyer} ${hutangBadge}</div>
                <div class="font-extrabold text-gray-800">Rp ${trx.total.toLocaleString('id-ID')}</div>
            </div>
            <div class="flex justify-between items-center text-xs text-gray-500">
                <div class="flex items-center gap-1">${methodIcon} ${trx.items ? trx.items.length : 0} Item</div>
                <div><i class="far fa-clock mr-1"></i>${fullDateStr}</div>
            </div>
        `;
        list.appendChild(el);
    });
}


// 4. Update Fungsi Tombol Filter Pil Waktu (Ditambah filter Query Lanjutan)
window.setQueryFilter = function(mode) {
    if (queryFilterMode === mode) {
        queryFilterMode = 'none'; 
    } else {
        queryFilterMode = mode;
    }
    const btns = document.getElementById('report-query-filters').querySelectorAll('button');
    btns.forEach(btn => btn.classList.remove('active', 'border-purple-400', 'bg-purple-50'));
    if (queryFilterMode !== 'none') {
        btns.forEach(btn => {
            if (btn.onclick.toString().includes(mode)) btn.classList.add('active', 'border-purple-400', 'bg-purple-50');
        });
    }
    renderTransactions();
};

window.setReportFilter = function(mode, val) {
    reportFilterMode = mode;
    if(val) reportFilterDate = val;
    
    // Logika UI untuk merubah warna pill button yang aktif
    const btns = document.getElementById('report-filters').querySelectorAll('.filter-btn');
    btns.forEach(b => {
        b.classList.remove('active', 'bg-white', 'text-purple-800');
        b.classList.add('bg-purple-700', 'text-purple-100');
    });

    let activeBtn;
    if(mode === 'today') activeBtn = btns[0];
    else if(mode === 'yesterday') activeBtn = btns[1];
    else if(mode === '7days') activeBtn = btns[2];
    else if(mode === 'month') activeBtn = btns[3];
    else if(mode === 'custom') activeBtn = btns[4];

    if (activeBtn) {
        activeBtn.classList.remove('bg-purple-700', 'text-purple-100');
        activeBtn.classList.add('active', 'bg-white', 'text-purple-800');
    }

    renderTransactions();
}


window.closeBillModal = function() { document.getElementById('bill-modal').classList.add('hidden'); }

function generateReceiptHTML(buyer, items, total, date, method, paid = 0, change = 0, remaining = 0, operatorName = "Admin") {
    let itemHtml = '';
    (items || []).forEach(i => {
        itemHtml += `<div class="flex justify-between text-xs mb-1"><span>${i.name} x${i.qty}</span><span>${((parseInt(i.price)||0)*(parseInt(i.qty)||0)).toLocaleString()}</span></div>`;
    });

    let paymentDetails = '';
    if (method === 'TUNAI' && paid > 0) {
        paymentDetails = `<div class="flex justify-between text-xs mt-2 pt-2 border-t border-dashed"><span>Bayar:</span><span>${paid.toLocaleString()}</span></div><div class="flex justify-between text-xs"><span>Kembali:</span><span>${change.toLocaleString()}</span></div>`;
    }

    let hutangDetails = remaining > 0 ? `<div class="flex justify-between text-xs mt-2 pt-2 border-t border-dashed"><span>Dibayar:</span><span>${paid.toLocaleString()}</span></div><div class="flex justify-between text-xs"><span>Sisa Hutang:</span><span>${remaining.toLocaleString()}</span></div>` : '';

    return `<div class="p-2 text-center"><h2 class="font-bold">${window.shopNameAsli || 'SAHABAT USAHAMU'}</h2><p class="text-[10px] text-gray-600 mb-1">${window.shopAddressAsli || 'Nusadua Bali'}</p><p class="text-xs text-gray-500 mb-2">${date}</p><div class="text-left border-t border-b py-2 border-dashed my-2 space-y-1"><div class="flex justify-between font-bold text-xs"><span>Plg: ${buyer}</span><span>Kasir: ${operatorName}</span></div><div class="text-right text-[10px] text-gray-500 mb-1">${method || '-'}</div>${itemHtml}</div><div class="flex justify-between font-bold text-lg"><span>TOTAL</span><span>Rp ${total.toLocaleString()}</span></div>${paymentDetails}${hutangDetails}<div class="mt-6 text-center text-xs text-gray-400">Terima Kasih - Semoga sehat selalu dan di lancarkan semua usahanya</div></div>`;
}

window.viewTransactionDetail = function(id) {
    const trx = transactions.find(t => t.id === id);
    if (!trx) return;
    currentViewedTrx = trx;
    
    document.getElementById('bill-content').innerHTML = generateReceiptHTML(trx.buyer, trx.items, trx.total, trx.date, trx.method, trx.paid, trx.change, trx.remaining || 0, trx.operatorName || 'Admin');
    
    document.getElementById('payment-actions').classList.add('hidden');
    document.getElementById('payment-actions').classList.remove('grid');
    document.getElementById('view-actions').classList.remove('hidden');
    document.getElementById('view-actions').classList.add('flex');
    document.getElementById('bill-modal').classList.remove('hidden');
}

window.showBillPreview = function() {
    if(cart.length === 0) return Swal.fire('Kosong', 'Belum ada pesanan', 'warning');
    
    let total = 0;
    try {
        total = cart.reduce((sum, i) => sum + ((parseInt(i.price) || 0) * (parseInt(i.qty) || 0)), 0);
    } catch(e) { total = 0; }

    const buyer = document.getElementById('buyer-name').value.trim() || "Pelanggan";
    const date = new Date().toLocaleString('id-ID');
    const currentKasir = businessData.name || "Admin"; 
    
    document.getElementById('bill-content').innerHTML = generateReceiptHTML(buyer, cart, total, date, "DRAFT", 0, 0, 0, currentKasir);
    
    if (editingTransactionId) {
        document.getElementById('bill-modal-title').innerText = "Konfirmasi Revisi";
    } else {
        document.getElementById('bill-modal-title').innerText = "Detail Transaksi";
    }
    document.getElementById('payment-actions').classList.remove('hidden');
    document.getElementById('payment-actions').classList.add('grid');
    document.getElementById('view-actions').classList.add('hidden');
    document.getElementById('view-actions').classList.remove('flex');
    document.getElementById('bill-modal').classList.remove('hidden');
}

window.sendToWA = function() {
    if(!currentViewedTrx) return;
    const t = currentViewedTrx;
    
    // 1. Ambil nomor WA dari input HTML yang baru kita buat
    let noWA = document.getElementById('modal-buyer-wa').value.trim();
    
    // 2. Format nomor WA (ubah awalan 0 menjadi 62 standar internasional)
    if (noWA.startsWith('0')) {
        noWA = '62' + noWA.substring(1);
    }
    
    // 3. Siapkan teks struk sebagai cadangan
    let text = `*Struk ${window.shopNameAsli || businessData.name || 'SAHABAT USAHAMU'}*\nTgl: ${t.date}\nPlg: ${t.buyer}\n\n`;
    t.items.forEach(i => text += `${i.name} (${i.qty}) : Rp ${(parseInt(i.price)||0)*(parseInt(i.qty)||0)}\n`);
    text += `\n*Total: Rp ${t.total.toLocaleString('id-ID')}*\nMetode: ${t.method}`;
    if(t.method === 'TUNAI' && t.paid) { text += `\nBayar: Rp ${t.paid.toLocaleString('id-ID')}\nKembali: Rp ${t.change.toLocaleString('id-ID')}`; }
    if(t.remaining > 0) { text += `\nSisa Hutang: Rp ${t.remaining.toLocaleString('id-ID')}`; }
    text += `\n\n_Terima kasih telah berbelanja!_`;

    // 4. Tentukan link tujuan (jika nomor kosong, WA akan minta pilih kontak manual)
    let waLink = noWA ? `https://wa.me/${noWA}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;

    // 5. Trik Hybrid: Download Gambar Struk dulu, baru buka WA
    Swal.fire({title: 'Menyiapkan Struk...', text: 'Gambar struk akan di-download otomatis', timer: 1500, showConfirmButton: false});
    
    const el = document.getElementById('bill-content');
    html2canvas(el, {scale:2, backgroundColor:'#fff'}).then(c => {
        // Proses Download PNG
        const l = document.createElement('a'); 
        l.download = `Struk_${t.buyer}_${Date.now()}.png`; 
        l.href = c.toDataURL(); 
        l.click();
        
        // Jeda setengah detik lalu Buka WhatsApp
        setTimeout(() => {
            window.open(waLink, '_blank');
        }, 500);
    });
}

window.saveReceiptImage = function() {
    const el = document.getElementById('bill-content');
    html2canvas(el, {scale:2, backgroundColor:'#fff'}).then(c => {
        const l = document.createElement('a'); l.download = 'struk.png'; l.href = c.toDataURL(); l.click();
    });
}

window.seedDefaultMenus = async function() { Swal.fire('Info', 'Gunakan menu Tambah Kategori dulu', 'info'); }

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
}

window.backupData = async function() {
    const csvMenus = menus.map(m => `${m.name},${m.price},${m.stock}`).join('\n');
    const csvTrx = transactions.map(t => `${t.date},${t.total}`).join('\n');
    const blob = new Blob([`Menus:\n${csvMenus}\n\nTransactions:\n${csvTrx}`], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup.csv'; a.click();
}

window.exportToPDF = function() {
    if(filteredTrx.length === 0) return Swal.fire('Kosong', 'Tidak ada data untuk diekspor', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.text(businessData.name || "SAHABAT USAHAMU Bali", 105, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.text(businessData.address || "Nusadua Bali", 105, 17, { align: 'center' });
    const reportLabel = document.getElementById('report-period-label').innerText;
    doc.text("Laporan Penjualan - " + reportLabel, 105, 24, { align: 'center' });
    doc.text("Dicetak pada: " + new Date().toLocaleString('id-ID'), 105, 31, { align: 'center' });

    let yPos = 40;
    let grandTotal = 0;
    let isHutangFilter = reportPaymentFilter === 'HUTANG';

    filteredTrx.forEach((trx, index) => {
        const calcTotal = isHutangFilter ? (trx.remaining || 0) : trx.total;
        grandTotal += calcTotal;

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Transaksi #${index + 1}: ${trx.date} - ${trx.buyer}`, 10, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Metode: ${trx.method} | Total: Rp ${calcTotal.toLocaleString('id-ID')}`, 10, yPos);
        if (trx.remaining > 0) {
            doc.text(`Dibayar: Rp ${trx.paid.toLocaleString('id-ID')} | Sisa Hutang: Rp ${trx.remaining.toLocaleString('id-ID')}`, 10, yPos + 5);
            if (isHutangFilter) {
                doc.text(`(Total Belanja Asli: Rp ${trx.total.toLocaleString('id-ID')})`, 10, yPos + 10);
                yPos += 5;
            }
        } else if (trx.method === 'TUNAI') {
            doc.text(`Dibayar: Rp ${trx.paid.toLocaleString('id-ID')} | Kembalian: Rp ${trx.change.toLocaleString('id-ID')}`, 10, yPos + 5);
        }
        yPos += 15;

        if (trx.items && trx.items.length > 0) {
            const itemData = trx.items.map(item => [
                item.name,
                item.qty,
                `Rp ${item.price.toLocaleString('id-ID')}`,
                `Rp ${(item.price * item.qty).toLocaleString('id-ID')}`
            ]);
            doc.autoTable({
                head: [['Nama Item', 'Qty', 'Harga', 'Subtotal']],
                body: itemData,
                startY: yPos,
                margin: { left: 10, right: 10 },
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [100, 100, 100] },
                columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 20 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } }
            });
            yPos = doc.lastAutoTable.finalY + 10;
        } else {
            doc.text("Tidak ada item detail.", 10, yPos);
            yPos += 10;
        }

        yPos += 5;
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
    });

    doc.addPage();
    yPos = 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Ringkasan", 10, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Transaksi: ${filteredTrx.length}`, 10, yPos);
    yPos += 7;
    doc.text(`${isHutangFilter ? "Total Sisa Hutang" : "Omzet Keseluruhan"}: Rp ${grandTotal.toLocaleString('id-ID')}`, 10, yPos);

    doc.save('laporan-penjualan-detail.pdf');
}

window.exportToCSV = function() {
    if (filteredTrx.length === 0) return Swal.fire('Kosong', 'Tidak ada data', 'warning');
    let csv = 'Tanggal,Pelanggan,Metode,Total/Sisa,Item Count\n';
    filteredTrx.forEach(trx => {
        const calcValue = (reportPaymentFilter === 'HUTANG') ? trx.remaining : trx.total;
        csv += `${trx.date},${trx.buyer},${trx.method},${calcValue},${trx.items.length}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'laporan.csv'; a.click();
};

window.exportToExcel = function() {
    if (filteredTrx.length === 0) return Swal.fire('Kosong', 'Tidak ada data', 'warning');
    const wb = XLSX.utils.book_new();
    
    const trxData = [['Tanggal', 'Pelanggan', 'Metode', 'Total/Sisa', 'Item Count']];
    filteredTrx.forEach(trx => {
        const calcValue = (reportPaymentFilter === 'HUTANG') ? trx.remaining : trx.total;
        trxData.push([trx.date, trx.buyer, trx.method, calcValue, trx.items.length]);
    });
    const wsTrx = XLSX.utils.aoa_to_sheet(trxData);
    XLSX.utils.book_append_sheet(wb, wsTrx, 'Transaksi');
    
    const sumOmzet = filteredTrx.reduce((sum, trx) => sum + ((reportPaymentFilter === 'HUTANG') ? trx.remaining : trx.total), 0);
    const avgTrx = sumOmzet / filteredTrx.length;
    const sumData = [
        ['Label', 'Nilai'],
        ['Total Omzet/Sisa', sumOmzet],
        ['Rata-rata Transaksi', avgTrx.toFixed(0)],
        ['Jumlah Transaksi', filteredTrx.length]
    ];
    const wsSum = XLSX.utils.aoa_to_sheet(sumData);
    XLSX.utils.book_append_sheet(wb, wsSum, 'Ringkasan');
    
    XLSX.writeFile(wb, 'laporan.xlsx');
};

function updateBusinessNameUI() {
    document.getElementById('business-name-lobby').innerText = window.shopNameAsli || 'SAHABAT USAHAMU';
    const addressLobby = document.getElementById('business-address-lobby');
    if(addressLobby) {
        addressLobby.innerText = window.shopAddressAsli || 'Nusadua Bali';
    }
}

window.updateBusinessName = async function() {
    const newName = document.getElementById('edit-business-name').value.trim();
    const newAddress = document.getElementById('edit-business-address').value.trim();
    
    if (!newName) return Swal.fire('Error', 'Nama usaha wajib diisi', 'error');
    
    Swal.fire({title: 'Menyimpan...', didOpen: () => Swal.showLoading()});
    try {
        await setDoc(doc(db, "users", currentUser.uid), { 
            name: newName,
            address: newAddress
        }, { merge: true });
        
        businessData.name = newName;
        businessData.address = newAddress;
        window.shopNameAsli = newName;
        window.shopAddressAsli = newAddress;
        
        updateBusinessNameUI();
        
        Swal.fire('Sukses', 'Profil usaha diperbarui', 'success');
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('view-cashier').classList.contains('hide')) showBillPreview();
    if (e.key === 'Escape' && !document.getElementById('view-cashier').classList.contains('hide')) clearCart();
});

window.onerror = (msg) => Swal.fire('Error', msg, 'error');

if (!localStorage.getItem('onboarded')) {
    Swal.fire({
        title: 'Selamat Datang!',
        text: 'Ini tutorial singkat: 1. Tambah menu di Kelola Menu. 2. Jual di Kasir. 3. Lihat laporan. Hubungi support jika bingung 081 559 557 553.',
        icon: 'info'
    });
    localStorage.setItem('onboarded', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
    const debounce = (func, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func(...args), delay);
        };
    };

    const debouncedRenderMenuGrid = debounce(renderMenuGrid, 300);
    const cashierSearch = document.getElementById('cashier-search');
    if (cashierSearch) cashierSearch.addEventListener('keyup', debouncedRenderMenuGrid);

    const debouncedRenderAdminList = debounce(renderAdminList, 300);
    const adminSearch = document.getElementById('admin-search');
    if (adminSearch) adminSearch.addEventListener('keyup', debouncedRenderAdminList);

    const debouncedRenderStockList = debounce(renderStockList, 300);
    const stockSearch = document.getElementById('stock-search');
    if (stockSearch) stockSearch.addEventListener('keyup', debouncedRenderStockList);
}); // <-- PENUTUP DOMContentLoaded
// ============================================================
// 📶 DETEKSI KONEKSI INTERNET (AUTO SYNC MONITOR)
// ============================================================

function updateConnectionStatus() {
    const statusLabel = document.querySelector('#business-address-lobby span.text-green-400'); // Label ONLINE di Lobby
    const statusText = document.querySelector('#business-address-lobby'); // Text Container
    
    if (navigator.onLine) {
        // JIKA ONLINE
        if(statusLabel) {
            statusLabel.innerText = "ONLINE";
            statusLabel.className = "text-green-400 font-bold blink-slow"; // Tambah efek kedip pelan
        }
        Swal.close(); // Tutup peringatan offline jika ada
        
        // Cek jika baru saja kembali online dari offline
        if (window.wasOffline) {
            Swal.fire({
                icon: 'success',
                title: 'Kembali Online!',
                text: 'Data transaksi offline sedang di-upload otomatis ke server.',
                toast: true, position: 'top', timer: 3000, showConfirmButton: false
            });
            window.wasOffline = false;
        }
    } else {
        // JIKA OFFLINE
        if(statusLabel) {
            statusLabel.innerText = "OFFLINE (Data Tersimpan di HP)";
            statusLabel.className = "text-red-500 font-bold blink";
        }
        window.wasOffline = true;
        
        // Beri notifikasi kecil (Toast)
        Swal.fire({
            icon: 'warning',
            title: 'Mode Offline',
            text: 'Internet terputus. Transaksi tetap bisa dilakukan & akan di-sync nanti.',
            toast: true, position: 'bottom', showConfirmButton: false, timer: 3000
        });
    }
}

// Pasang "Telinga" untuk mendengar perubahan sinyal
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Cek saat pertama kali load
document.addEventListener('DOMContentLoaded', () => {
    updateConnectionStatus();
});

// ================= FITUR AI CHATBOT (FULL SET: BRAIN + UI) =================

// 1. LOGIKA TOMBOL GESER & KLIK
(function initFloatingButton() {
    const fab = document.getElementById('tombol-jelajah-ai');
    if (!fab) return;

    let isDragging = false;
    let startY, startBottom;

    fab.addEventListener('touchstart', (e) => {
        isDragging = false;
        startY = e.touches[0].clientY;
        const style = window.getComputedStyle(fab);
        startBottom = parseInt(style.bottom) || 20;
        fab.style.opacity = "0.8";
    }, {passive: false});

    fab.addEventListener('touchmove', (e) => {
        const deltaY = startY - e.touches[0].clientY;
        if (Math.abs(deltaY) > 5) {
            isDragging = true;
            e.preventDefault(); 
            let newBottom = startBottom + deltaY;
            if (newBottom < 10) newBottom = 10;
            if (newBottom > window.innerHeight - 80) newBottom = window.innerHeight - 80;
            fab.style.bottom = `${newBottom}px`;
        }
    }, {passive: false});

    fab.addEventListener('touchend', (e) => {
        fab.style.opacity = "1";
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
        isDragging = false;
    });
})();

// FIX TOMBOL ENTER
setTimeout(() => {
    const chatInput = document.getElementById('chat-input');
    if(chatInput) {
        const newInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newInput, chatInput);
        newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); window.sendChatMessage(); }
        });
        newInput.id = 'chat-input';
    }
}, 1500);

// 2. FUNGSI BUKA TUTUP CHAT (INI YANG TADI HILANG)
window.toggleChat = function() {
    const chatWindow = document.getElementById('ai-chat-window');
    if (!chatWindow) return;
    
    if (chatWindow.classList.contains('hidden')) {
        chatWindow.classList.remove('hidden');
        chatWindow.classList.add('flex');
        const chatBox = document.getElementById('chat-messages');
        if(chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    } else {
        chatWindow.classList.add('hidden');
        chatWindow.classList.remove('flex');
    }
}

// 3. HELPER BUBBLE CHAT
function addChatBubble(text, sender) {
    const chatBox = document.getElementById('chat-messages');
    if(!chatBox) return;

    const div = document.createElement('div');
    const isUser = sender === 'user';
    div.className = isUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';
    const bgClass = isUser ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200';
    const iconHtml = isUser ? '' : `<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-none mr-2 mt-1"><i class="fas fa-robot text-xs text-blue-600"></i></div>`;
    
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

    div.innerHTML = `${iconHtml}<div class="${bgClass} p-2.5 rounded-lg max-w-[85%] text-sm shadow-sm leading-relaxed">${formatted}</div>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 4. FUNGSI UTAMA (MENGGUNAKAN OTAK BARU / AI-BRAIN.JS)
window.sendChatMessage = async function() {
    const inputEl = document.getElementById('chat-input');
    const message = inputEl.value.trim();
    if (!message) return;

    // Tampilkan Chat User
    addChatBubble(message, 'user');
    inputEl.value = '';

    // Tampilkan Loading
    const loadingId = 'loading-' + Date.now();
    const chatBox = document.getElementById('chat-messages');
    chatBox.insertAdjacentHTML('beforeend', `
        <div id="${loadingId}" class="flex justify-start mb-2">
            <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-none mr-2 mt-1"><i class="fas fa-robot text-xs text-blue-600"></i></div>
            <div class="bg-white p-2.5 rounded-lg border border-gray-200 text-gray-400 italic text-xs shadow-sm">
                Sedang berpikir... <i class="fas fa-circle-notch fa-spin"></i>
            </div>
        </div>
    `);
    chatBox.scrollTop = chatBox.scrollHeight;

    // --- PANGGIL OTAK AI ---
    try {
        // 1. Susun data (Context) menggunakan fungsi dari brain
        // Pastikan variabel 'transactions' dan 'menus' sudah ada di app.js
        const contextPrompt = generateContext(transactions, menus);

        // 2. Tanya ke Groq
        const reply = await askGroqAI(message, contextPrompt);

        // 3. Tampilkan Jawaban
        document.getElementById(loadingId).remove();
        addChatBubble(reply, 'bot');

    } catch (e) {
        if(document.getElementById(loadingId)) document.getElementById(loadingId).remove();
        addChatBubble("Otak AI sedang gangguan bosku. Cek file brain-nya ya! 😅", 'bot');
        console.error(e);
    }
}
// ================= FITUR VOICE COMMAND (SPEECH TO TEXT) =================

window.startVoiceInput = function() {
    // Cek dukungan browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return Swal.fire('Maaf', 'Browser HP ini tidak mendukung fitur suara. Gunakan Google Chrome.', 'warning');
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; // Bahasa Indonesia
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Efek Visual saat merekam
    const btnMic = document.getElementById('btn-mic');
    const originalHtml = btnMic.innerHTML;
    const originalClass = btnMic.className;
    
    btnMic.className = "bg-red-500 text-white w-9 h-9 rounded-full flex items-center justify-center animate-pulse flex-none";
    btnMic.innerHTML = '<i class="fas fa-stop"></i>';

    recognition.start();

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        const inputEl = document.getElementById('chat-input');
        inputEl.value = text;
        
        // Kembalikan tombol ke semula
        stopMicVisual();
        
        // Opsional: Langsung kirim setelah ngomong
        // window.sendChatMessage(); 
        // Saya sarankan jangan auto-kirim dulu, biar user bisa cek teksnya benar/salah
    };

    recognition.onspeechend = () => {
        recognition.stop();
        stopMicVisual();
    };

    recognition.onerror = (event) => {
        console.error("Voice Error:", event.error);
        stopMicVisual();
        // Jangan alert error kalau cuma "no-speech" (diam)
        if(event.error !== 'no-speech') {
            Swal.fire('Gagal', 'Suara tidak terdengar jelas.', 'info');
        }
    };

    function stopMicVisual() {
        btnMic.className = originalClass;
        btnMic.innerHTML = originalHtml;
    }
}
