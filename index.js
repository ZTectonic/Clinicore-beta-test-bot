const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

// .env faylda BOT_TOKEN va ADMIN_ID bo‘lishi kerak
const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID;

if (!token || !adminId) {
    console.error("❌ BOT_TOKEN yoki ADMIN_ID .env faylida topilmadi!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// SQLite DB ulash
const db = new sqlite3.Database("./data.db", (err) => {
    if (err) {
        console.error("❌ Ma'lumotlar bazasiga ulanishda xatolik:", err.message);
    } else {
        console.log("✅ SQLite ma'lumotlar bazasiga ulandik");
    }
});

// Jadval yaratish
db.run(`
CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    username TEXT,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

// Start komandasi
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        "👋 Salom! To‘liq ismingizni yuboring:"
    );
});

// Foydalanuvchi ism yuborganda bazaga yozish
bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!text || text.startsWith("/")) return; // Komanda bo‘lsa yozmaymiz

    db.run(
        `INSERT INTO survey_responses (fullname, username) VALUES (?, ?)`,
        [text, msg.from.username || ""],
        (err) => {
            if (err) {
                console.error("❌ Ma'lumot qo‘shishda xatolik:", err.message);
                bot.sendMessage(chatId, "❌ Xatolik yuz berdi.");
            } else {
                bot.sendMessage(chatId, "✅ Ismingiz qabul qilindi!");
                console.log(`📥 ${text} ismli foydalanuvchi qo‘shildi.`);
            }
        }
    );
});

// /list komandasi (faqat admin)
bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;

    if (chatId.toString() !== adminId.toString()) {
        bot.sendMessage(chatId, "⛔ Bu buyruq faqat admin uchun!");
        return;
    }

    db.all(`SELECT fullname, username, date FROM survey_responses ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            console.error("❌ Ma'lumotlarni olishda xatolik:", err.message);
            bot.sendMessage(chatId, "❌ Xatolik yuz berdi.");
            return;
        }

        if (rows.length === 0) {
            bot.sendMessage(chatId, "📭 Hali hech kim ro‘yxatdan o‘tmagan.");
            return;
        }

        let list = "📋 Ro‘yxatdan o‘tganlar:\n\n";
        rows.forEach((row, index) => {
            list += `${index + 1}. ${row.fullname} ${row.username ? `(@${row.username})` : ""} - ${row.date}\n`;
        });

        bot.sendMessage(chatId, list);
    });
});

// Railway port tinglash (Railway talab qiladi)
const PORT = process.env.PORT || 3000;
require("http")
    .createServer((req, res) => res.end("Bot is running"))
    .listen(PORT, () => console.log(`🚀 Server port ${PORT} da ishga tushdi`));
