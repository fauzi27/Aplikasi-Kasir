import { auth, db, secondaryAuth } from './firebase.js';
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
    onSnapshot(catCol, async (snapshot) => {
        if (snapshot.empty) {
            const defaultCats = ["Makanan", "Minuman", "Camilan", "Tambahan"];
            for (const c of defaultCats) {
                await addDoc(catCol, { name: c, id: c.toLowerCase() });
            }
        } else {
            categories = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            renderCategoryTiles(); 
        }
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
        window.setReportPaymentFilter('all'); 
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
    
    // HTML Normal (Untuk Kasir & Stok)
    let normalHtml = `<button onclick="window.setCategory('all')" class="category-btn ${currentCategory === 'all' ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">Semua</button>`;
    
    // Kategori Biasa
    categories.forEach(cat => {
        const isActive = currentCategory === cat.name.toLowerCase();
        normalHtml += `<button onclick="window.setCategory('${cat.name.toLowerCase()}')" class="category-btn ${isActive ? 'active' : ''} px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 bg-white text-gray-600 transition whitespace-nowrap">${cat.name}</button>`;
    });

    // Tampilkan untuk Kasir & Stok
    if(cashierTabs) cashierTabs.innerHTML = normalHtml;
    if(stockTabs) stockTabs.innerHTML = normalHtml; 

    // HTML KHUSUS ADMIN (Tambah Tombol + dan X)
    if(adminTabs) {
        // Beri div pembungkus biar rapi
        let adminHtml = `<div class="flex gap-2 items-center w-full">`; 
        
        // Bagian Kiri: Tombol + dan X (Biar kelihatan jelas)
        adminHtml += `
            <div class="flex gap-1 border-r border-gray-300 pr-2 flex-none">
                <button onclick="window.addCategoryPrompt()" class="px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200 hover:bg-green-200 transition"><i class="fas fa-plus"></i></button>
                <button onclick="window.showDeleteCategoryModal()" class="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 transition"><i class="fas fa-times"></i></button>
            </div>
        `;

        // Bagian Kanan: Daftar Kategori (Bisa digeser)
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

// ...................
window.setCategory = function(cat) {
    if (isLongPress) return; // Cegah pindah kategori kalau user habis nekan lama

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
// 🔥 FITUR HAPUS KATEGORI (MODAL POP-UP)
// ============================================================
window.showDeleteCategoryModal = function() {
    if (categories.length === 0) return Swal.fire('Info', 'Tidak ada kategori untuk dihapus.', 'info');

    // Buat HTML List Kategori untuk ditaruh di dalam Swal
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

            // Pindahkan tampilan ke "Semua" jika kategori yg dihapus sedang aktif
            if (currentCategory === name.toLowerCase()) window.setCategory('all');
            
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Gagal hapus: ' + e.message, 'error');
        }
    }
    
    // Reset status dengan jeda sebentar
    setTimeout(() => { isLongPress = false; }, 300);
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
        const stockDisplay = item.stock !== undefined ? `<span class="text-[10px] ${item.stock < 5 ? 'text-red-500 font-bold' : 'text-gray-400'}">Stok: ${item.stock}</span>` : '';
        
        el.className = `menu-card ${item.color || 'bg-white'} p-2 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center cursor-pointer h-28 text-center transition active:scale-95`;
        el.onclick = () => window.addToCart(item.id);
        el.innerHTML = `
            <i class="fas ${item.icon || 'fa-utensils'} text-xl mb-1 text-gray-700 opacity-70"></i>
            <h4 class="font-bold text-[10px] leading-tight text-gray-800 line-clamp-2 h-6 flex items-center justify-center overflow-hidden w-full">${item.name}</h4>
            <p class="text-xs text-blue-700 font-bold mt-0.5">Rp ${item.price.toLocaleString('id-ID')}</p>
            ${stockDisplay}
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

// --- PROCESS PAYMENT (FULL CODE: SEMI-OFFLINE READY) ---
window.processPayment = async function(method) {
    // 1. SIAPKAN DATA AWAL (JANGAN DIHAPUS)
    const buyer = document.getElementById('buyer-name').value.trim() || "Pelanggan";
    let total = 0;
    cart.forEach(i => total += ((parseInt(i.price)||0) * (parseInt(i.qty)||0)));
    
    let paidAmount = 0;
    let changeAmount = 0;
    let remaining = 0;

    // 2. INPUT JUMLAH UANG (LOGIKA PEMBAYARAN)
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

        if (money === false) { 
            // Uang Pas (Deny Button)
            paidAmount = total;
        } else if (money) {
            // Input Manual
            paidAmount = parseInt(money);
        } else {
            return; // Cancel
        }

        if (paidAmount > total) {
            changeAmount = paidAmount - total;
        } else if (paidAmount < total) {
            method = 'HUTANG'; 
            remaining = total - paidAmount;
            Swal.fire('Info', `Uang kurang, transaksi dicatat sebagai Hutang dengan sisa Rp ${remaining.toLocaleString()}`, 'info');
        }
    } else if (method === 'QRIS') {
        paidAmount = total;
    } else if (method === 'HUTANG') {
        remaining = total;
    }

    // 3. EKSEKUSI PENYIMPANAN (LOGIKA FIRE & FORGET)
    Swal.fire({title: 'Memproses...', didOpen: () => Swal.showLoading()});

    try {
        // A. UPDATE STOK (Local Logic)
        if (!editingTransactionId) {
            for (const item of cart) {
                if (!item.isManual && item.id) {
                    const menuItem = menus.find(m => m.id === item.id);
                    if (menuItem) {
                        // Update stok di memori lokal dulu biar UI stok langsung berkurang
                        menuItem.stock = (menuItem.stock || 0) - item.qty;
                        
                        // Kirim update ke Firebase
                        const stockRef = doc(db, "users", shopOwnerId, "menus", item.id);
                        if (navigator.onLine) {
                            await setDoc(stockRef, { stock: menuItem.stock }, { merge: true });
                        } else {
                            // Jika Offline: Kirim tanpa await (Fire & Forget)
                            setDoc(stockRef, { stock: menuItem.stock }, { merge: true }); 
                        }
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

        // C. KIRIM KE DATABASE (LOGIKA PINTAR: ONLINE vs OFFLINE)
        if (editingTransactionId) {
            // --- MODE EDIT ---
            delete trxData.timestamp; 
            delete trxData.date;
            trxData.updatedAt = Date.now();
            
            const docRef = doc(db, "users", shopOwnerId, "transactions", editingTransactionId);
            
            if (navigator.onLine) {
                await setDoc(docRef, trxData, { merge: true }); // Tunggu server jika Online
            } else {
                setDoc(docRef, trxData, { merge: true }); // Jangan tunggu jika Offline
            }
            
            Swal.fire({icon: 'success', title: 'Revisi Disimpan', text: navigator.onLine ? '' : '(Mode Offline)', timer: 1500, showConfirmButton: false});
            exitEditMode();

        } else {
            // --- MODE TRANSAKSI BARU ---
            const colRef = collection(db, "users", shopOwnerId, "transactions");
            
            if (navigator.onLine) {
                await addDoc(colRef, trxData); // Tunggu server confirm
            } else {
                addDoc(colRef, trxData); // Langsung lanjut, biarkan antre di background
                
                // PENTING: Masukkan manual ke array lokal biar tampil di riwayat tanpa refresh
                const offlineTrx = { id: 'offline_' + Date.now(), ...trxData };
                transactions.unshift(offlineTrx); 
                renderTransactions(); // Refresh tampilan riwayat
            }

            let msg = method === 'TUNAI' ? `Kembali: Rp ${changeAmount.toLocaleString('id-ID')}` : 'Berhasil';
            if (!navigator.onLine) msg += ' (Disimpan di HP)';

            Swal.fire({
                icon: 'success', 
                title: 'Transaksi Berhasil', 
                text: msg,
                timer: 3000, 
                showConfirmButton: true
            });
            
            // Reset Cart setelah berhasil
            cart = [];
            document.getElementById('buyer-name').value = '';
            renderCart();
        }

        window.closeBillModal();
        
    } catch (e) {
        console.error(e);
        // Kalau errornya cuma koneksi saat offline, abaikan saja dan anggap sukses
        if (!navigator.onLine) {
             window.closeBillModal();
             cart = [];
             renderCart();
             return;
        }
        Swal.fire('Error', 'Terjadi kesalahan: ' + (e.message || 'Unknown'), 'error');
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

window.addNewMenu = async function() {
    const name = document.getElementById('new-menu-name').value;
    const price = document.getElementById('new-menu-price').value;
    const stock = document.getElementById('new-menu-stock').value;
    let cat = document.getElementById('selected-admin-cat').value;
    if(!cat || cat === 'all') cat = 'makanan';

    if(!name || !price) return Swal.fire('Error', 'Lengkapi data', 'error');

    let icon = 'fa-utensils';
    let color = 'bg-white';
    if(cat.includes('minum')) { icon = 'fa-glass-water'; color = 'bg-blue-50'; }
    if(cat.includes('camil')) { icon = 'fa-bread-slice'; color = 'bg-yellow-50'; }
    
    Swal.fire({title: 'Menyimpan...', didOpen: () => Swal.showLoading()});
    try {
        await addDoc(collection(db, "users", shopOwnerId, "menus"), {
            name: name, price: parseInt(price), category: cat, icon: icon, color: color, stock: parseInt(stock) || 0, favorite: false
        });
        document.getElementById('new-menu-name').value = '';
        document.getElementById('new-menu-price').value = '';
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
        row.innerHTML = `<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 bg-gray-100"><i class="fas ${item.icon}"></i></div><div><div class="font-bold text-sm text-gray-800">${item.name}</div><div class="text-xs text-gray-500">${item.category} • Stok: ${item.stock || 0}</div></div></div><div class="flex gap-2"><button onclick="window.toggleFavorite('${item.id}')" class="text-${item.favorite ? 'red' : 'gray'}-500 text-xl">${item.favorite ? '❤️' : '♡'}</button><button onclick="window.deleteMenu('${item.id}')" class="text-red-500 px-3 py-2 bg-red-50 rounded-lg hover:bg-red-100 transition active:scale-95"><i class="fas fa-trash"></i></button></div>`;
        list.appendChild(row);
    });
}

// --- LOGIKA FILTER METODE BAYAR ---
window.setReportPaymentFilter = function(mode) {
    reportPaymentFilter = mode;
    const btns = document.getElementById('report-payment-filters').querySelectorAll('button');
    btns.forEach(btn => btn.classList.remove('active', 'bg-purple-600', 'text-white'));
    btns.forEach(btn => btn.classList.add('text-purple-200', 'bg-purple-700'));
    
    if(mode === 'all') { btns[0].classList.add('active', 'bg-purple-600', 'text-white'); btns[0].classList.remove('text-purple-200', 'bg-purple-700'); }
    if(mode === 'TUNAI') { btns[1].classList.add('active', 'bg-purple-600', 'text-white'); btns[1].classList.remove('text-purple-200', 'bg-purple-700'); }
    if(mode === 'HUTANG') { btns[2].classList.add('active', 'bg-purple-600', 'text-white'); btns[2].classList.remove('text-purple-200', 'bg-purple-700'); }
    if(mode === 'QRIS') { btns[3].classList.add('active', 'bg-purple-600', 'text-white'); btns[3].classList.remove('text-purple-200', 'bg-purple-700'); }

    renderTransactions();
}

// --- LOGIKA FILTER QUERY TAMBAHAN ---
window.setQueryFilter = function(mode) {
    if (queryFilterMode === mode) {
        queryFilterMode = 'none'; 
    } else {
        queryFilterMode = mode;
    }
    const btns = document.getElementById('report-query-filters').querySelectorAll('button');
    btns.forEach(btn => btn.classList.remove('active'));
    if (queryFilterMode !== 'none') {
        btns.forEach(btn => {
            if (btn.onclick.toString().includes(mode)) btn.classList.add('active');
        });
    }
    renderTransactions();
};

// --- TRANSACTIONS & BILL ---
function renderTransactions() {
    const list = document.getElementById('transaction-list');
    const totalEl = document.getElementById('report-grand-total');
    const labelEl = document.getElementById('report-period-label');
    list.innerHTML = '';
    
    const now = new Date();
    filteredTrx = transactions;
    let filterLabel = "Semua";

    if (reportFilterMode === 'today') {
        const todayStr = now.toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === todayStr);
        filterLabel = "Hari Ini";
    } else if (reportFilterMode === 'yesterday') {
        const yest = new Date(now); yest.setDate(yest.getDate() - 1);
        const yestStr = yest.toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === yestStr);
        filterLabel = "Kemarin";
    } else if (reportFilterMode === 'month') {
        filteredTrx = transactions.filter(t => { const d = new Date(t.timestamp); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
        filterLabel = "Bulan Ini";
    } else if (reportFilterMode === 'custom' && reportFilterDate) {
        const selStr = new Date(reportFilterDate).toLocaleDateString('id-ID');
        filteredTrx = transactions.filter(t => new Date(t.timestamp).toLocaleDateString('id-ID') === selStr);
        filterLabel = selStr;
    }

    if (reportPaymentFilter !== 'all') {
        filteredTrx = filteredTrx.filter(t => t.method === reportPaymentFilter);
        filterLabel += ` (${reportPaymentFilter})`;
    }

    if(filteredTrx.length === 0) { list.innerHTML = '<p class="text-center text-gray-400 text-xs mt-10">Kosong</p>'; totalEl.innerText = 'Rp 0'; return; }
    
    let omzet = 0;
    let isHutangFilter = reportPaymentFilter === 'HUTANG';
    labelEl.innerText = (isHutangFilter ? "Sisa Hutang " : "Omzet ") + filterLabel;

    if (queryFilterMode === 'none') {
        filteredTrx.forEach(trx => {
            const calcValue = isHutangFilter ? (trx.remaining || 0) : trx.total;
            omzet += calcValue;
            
            const el = document.createElement('div');
            el.onclick = () => window.viewTransactionDetail(trx.id);
            el.className = `bg-white p-3 mb-2 rounded border-l-4 ${trx.method === 'HUTANG' || trx.remaining > 0 ? 'border-red-500' : 'border-green-500'} cursor-pointer shadow-sm`;
            let paymentInfo = `${trx.items ? trx.items.length : 0} Item • ${trx.method} • Kasir: ${trx.operatorName || 'Admin'}`;

            if (trx.remaining > 0) {
                paymentInfo += ` (Sisa Hutang: Rp ${trx.remaining.toLocaleString('id-ID')})`;
            }
            if (isHutangFilter && trx.total !== trx.remaining) {
                paymentInfo += ` (Total Belanja: Rp ${trx.total.toLocaleString('id-ID')})`;
            }
            
            el.innerHTML = `<div class="flex justify-between"><span class="font-bold text-sm">${trx.buyer}</span><span class="text-xs text-gray-500">${trx.date}</span></div><div class="flex justify-between mt-1"><span class="text-xs text-gray-500">${paymentInfo}</span><span class="font-bold text-gray-800">Rp ${calcValue.toLocaleString('id-ID')}</span></div>`;
            list.appendChild(el);
        });
        totalEl.innerText = 'Rp ' + omzet.toLocaleString('id-ID');
    } else {
        list.innerHTML = ''; 
        totalEl.innerText = ''; 
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
            labelEl.innerText = "Menu Terlaris " + filterLabel;
            sorted.forEach(([name, data]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-blue-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${name}</div><div class="text-xs text-gray-500">Qty: ${data.qty} | Omzet: Rp ${data.revenue.toLocaleString('id-ID')}</div>`;
                list.appendChild(el);
            });
        } else if (queryFilterMode === 'daily_menu') {
            Swal.fire({ title: 'Pilih Menu', input: 'text' }).then(async (result) => {
                const menuName = result.value;
                if (!menuName) return;
                let dailySales = {};
                filteredTrx.forEach(trx => {
                    const day = new Date(trx.timestamp).toLocaleDateString('id-ID');
                    const menuItems = trx.items.filter(i => i.name.toLowerCase().includes(menuName.toLowerCase()));
                    let dayQty = 0, dayRev = 0;
                    menuItems.forEach(i => { dayQty += i.qty; dayRev += i.price * i.qty; });
                    if (dayQty > 0) {
                        if (!dailySales[day]) dailySales[day] = { qty: 0, revenue: 0 };
                        dailySales[day].qty += dayQty;
                        dailySales[day].revenue += dayRev;
                    }
                });
                const sortedDays = Object.entries(dailySales).sort((a, b) => new Date(b[0]) - new Date(a[0]));
                labelEl.innerText = `Penjualan Harian ${menuName} ` + filterLabel;
                sortedDays.forEach(([day, data]) => {
                    const el = document.createElement('div');
                    el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-green-500 shadow-sm';
                    el.innerHTML = `<div class="font-bold text-sm">${day}</div><div class="text-xs text-gray-500">Qty: ${data.qty} | Omzet: Rp ${data.revenue.toLocaleString('id-ID')}</div>`;
                    list.appendChild(el);
                });
            });
        } else if (queryFilterMode === 'category_omzet') {
            let catOmzet = {};
            filteredTrx.forEach(trx => {
                trx.items.forEach(item => {
                    const cat = menus.find(m => m.id === item.id)?.category || 'Lainnya';
                    if (!catOmzet[cat]) catOmzet[cat] = { revenue: 0, qty: 0 };
                    catOmzet[cat].revenue += item.price * item.qty;
                    catOmzet[cat].qty += item.qty;
                });
            });
            labelEl.innerText = "Omzet per Kategori " + filterLabel;
            Object.entries(catOmzet).forEach(([cat, data]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-purple-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${cat}</div><div class="text-xs text-gray-500">Qty: ${data.qty} | Omzet: Rp ${data.revenue.toLocaleString('id-ID')}</div>`;
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
            labelEl.innerText = "Pelanggan Hutang Terbanyak " + filterLabel;
            sorted.forEach(([buyer, data]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-red-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${buyer}</div><div class="text-xs text-gray-500">Sisa: Rp ${data.sisa.toLocaleString('id-ID')} | Transaksi: ${data.count}</div>`;
                list.appendChild(el);
            });
            totalEl.innerText = 'Rp ' + sorted.reduce((sum, [_, d]) => sum + d.sisa, 0).toLocaleString('id-ID');
        } else if (queryFilterMode === 'tren_mingguan') {
            let weeklyOmzet = {};
            filteredTrx.forEach(trx => {
                const date = new Date(trx.timestamp);
                const week = `${date.getFullYear()}-W${Math.floor((date.getDate() - date.getDay() + 7) / 7)}`;
                if (!weeklyOmzet[week]) weeklyOmzet[week] = 0;
                weeklyOmzet[week] += trx.total;
            });
            const sortedWeeks = Object.entries(weeklyOmzet).sort((a, b) => a[0].localeCompare(b[0]));
            labelEl.innerText = "Tren Omzet Mingguan " + filterLabel;
            sortedWeeks.forEach(([week, omzet]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-indigo-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${week}</div><div class="text-xs text-gray-500">Omzet: Rp ${omzet.toLocaleString('id-ID')}</div>`;
                list.appendChild(el);
            });
        } else if (queryFilterMode === 'item_per_hari') {
            Swal.fire({ title: 'Pilih Kategori/Menu', input: 'text' }).then(async (result) => {
                const search = result.value.toLowerCase();
                if (!search) return;
                let dailyQty = {};
                filteredTrx.forEach(trx => {
                    const day = new Date(trx.timestamp).toLocaleDateString('id-ID');
                    let dayQty = 0;
                    trx.items.forEach(item => {
                        const cat = menus.find(m => m.id === item.id)?.category || '';
                        if (item.name.toLowerCase().includes(search) || cat.toLowerCase().includes(search)) dayQty += item.qty;
                    });
                    if (dayQty > 0) {
                        if (!dailyQty[day]) dailyQty[day] = 0;
                        dailyQty[day] += dayQty;
                    }
                });
                const sortedDays = Object.entries(dailyQty).sort((a, b) => new Date(b[0]) - new Date(a[0]));
                labelEl.innerText = `Item Terjual per Hari (${search}) ` + filterLabel;
                sortedDays.forEach(([day, qty]) => {
                    const el = document.createElement('div');
                    el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-teal-500 shadow-sm';
                    el.innerHTML = `<div class="font-bold text-sm">${day}</div><div class="text-xs text-gray-500">Qty: ${qty}</div>`;
                    list.appendChild(el);
                });
            });
        } else if (queryFilterMode === 'payment_breakdown') {
            let methodBreak = { TUNAI: { count: 0, total: 0 }, HUTANG: { count: 0, total: 0 }, QRIS: { count: 0, total: 0 } };
            filteredTrx.forEach(trx => {
                const key = trx.method;
                if (methodBreak[key]) {
                    methodBreak[key].count += 1;
                    methodBreak[key].total += (key === 'HUTANG' ? trx.remaining : trx.total);
                }
            });
            labelEl.innerText = "Breakdown Pembayaran " + filterLabel;
            Object.entries(methodBreak).forEach(([method, data]) => {
                const perc = (data.total / omzet * 100).toFixed(2) || 0;
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-yellow-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${method}</div><div class="text-xs text-gray-500">Transaksi: ${data.count} | Total: Rp ${data.total.toLocaleString('id-ID')} (${perc}%)</div>`;
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
            labelEl.innerText = "Pelanggan Setia " + filterLabel;
            sorted.forEach(([buyer, data]) => {
                const el = document.createElement('div');
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-green-500 shadow-sm';
                el.innerHTML = `<div class="font-bold text-sm">${buyer}</div><div class="text-xs text-gray-500">Transaksi: ${data.count} | Total Belanja: Rp ${data.total.toLocaleString('id-ID')}</div>`;
                list.appendChild(el);
            });
        } else if (queryFilterMode === 'revisi_transaksi') {
            const revisedTrx = filteredTrx.filter(trx => trx.updatedAt); 
            labelEl.innerText = "Transaksi Direvisi " + filterLabel;
            revisedTrx.forEach(trx => {
                const el = document.createElement('div');
                el.onclick = () => window.viewTransactionDetail(trx.id);
                el.className = 'bg-white p-3 mb-2 rounded border-l-4 border-orange-500 cursor-pointer shadow-sm';
                el.innerHTML = `<div class="flex justify-between"><span class="font-bold text-sm">${trx.buyer}</span><span class="text-xs text-gray-500">${trx.date}</span></div><div class="flex justify-between mt-1"><span class="text-xs text-gray-500">Direvisi pada ${new Date(trx.updatedAt).toLocaleString('id-ID')}</span><span class="font-bold text-gray-800">Rp ${trx.total.toLocaleString('id-ID')}</span></div>`;
                list.appendChild(el);
            });
        }
    }
}

window.setReportFilter = function(mode, val) {
    reportFilterMode = mode;
    if(val) reportFilterDate = val;
    const btns = document.getElementById('report-filters').querySelectorAll('.filter-btn');
    btns.forEach(b => b.classList.remove('active'));
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
