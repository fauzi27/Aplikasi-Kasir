// ============================================================
// 🧠 OTAK KECERDASAN BUATAN (AI BRAIN - LEVEL SUPER ASISTEN)
// ============================================================

const GROQ_API_KEY = "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"; 

// 1. KEPRIBADIAN & ATURAN
const AI_PERSONALITY = `
Kamu adalah "Sahabat AI", asisten virtual super cerdas, serba bisa, dan sahabat terbaik untuk Bos Pemilik "SAHABAT USAHAMU" (Sebuah Aplikasi Kasir PWA/Point of Sale).

KEMAMPUAN UTAMAMU (HYBRID):
1. ASISTEN UMUM: Bebas dan santai! Jika Bos meminta dibuatkan puisi, coding, bercanda, atau pengetahuan umum, layani dengan kreatif dan asyik.
2. ANALIS BISNIS: Jika Bos bertanya tentang omzet, penjualan, atau stok warung, JANGAN MENGARANG ANGKA. Wajib gunakan "DATA RANGKUMAN BISNIS" di bawah ini.
3. CUSTOMER SERVICE APLIKASI: Jika Bos atau Kasir bertanya cara menggunakan aplikasi ini, pandu mereka menggunakan "PANDUAN APLIKASI" di bawah ini.

ATURAN SIKAP:
- Selalu panggil user dengan sebutan "Bosku".
- Gunakan bahasa yang santai, asyik, suportif, dan gunakan emoji secukupnya.
- Berikan jawaban berbentuk poin-poin (bullet points) jika menjelaskan tutorial/langkah-langkah agar mudah dibaca.
`;

// 2. FUNGSI PENGOLAH DATA & KONTEKS (THE ENGINE)
export function generateContext(transactions, menus) {
    const now = new Date();
    const todayStr = now.toLocaleDateString('id-ID');
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    
    // Inisialisasi Wadah Data
    let stats = {
        today: { omzet: 0, trx: 0, items: {} },
        thisWeek: { omzet: 0, trx: 0 },
        thisMonth: { omzet: 0, trx: 0, items: {} },
        lastMonth: { omzet: 0, trx: 0 }, 
        thisYear: { omzet: 0, trx: 0 },
        hutang: []
    };

    // --- LOOPING UTAMA (Menganalisa Setiap Transaksi) ---
    transactions.forEach(t => {
        const tDate = new Date(t.timestamp);
        const tDateStr = tDate.toLocaleDateString('id-ID');
        
        // 1. DATA HARI INI
        if (tDateStr === todayStr) {
            stats.today.omzet += t.total;
            stats.today.trx += 1;
            if (t.remaining > 0) stats.hutang.push(`${t.buyer} (Rp ${t.remaining.toLocaleString()})`);
            
            if(t.items) t.items.forEach(i => {
                stats.today.items[i.name] = (stats.today.items[i.name] || 0) + i.qty;
            });
        }

        // 2. DATA MINGGU INI (7 Hari Terakhir)
        const diffTime = Math.abs(now - tDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) {
            stats.thisWeek.omzet += t.total;
            stats.thisWeek.trx += 1;
        }

        // 3. DATA BULAN INI
        if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
            stats.thisMonth.omzet += t.total;
            stats.thisMonth.trx += 1;
            if(t.items) t.items.forEach(i => {
                stats.thisMonth.items[i.name] = (stats.thisMonth.items[i.name] || 0) + i.qty;
            });
        }

        // 4. DATA BULAN LALU (Untuk Komparasi)
        let prevMonth = currentMonth - 1;
        let prevYear = currentYear;
        if (prevMonth < 0) { prevMonth = 11; prevYear = currentYear - 1; }
        
        if (tDate.getMonth() === prevMonth && tDate.getFullYear() === prevYear) {
            stats.lastMonth.omzet += t.total;
            stats.lastMonth.trx += 1;
        }

        // 5. DATA TAHUN INI
        if (tDate.getFullYear() === currentYear) {
            stats.thisYear.omzet += t.total;
            stats.thisYear.trx += 1;
        }
    });

    // --- ANALISA LANJUTAN ---
    let bestSellerToday = Object.entries(stats.today.items)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(i => `${i[0]} (${i[1]})`).join(', ');

    let bestSellerMonth = Object.entries(stats.thisMonth.items)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(i => `${i[0]} (${i[1]} pcs)`).join(', ');

    let lowStock = menus
        .filter(m => (m.stock || 0) <= 5)
        .map(m => `${m.name} (Sisa: ${m.stock})`).join(', ');

    let growthText = "";
    if (stats.lastMonth.omzet > 0) {
        let percent = ((stats.thisMonth.omzet - stats.lastMonth.omzet) / stats.lastMonth.omzet) * 100;
        growthText = percent > 0 
            ? `📈 NAIK ${percent.toFixed(1)}% dibanding bulan lalu.` 
            : `📉 TURUN ${Math.abs(percent).toFixed(1)}% dibanding bulan lalu.`;
    }

    // --- RAKIT DATA UNTUK DIKIRIM KE AI ---
    return `
${AI_PERSONALITY}

=== 📊 RANGKUMAN BISNIS REAL-TIME (${todayStr}) ===
1. HARI INI: Omzet Rp ${stats.today.omzet.toLocaleString('id-ID')} | Trx: ${stats.today.trx} | Terlaris: ${bestSellerToday || "-"} | Hutang: ${stats.hutang.join(', ') || "Nihil"}
2. MINGGU INI (7 Hari): Rp ${stats.thisWeek.omzet.toLocaleString('id-ID')}
3. BULAN INI: Rp ${stats.thisMonth.omzet.toLocaleString('id-ID')} | Terlaris: ${bestSellerMonth || "-"} | Status: ${growthText}
4. TAHUN INI: Rp ${stats.thisYear.omzet.toLocaleString('id-ID')}
5. STOK GUDANG: Kritis/Habis: ${lowStock || "Semua Aman"} | Total Menu: ${menus.length} Item

=== 📱 PANDUAN PENGGUNAAN APLIKASI (BANTU USER JIKA BERTANYA) ===
1. MULAI JUALAN (Kasir): 
   - Klik menu untuk tambah pesanan. (+) dan (-) untuk ubah jumlah.
   - Klik "Bayar", pilih metode (TUNAI, QRIS, HUTANG). Masukkan nominal bayar, sistem otomatis hitung kembalian.
   - Struk bisa dikirim via WhatsApp atau di-download.

2. STOK: 
   - Tempat melihat sisa barang. Tekan (-) atau (+) untuk ubah stok instan.

3. LAPORAN (Dashboard): 
   - Melihat omzet kotor, uang tunai, hutang. 
   - Tombol filter "Terlaris", "Hutang Terbanyak", "Pelanggan Setia". Bisa dicetak ke PDF / Excel.

4. TABEL REKAP: 
   - Riwayat transaksi berwujud tabel rapi seperti Excel. Menampilkan detail item dan status Lunas/Hutang.

5. MANUAL (Kalkulator): 
   - Buat jual barang yang belum didaftarkan di menu. Ketik harga -> klik ADD -> beri nama -> masuk keranjang.

6. KELOLA MENU (Hanya Admin): 
   - Tambah menu baru, upload foto dari galeri HP, atur harga, dan hapus menu.
   - Tambah kategori baru pakai tombol (+) hijau, hapus pakai (x) merah.

7. SETTING & STUDIO TAMPILAN (Hanya Admin):
   - Edit profil toko & Tambah akun Karyawan/Kasir.
   - STUDIO TAMPILAN: Tempat rahasia untuk ganti Latar Belakang (pakai warna hex atau foto dari galeri) dan ganti warna semua tombol aplikasi.

FITUR SPESIAL APLIKASI INI:
- OFFLINE MODE: Tanda koneksi ada di bawah nama toko di Lobi. Hijau = Online, Merah berkedip = Offline. Aplikasi tetap 100% BISA dipakai jualan saat offline/mati lampu. Data akan diupload otomatis ke cloud saat internet nyala.
- KEMBALI AMAN: Saat di menu, menekan tombol "Back" (kembali) di HP tidak akan mengeluarkan user dari aplikasi, tapi membawanya pulang ke layar Lobi.
`;
}

// 3. FUNGSI PEMANGGIL SERVER (API CALL)
export async function askGroqAI(userMessage, systemPrompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${GROQ_API_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7, 
                max_tokens: 1200 
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            throw new Error("AI tidak merespon.");
        }
    } catch (error) {
        console.error("AI Error:", error);
        return "Maaf bos, sinyal ke server AI putus. Coba cek koneksi internet.";
    }
}
