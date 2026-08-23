/* ============================================================
   LASTBOT — админ-бэкенд (чистый Node, без внешних зависимостей)
   - авторизация: HMAC-токен в httpOnly-куке, 12 часов
   - пароль хранится и сверяется на сервере (timingSafeEqual)
   - rate-limit попыток входа
   - контент сайта: JSON-файл в DATA_DIR
   ============================================================ */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const ADMIN_USER = process.env.ADMIN_USER || "ta-admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "142536Mainkey";
const ADMIN_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "admin");
const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 часов
const LOGIN_WINDOW = 10 * 60 * 1000;   // окно rate-limit: 10 минут
const LOGIN_MAX = 8;                    // максимум попыток входа за окно
const BODY_LIMIT = 300 * 1024;          // 300 КБ на тело запроса

/* ---------- Контент по умолчанию (зеркало текущего сайта) ---------- */
const DEFAULTS = {
  hero: {
    badge: "Облачный сервис · работает 24/7",
    titleLine1: "Твой бот для DLS",
    word1: "Лечи.",
    word2: "Фарми.",
    word3: "Доминируй.",
    subtitle: "Полная автоматизация Doomsday: Last Survivors — лечение отрядов, фарм ресурсов, альянс и ежедневки без твоего участия. Бот работает в облаке, пока ты занимаешься своей жизнью.",
    trust: ["Безопасно для аккаунта", "PayPal / Crypto", "Доступ до 24 часов"],
  },
  why: {
    heading: "Время — главный ресурс в пустоши",
    sub: "Мы забираем рутину на себя, чтобы ты играл только в самое интересное.",
    cards: [
      { title: "Экономия 10+ часов в неделю", text: "Пока бот лечит, фармит и жмёт кнопки помощи — ты строишь базу, воюешь и отдыхаешь.", label: "XP 10h / 10h" },
      { title: "Работает 24/7 в облаке", text: "Серверы не спят, не болеют и не ходят на пары. Твой аккаунт в игре даже ночью.", label: "UPTIME 99.9%" },
      { title: "Безопасно для аккаунта", text: "Шифрованное соединение, без передачи данных третьим лицам и без установки на твой ПК.", label: "SHIELD 100%" },
      { title: "Поддержка 24/7", text: "Живые люди в Telegram и на почте. Среднее время ответа — 15 минут, даже ночью.", label: "REPLY ~15 MIN" },
    ],
  },
  features: {
    heading: "Всё, что ты ненавидишь делать руками, делает бот",
    sub: "Шесть модулей автоматизации под каждый рутинный сценарий DLS.",
    items: [
      { tag: "TOP", title: "Heal Bot — лечение отрядов", text: "Автоматически лечит раненые войска в госпитале после каждого сражения. Больше никаких «ой, забыл поставить лечение» — бот сделает это быстрее тебя." },
      { tag: "24/7", title: "Фарм ресурсов", text: "Сбор ресурсов с карты, атаки на зомби-фермы и рутинные PvE-активности вроде охоты за призами — на полном автомате." },
      { tag: "", title: "Помощь альянсу", text: "Автоматические клики по кнопкам помощи союзникам: ускоряй стройку и исследования товарищей, получай очки альянса и репутацию." },
      { tag: "", title: "Ежедневные задания", text: "Рутинные дейлики на опыте и наградах выполняются каждый день — стабильный прогресс без захода в игру." },
      { tag: "×30", title: "Мультиаккаунтинг", text: "Веди до 30 аккаунтов одновременно. Фермы-доноры, альты для альянса и эксперименты — все они работают параллельно." },
      { tag: "AI", title: "Автокликер с распознаванием изображений", text: "Для сложных сценариев, где нужна точность: бот видит интерфейс игры, находит нужные кнопки по картинке и действует по сценарию — даже если элементы двигаются или меняют дизайн." },
    ],
  },
  pricing: {
    heading: "Простая цена: $2 за бота",
    sub: "Чем больше ботов — тем больше сила. Все тарифы включают все функции и поддержку 24/7.",
    tiers: [
      { name: "Базовый", bots: "10", price: "$20", features: ["Все функции ботов", "До 10 аккаунтов", "Поддержка 24/7", "Доставка до 24 часов"] },
      { name: "Оптимальный", bots: "20", price: "$40", features: ["Все функции ботов", "До 20 аккаунтов", "Приоритетная поддержка", "Доставка обычно мгновенно", "Бонус: скрипты для альянса"] },
      { name: "Про", bots: "30", price: "$60", features: ["Все функции ботов", "До 30 аккаунтов", "VIP-поддержка 24/7", "Доставка мгновенно", "Индивидуальные сценарии"] },
    ],
    note: "Подписка продлевается автоматически каждый месяц. Отключить автопродление можно в любой момент в личном сообщении поддержке.",
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
      { code: "DLSODS", reward: "Бесплатные награды", expires: "до 31.08.2026" },
      { code: "DLSFAIRYTAIL", reward: "Бесплатные награды", expires: "истекает скоро" },
    ],
  },
  faq: {
    heading: "Вопросы перед стартом",
    items: [
      { q: "Это безопасно для моего аккаунта?", a: "Да. Боты работают в облаке через защищённое соединение, без установки программ на твой компьютер и без передачи данных третьим лицам. Мы не просим пароли от почты и не меняем настройки аккаунта. Тем не менее, использование сторонних сервисов — твоя зона ответственности: ознакомься с правилами игры." },
      { q: "Как я получу доступ после оплаты?", a: "Сразу после оплаты напиши в Telegram или на почту номер заказа — мы активируем ботов. Доставка занимает до 24 часов, в 95% случаев — мгновенно. Ты получишь доступ к панели управления и инструкцию по подключению." },
      { q: "Можно ли отменить подписку?", a: "Да, в любой момент. Напиши в поддержку — автопродление будет отключено, а уже оплаченный период отработает до конца. Никаких штрафов и скрытых платежей." },
      { q: "Есть ли гарантия возврата?", a: "Если сервис не был предоставлен в течение 48 часов после оплаты, мы вернём деньги полностью — на тот же способ оплаты. Подробности в Refund Policy." },
      { q: "Сколько аккаунтов можно подключить?", a: "Зависит от тарифа: Базовый — до 10, Оптимальный — до 20, Про — до 30 аккаунтов одновременно. Все боты работают параллельно и независимо друг от друга." },
      { q: "Нужен ли мощный компьютер или эмулятор?", a: "Нет. Всё крутится на наших облачных серверах. Тебе нужен только браузер — управлять ботами можно даже с телефона." },
    ],
  },
  cta: {
    heading: "Готов доминировать?",
    text: "Подключи ботов сегодня — завтра проснёшься с полным госпиталем, фермой и собранными наградами.",
  },
  how: {
    items: [
      { title: "Выбери тариф", text: "10, 20 или 30 ботов — под размер твоей фермы. Все тарифы включают все функции." },
      { title: "Оплати подписку", text: "PayPal или криптовалюта. Подписка на месяц с автопродлением — отключить можно в любой момент." },
      { title: "Получи доступ к ботам", text: "Доставка в течение 24 часов, обычно мгновенно. Подключаешь аккаунты — и боты уходят в бой." },
    ],
  },
  contacts: {
    email: "support@lastbot.gg",
    telegramHandle: "@lastbot_support",
    telegramUrl: "https://t.me/lastbot_support",
    tagline: "Облачная автоматизация Doomsday: Last Survivors. Лечи. Фарми. Доминируй.",
  },
  dashboard: {
    url: "", // ссылка кнопки «Дашборд» в верхнем меню; пусто — кнопка скрыта
  },
};

/* ---------- Лента новостей: собственный прокси (без сторонних CORS-сервисов) ---------- */
const NEWS_FEEDS = {
  ru: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=ru&gl=RU&ceid=RU:ru",
  en: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=en-US&gl=US&ceid=US:en",
  es: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=es&gl=ES&ceid=ES:es",
  de: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=de&gl=DE&ceid=DE:de",
  fr: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=fr&gl=FR&ceid=FR:fr",
  pt: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  zh: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  ar: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=ar&gl=EG&ceid=EG:ar",
};

const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 минут
const newsCache = new Map(); // lang -> { ts, items }

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[|\]\]>/g, "");
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 5) {
    const block = m[1];
    const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    let title = decodeEntities(rawTitle).trim();
    if (!title) continue;
    const srcMatch = title.match(/\s+-\s+([^-]+)$/);
    const source = srcMatch ? srcMatch[1].trim() : "Google News";
    if (srcMatch) title = title.slice(0, srcMatch.index).trim();
    items.push({
      title: title || "Doomsday: Last Survivors",
      date: pub ? new Date(pub).toISOString() : null,
      url: link.trim() || "https://dls.igg.com/",
      source,
    });
  }
  return items;
}

/* ---------- Хранилище ---------- */
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, randomBytes(32).toString("hex"));
    try { fs.chmodSync(SECRET_FILE, 0o600); } catch { /* windows */ }
  }
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(DEFAULTS, null, 2));
  }
}
ensureDataDir();

function loadContent() {
  try {
    const raw = fs.readFileSync(CONTENT_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveContent(content) {
  const tmp = CONTENT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(content, null, 2));
  fs.renameSync(tmp, CONTENT_FILE);
}

const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();

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
   (docker 8080->80, локальные тесты) порты могут не совпадать.
   Чужой origin всегда придёт с чужим hostname, так что защита сохраняется. */
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
  // no-store: браузеры с агрессивным кэшем (например, Яндекс) не должны
  // подсовывать устаревшие ответы API
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
      if (!rateLimitOk(ip)) { json(res, 429, { ok: false, error: "Слишком много попыток, подождите" }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
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
        "Set-Cookie": "lb_auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
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
        // пустой список: клиент покажет резервную ленту (VK/кэш)
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
      // мержим по верхним ключам, чтобы частичное обновление не затирало остальные секции
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

    if (p === "/api/status") {
      json(res, 200, { ok: true, authed: isAuthed(req) });
      return;
    }

    json(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    if (err && err.message === "TOO_LARGE") { json(res, 413, { ok: false, error: "Слишком большой запрос" }); return; }
    json(res, 400, { ok: false, error: "bad request" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`admin-server listening on 127.0.0.1:${PORT}, data dir: ${DATA_DIR}`);
});
