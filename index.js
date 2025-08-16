// index.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');

// --- Env
const token = process.env.BOT_TOKEN;
const adminId = (process.env.ADMIN_ID || '').toString();

if (!token || !adminId) {
  console.error('❌ BOT_TOKEN yoki ADMIN_ID .env/Variables da yo‘q.');
  process.exit(1);
}

// --- Bot (polling)
const bot = new TelegramBot(token, { polling: true });

// --- DB
const db = new sqlite3.Database('./survey.db', (err) => {
  if (err) console.error('DB connect error:', err.message);
  else console.log('✅ SQLite ulandi');
});

db.run(`CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER,
  fullname TEXT,
  age TEXT,
  phone TEXT,
  used_app TEXT,
  main_problem TEXT,
  needed_service TEXT,
  willing_to_pay TEXT,
  suggestions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// --- Savollar
const questions = [
  "1. Ism familiyangiz (Misol: Ahmedov Shavkat)",
  "2. Yoshingizni kiriting:",
  "3. Telefon raqamingiz",
  {
    text: "4. Siz sog‘lig‘ingizni nazorat qilish uchun mobil ilovadan foydalanganmisiz?",
    options: { reply_markup: { keyboard: [["Ha", "Yo‘q"]], one_time_keyboard: true, resize_keyboard: true } }
  },
  {
    text: "5. Sog‘lig‘ingizni boshqarishda eng katta qiyinchilik nimada?",
    options: { reply_markup: { keyboard: [
      ["Navbatlar va vaqt yetishmasligi"],
      ["Dori topish qiyinligi"],
      ["Malakali shifokor topish"],
       ["Sog‘liqni nazorat qilish uchun vaqt yo‘qligi"]
    ], one_time_keyboard: true, resize_keyboard: true } }
  },
  {
    text: "6. CliniCore’da qaysi xizmat sizga eng kerakli bo‘lar edi?",
    options: { reply_markup: { keyboard: [
      ["Onlayn shifokor maslahatlari"],
      ["Onlayn dorixona"],
      ["Klinikalarni qidirish"],
      ["Shaxsiy sog‘liq profili"]
    ], one_time_keyboard: true, resize_keyboard: true } }
  },
  {
    text: "7. Agar xizmat sizga mos bo‘lsa, oyiga kichik obuna to‘lovini to‘lashga tayyormisiz?",
    options: { reply_markup: { keyboard: [["Ha"], ["Yo‘q"], ["Balki"]], one_time_keyboard: true, resize_keyboard: true } }
  },
  "8. Bizga taklif yoki izohlaringiz bormi?"
];

// --- Sessiyalar (foydalanuvchi holati)
const userStep = {};   // chatId -> step index
const userData = {};   // chatId -> javoblar

function askQuestion(chatId) {
  const step = userStep[chatId];
  const q = questions[step];
  if (typeof q === 'string') {
    bot.sendMessage(chatId, q);
  } else {
    bot.sendMessage(chatId, q.text, q.options);
  }
}

function isCommand(text) {
  return typeof text === 'string' && text.startsWith('/');
}

// --- /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userStep[chatId] = 0;
  userData[chatId] = { telegram_id: chatId };
  bot.sendMessage(chatId, "👋 Salom! So‘rovnomani boshlaymiz. Iltimos, savollarga navbat bilan javob bering.");
  askQuestion(chatId);
});

// --- Javoblarni qabul qilish
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  // Komandalarni bu handlerda qayta ishlamaymiz
  if (isCommand(text)) return;

  // Faqat aktiv so‘rovnoma bo‘lsa qabul qilamiz
  if (userStep[chatId] === undefined) return;

  const step = userStep[chatId];

  // Javoblarni maydonlarga joylash
  switch (step) {
    case 0: userData[chatId].fullname = text; break;
    case 1: userData[chatId].age = text; break;
    case 2: userData[chatId].phone = text; break;
    case 3: userData[chatId].used_app = text; break;
    case 4: userData[chatId].main_problem = text; break;
    case 5: userData[chatId].needed_service = text; break;
    case 6: userData[chatId].willing_to_pay = text; break;
    case 7: userData[chatId].suggestions = text; break;
    default: break;
  }

  userStep[chatId]++;

  // Keyingi savol yoki yakunlash
  if (userStep[chatId] < questions.length) {
    askQuestion(chatId);
  } else {
    const data = userData[chatId];

    // Bazaga saqlash
    db.run(
      `INSERT INTO survey_responses 
       (telegram_id, fullname, age, phone, used_app, main_problem, needed_service, willing_to_pay, suggestions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.telegram_id,
        data.fullname || '',
        data.age || '',
        data.phone || '',
        data.used_app || '',
        data.main_problem || '',
        data.needed_service || '',
        data.willing_to_pay || '',
        data.suggestions || ''
      ],
      function (err) {
        if (err) {
          console.error('DB insert error:', err);
          bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.");
          // sessiyani tozalaymiz
          delete userStep[chatId];
          delete userData[chatId];
          return;
        }

        const surveyId = this.lastID;

        // Admin’ga yuborish
        const adminMsg =
          `📋 Yangi so‘rovnoma #${surveyId}\n` +
          `🆔 Telegram ID: ${data.telegram_id}\n` +
          `👤 F.I.Sh: ${data.fullname}\n` +
          `🎂 Yoshi: ${data.age}\n` +
          `📞 Telefon: ${data.phone}\n` +
          `📱 Ilova ishlatganmi: ${data.used_app}\n` +
          `⚠️ Qiyinchilik: ${data.main_problem}\n` +
          `🩺 Xizmat: ${data.needed_service}\n` +
          `💰 To‘lovga tayyor: ${data.willing_to_pay}\n` +
          `💬 Taklif: ${data.suggestions}`;
        bot.sendMessage(adminId, adminMsg).catch(() => { /* admin bloklangan bo‘lishi mumkin */ });

        // Foydalanuvchiga xabar
        bot.sendMessage(
          chatId,
          "✅ Rahmat! Siz so‘rovnomani yakunladingiz.\n" +
          "Tez orada CliniCore ishga tushganda xabar yuboramiz va sizga 2 oylik PREMIUM a’zolik taqdim etamiz.\n\n" +
          "📢 Yangiliklardan xabardor bo‘lish uchun bizning Telegram kanalimizga qo‘shiling: @clinicore_uz",
          { reply_markup: { remove_keyboard: true } }
        );

        // Sessiyani tozalash
        delete userStep[chatId];
        delete userData[chatId];
      }
    );
  }
});

// --- /list (faqat admin)
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== adminId) {
    bot.sendMessage(msg.chat.id, "❌ Sizda bu komandani ishlatish huquqi yo‘q.");
    return;
  }

  db.all(
    `SELECT id, fullname, age, phone, created_at FROM survey_responses ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('DB select error:', err);
        bot.sendMessage(msg.chat.id, "❌ Ma'lumotlarni olishda xatolik.");
        return;
      }

      if (rows.length === 0) {
        bot.sendMessage(msg.chat.id, "📭 Hali hech kim so‘rovnomadan o‘tmagan.");
        return;
      }

      let message = "📋 Ro‘yxatdan o‘tganlar:\n\n";
      rows.forEach(row => {
        message += `#${row.id} — ${row.fullname}, ${row.age} yosh\n📞 ${row.phone}\n🕒 ${row.created_at}\n\n`;
      });

      // 4000 belgidan katta xabarlarni bo‘lib yuboramiz
      const parts = message.match(/[\s\S]{1,4000}/g) || [];
      parts.forEach(part => bot.sendMessage(msg.chat.id, part));
    }
  );
});

// --- /clear (faqat admin)
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== adminId) {
    bot.sendMessage(msg.chat.id, "❌ Sizda bu komandani ishlatish huquqi yo‘q.");
    return;
  }

  db.run(`DELETE FROM survey_responses`, (err) => {
    if (err) {
      console.error('DB delete error:', err);
      bot.sendMessage(msg.chat.id, "❌ Ma'lumotlarni o‘chirishda xatolik.");
      return;
    }
    bot.sendMessage(msg.chat.id, "✅ Barcha so‘rovnomalar o‘chirildi.");
  });
});

// --- /help
bot.onText(/\/help/, (msg) => {
  const helpMessage =
    "ℹ️ Yordam\n\n" +
    "/start — So‘rovnomani boshlash\n" +
    "/list — So‘rovnoma ishtirokchilari ro‘yxati (faqat admin)\n" +
    "/clear — Barcha so‘rovnomalarni o‘chirish (faqat admin)\n" +
    "/help — Yordam";
  bot.sendMessage(msg.chat.id, helpMessage);
});

// --- Railway healthcheck (optional)
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => res.end('Bot is running')).listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portda`);
});


