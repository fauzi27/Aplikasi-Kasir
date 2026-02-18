// ============================================================
// 🧠 OTAK KECERDASAN BUATAN (AI BRAIN - MODE BEBAS)
// ============================================================

const GROQ_API_KEY = "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"; 

// 1. KEPRIBADIAN & ATURAN (HYBRID MODE)
const AI_PERSONALITY = `
Kamu adalah "Sahabat AI", asisten cerdas untuk aplikasi kasir "SAHABAT USAHAMU".
Kamu memiliki dua mode kepribadian:

1. **MODE KASIR (PRIORITAS UTAMA):**
   Jika pengguna bertanya soal data penjualan, stok, omzet, atau laporan toko, JAWABLAH BERDASARKAN DATA REAL-TIME yang diberikan di bawah. Jangan mengarang angka!

2. **MODE SAHABAT (BEBAS):**
   Jika pengguna bertanya hal umum (seperti puisi, resep masakan, tips bisnis, curhat, lelucon, atau info umum), JAWABLAH DENGAN BEBAS, KREATIF, DAN CERDAS. Kamu boleh membahas apa saja di luar konteks warung.

Gaya Bicara: Santai, gaul, akrab, suportif, dan suka pakai emoji yang asik. 
Jangan kaku seperti robot bank. Anggap pengguna adalah teman nongkrongmu.
`;

// 2. FUNGSI PENYUSUN MEMORI (MENGGABUNGKAN DATA)
export function generateContext(transactions, menus) {
    const todayStr = new Date().toLocaleDateString('id-ID');
    let omzet = 0;
    let itemsSold = {};
    let hutangList = [];
    let methodStats = { TUNAI: 0, QRIS: 0, HUTANG: 0 };

    // Analisa Transaksi
    transactions.forEach(t => {
        if (new Date(t.timestamp).toLocaleDateString('id-ID') === todayStr) {
            omzet += t.total;
            if(methodStats[t.method] !== undefined) methodStats[t.method] += t.total;
            else if(t.method === 'HUTANG') methodStats.HUTANG += t.remaining;
            
            if (t.items) t.items.forEach(i => itemsSold[i.name] = (itemsSold[i.name] || 0) + i.qty);
            if (t.remaining > 0) hutangList.push(`- ${t.buyer}: Rp ${t.remaining.toLocaleString('id-ID')}`);
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

    // RAKIT DATA (Ini adalah "Contekan" bagi AI jika ditanya soal toko)
    return `
${AI_PERSONALITY}

=== DATA RAHASIA TOKO HARI INI (${todayStr}) ===
(Gunakan data ini HANYA jika user bertanya soal toko/jualan)
💰 Omzet: Rp ${omzet.toLocaleString('id-ID')}
📊 Rincian: Tunai (Rp ${methodStats.TUNAI.toLocaleString()}), QRIS (Rp ${methodStats.QRIS.toLocaleString()}), Hutang (Rp ${methodStats.HUTANG.toLocaleString()})
🏆 Terlaris: ${bestSeller || "Belum ada"}
⚠️ Stok Tipis:
${lowStock || "Aman"}
📒 Daftar Hutang:
${hutangList.join('\n') || "Nihil"}
==================================================
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
                temperature: 0.8, // Kita naikkan jadi 0.8 biar lebih kreatif bikin puisinya
                max_tokens: 1000
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            throw new Error("AI membisu...");
        }
    } catch (error) {
        console.error("AI Error:", error);
        return "Waduh, sinyal ke otak saya putus bosku! Coba lagi ya.";
    }
}
