/* ============================================================
   Telegram-бот LASTBOT: автопостинг новостей DLS в канал.
   Без внешних зависимостей (чистый https).
   - публикует только новые новости (дедупликация по ссылке,
     история в data/telegram-posted.json)
   - авто-цикл раз в 4 часа + ручной вызов из админ-панели
   ============================================================ */
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fetchNewsItems } from "./news-feed.mjs";

const API = "api.telegram.org";
const POST_INTERVAL = 4 * 60 * 60 * 1000; // 4 часа

function tgRequest(token, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params || {});
    const req = https.request(
      {
        host: API,
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Telegram: не-JSON ответ (HTTP " + res.statusCode + ")"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Telegram: таймаут")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function startTelegramBot({ token, channel, dataDir }) {
  if (!token) {
    console.log("Telegram-бот: BOT_TOKEN не задан — автопостинг отключён");
    return { enabled: false, postNewNews: async () => ({ posted: 0, error: "BOT_TOKEN не задан" }) };
  }

  const postedFile = path.join(dataDir, "telegram-posted.json");
  let seen = new Set();
  try {
    const raw = fs.readFileSync(postedFile, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) seen = new Set(list);
    // ограничим историю, чтобы файл не рос бесконечно
    if (seen.size > 500) seen = new Set([...seen].slice(-500));
  } catch {
    /* файла ещё нет */
  }

  function saveSeen() {
    try {
      fs.writeFileSync(postedFile, JSON.stringify([...seen]));
    } catch {
      /* не критично */
    }
  }

  async function postMessage(text) {
    const res = await tgRequest(token, "sendMessage", {
      chat_id: channel,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (!res || !res.ok) {
      const desc = res && res.description ? res.description : "неизвестная ошибка";
      throw new Error(desc);
    }
    return true;
  }

  async function postNewNews() {
    try {
      const items = await fetchNewsItems("ru");
      let posted = 0;
      for (const item of items) {
        const id = item.url;
        if (seen.has(id)) continue;
        const text =
          "📰 <b>" + escapeHtml(item.title) + "</b>\n" +
          (item.source ? "Источник: " + escapeHtml(item.source) + "\n" : "") +
          "🔗 " + item.url;
        await postMessage(text);
        seen.add(id);
        posted++;
        await new Promise((r) => setTimeout(r, 700)); // пауза между постами
      }
      if (posted) saveSeen();
      console.log("Telegram-бот: опубликовано новых новостей:", posted);
      return { posted };
    } catch (err) {
      console.log("Telegram-бот: ошибка публикации:", err.message);
      return { posted: 0, error: err.message };
    }
  }

  // авто-цикл раз в 4 часа; первый прогон — через 20 секунд после старта
  setInterval(postNewNews, POST_INTERVAL);
  setTimeout(postNewNews, 20000);

  return { enabled: true, postNewNews };
}
