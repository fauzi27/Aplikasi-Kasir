// ============================================================
// 🧠 OTAK KECERDASAN BUATAN (AI BRAIN)
// ============================================================
// Di sini tempat kamu "melatih" AI dengan mengubah System Prompt.

const GROQ_API_KEY = "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"; 

// 1. KEPRIBADIAN & ATURAN (TRAINING DATA)
const AI_PERSONALITY = `
Kamu adalah "Sahabat AI", asisten bisnis digital untuk aplikasi kasir "SAHABAT USAHAMU".
Gaya bicaramu: Santai, ramah, profesional, dan menggunakan emoji yang relevan.
Bahasa: Bahasa Indonesia gaul tapi sopan (seperti partner bisnis).

TUGAS UTAMA:
1. Menganalisa penjualan dan stok berdasarkan data yang diberikan.
2. Memberikan saran marketing (copywriting WA) jika diminta.
3. Memberi semangat kepada pemilik toko.

PANTANGAN:
- JANGAN mengarang data penjualan. Gunakan hanya data yang disuplai di bawah.
- Jika data kosong, katakan "Belum ada data".
- JANGAN menjawab pertanyaan di luar konteks bisnis/warung (misal: jangan jawab soal politik).
`;

// 2. FUNGSI PENYUSUN MEMORI (MENGGABUNGKAN DATA REAL-TIME)
// Fungsi ini mengubah data mentah kasir menjadi teks yang bisa dibaca AI
export function generateContext(transactions, menus) {
    const todayStr = new Date().toLocaleDateString('id-ID');
    let omzet = 0;
    let itemsSold = {};
    let hutangList = [];
    let methodStats = { TUNAI: 0, QRIS: 0, HUTANG: 0 };

    // Analisa Transaksi Hari Ini
    transactions.forEach(t => {
        if (new Date(t.timestamp).toLocaleDateString('id-ID') === todayStr) {
            omzet += t.total;
            // Hitung Metode Bayar
            if(methodStats[t.method] !== undefined) methodStats[t.method] += t.total;
            else if(t.method === 'HUTANG') methodStats.HUTANG += t.remaining;
            
            // Hitung Item Terlaris
            if (t.items) {
                t.items.forEach(i => {
                    itemsSold[i.name] = (itemsSold[i.name] || 0) + i.qty;
                });
            }
            // Catat Hutang
            if (t.remaining > 0) {
                hutangList.push(`- ${t.buyer}: Rp ${t.remaining.toLocaleString('id-ID')}`);
            }
        }
    });

    // Cari Stok Menipis
    let lowStock = menus
        .filter(m => (m.stock || 0) <= 5)
        .map(m => `- ${m.name} (Sisa: ${m.stock})`)
        .join('\n');

    // Cari Best Seller
    let bestSeller = Object.entries(itemsSold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(i => `${i[0]} (${i[1]} pcs)`)
        .join(', ');

    // RAKIT PROMPT AKHIR
    return `
${AI_PERSONALITY}

DATA REAL-TIME TOKO HARI INI (${todayStr}):
💰 Total Omzet: Rp ${omzet.toLocaleString('id-ID')}
📊 Rincian Bayar: Tunai (Rp ${methodStats.TUNAI.toLocaleString()}), QRIS (Rp ${methodStats.QRIS.toLocaleString()}), Hutang (Rp ${methodStats.HUTANG.toLocaleString()})
🏆 Menu Terlaris: ${bestSeller || "Belum ada penjualan"}
⚠️ Stok Menipis (Wajib Restock):
${lowStock || "Aman, tidak ada yang menipis."}
📒 Daftar Pelanggan Berhutang Hari Ini:
${hutangList.join('\n') || "Tidak ada hutang hari ini."}
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
                model: "llama-3.3-70b-versatile", // Model Llama 3 yang Cepat & Pintar
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7, // Tingkat kreativitas (0.7 = seimbang)
                max_tokens: 600
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            throw new Error(data.error?.message || "Respon kosong dari AI");
        }
    } catch (error) {
        console.error("AI Error:", error);
        return "Maaf bosku, koneksi ke otak AI terputus. Coba cek internetnya ya! 🤕";
    }
}
