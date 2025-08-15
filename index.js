require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });



// Bot token (BotFather’dan oling)
const token = process.env.BOT_TOKEN;


// Admin Telegram ID
const adminId = process.env.ADMIN_ID;// Adminning Telegram ID

// SQLite bazasini yaratish
const db = new sqlite3.Database('survey.db');
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

// Savollar ro'yxati
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
      ["Boshqa (yozib qoldirish)"]
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

// Foydalanuvchi holati
let userStep = {};
let userData = {};

// /start komandasi
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userStep[chatId] = 0;
  userData[chatId] = { telegram_id: chatId };

  bot.sendMessage(chatId, "Salom! So‘rovnomani boshlaymiz.");
  askQuestion(chatId);
});

// Savol berish funksiyasi
function askQuestion(chatId) {
  const step = userStep[chatId];
  const question = questions[step];

  if (typeof question === 'string') {
    bot.sendMessage(chatId, question);
  } else {
    bot.sendMessage(chatId, question.text, question.options);
  }
}

// Javoblarni qabul qilish
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (userStep[chatId] === undefined) return;

  const step = userStep[chatId];
  const answer = msg.text;

  if (step === 0) userData[chatId].fullname = answer;
  if (step === 1) userData[chatId].age = answer;
  if (step === 2) userData[chatId].phone = answer;
  if (step === 3) userData[chatId].used_app = answer;
  if (step === 4) userData[chatId].main_problem = answer;
  if (step === 5) userData[chatId].needed_service = answer;
  if (step === 6) userData[chatId].willing_to_pay = answer;
  if (step === 7) userData[chatId].suggestions = answer;

  userStep[chatId]++;

  if (userStep[chatId] < questions.length) {
    askQuestion(chatId);
  } else {
    const data = userData[chatId];

    // Bazaga saqlash
    db.run(
      `INSERT INTO survey_responses 
      (telegram_id, fullname, age, phone, used_app, main_problem, needed_service, willing_to_pay, suggestions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.telegram_id, data.fullname, data.age, data.phone, data.used_app, data.main_problem, data.needed_service, data.willing_to_pay, data.suggestions],
      function(err) {
        if (err) {
          console.error(err);
          return;
        }

        const surveyId = this.lastID; // Ishtirokchi ID

        // Admin’ga yuborish
        bot.sendMessage(adminId,
          `📋 Yangi so‘rovnoma #${surveyId}:\n` +
          `👤 ${data.fullname}\n` +
          `🎂 ${data.age}\n` +
          `📞 ${data.phone}\n` +
          `📱 Ilova ishlatganmi: ${data.used_app}\n` +
          `⚠️ Qiyinchilik: ${data.main_problem}\n` +
          `🩺 Xizmat: ${data.needed_service}\n` +
          `💰 To‘lovga tayyor: ${data.willing_to_pay}\n` +
          `💬 Taklif: ${data.suggestions}`
        );

        // Foydalanuvchiga rahmat xabari
        bot.sendMessage(chatId,
          "✅ Rahmat! Siz so‘rovnomani yakunladingiz.\n" +
          "Tez orada CliniCore ishga tushganda xabar yuboramiz va sizga 2 oylik PREMIUM a’zolik taqdim etamiz.\n\n" +
          "📢 Yangiliklardan xabardor bo‘lish uchun bizning Telegram kanalimizga qo‘shiling: @clinicore_uz",
          { reply_markup: { remove_keyboard: true } }
        );

        delete userStep[chatId];
        delete userData[chatId];
      }
    );
  }
});

// /list komandasi faqat admin uchun
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;

  if (chatId !== adminId) {
    bot.sendMessage(chatId, "❌ Sizda bu komandani ishlatish huquqi yo‘q.");
    return;
  }

  db.all(`SELECT id, fullname, age, phone, created_at FROM survey_responses ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Ma'lumotlarni olishda xatolik.");
      return;
    }

    if (rows.length === 0) {
      bot.sendMessage(chatId, "📭 Hali hech kim so‘rovnomadan o‘tmagan.");
      return;
    }

    let message = "📋 Ro‘yxatdan o‘tganlar:\n\n";
    rows.forEach(row => {
      message += `#${row.id} — ${row.fullname}, ${row.age} yosh\n📞 ${row.phone}\n🕒 ${row.created_at}\n\n`;
    });

    // Agar ro'yxat juda uzun bo'lsa, bo'lib yuboramiz
    const parts = message.match(/[\s\S]{1,4000}/g);
    parts.forEach(part => bot.sendMessage(chatId, part));
  });
});
// /clear komandasi faqat admin uchun
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;

  if (chatId !== adminId) {
    bot.sendMessage(chatId, "❌ Sizda bu komandani ishlatish huquqi yo‘q.");
    return;
  }

  db.run(`DELETE FROM survey_responses`, (err) => {
    if (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Ma'lumotlarni o'chirishda xatolik.");
      return;
    }

    bot.sendMessage(chatId, "✅ Barcha so‘rovnomalar o‘chirildi.");
  });
});


bot.onText(/\/list/, async (msg) => {
   const chatId = msg.chat.id;
   const data = getListFromDB(); // Railway’da DB bo‘sh bo‘lishi mumkin
   bot.sendMessage(chatId, data.join("\n"));
});
// /help komandasi
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = "Bu bot CliniCore so‘rovnomasini to‘ldirish uchun ishlatiladi.\n\n" +
                      "Komandalar:\n" +
                      "/start - So‘rovnomani boshlash\n" +
                      "/list - So‘rovnoma ishtirokchilar ro‘yxatini ko‘rish (admin)\n" +
                      "/clear - Barcha so‘rovnomalarni o‘chirish (admin)\n" +
                      "/help - Yordam";

  bot.sendMessage(chatId, helpMessage);
});

