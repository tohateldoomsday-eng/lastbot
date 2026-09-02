/* ============================================================
   СРАВНЕНИЕ ЦЕН КАЛЬКУЛЯТОРА на исправленном коде main.js.
   Извлекает реальные функции из public/assets/js/main.js
   и повторяет арифметику renderPrice (с фиксом зажима скидок).
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const mainSrc = fs.readFileSync(path.join(process.cwd(), "public", "assets", "js", "main.js"), "utf8");
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  const ob = src.indexOf("{", start);
  let depth = 0;
  for (let i = ob; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error("нет блока: " + marker);
}
const DEFAULTS_SRC = extractBlock(mainSrc, "const PRICING_DEFAULTS = ");
const DEFAULTS = new Function("RUB_RATE", DEFAULTS_SRC + "\nreturn PRICING_DEFAULTS;")(85);
/* База = код-дефолты, перекрытые реальными данными data/content.json (как на сайте) */
let LIVE = null;
try {
  const c = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "content.json"), "utf8"));
  LIVE = { ...DEFAULTS, botPrices: c.pricing.botPrices, periods: c.pricing.periods };
  console.log("(база: данные из data/content.json: боты " + LIVE.botPrices.map((t) => "$" + (+t.price).toFixed(2)).join("/") +
    ", скидки " + LIVE.periods.map((p) => p.discount + "%").join("/") + ")\n");
} catch { LIVE = DEFAULTS; }
/* Зеркало: как клиент подхватывает данные API */
function baseData(over = {}) { return { ...LIVE, ...over }; }
const fnsSrc = ["fmtUsd", "fmtRub", "priceMonthlyFor", "periodFor", "promoFor"]
  .map((n) => extractBlock(mainSrc, "function " + n + "(")).join("\n");
const factory = new Function("pricingData", fnsSrc + "\nreturn { fmtUsd, fmtRub, priceMonthlyFor, periodFor, promoFor };");

/* Арифметика renderPrice (исправленная) */
function calc(data, bots, months, rate = 85) {
  const f = factory({ ...baseData(), ...data });
  const monthly = f.priceMonthlyFor(bots);
  const perBot = bots > 0 ? monthly / bots : 0;
  const period = f.periodFor(months);
  const prePromo = monthly * period.coef;
  const base = monthly * months;
  let total = prePromo, oldPrice = null, promoOff = 0;
  const promo = f.promoFor(months, bots)[0];
  if (promo) {
    if (promo.type === "percent") {
      const v = Math.min(100, Math.max(0, parseFloat(promo.value) || 0));
      if (v > 0) { oldPrice = prePromo; total = prePromo * (1 - v / 100); promoOff = prePromo - total; }
    } else if (promo.type === "fixed") {
      const v = Math.max(0, parseFloat(promo.value) || 0);
      if (v > 0) { oldPrice = prePromo; total = Math.max(0, prePromo - v); promoOff = prePromo - total; }
    }
  }
  return { perBot, coef: period.coef, discount: period.discount, prePromo, total, oldPrice, promoOff, save: Math.max(0, base - prePromo), promo: promo ? (promo.name || promo.type) : null };
}
const usd = (n) => "$" + n.toFixed(2);

/* ---------- Таблица A: цена пакета: боты × срок (без акций) ---------- */
const BOTS = [1, 5, 10, 11, 15, 20, 21, 25, 30];
const MONTHS = [1, 3, 6, 12];
console.log("=== A. Цена пакета ($), реальные тарифы: боты × срок ===");
console.log("боты\\срок | 1 мес   3 мес   6 мес  12 мес   | цена/бот");
for (const b of BOTS) {
  const cells = MONTHS.map((m) => usd(calc(baseData(), b, m).total).padStart(8));
  console.log(String(b).padStart(8) + " |" + cells.join(" ") + "  | " + usd(calc(baseData(), b, 1).perBot));
}
console.log("(скидки периода: 1м −0%, 3м −10%→coef 2.7, 6м −15%→5.1, 12м −25%→9)\n");

/* ---------- Таблица B: сравнение сроков и экономия для 10/20/30 ботов ---------- */
console.log("=== B. Тот же объём по срокам: экономия против помесячной оплаты без скидки ===");
for (const b of [10, 20, 30]) {
  console.log(`--- ${b} ботов ---`);
  for (const m of MONTHS) {
    const r = calc(baseData(), b, m);
    console.log(`  ${String(m).padStart(2)} мес: итог ${usd(r.total).padStart(8)} | скидка ${String(r.discount).padStart(2)}% | экономия ${usd(r.save).padStart(7)} | за месяц ${usd(r.total / m)}`);
  }
}

/* ---------- Таблица C: промо-скидки на 20 ботов × 3 мес ---------- */
console.log("\n=== C. Промо percent на пакет 20 ботов × 3 мес (база $" + (calc(baseData(), 20, 3).perBot * 20 * 3).toFixed(2) + ", со скидкой периода −10% = $" + calc(baseData(), 20, 3).prePromo.toFixed(2) + ") ===");
const promos = [
  { v: 0, label: "0% (нет акции)" },
  { v: 10, label: "−10%" },
  { v: 30, label: "−30%" },
  { v: 50, label: "−50%" },
  { v: 100, label: "−100%" },
  { v: 150, label: "−150% (было −$…, теперь зажим)" },
  { v: 500, label: "−500% (было −$…, теперь зажим)" },
];
for (const p of promos) {
  const data = { ...baseData(), promotions: [{ id: "cmp", name: "Акция", description: "", banner: "", type: "percent", value: p.v, appliesTo: {}, minBots: null, maxBots: null, startDate: "2020-01-01", endDate: "2099-01-01", usageLimit: null, used: 0 }] };
  const r = calc(data, 20, 3);
  const struck = r.oldPrice != null ? " (зачёркнуто " + usd(r.oldPrice) + ")" : "";
  console.log(`  ${p.label.padEnd(38)} → итог ${usd(r.total).padStart(8)}${struck}`);
}

/* ---------- Таблица D: фиксы на граничных значениях ---------- */
console.log("\n=== D. Граничные случаи после фиксов ===");
/* отрицательная цена за бота → сервер теперь отдаёт ≥0, клиент не ниже 0 */
{
  const data = { ...baseData(), botPrices: [{ min: 1, max: 10, price: -2 }, { min: 11, max: 20, price: 1.8 }, { min: 21, max: 30, price: 1.5 }] };
  const r = calc(data, 5, 1);
  console.log(`  цена бота −2$ (введено в админке) → сервер зажимает в 0, клиент: цена/бот ${usd(r.perBot)}, итог ${usd(r.total)}`);
}
/* промо 150% на 1 бот × 1 мес */
{
  const data = { ...baseData(), promotions: [{ id: "x", name: "Скидка 150%", description: "", banner: "", type: "percent", value: 150, appliesTo: {}, minBots: null, maxBots: null, startDate: "2020-01-01", endDate: "2099-01-01", usageLimit: null, used: 0 }] };
  const r = calc(data, 1, 1);
  console.log(`  промо 150% на 1 бот × 1 мес → итог ${usd(r.total)} (было −$1.00) — скидка зажата до 100%`);
}
/* 100% скидка периода */
{
  const data = { ...baseData(), periods: [{ months: 1, discount: 0 }, { months: 12, discount: 100 }] };
  const r = calc(data, 30, 12);
  console.log(`  скидка периода 100% на 30×12 → итог ${usd(r.total)}`);
}
