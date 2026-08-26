/* ============================================================
   LASTBOT — админ-бэкенд (чистый Node, без внешних зависимостей)
   - авторизация: HMAC-токен в httpOnly-куке, 12 часов
   - пароль хранится и сверяется на сервере (timingSafeEqual)
   - rate-limit попыток входа и заявок на триал
   - контент сайта: data/content.json
   - новые данные: data/trials.json, data/balances.json,
     data/referrals.json, data/promotions.json
   - новые API: триал, дашборд альянса, рефералы, покупки,
     акции, цены, активные промокоды
   ============================================================ */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, createHash, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { NEWS_FEEDS, parseRssItems } from "./news-feed.mjs";
import { startTelegramBot } from "./telegram-bot.mjs";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const ADMIN_USER = process.env.ADMIN_USER || "ta-admin";
const ADMIN_PASS = process.env.ADMIN_PASS || ""; // без .env вход закрыт (см. проверку в /api/login)
const ADMIN_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "admin");
const TOKEN_TTL = 12 * 60 * 60 * 1000;      // сессия: 12 часов
const LOGIN_WINDOW = 10 * 60 * 1000;        // окно rate-limit: 10 минут
const LOGIN_MAX = 8;                        // максимум попыток входа за окно
const BODY_LIMIT = 300 * 1024;              // 300 КБ на тело запроса

/* ---------- Настройки бизнес-логики (env → .env) ---------- */
const TRIAL_DAYS = Math.max(1, parseInt(process.env.TRIAL_DAYS || "7", 10));           // дней бесплатного триала
const TRIAL_BOTS = Math.max(1, parseInt(process.env.TRIAL_BOTS || "5", 10));           // ботов в триале
const COMMISSION_PERCENT = clampPct(process.env.REFERRAL_COMMISSION_PERCENT, 10);      // % денежного кэшбэка рефереру
const CASHBACK_PERCENT = clampPct(process.env.CASHBACK_PERCENT, 10);                   // % кэшбэка бото-месяцами за любую покупку
const RUB_RATE = parseFloat(process.env.RUB_RATE || "85");                             // ориентировочный курс $→₽

function clampPct(v, def) {
  const n = parseFloat(v);
  return isFinite(n) ? Math.min(100, Math.max(0, n)) : def;
}

/* ---------- Контент по умолчанию (зеркало сайта) ---------- */
const CONTENT_SCHEMA = 2; // версия схемы контента: при несовпадении — миграция
const DEFAULTS = {
  schemaVersion: CONTENT_SCHEMA,
  hero: {
    badge: "Бот помощи альянсу · облако 24/7",
    titleLine1: "Командир, усиль свой альянс с LASTBOT",
    word1: "Помогай.",
    word2: "Собирай.",
    word3: "Доминируй.",
    subtitle: "Автоматическая помощь союзникам 24/7, сундук славы в 3 раза быстрее, рейтинг альянса растёт без твоего участия.",
    trust: ["Безопасно для аккаунта", "Автопомощь без пропусков", "Оплата в Telegram"],
  },
  why: {
    heading: "Почему командиры выбирают LASTBOT",
    sub: "Мы забираем рутину на себя, чтобы твой альянс доминировал на сервере.",
    cards: [
      { title: "Экономия 10+ часов в неделю", text: "Пока бот кликает помощь альянсу, собирает подарки и закрывает остальную рутину — ты воюешь, строишь и отдыхаешь.", label: "XP 10h / 10h" },
      { title: "Работает 24/7 в облаке", text: "Серверы не спят, не болеют и не ходят на пары. Твой аккаунт в игре даже ночью.", label: "UPTIME 99.9%" },
      { title: "Безопасно для аккаунта", text: "Шифрованное соединение, без передачи данных третьим лицам и без установки на твой ПК.", label: "SHIELD 100%" },
      { title: "Реферальные бонусы", text: "Приведи другой альянс — получи их ботов на месяц бесплатно и 10% от суммы их покупки на свой счёт.", label: "REF +10%" },
    ],
  },
  features: {
    heading: "Помощь альянсу — главный модуль",
    sub: "Автоклики по кнопкам помощи, подарки и сундук славы — основа. Плюс дополнительные модули под остальную рутину.",
    items: [
      { tag: "TOP", title: "Помощь альянсу — автоклики 24/7", text: "Автоматические клики по кнопкам помощи: ускоряй стройку и исследования союзников, зарабатывай очки альянса и репутацию. Бот собирает подарки альянса — и сундук славы наполняется в 3 раза быстрее." },
      { tag: "", title: "Heal Bot — лечение отрядов", text: "Автоматически лечит раненые войска в госпитале после каждого сражения. Больше никаких «ой, забыл поставить лечение» — бот сделает это быстрее тебя." },
      { tag: "24/7", title: "Фарм ресурсов", text: "Сбор ресурсов с карты, атаки на зомби-фермы и рутинные PvE-активности вроде охоты за призами — на полном автомате." },
      { tag: "", title: "Ежедневные задания", text: "Рутинные дейлики на опыте и наградах выполняются каждый день — стабильный прогресс без захода в игру." },
      { tag: "×30", title: "Мультиаккаунтинг", text: "Веди до 30 аккаунтов одновременно. Фермы-доноры, альты для альянса и эксперименты — все они работают параллельно." },
      { tag: "AI", title: "Автокликер с распознаванием изображений", text: "Для сложных сценариев, где нужна точность: бот видит интерфейс игры, находит нужные кнопки по картинке и действует по сценарию — даже если элементы двигаются или меняют дизайн." },
      { tag: "BONUS", title: "Реферальная программа", text: "Уникальный код альянса, бонусные бото-месяцы и денежный кэшбэк за каждого приведённого союзника. Баланс и история — в личном кабинете." },
    ],
  },
  pricing: {
    heading: "Собери свой пакет ботов",
    sub: "Двигай ползунок, выбирай срок — цена считается мгновенно, в долларах и рублях.",
    /* Прогрессивные цены за бота: диапазоны количества ботов */
    botPrices: [
      { min: 1, max: 10, price: 2.0 },
      { min: 11, max: 20, price: 1.8 },
      { min: 21, max: 30, price: 1.5 },
    ],
    /* Сроки подписки: коэффициент к месячной цене и % скидки */
    periods: [
      { months: 1, coef: 1.0, discount: 0 },
      { months: 3, coef: 2.5, discount: 17 },
      { months: 6, coef: 5.0, discount: 17 },
      { months: 12, coef: 9.0, discount: 25 },
    ],
    note: "Оплата и условия — с менеджером в Telegram (@lastbotdls). При каждой покупке начисляется 10% кэшбэка бонусными бото-месяцами. Цены в рублях ориентировочные: курс ≈85 ₽/$.",
    /* Старые фиксированные тарифы оставлены для обратной совместимости
       (не рендерятся на сайте: вместо них калькулятор) */
    tiers: [
      { name: "Базовый", bots: "10", price: "$20", features: ["Все функции ботов", "До 10 аккаунтов", "Поддержка 24/7", "Доставка до 24 часов"] },
      { name: "Оптимальный", bots: "20", price: "$40", features: ["Все функции ботов", "До 20 аккаунтов", "Приоритетная поддержка", "Доставка обычно мгновенно", "Бонус: скрипты для альянса"] },
      { name: "Про", bots: "30", price: "$60", features: ["Все функции ботов", "До 30 аккаунтов", "VIP-поддержка 24/7", "Доставка мгновенно", "Индивидуальные сценарии"] },
    ],
  },
  news: {
    heading: "Всегда в теме",
    sub: "Мы следим за обновлениями DLS, чтобы боты работали сразу после каждого патча.",
    items: [
      { title: "DLS × FAIRY TAIL — коллаборация в игре, осталось 2 дня!", date: "авг 2026", url: "https://vk.ru/doomsday_last_survivors_ru", source: "VK · DLS Official" },
      { title: "Эксклюзивные подарки Чемпионата мира IGG 2026", date: "авг 2026", url: "https://vk.ru/doomsday_last_survivors_ru", source: "VK · DLS Official" },
      { title: "Командиры, помогите установить мировой рекорд онлайн-каллиграммы", date: "авг 2026", url: "https://vk.ru/doomsday_last_survivors_ru", source: "VK · DLS Official" },
      { title: "Наше сообщество в Discord преодолело новую отметку", date: "авг 2026", url: "https://vk.ru/doomsday_last_survivors_ru", source: "VK · DLS Official" },
      { title: "Обратная связь разработчиков #6 — Часть 2: оптимизации и обновления 2026", date: "2026", url: "https://vk.com/@doomsday_last_survivors_ru-obratnaya-svyaz-razrabotchikov-6-chast-2optimizacii-i-obn", source: "VK · DLS Official" },
    ],
  },
  codes: {
    items: [
      { code: "DLSODS", reward: "Бесплатные награды", expires: "до 31.08.2026", active: true },
      { code: "DLSFAIRYTAIL", reward: "Бесплатные награды", expires: "истекает скоро", active: true },
    ],
  },
  faq: {
    heading: "Вопросы перед стартом",
    items: [
      { q: "Это безопасно для моего аккаунта?", a: "Да. Боты работают в облаке через защищённое соединение, без установки программ на твой компьютер и без передачи данных третьим лицам. Мы не просим пароли от почты и не меняем настройки аккаунта. Тем не менее, использование сторонних сервисов — твоя зона ответственности: ознакомься с правилами игры." },
      { q: "Как быстро бот реагирует на запросы помощи альянса?", a: "Мгновенно. Бот мониторит ленту помощи 24/7 и кликает кнопки сразу после появления запроса — союзники получают ускорение стройки и исследований без ожидания, а ты — очки альянса и репутацию. Заодно бот собирает подарки альянса, поэтому сундук славы наполняется в 3 раза быстрее." },
      { q: "Как я получу доступ после оплаты?", a: "Сразу после оплаты напиши в Telegram или на почту номер заказа — мы активируем ботов. Доставка занимает до 24 часов, в 95% случаев — мгновенно. Ты получишь доступ к панели управления и инструкцию по подключению." },
      { q: "Можно ли отменить подписку?", a: "Да, в любой момент. Напиши в поддержку — автопродление будет отключено, а уже оплаченный период отработает до конца. Никаких штрафов и скрытых платежей." },
      { q: "Есть ли гарантия возврата?", a: "Если сервис не был предоставлен в течение 48 часов после оплаты, мы вернём деньги полностью — на тот же способ оплаты. Подробности в Refund Policy." },
      { q: "Сколько аккаунтов можно подключить?", a: "Зависит от пакета: от 1 до 30 ботов одновременно. Все боты работают параллельно и независимо друг от друга." },
      { q: "Нужен ли мощный компьютер или эмулятор?", a: "Нет. Всё крутится на наших облачных серверах. Тебе нужен только браузер — управлять ботами можно даже с телефона." },
      { q: "Что такое бонусные бото-месяцы?", a: "Это бесплатные месяцы ботов, которые можно использовать при будущих покупках: 3 бото-месяца = 3 месяца для одного бота или 1 месяц для трёх. Начисляются автоматически — 10% от каждой покупки." },
      { q: "Как работает реферальная программа?", a: "Каждый альянс получает уникальный реферальный код. Если другой альянс покупает пакет по вашему коду — вы получаете их количество ботов на 1 месяц бесплатно и 10% от суммы покупки денежным кэшбэком." },
      { q: "Как получить бесплатный триал?", a: "Нажми «Попробовать бесплатно», оставь название альянса и Telegram — менеджер активирует 7 дней на 5 ботов. После триала — персональная скидка 15% на первый платный месяц." },
      { q: "Можно ли менять состав ботов?", a: "Да. Альянс покупает пул ботов — распределяй их между участниками как угодно и меняй состав в любой момент." },
    ],
  },
  cta: {
    heading: "Не дай соперникам обогнать тебя",
    text: "Начни доминировать с LASTBOT сегодня — 7 дней триала бесплатно для твоего альянса.",
  },
  how: {
    items: [
      { title: "Выбери пакет", text: "Собери калькулятором нужное количество ботов и срок — или обсуди с менеджером персональные условия." },
      { title: "Оплати через Telegram", text: "Напиши менеджеру — он подберёт тариф и обсудит удобный способ оплаты: рубли, карты или крипта." },
      { title: "Получи доступ к ботам", text: "Доставка в течение 24 часов, обычно мгновенно. Подключаешь аккаунты — и боты начинают помогать альянсу." },
    ],
  },
  contacts: {
    email: "support@lastbot.gg",
    telegramHandle: "@lastbotdls",
    telegramUrl: "https://t.me/lastbotdls",
    tagline: "Облачная автоматизация Doomsday: Last Survivors. Помогай. Собирай. Доминируй.",
  },
  stats: {
    alliancesCount: 150,   // счётчик «альянсов доверяют» (правится в админке)
    hoursSaved: 1200,      // суммарно сэкономленных часов (для маркетинга)
  },
  testimonials: [
    { name: "Алексей", alliance: "Волки Пустоши", text: "Помощь альянсу стала мгновенной. Раньше кто-то вечно забывал нажать кнопку — теперь бот делает это за всех 24/7. Сундук славы заполняется в разы быстрее.", rating: 5, date: "июнь 2026" },
    { name: "Мария", alliance: "Стальной Легион", text: "Взяли 20 ботов на три месяца. Кэшбэк бото-месяцами уже сэкономил нам половину следующего платежа. Очень грамотная система.", rating: 5, date: "май 2026" },
    { name: "Дмитрий", alliance: "Тень Апокалипсиса", text: "Привёл союзный альянс по рефералке — бонус начислили автоматически, менеджер всё объяснил в Telegram. Поддержка отвечает за минуты.", rating: 4, date: "апрель 2026" },
  ],
  referral: {
    commissionPercent: 10, // % денежного кэшбэка рефереру от покупки приведённого альянса
    bonusMonthsPercent: 100, // реферальный бонус: каждый купленный бот = 1 бото-месяц (см. описание программы)
    cashbackPercent: 10,   // % кэшбэка бото-месяцами за любую покупку
  },
  dashboard: {
    url: "/account", // ссылка кнопки «Кабинет» в верхнем меню
  },
};

/* ---------- Акции по умолчанию (data/promotions.json) ---------- */
const DEFAULT_PROMOTIONS = [
  {
    id: "first-alliance",
    name: "Первый альянс на сервере",
    description: "Скидка 30% на первый месяц для нового альянса (без предыдущих покупок)",
    banner: "−30%",
    type: "percent",          // percent | fixed | bots-gift
    value: 30,
    appliesTo: { periods: [1] }, // пусто = ко всем
    minBots: null,
    maxBots: null,
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    usageLimit: null,
    used: 0,
  },
  {
    id: "season-battle",
    name: "Сезонная битва",
    description: "20% на 3-месячную подписку до конца текущего сезона",
    banner: "−20%",
    type: "percent",
    value: 20,
    appliesTo: { periods: [3] },
    minBots: null,
    maxBots: null,
    startDate: "2026-08-01",
    endDate: "2026-09-15",
    usageLimit: null,
    used: 0,
  },
  {
    id: "referral-gift",
    name: "Реферальный бонус",
    description: "+5 ботов в подарок при покупке от 20 ботов",
    banner: "+5 БОТОВ",
    type: "bots-gift",
    value: 5,
    appliesTo: {},
    minBots: 20,
    maxBots: null,
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    usageLimit: null,
    used: 0,
  },
];

/* ---------- Лента новостей: собственный прокси (без сторонних CORS-сервисов) ---------- */
const NEWS_CACHE_TTL = 15 * 60 * 1000;
const newsCache = new Map();

/* ---------- Хранилище ---------- */
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const TRIALS_FILE = path.join(DATA_DIR, "trials.json");
const BALANCES_FILE = path.join(DATA_DIR, "balances.json");
const REFERRALS_FILE = path.join(DATA_DIR, "referrals.json");
const PROMOTIONS_FILE = path.join(DATA_DIR, "promotions.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BONUS_REQUESTS_FILE = path.join(DATA_DIR, "bonus-requests.json");

function readJson(file, fallback) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, randomBytes(32).toString("hex"));
    try { fs.chmodSync(SECRET_FILE, 0o600); } catch { /* windows */ }
  }
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(DEFAULTS, null, 2));
  }
  if (!fs.existsSync(TRIALS_FILE)) writeJson(TRIALS_FILE, []);
  if (!fs.existsSync(BALANCES_FILE)) writeJson(BALANCES_FILE, {});
  if (!fs.existsSync(REFERRALS_FILE)) writeJson(REFERRALS_FILE, { codes: {}, links: [] });
  if (!fs.existsSync(PROMOTIONS_FILE)) writeJson(PROMOTIONS_FILE, DEFAULT_PROMOTIONS);
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
  if (!fs.existsSync(BONUS_REQUESTS_FILE)) writeJson(BONUS_REQUESTS_FILE, []);
}
ensureDataDir();

function loadContent() {
  const raw = readJson(CONTENT_FILE, {});
  let changed = false;

  // Миграция: секции, которые переопределил редизайн, обновляются
  // целиком (админские правки news/codes/contacts сохраняются)
  const REDESIGN_KEYS = ["hero", "why", "features", "pricing", "faq", "cta", "how", "stats", "testimonials", "referral"];
  if (toInt(raw.schemaVersion, 1) < CONTENT_SCHEMA) {
    for (const key of REDESIGN_KEYS) {
      raw[key] = JSON.parse(JSON.stringify(DEFAULTS[key]));
    }
    raw.schemaVersion = CONTENT_SCHEMA;
    changed = true;
  }

  // Общий случай: добавляем отсутствующие верхние ключи из DEFAULTS
  for (const key of Object.keys(DEFAULTS)) {
    if (raw[key] == null) {
      raw[key] = JSON.parse(JSON.stringify(DEFAULTS[key]));
      changed = true;
    }
  }
  // Миграция вложенных полей pricing (для старых content.json)
  if (raw.pricing) {
    if (!Array.isArray(raw.pricing.botPrices)) {
      raw.pricing.botPrices = JSON.parse(JSON.stringify(DEFAULTS.pricing.botPrices));
      changed = true;
    }
    if (!Array.isArray(raw.pricing.periods)) {
      raw.pricing.periods = JSON.parse(JSON.stringify(DEFAULTS.pricing.periods));
      changed = true;
    }
  }
  if (changed) {
    try { writeJson(CONTENT_FILE, raw); } catch { /* не критично */ }
  }
  return raw;
}

function saveContent(content) {
  writeJson(CONTENT_FILE, content);
}

/* ---------- Telegram-бот (автопостинг + уведомления) ---------- */
const telegramBot = startTelegramBot({
  token: process.env.BOT_TOKEN,
  channel: process.env.TELEGRAM_CHANNEL || "@lastbotdls",
  dataDir: DATA_DIR,
});

const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();

/* ---------- Клиентская авторизация (личный кабинет альянсов) ---------- */
const CLIENT_JWT_SECRET = process.env.CLIENT_JWT_SECRET || secret; // .env CLIENT_JWT_SECRET
const CLIENT_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней
const CLIENT_COOKIE = "lb_client_token";
const PBKDF2_ITER = 100000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", CLIENT_JWT_SECRET).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + sig;
}

function verifyJwt(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const expect = createHmac("sha256", CLIENT_JWT_SECRET).update(parts[0] + "." + parts[1]).digest("base64url");
    if (!safeEqual(expect, parts[2])) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function newSalt() {
  return randomBytes(16).toString("hex");
}

function hashPassword(pw, salt) {
  return pbkdf2Sync(String(pw), salt, PBKDF2_ITER, 64, "sha512").toString("hex");
}

function loadUsers() {
  const u = readJson(USERS_FILE, []);
  return Array.isArray(u) ? u : [];
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function findUserByEmail(email) {
  const e = String(email || "").toLowerCase();
  return loadUsers().find((u) => u && u.email === e) || null;
}

function findUserById(id) {
  return loadUsers().find((u) => u && u.id === id) || null;
}

function findUserByAllianceCode(code) {
  const c = String(code || "").toUpperCase();
  return loadUsers().find((u) => u && u.allianceCode === c) || null;
}

function genUniqueCode(takenSet) {
  let code;
  do {
    code = randomBytes(4).toString("hex").toUpperCase(); // 8 символов
  } while (takenSet.has(code));
  return code;
}

function clientUserFromReq(req) {
  const token = parseCookies(req).lb_client_token;
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) return null;
  return findUserById(payload.sub);
}

function clientBalanceOf(allianceCode) {
  const balances = readJson(BALANCES_FILE, {});
  return balances[allianceCode] || { name: "", bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] };
}

/* Rate-limit клиентского входа: 5 попыток за 10 минут */
const clientLoginAttempts = new Map();
function clientRateLimitOk(ip) {
  const now = Date.now();
  const rec = clientLoginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW) {
    clientLoginAttempts.set(ip, { first: now, count: 1 });
    return true;
  }
  rec.count++;
  return rec.count <= LOGIN_MAX;
}

/* Rate-limit регистрации: 5 заявок в час с одного IP */
const regAttempts = new Map();
function regRateLimitOk(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000;
  const rec = regAttempts.get(ip);
  if (!rec || now - rec.first > WINDOW) {
    regAttempts.set(ip, { first: now, count: 1 });
    return true;
  }
  rec.count++;
  return rec.count <= 5;
}

/* ---------- Безопасность ---------- */
function sha256(s) {
  return createHash("sha256").update(s).digest();
}

function safeEqual(a, b) {
  const ha = sha256(String(a));
  const hb = sha256(String(b));
  return timingSafeEqual(ha, hb);
}

function makeToken() {
  const exp = Date.now() + TOKEN_TTL;
  const payload = `${ADMIN_USER}|${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = createHmac("sha256", secret).update(payload).digest("hex");
  if (!safeEqual(sig, expect)) return false;
  const [, exp] = payload.split("|");
  return Number(exp) > Date.now();
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  return verifyToken(parseCookies(req).lb_auth);
}

/* Origin-проверка для изменяющих запросов (анти-CSRF).
   Сравниваем только hostname: порт не учитываем, т.к. при проксировании
   (docker 8080->80, локальные тесты) порты могут не совпадать. */
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // небраузерные клиенты
  try {
    const o = new URL(origin);
    const h = new URL("http://" + req.headers.host);
    return o.hostname === h.hostname;
  } catch {
    return false;
  }
}

/* Rate-limit попыток входа */
const loginAttempts = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW) {
    loginAttempts.set(ip, { first: now, count: 1 });
    return true;
  }
  rec.count++;
  return rec.count <= LOGIN_MAX;
}

/* Rate-limit публичных заявок на триал: 5 в час с одного IP */
const trialAttempts = new Map();
function trialRateLimitOk(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000;
  const MAX = 5;
  const rec = trialAttempts.get(ip);
  if (!rec || now - rec.first > WINDOW) {
    trialAttempts.set(ip, { first: now, count: 1 });
    return true;
  }
  rec.count++;
  return rec.count <= MAX;
}

/* ---------- HTTP ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error("TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveAdminFile(req, res, urlPath) {
  let rel = urlPath === "/admin" || urlPath === "/admin/" ? "index.html" : urlPath.slice("/admin/".length);
  if (rel.includes("..")) { json(res, 403, { ok: false }); return; }
  const file = path.join(ADMIN_DIR, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

/* ---------- Валидация ---------- */
function cleanStr(v, max = 200) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function toInt(v, def) {
  const n = parseInt(v, 10);
  return isFinite(n) ? n : def;
}

function toFloat(v, def) {
  const n = parseFloat(v);
  return isFinite(n) ? n : def;
}

/* ---------- Реферальные коды и балансы ---------- */
function makeReferralCode() {
  return randomBytes(4).toString("hex").toUpperCase(); // 8 символов
}

function getReferralCode(allianceName) {
  const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });
  for (const [code, entry] of Object.entries(refs.codes || {})) {
    if (entry && entry.allianceName === allianceName) return code;
  }
  return null;
}

function ensureReferralCode(allianceName) {
  const existing = getReferralCode(allianceName);
  if (existing) return existing;
  const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });
  if (!refs.codes) refs.codes = {};
  const code = makeReferralCode();
  while (refs.codes[code]) code = makeReferralCode();
  refs.codes[code] = { allianceName, ts: Date.now() };
  if (!refs.links) refs.links = [];
  writeJson(REFERRALS_FILE, refs);
  return code;
}

/* ---------- Акции ---------- */
function activePromotions(now = Date.now()) {
  const list = readJson(PROMOTIONS_FILE, []);
  if (!Array.isArray(list)) return [];
  return list.filter((pr) => {
    if (!pr || pr.type === undefined) return false;
    if (pr.usageLimit != null && (pr.used || 0) >= pr.usageLimit) return false;
    const start = pr.startDate ? new Date(pr.startDate).getTime() : 0;
    const end = pr.endDate ? new Date(pr.endDate + "T23:59:59").getTime() : Infinity;
    return now >= start && now <= end;
  });
}

/* Напоминание об истекающих акциях (за 2 дня) в Telegram */
function checkExpiringPromotions() {
  try {
    const now = Date.now();
    const soon = now + 2 * 24 * 60 * 60 * 1000;
    for (const pr of activePromotions()) {
      if (!pr.endDate) continue;
      const end = new Date(pr.endDate + "T23:59:59").getTime();
      if (end >= now && end <= soon) {
        telegramBot.sendMessage("⏰ Акция «" + pr.name + "» истекает " + pr.endDate + " — напомните клиентам!").catch(() => {});
      }
    }
  } catch { /* не критично */ }
}
setTimeout(checkExpiringPromotions, 60 * 1000);
setInterval(checkExpiringPromotions, 24 * 60 * 60 * 1000);

/* ---------- Покупка: кэшбэк + реферальные бонусы ---------- */
function applyPurchase({ allianceCode, allianceName, botsCount, periodMonths, totalPriceUsd, referralCode }) {
  const balances = readJson(BALANCES_FILE, {});
  const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });

  const entry = balances[allianceCode] || {
    name: cleanStr(allianceName) || allianceCode,
    bonusMonths: 0,
    cashbackCents: 0,
    purchases: [],
    referrals: [],
  };
  if (cleanStr(allianceName)) entry.name = cleanStr(allianceName);

  /* 1.4 Кэшбэк: 10% от числа купленных ботов в виде бото-месяцев */
  const cashbackMonths = Math.round(botsCount * (CASHBACK_PERCENT / 100));
  entry.bonusMonths += cashbackMonths;

  const purchase = {
    ts: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    bots: botsCount,
    months: periodMonths,
    priceUsd: totalPriceUsd,
    cashbackMonths,
    referralCode: referralCode || null,
  };
  entry.purchases.push(purchase);

  /* 1.3 Реферальный бонус: если указан код реферера */
  let referralAward = null;
  if (referralCode && refs.codes && refs.codes[referralCode] && referralCode !== allianceCode) {
    const refMeta = refs.codes[referralCode];
    const refEntry = balances[referralCode] || {
      name: refMeta.allianceName || referralCode,
      bonusMonths: 0,
      cashbackCents: 0,
      purchases: [],
      referrals: [],
    };
    const refMonths = botsCount; // «боты альянса Б на 1 месяц бесплатно» = бото-месяцы
    const refCashbackCents = Math.round(totalPriceUsd * (COMMISSION_PERCENT / 100) * 100);
    refEntry.bonusMonths += refMonths;
    refEntry.cashbackCents += refCashbackCents;
    refEntry.referrals.push({
      ts: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      buyerAlliance: entry.name,
      bots: botsCount,
      months: periodMonths,
      priceUsd: totalPriceUsd,
      bonusMonths: refMonths,
      cashbackCents: refCashbackCents,
    });
    balances[referralCode] = refEntry;
    if (!refs.links) refs.links = [];
    refs.links.push({ referrerCode: referralCode, buyerAlliance: entry.name, buyerCode: allianceCode, ts: Date.now(), bots: botsCount, months: periodMonths, priceUsd: totalPriceUsd });
    referralAward = { referrerCode: referralCode, bonusMonths: refMonths, cashbackCents: refCashbackCents };
  }

  balances[allianceCode] = entry;
  writeJson(BALANCES_FILE, balances);
  writeJson(REFERRALS_FILE, refs);
  return { cashbackMonths, referralAward, purchase };
}

/* ============================================================
   HTTP-сервер
   ============================================================ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  try {
    /* ----- админ-панель (статика) ----- */
    if (p === "/admin" || p.startsWith("/admin/")) {
      if (p === "/admin/login" || p === "/admin/index.html" || p === "/admin/admin.js" || p === "/admin/admin.css" || p === "/admin" || p === "/admin/") {
        serveAdminFile(req, res, p);
        return;
      }
      json(res, 404, { ok: false });
      return;
    }

    /* ----- API ----- */
    if (p === "/api/login" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "?";
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");

      /* Клиентский вход по email/паролю (личный кабинет /account) */
      if (typeof body.email === "string" && typeof body.password === "string") {
        if (!clientRateLimitOk(ip)) { json(res, 429, { ok: false, error: "Слишком много попыток, подождите" }); return; }
        const email = cleanStr(body.email, 200).toLowerCase();
        const password = String(body.password || "");
        const user = findUserByEmail(email);
        if (!user || !safeEqual(hashPassword(password, user.salt), user.passwordHash)) {
          json(res, 401, { ok: false, error: "errLogin" });
          return;
        }
        const users = loadUsers().map((u) => (u.id === user.id ? { ...u, lastLogin: Date.now() } : u));
        saveUsers(users);
        const token = signJwt({ sub: user.id, email: user.email, exp: Date.now() + CLIENT_TOKEN_TTL });
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": CLIENT_COOKIE + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + (CLIENT_TOKEN_TTL / 1000),
        });
        res.end(JSON.stringify({
          ok: true,
          allianceName: user.allianceName,
          allianceCode: user.allianceCode,
          referralCode: user.referralCode,
          balance: clientBalanceOf(user.allianceCode),
        }));
        return;
      }

      /* Админский вход */
      if (!rateLimitOk(ip)) { json(res, 429, { ok: false, error: "Слишком много попыток, подождите" }); return; }
      if (!ADMIN_PASS) { json(res, 503, { ok: false, error: "ADMIN_PASS не задан: создайте .env (см. .env.example)" }); return; }
      const userOk = safeEqual(body.u || "", ADMIN_USER);
      const passOk = safeEqual(body.p || "", ADMIN_PASS);
      if (!userOk || !passOk) { json(res, 401, { ok: false, error: "Неверный логин или пароль" }); return; }
      loginAttempts.delete(ip);
      const token = makeToken();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `lb_auth=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TOKEN_TTL / 1000}`,
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (p === "/api/logout" && req.method === "POST") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": [
          "lb_auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          CLIENT_COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        ],
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (p === "/api/news" && req.method === "GET") {
      // только языки из белого списка — SSRF-безопасно
      const lang = String(url.searchParams.get("lang") || "ru").slice(0, 5).toLowerCase();
      const feedUrl = NEWS_FEEDS[lang] || NEWS_FEEDS.ru;
      const cached = newsCache.get(lang);
      const now = Date.now();
      if (cached && now - cached.ts < NEWS_CACHE_TTL) {
        json(res, 200, { ok: true, items: cached.items, cached: true });
        return;
      }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const up = await fetch(feedUrl, {
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (lastbot-news; +https://lastbot.gg)" },
        });
        clearTimeout(timer);
        if (!up.ok) throw new Error("HTTP " + up.status);
        const items = parseRssItems(await up.text());
        newsCache.set(lang, { ts: now, items });
        json(res, 200, { ok: true, items, cached: false });
      } catch {
        json(res, 200, { ok: false, items: [], error: "feed unavailable" });
      }
      return;
    }

    if (p === "/api/content" && req.method === "GET") {
      json(res, 200, loadContent());
      return;
    }

    if (p === "/api/content" && req.method === "PUT") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "null");
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(res, 400, { ok: false, error: "Неверный формат" });
        return;
      }
      saveContent({ ...loadContent(), ...body });
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/content/reset" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      saveContent(DEFAULTS);
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/telegram/post-news" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const result = await telegramBot.postNewNews();
      json(res, 200, { ok: true, ...result });
      return;
    }

    if (p === "/api/status") {
      json(res, 200, { ok: true, authed: isAuthed(req) });
      return;
    }

    /* ================= НОВЫЕ ЭНДПОИНТЫ ================= */

    /* 1.6 Заявка на бесплатный триал (публично, с rate-limit) */
    if (p === "/api/trial" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "?";
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!trialRateLimitOk(ip)) { json(res, 429, { ok: false, error: "Слишком много заявок, попробуйте позже" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const allianceName = cleanStr(body.allianceName, 100);
      const leaderName = cleanStr(body.leaderName, 100);
      const contactTelegram = cleanStr(body.contactTelegram, 100);
      if (!allianceName || !leaderName || !contactTelegram) {
        json(res, 400, { ok: false, error: "Заполните все поля" });
        return;
      }
      const trials = readJson(TRIALS_FILE, []);
      trials.push({
        id: randomBytes(8).toString("hex"),
        allianceName,
        leaderName,
        contactTelegram,
        ts: Date.now(),
        date: new Date().toISOString(),
      });
      writeJson(TRIALS_FILE, trials);
      // Автоматически выдаём альянсу реферальный код (п.1.3)
      const referralCode = ensureReferralCode(allianceName);
      // Уведомление менеджеру в Telegram (не блокирует ответ)
      telegramBot.sendMessage("🆕 Заявка на триал\nАльянс: " + allianceName + "\nЛидер: " + leaderName + "\nTelegram: " + contactTelegram + "\nРеф-код: " + referralCode).catch(() => {});
      json(res, 200, { ok: true, referralCode, trialDays: TRIAL_DAYS, trialBots: TRIAL_BOTS });
      return;
    }

    /* 1.9 Дашборд альянса по коду */
    if (p === "/api/dashboard" && req.method === "GET") {
      const code = cleanStr(url.searchParams.get("code"), 64).toUpperCase();
      if (!code) { json(res, 400, { ok: false, error: "Укажите код" }); return; }
      const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });
      if (!refs.codes || !refs.codes[code]) {
        json(res, 404, { ok: false, error: "Код альянса не найден" });
        return;
      }
      const balances = readJson(BALANCES_FILE, {});
      const bal = balances[code] || { name: refs.codes[code].allianceName || code, bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] };
      json(res, 200, {
        ok: true,
        code,
        alliance: refs.codes[code].allianceName || code,
        balance: {
          bonusMonths: bal.bonusMonths || 0,
          cashbackCents: bal.cashbackCents || 0,
          purchases: bal.purchases || [],
          referrals: bal.referrals || [],
        },
      });
      return;
    }

    /* 1.1/1.2/1.5 Цены, сроки и активные акции (публично) */
    if (p === "/api/pricing" && req.method === "GET") {
      const content = loadContent();
      json(res, 200, {
        ok: true,
        rate: RUB_RATE,
        botPrices: (content.pricing && content.pricing.botPrices) || DEFAULTS.pricing.botPrices,
        periods: (content.pricing && content.pricing.periods) || DEFAULTS.pricing.periods,
        promotions: activePromotions(),
        referral: { cashbackPercent: CASHBACK_PERCENT, commissionPercent: COMMISSION_PERCENT },
        trial: { days: TRIAL_DAYS, bots: TRIAL_BOTS },
      });
      return;
    }

    /* 1.5 Активные промокоды с учётом условий (публично) */
    if (p === "/api/promocodes/active" && req.method === "GET") {
      const bots = toInt(url.searchParams.get("bots"), 0);
      const content = loadContent();
      const items = (content.codes && content.codes.items) || [];
      const now = Date.now();
      const active = items.filter((c) => {
        if (!c) return false;
        if (c.active === false || c.active === "false") return false;
        if (c.expiresTs && toInt(c.expiresTs, 0) < now) return false;
        if (c.minBots != null && bots < toInt(c.minBots, 0)) return false;
        if (c.maxBots != null && bots > toInt(c.maxBots, 0)) return false;
        return true;
      });
      json(res, 200, { ok: true, items: active });
      return;
    }


    /* ================= КЛИЕНТСКИЕ ЭНДПОИНТЫ (личный кабинет) ================= */

    /* Регистрация лидера альянса */
    if (p === "/api/register" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "?";
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!regRateLimitOk(ip)) { json(res, 429, { ok: false, error: "Слишком много заявок, попробуйте позже" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = cleanStr(body.email, 200).toLowerCase();
      const password = String(body.password || "");
      const allianceName = cleanStr(body.allianceName, 100);
      const referralCode = cleanStr(body.referralCode, 64).toUpperCase() || null;
      const allianceCodeHint = cleanStr(body.allianceCode, 64).toUpperCase() || null;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { json(res, 400, { ok: false, error: "errInvalidEmail" }); return; }
      if (password.length < 8) { json(res, 400, { ok: false, error: "errWeakPassword" }); return; }
      if (allianceName.length < 2) { json(res, 400, { ok: false, error: "errAllianceName" }); return; }

      const users = loadUsers();
      if (findUserByEmail(email)) { json(res, 409, { ok: false, error: "errEmailTaken" }); return; }

      const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });
      if (!refs.codes) refs.codes = {};
      if (referralCode && !refs.codes[referralCode]) { json(res, 400, { ok: false, error: "errInvalidCode" }); return; }

      /* Привязка к существующему балансу: по allianceCode или по названию */
      const balances = readJson(BALANCES_FILE, {});
      let allianceCode = null;
      if (allianceCodeHint && balances[allianceCodeHint]) {
        allianceCode = allianceCodeHint;
      } else {
        const lower = allianceName.toLowerCase();
        const found = Object.keys(balances).find((k) => balances[k] && String(balances[k].name || "").toLowerCase() === lower);
        if (found) allianceCode = found;
      }
      if (!allianceCode) {
        const taken = new Set([...Object.keys(balances), ...Object.keys(refs.codes)]);
        allianceCode = genUniqueCode(taken);
        balances[allianceCode] = { name: allianceName, bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] };
      }
      if (!balances[allianceCode].name || balances[allianceCode].name === allianceCode) {
        balances[allianceCode].name = allianceName;
      }
      writeJson(BALANCES_FILE, balances);

      /* Собственный реферальный код пользователя */
      const takenCodes = new Set(Object.keys(refs.codes));
      users.forEach((u) => { if (u && u.referralCode) takenCodes.add(u.referralCode); });
      const ownReferralCode = genUniqueCode(takenCodes);
      refs.codes[ownReferralCode] = { allianceName, ts: Date.now(), user: null };

      const salt = newSalt();
      const user = {
        id: randomBytes(8).toString("hex"),
        email,
        passwordHash: hashPassword(password, salt),
        salt,
        allianceName,
        allianceCode,
        referralCode: ownReferralCode,
        referredBy: referralCode,          // связь сохранена; бонус — после первой покупки
        referredBonusAwarded: false,
        createdAt: Date.now(),
        lastLogin: null,
      };
      refs.codes[ownReferralCode].user = user.id;
      users.push(user);
      saveUsers(users);
      writeJson(REFERRALS_FILE, refs);

      json(res, 200, { ok: true, allianceCode, referralCode: ownReferralCode, linkedToExisting: !!allianceCodeHint || false });
      return;
    }

    /* Профиль (требует авторизации) */
    if (p === "/api/profile" && req.method === "GET") {
      const user = clientUserFromReq(req);
      if (!user) { json(res, 401, { ok: false, error: "errAuthRequired" }); return; }
      json(res, 200, {
        ok: true,
        email: user.email,
        allianceName: user.allianceName,
        allianceCode: user.allianceCode,
        referralCode: user.referralCode,
        balance: clientBalanceOf(user.allianceCode),
      });
      return;
    }

    /* Заявка на применение бонусных бото-месяцев (требует авторизации) */
    if (p === "/api/apply-bonus" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      const user = clientUserFromReq(req);
      if (!user) { json(res, 401, { ok: false, error: "errAuthRequired" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const botsCount = toInt(body.botsCount, 0);
      const months = toInt(body.months, 0);
      const useBonusMonths = body.useBonusMonths === true || body.useBonusMonths === "true";
      if (botsCount < 1 || botsCount > 30 || months < 1 || months > 12) {
        json(res, 400, { ok: false, error: "errApplyBonusInvalid" });
        return;
      }
      const balance = clientBalanceOf(user.allianceCode);
      const requests = readJson(BONUS_REQUESTS_FILE, []);
      const reqEntry = {
        id: randomBytes(8).toString("hex"),
        userId: user.id,
        email: user.email,
        allianceName: user.allianceName,
        allianceCode: user.allianceCode,
        botsCount,
        months,
        useBonusMonths,
        bonusBalance: balance.bonusMonths || 0,
        status: "new", // new | approved | rejected
        ts: Date.now(),
        date: new Date().toISOString(),
      };
      requests.push(reqEntry);
      writeJson(BONUS_REQUESTS_FILE, requests);
      telegramBot.sendMessage(
        "📩 Заявка на списание бонусов\nАльянс: " + user.allianceName + " (" + user.allianceCode + ")\n" +
        botsCount + " ботов × " + months + " мес, использовать бонусы: " + (useBonusMonths ? "да (баланс " + (balance.bonusMonths || 0) + " мес)" : "нет") + "\nEmail: " + user.email
      ).catch(() => {});
      json(res, 200, { ok: true, id: reqEntry.id });
      return;
    }

    /* ================= АДМИН-ЭНДПОИНТЫ (только авторизованным) ================= */

    /* Подтверждение покупки: кэшбэк + реферальные бонусы */
    if (p === "/api/purchase" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const allianceCode = cleanStr(body.allianceCode, 64).toUpperCase();
      const allianceName = cleanStr(body.allianceName, 100);
      const botsCount = toInt(body.botsCount, 0);
      const periodMonths = toInt(body.periodMonths, 1);
      const totalPriceUsd = toFloat(body.totalPriceUsd, 0);
      let referralCode = cleanStr(body.referralCode, 64).toUpperCase() || null;
      if (!allianceCode || botsCount < 1 || botsCount > 1000 || periodMonths < 1 || totalPriceUsd < 0) {
        json(res, 400, { ok: false, error: "Неверные данные покупки" });
        return;
      }
      /* Если покупатель зарегистрировался по реферальному коду и это его
         первая покупка — начисляем бонус рефереру автоматически */
      let autoReferredUser = null;
      if (!referralCode) {
        autoReferredUser = findUserByAllianceCode(allianceCode);
        if (autoReferredUser && autoReferredUser.referredBy && !autoReferredUser.referredBonusAwarded) {
          referralCode = autoReferredUser.referredBy;
        } else {
          autoReferredUser = null;
        }
      }
      const result = applyPurchase({ allianceCode, allianceName, botsCount, periodMonths, totalPriceUsd, referralCode });
      if (autoReferredUser && result.referralAward) {
        const users = loadUsers().map((u) => (u.id === autoReferredUser.id ? { ...u, referredBonusAwarded: true } : u));
        saveUsers(users);
      }
      json(res, 200, { ok: true, ...result });
      return;
    }

    /* Ручная генерация реферального кода */
    if (p === "/api/referral/generate" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const allianceName = cleanStr(body.allianceName, 100);
      if (!allianceName) { json(res, 400, { ok: false, error: "Укажите название альянса" }); return; }
      const code = ensureReferralCode(allianceName);
      json(res, 200, { ok: true, referralCode: code });
      return;
    }

    /* Начисление реферальных бонусов без полной покупки (п.3.1) */
    if (p === "/api/referral/apply" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const referralCode = cleanStr(body.referralCode, 64).toUpperCase();
      const buyerAlliance = cleanStr(body.buyerAlliance, 100);
      const botsCount = toInt(body.botsCount, 0);
      const periodMonths = toInt(body.periodMonths, 1);
      const totalPrice = toFloat(body.totalPrice, 0);
      if (!referralCode || botsCount < 1 || totalPrice < 0) {
        json(res, 400, { ok: false, error: "Неверные данные" });
        return;
      }
      const refs = readJson(REFERRALS_FILE, { codes: {}, links: [] });
      if (!refs.codes || !refs.codes[referralCode]) {
        json(res, 404, { ok: false, error: "Реферальный код не найден" });
        return;
      }
      const balances = readJson(BALANCES_FILE, {});
      const refEntry = balances[referralCode] || { name: refs.codes[referralCode].allianceName || referralCode, bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] };
      const refMonths = botsCount;
      const refCashbackCents = Math.round(totalPrice * (COMMISSION_PERCENT / 100) * 100);
      refEntry.bonusMonths += refMonths;
      refEntry.cashbackCents += refCashbackCents;
      refEntry.referrals.push({
        ts: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        buyerAlliance: buyerAlliance || "—",
        bots: botsCount,
        months: periodMonths,
        priceUsd: totalPrice,
        bonusMonths: refMonths,
        cashbackCents: refCashbackCents,
      });
      balances[referralCode] = refEntry;
      refs.links = refs.links || [];
      refs.links.push({ referrerCode: referralCode, buyerAlliance: buyerAlliance || "—", ts: Date.now(), bots: botsCount, months: periodMonths, priceUsd: totalPrice });
      writeJson(BALANCES_FILE, balances);
      writeJson(REFERRALS_FILE, refs);
      json(res, 200, { ok: true, bonusMonths: refMonths, cashbackCents: refCashbackCents });
      return;
    }

    /* Просмотры для админки */
    if (p === "/api/trials" && req.method === "GET") {
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      json(res, 200, { ok: true, items: readJson(TRIALS_FILE, []) });
      return;
    }
    if (p === "/api/trials" && req.method === "PUT") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "null");
      if (!Array.isArray(body)) { json(res, 400, { ok: false, error: "Ожидается массив" }); return; }
      writeJson(TRIALS_FILE, body);
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/balances" && req.method === "GET") {
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      json(res, 200, { ok: true, balances: readJson(BALANCES_FILE, {}) });
      return;
    }
    if (p === "/api/balances" && req.method === "PUT") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "null");
      if (!body || typeof body !== "object" || Array.isArray(body)) { json(res, 400, { ok: false, error: "Ожидается объект" }); return; }
      writeJson(BALANCES_FILE, body);
      json(res, 200, { ok: true });
      return;
    }

    if (p === "/api/referrals" && req.method === "GET") {
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      json(res, 200, { ok: true, ...readJson(REFERRALS_FILE, { codes: {}, links: [] }) });
      return;
    }


    /* Пользователи (список для админки) */
    if (p === "/api/users" && req.method === "GET") {
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const balances = readJson(BALANCES_FILE, {});
      const users = loadUsers().map((u) => ({
        id: u.id,
        email: u.email,
        allianceName: u.allianceName,
        allianceCode: u.allianceCode,
        referralCode: u.referralCode,
        referredBy: u.referredBy || null,
        referredBonusAwarded: !!u.referredBonusAwarded,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin || null,
        balance: balances[u.allianceCode] || { bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] },
      }));
      json(res, 200, { ok: true, users });
      return;
    }

    /* Заявки на списание бонусов */
    if (p === "/api/bonus-requests" && req.method === "GET") {
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      json(res, 200, { ok: true, items: readJson(BONUS_REQUESTS_FILE, []) });
      return;
    }
    if (p === "/api/bonus-requests/decide" && req.method === "POST") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const id = cleanStr(body.id, 64);
      const decision = cleanStr(body.decision, 20);
      if (!id || (decision !== "approve" && decision !== "reject")) {
        json(res, 400, { ok: false, error: "Неверные данные" });
        return;
      }
      const requests = readJson(BONUS_REQUESTS_FILE, []);
      const reqEntry = requests.find((r) => r && r.id === id);
      if (!reqEntry || reqEntry.status !== "new") {
        json(res, 404, { ok: false, error: "Заявка не найдена или уже обработана" });
        return;
      }
      if (decision === "approve") {
        /* Списываем бонусные бото-месяцы и пишем запись в историю */
        const balances = readJson(BALANCES_FILE, {});
        const bal = balances[reqEntry.allianceCode] || { name: reqEntry.allianceName, bonusMonths: 0, cashbackCents: 0, purchases: [], referrals: [] };
        if (reqEntry.useBonusMonths) {
          const spend = Math.min(bal.bonusMonths || 0, reqEntry.botsCount * reqEntry.months);
          bal.bonusMonths = (bal.bonusMonths || 0) - spend;
          bal.purchases.push({
            ts: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            bots: reqEntry.botsCount,
            months: reqEntry.months,
            priceUsd: 0,
            cashbackMonths: 0,
            bonusSpent: spend,
            type: "bonus-spend",
          });
        } else {
          bal.purchases.push({
            ts: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            bots: reqEntry.botsCount,
            months: reqEntry.months,
            priceUsd: 0,
            cashbackMonths: 0,
            bonusSpent: 0,
            type: "purchase-request",
          });
        }
        balances[reqEntry.allianceCode] = bal;
        writeJson(BALANCES_FILE, balances);
        reqEntry.status = "approved";
        reqEntry.decidedTs = Date.now();
      } else {
        reqEntry.status = "rejected";
        reqEntry.decidedTs = Date.now();
      }
      writeJson(BONUS_REQUESTS_FILE, requests);
      json(res, 200, { ok: true, status: reqEntry.status });
      return;
    }

    /* Акции: публичный список — только активные; полный — с авторизацией */
    if (p === "/api/promotions" && req.method === "GET") {
      const all = url.searchParams.get("all") === "1";
      if (all && !isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      json(res, 200, { ok: true, promotions: all ? readJson(PROMOTIONS_FILE, []) : activePromotions() });
      return;
    }
    if (p === "/api/promotions" && req.method === "PUT") {
      if (!originOk(req)) { json(res, 403, { ok: false, error: "bad origin" }); return; }
      if (!isAuthed(req)) { json(res, 401, { ok: false, error: "Требуется вход" }); return; }
      const body = JSON.parse((await readBody(req)) || "null");
      if (!Array.isArray(body)) { json(res, 400, { ok: false, error: "Ожидается массив" }); return; }
      writeJson(PROMOTIONS_FILE, body);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    if (err && err.message === "TOO_LARGE") { json(res, 413, { ok: false, error: "Слишком большой запрос" }); return; }
    if (err instanceof SyntaxError) { json(res, 400, { ok: false, error: "Неверный JSON" }); return; }
    console.error("[admin-server] ошибка запроса:", err && err.message ? err.message : err);
    json(res, 400, { ok: false, error: "bad request" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`admin-server listening on 127.0.0.1:${PORT}, data dir: ${DATA_DIR}`);
});
