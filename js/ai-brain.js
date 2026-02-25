// ============================================================
// 🧠 OTAK KECERDASAN BUATAN (AI BRAIN - LEVEL ANALIS DATA)
// ============================================================

const GROQ_API_KEY = "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"; 

// 1. KEPRIBADIAN & ATURAN
const AI_PERSONALITY = `
Kamu adalah "Sahabat AI", asisten virtual super cerdas, serba bisa, dan sahabat terbaik untuk Bos Pemilik "SAHABAT USAHAMU".

KEMAMPUAN UTAMAMU (HYBRID):
1. ASISTEN UMUM: Kamu bebas dan bisa melakukan apa saja! Jika Bos meminta dibuatkan puisi, menulis kode (coding), bercanda, atau menjawab pengetahuan umum, layani dengan kreatif, santai, dan cerdas.
2. ANALIS BISNIS: Jika Bos bertanya tentang omzet, penjualan, atau stok warung, JANGAN MENGARANG ANGKA. Wajib gunakan "DATA RANGKUMAN BISNIS" di bawah ini untuk memberikan analisa dan saran strategi.

ATURAN SIKAP:
- Selalu panggil user dengan sebutan "Bosku".
- Gunakan bahasa yang santai, asyik, suportif, dan gunakan emoji secukupnya.
- Jika ditanya hal di luar data warung (seperti cuaca hari ini), jawab saja pengetahuan umummu atau katakan dengan santai kalau kamu belum terhubung ke satelit BMKG.
`;


// 2. FUNGSI PENGOLAH DATA (THE CALCULATOR ENGINE)
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
        lastMonth: { omzet: 0, trx: 0 }, // Untuk perbandingan
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
            
            // Item Harian
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
            // Item Bulanan (Untuk cari Best Seller Bulanan)
            if(t.items) t.items.forEach(i => {
                stats.thisMonth.items[i.name] = (stats.thisMonth.items[i.name] || 0) + i.qty;
            });
        }

        // 4. DATA BULAN LALU (Untuk Komparasi)
        // Logika sederhana: Jika bulan sekarang 0 (Jan), bulan lalu 11 (Des) tahun sebelumnya
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

    // Cari Menu Terlaris Harian
    let bestSellerToday = Object.entries(stats.today.items)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(i => `${i[0]} (${i[1]})`).join(', ');

    // Cari Menu Terlaris Bulanan
    let bestSellerMonth = Object.entries(stats.thisMonth.items)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(i => `${i[0]} (${i[1]} pcs)`).join(', ');

    // Cek Stok Menipis
    let lowStock = menus
        .filter(m => (m.stock || 0) <= 5)
        .map(m => `${m.name} (Sisa: ${m.stock})`).join(', ');

    // Analisa Pertumbuhan (Month over Month)
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

=== 📊 RANGKUMAN BISNIS REAL-TIME ===

1. PERFORMA HARI INI (${todayStr}):
   - Omzet: Rp ${stats.today.omzet.toLocaleString('id-ID')} (${stats.today.trx} transaksi)
   - Terlaris: ${bestSellerToday || "-"}
   - Hutang Baru: ${stats.hutang.join(', ') || "Nihil"}

2. PERFORMA MINGGU INI (7 Hari Terakhir):
   - Total Omzet: Rp ${stats.thisWeek.omzet.toLocaleString('id-ID')}

3. PERFORMA BULAN INI:
   - Total Omzet: Rp ${stats.thisMonth.omzet.toLocaleString('id-ID')}
   - Menu Jagoan Bulan Ini: ${bestSellerMonth || "-"}
   - Perbandingan: ${growthText} (Bulan lalu: Rp ${stats.lastMonth.omzet.toLocaleString()})

4. PERFORMA TAHUN INI (${currentYear}):
   - Total Akumulasi: Rp ${stats.thisYear.omzet.toLocaleString('id-ID')}

5. STATUS GUDANG:
   - Stok Kritis: ${lowStock || "Semua Aman"}
   - Total Varian Menu: ${menus.length} Item

(Gunakan data di atas untuk menjawab pertanyaan user. Jika user bertanya "Gimana performa warung?", berikan analisa mendalam dari data bulanan dan mingguan.)
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
                max_tokens: 1200 // Token diperbanyak agar jawabannya bisa panjang lebar
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
