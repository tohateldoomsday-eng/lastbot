/* ============================================================
   SWEEP-ТЕСТ КАЛЬКУЛЯТОРА: боты × сроки × скидки — поиск ошибок.
   Использует НАСТОЯЩИЕ функции из public/assets/js/main.js
   (извлекаются из файла по строкам) + нормализацию /api/pricing.

   Запуск:  node _sweep-tests.mjs
   ============================================================ */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const DATA = "./data-sweep";
fs.rmSync(DATA, { recursive: true, force: true });
const PORT = 3221;

const child = spawn(process.execPath, ["server/admin-server.mjs"], {
  env: { ...process.env, DATA_DIR: DATA, ADMIN_PASS: "test", PORT: String(PORT), CLIENT_JWT_SECRET: "sweep" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/status`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start\n" + serverLog);
}
await waitUp();

/* ---------- Извлечение НАСТОЯЩЕГО кода калькулятора из main.js ---------- */
const mainSrc = fs.readFileSync(path.join(ROOT, "public", "assets", "js", "main.js"), "utf8");
/* Поиск тела функции/объекта от маркера до парной закрывающей скобки */
function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("не найден маркер: " + marker);
  const ob = src.indexOf("{", start);
  let depth = 0;
  for (let i = ob; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error("непарные скобки: " + marker);
}
/* PRICING_DEFAULTS — константа из main.js (rate: RUB_RATE → передаём 85) */
const DEFAULTS_SRC = extractBlock(mainSrc, "const PRICING_DEFAULTS = ");
const defaultsFactory = new Function("RUB_RATE", DEFAULTS_SRC + "\nreturn PRICING_DEFAULTS;");
const PRICING_DEFAULTS = defaultsFactory(85);
/* fmtUsd, fmtRub, priceMonthlyFor, periodFor, promoFor — функции main.js */
const fnsSrc = ["fmtUsd", "fmtRub", "priceMonthlyFor", "periodFor", "promoFor"]
  .map((n) => extractBlock(mainSrc, "function " + n + "(")).join("\n");
const factory = new Function("pricingData", fnsSrc + "\nreturn { fmtUsd, fmtRub, priceMonthlyFor, periodFor, promoFor };");

/* Точное повторение арифметики renderPrice() из main.js (без DOM) */
function computeTotal(fns, bots, months, rate) {
  const monthly = fns.priceMonthlyFor(bots);
  const period = fns.periodFor(months);
  const prePromo = monthly * period.coef;
  const base = monthly * months;
  let total = prePromo, oldPrice = null, promoOff = 0;
  const promo = fns.promoFor(months, bots)[0];
  if (promo) {
    if (promo.type === "percent") {
      /* зеркало исправленного renderPrice: скидка не может быть больше 100% */
      const v = Math.min(100, Math.max(0, parseFloat(promo.value) || 0));
      if (v > 0) { oldPrice = prePromo; total = prePromo * (1 - v / 100); promoOff = prePromo - total; }
    } else if (promo.type === "fixed") {
      const v = parseFloat(promo.value) || 0;
      if (v > 0) { oldPrice = prePromo; total = Math.max(0, prePromo - v); promoOff = prePromo - total; }
    }
  }
  const save = Math.max(0, base - prePromo);
  let usd = null, rub = null, fmtErr = null;
  try { usd = fns.fmtUsd(total); } catch (e) { fmtErr = "fmtUsd: " + e.message; }
  try { rub = fns.fmtRub(Math.round((total * rate) / 100) * 100); } catch (e) { fmtErr = (fmtErr ? fmtErr + " | " : "") + "fmtRub: " + e.message; }
  return { bots, months, monthly, coef: period.coef, prePromo, base, total, oldPrice, promoOff, save, usd, rub, fmtErr, promo: promo && (promo.name || promo.id || promo.type) };
}

const BOTS = [0, 1, 2, 5, 10, 11, 20, 21, 25, 30, 31, 50, 100];
const FALLBACK_MONTHS = [2, 5, 7, 11, 24]; /* сроки вне данных: линейный fallback coef=months */

let pass = 0, fail = 0;
const discovered = new Map(); /* issue kind -> sample detail */

function bad(name, issues, maxShown = 5) {
  if (!issues.length) { pass++; console.log("PASS", name); return; }
  fail++;
  console.log("FAIL", name, "→", issues.slice(0, maxShown).join(" | "));
}
function note(issue) {
  if (!discovered.has(issue.kind)) discovered.set(issue.kind, { count: 0, sample: issue.detail });
  discovered.get(issue.kind).count++;
}

/* Проверка одного результата расчёта */
function inspectResult(r, { noPromo = false } = {}) {
  const issues = [];
  if (r.fmtErr) { issues.push(r.fmtErr); note({ kind: "fmt-throw", detail: r.fmtErr }); }
  if (!isFinite(r.total) || Number.isNaN(r.total)) {
    issues.push(`bots=${r.bots} m=${r.months}: total=${r.total}`); note({ kind: "nan-total", detail: `bots=${r.bots} m=${r.months} total=${r.total}` });
  }
  if (r.total !== null && isFinite(r.total) && r.total < -1e-9) {
    issues.push(`боты=${r.bots} срок=${r.months}: total=${r.total} (${r.promo || "без акции"})`);
    note({ kind: r.promo ? "neg-promo-total" : "neg-total", detail: `боты=${r.bots} срок=${r.months} total=${r.total} promo=${r.promo || "-"}` });
  }
  if (r.usd && /NaN|Infinity|не число/i.test(r.usd + "|" + (r.rub || ""))) {
    issues.push(`боты=${r.bots} m=${r.months}: ${r.usd} / ${r.rub}`); note({ kind: "nan-format", detail: `${r.usd} / ${r.rub}` });
  }
  return issues;
}

async function scenario(name, { content, promotions, extra } = {}) {
  if (content !== undefined) {
    if (!content.schemaVersion) content = { schemaVersion: 2, ...content };
    fs.writeFileSync(path.join(DATA, "content.json"), JSON.stringify(content));
  }
  if (promotions !== undefined) fs.writeFileSync(path.join(DATA, "promotions.json"), JSON.stringify(promotions));
  const res = await fetch(`http://127.0.0.1:${PORT}/api/pricing`);
  if (res.status !== 200) { fail++; console.log("FAIL", name, "→ HTTP " + res.status); return null; }
  const data = await res.json();
  const issues = [];

  /* инварианты серверной нормализации */
  if (!data.ok || !isFinite(data.rate) || data.rate <= 0) issues.push("rate=" + data.rate);
  for (const t of data.botPrices || []) {
    if (!isFinite(t.min) || !isFinite(t.max) || !isFinite(t.price)) issues.push(`botPrices: ${JSON.stringify(t)} → не число`);
  }
  for (const p of data.periods || []) {
    if (!isFinite(p.coef) || p.coef < 0) issues.push(`period months=${p.months} coef=${p.coef}`);
    if (!(p.discount >= 0 && p.discount <= 100)) issues.push(`period months=${p.months} discount=${p.discount} (вне 0..100!)`);
    if (!(Number.isInteger(p.months) && p.months > 0)) issues.push(`period months=${p.months} (должен быть int > 0)`);
  }

  const fns = factory({ ...PRICING_DEFAULTS, ...data });
  const rate = isFinite(data.rate) && data.rate > 0 ? data.rate : 85;
  const monthsSet = [...new Set([...(data.periods || []).map((p) => p.months), 1, 3, 6, 12])].filter((m) => m > 0);
  const noPromo = !(data.promotions && data.promotions.length);

  for (const b of BOTS) for (const m of monthsSet) issues.push(...inspectResult(computeTotal(fns, b, m, rate), { noPromo }));
  /* fallback-сроки вне данных */
  if (noPromo) for (const b of BOTS) for (const m of FALLBACK_MONTHS) issues.push(...inspectResult(computeTotal(fns, b, m, rate), { noPromo: true }));
  /* специальные проверки сценария */
  if (extra) extra(data, issues, fns, rate, monthsSet);

  bad(name, [...new Set(issues)], 6);
  return data;
}

/* ---------- 1. СКИДКА ПЕРИОДА: широкая сетка размеров ---------- */
const basePricing = {
  pricing: {
    heading: "t", sub: "t", note: "t",
    botPrices: [{ min: 1, max: 10, price: 2 }, { min: 11, max: 20, price: 1.8 }, { min: 21, max: 30, price: 1.5 }],
    periods: [
      { months: 1, discount: 0 },
      { months: 3, discount: 17 },
      { months: 6, discount: 17 },
      { months: 12, discount: 25 },
    ],
  },
};
const DISCOUNTS = [-100, -50, -1, 0, 0.5, 1, 5, 8, 10, 15, 17, 20, 25, 33.33, 49.5, 50, 66.67, 75, 90, 99, 99.99, 100, 100.5, 150, 300, 999];
for (const d of DISCOUNTS) {
  const periods = [
    { months: 1, discount: 0 },
    { months: 3, discount: d },
    { months: 6, discount: d },
    { months: 12, discount: d },
  ];
  await scenario(`скидка периода ${d}%`, {
    content: { pricing: { ...basePricing.pricing, periods } },
    promotions: [],
    extra: (data, issues) => {
      /* сервер обязан зажать скидку в 0..100 */
      for (const p of data.periods) {
        const want = Math.min(100, Math.max(0, Number(d)));
        if (p.months !== 1 && Math.abs(p.discount - want) > 1e-9 && !Number.isNaN(Number(d)))
          issues.push(`скидка ${d}% → сервер отдал ${p.discount}% для ${p.months} мес`);
      }
    },
  });
}
/* строки/мусор в скидке */
for (const d of ["17", "abc", "", null, "0.5"]) {
  await scenario(`скидка периодa тип ${JSON.stringify(d)}`, {
    content: { pricing: { ...basePricing.pricing, periods: [{ months: 1, discount: 0 }, { months: 6, discount: d }] } },
    promotions: [],
  });
}

/* ---------- 2. ПРОМО-СКИДКИ (percent) — размер скидки ---------- */
const active = { startDate: "2026-01-01", endDate: "2027-01-01", usageLimit: null, used: 0, appliesTo: {}, minBots: null, maxBots: null };
const PROMO_VALUES = [-100, -50, -1, 0, 0.5, 10, 30, 50, 75, 90, 99, 100, 100.5, 101, 110, 150, 500, 9999, "abc", "", null];
for (const v of PROMO_VALUES) {
  await scenario(`промо percent ${JSON.stringify(v)}%`, {
    content: basePricing,
    promotions: [{ id: "p1", name: "TestPromo", description: "", banner: "−X%", type: "percent", value: v, ...active }],
  });
}
/* fixed-промо */
for (const v of [0.01, 5, 50, 1000, "abc"]) {
  await scenario(`промо fixed $${JSON.stringify(v)}`, {
    content: basePricing,
    promotions: [{ id: "p2", name: "Fix", description: "", banner: "−$X", type: "fixed", value: v, ...active }],
  });
}
/* bots-gift — цену не меняет */
await scenario("промо bots-gift +5", {
  content: basePricing,
  promotions: [{ id: "p3", name: "Gift", description: "", banner: "+5 ботов", type: "bots-gift", value: 5, ...active }],
  extra: (data, issues, fns, rate, monthsSet) => {
    for (const b of BOTS) for (const m of monthsSet) {
      const r = computeTotal(fns, b, m, rate);
      if (r.total !== r.prePromo) issues.push(`bots-gift не должен менять цену: bots=${b} m=${m} ${r.total} != ${r.prePromo}`);
    }
  },
});
/* несколько промо подряд: percent 150 и 30 */
await scenario("два промо percent 150 и 30", {
  content: basePricing,
  promotions: [
    { id: "a", name: "A150", description: "", banner: "−150%", type: "percent", value: 150, ...active },
    { id: "b", name: "B30", description: "", banner: "−30%", type: "percent", value: 30, ...active },
  ],
});

/* ---------- 3. ЦЕНЫ ЗА БОТА ---------- */
await scenario("botPrices строковые цены", {
  content: { pricing: { ...basePricing.pricing, botPrices: [{ min: 1, max: 10, price: "2" }, { min: 11, max: 20, price: "1.9" }, { min: 21, max: 30, price: "1.5" }] } },
  promotions: [],
});
await scenario("botPrices отрицательная цена -2", {
  content: { pricing: { ...basePricing.pricing, botPrices: [{ min: 1, max: 10, price: -2 }, { min: 11, max: 20, price: 1.8 }, { min: 21, max: 30, price: 1.5 }] } },
  promotions: [],
  extra: (data, issues) => {
    const neg = data.botPrices.some((t) => t.price < 0);
    if (neg) issues.push("сервер пропускает отрицательную цену за бота (админка не валидирует)");
  },
});
await scenario("botPrices цена 0 (бесплатно — осознанно)", {
  content: { pricing: { ...basePricing.pricing, botPrices: [{ min: 1, max: 10, price: 0 }, { min: 11, max: 20, price: 1.8 }, { min: 21, max: 30, price: 1.5 }] } },
  promotions: [],
});
await scenario("botPrices мусорная цена abc", {
  content: { pricing: { ...basePricing.pricing, botPrices: [{ min: 1, max: 10, price: "abc" }, { min: 11, max: 20, price: 1.8 }, { min: 21, max: 30, price: 1.5 }] } },
  promotions: [],
});
await scenario("botPrices перекрытие диапазонов", {
  content: { pricing: { ...basePricing.pricing, botPrices: [{ min: 1, max: 20, price: 2 }, { min: 11, max: 30, price: 1.5 }] } },
  promotions: [],
});

/* ---------- 4. ОФЛАЙН: клиентские дефолты без сервера ---------- */
{
  const fns = factory(PRICING_DEFAULTS);
  const issues = [];
  for (const b of BOTS) for (const m of [1, 2, 3, 6, 12, 24]) issues.push(...inspectResult(computeTotal(fns, b, m, 85), { noPromo: true }));
  bad("офлайн-дефолты main.js (без /api/pricing)", [...new Set(issues)]);
}

/* ---------- ИТОГ ---------- */
child.kill();
fs.rmSync(DATA, { recursive: true, force: true });
console.log("\n=== НАЙДЕННЫЕ ПРОБЛЕМЫ ===");
if (!discovered.size) console.log("  (нет)");
for (const [kind, info] of discovered) {
  console.log(`  [${kind}] ×${info.count}  пример: ${info.sample}`);
}
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
