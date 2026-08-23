/* ============================================================
   Общий модуль ленты новостей: фиды Google News по языкам,
   парсинг RSS без внешних зависимостей.
   Используется админ-бэкендом (/api/news) и Telegram-ботом.
   ============================================================ */
export const NEWS_FEEDS = {
  ru: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=ru&gl=RU&ceid=RU:ru",
  en: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=en-US&gl=US&ceid=US:en",
  es: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=es&gl=ES&ceid=ES:es",
  de: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=de&gl=DE&ceid=DE:de",
  fr: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=fr&gl=FR&ceid=FR:fr",
  pt: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  zh: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  ar: "https://news.google.com/rss/search?q=Doomsday%20Last%20Survivors&hl=ar&gl=EG&ceid=EG:ar",
};

export function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[|\]\]>/g, "");
}

export function parseRssItems(xml, limit = 5) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
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

export async function fetchNewsItems(lang = "ru", timeoutMs = 8000) {
  const feedUrl = NEWS_FEEDS[lang] || NEWS_FEEDS.ru;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const up = await fetch(feedUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (lastbot-news; +https://lastbot.gg)" },
    });
    if (!up.ok) throw new Error("HTTP " + up.status);
    return parseRssItems(await up.text());
  } finally {
    clearTimeout(timer);
  }
}
