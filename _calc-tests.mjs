/* ============================================================
   ТЕСТЫ КАЛЬКУЛЯТОРА (маржинальная модель пакетов 10/20/30).
   Использует НАСТОЯЩИЕ функции из public/assets/js/main.js
   (извлекаются из файла) + серверную нормализацию /api/pricing.

   Запуск:  node _calc-tests.mjs
   ============================================================ */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const DATA = "./data-calc";
fs.rmSync(DATA, { recursive: true, force: true });
const PORT = 3221;

const child = spawn(process.execPath, ["server/admin-server.mjs"], {
  env: { ...process.env, DATA_DIR: DATA, ADMIN_PASS: "test", PORT: String(PORT) },
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
const DEFAULTS_SRC = extractBlock(mainSrc, "const PRICING_DEFAULTS = ");
const DEFAULTS = new Function("RUB_RATE", DEFAULTS_SRC + "\nreturn PRICING_DEFAULTS;")(85);
const fnsSrc = ["fmtUsd", "fmtRub", "priceMonthlyFor", "periodFor", "promoFor"]
  .map((n) => extractBlock(mainSrc, "function " + n + "(")).join("\n");
const factory = new Function("pricingData", fnsSrc + "\nreturn { fmtUsd, fmtRub, priceMonthlyFor, periodFor, promoFor };");

/* Арифметика renderPrice (без DOM): monthly → coef(срок) → акция */
function compute(fns, bots, months) {
  const monthly = fns.priceMonthlyFor(bots);
  const period = fns.periodFor(months);
  const prePromo = monthly * period.coef;
  const base = monthly * months;
  let total = prePromo, oldPrice = null, promoOff = 0;
  const promo = fns.promoFor(months, bots)[0];
  if (promo) {
    if (promo.type === "percent") {
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
  try { rub = fns.fmtRub(Math.round((total * 85) / 100) * 100); } catch (e) { fmtErr = (fmtErr ? fmtErr + " | " : "") + "fmtRub: " + e.message; }
  return { bots, months, monthly, perBot: bots > 0 ? monthly / bots : 0, coef: period.coef, discount: period.discount, prePromo, base, total, oldPrice, promoOff, save, usd, rub, fmtErr, promo: promo && (promo.name || promo.id || promo.type) };
}

const BOTS = [1, 2, 5, 10, 11, 15, 16, 20, 21, 25, 30];
const MONTHS = [1, 2, 3, 6, 12];

let pass = 0, fail = 0, warn = 0;
function report(name, kind, detail) {
  if (kind === "pass") { pass++; console.log("PASS", name); }
  else if (kind === "warn") { warn++; console.log("WARN", name, detail || ""); }
  else { fail++; console.log("FAIL", name, detail || ""); }
}

async function scenario(name, { content, promotions, expect } = {}) {
  if (content !== undefined) {
    if (!content.schemaVersion) content = { schemaVersion: 2, ...content };
    fs.writeFileSync(path.join(DATA, "content.json"), JSON.stringify(content));
  }
  if (promotions !== undefined) fs.writeFileSync(path.join(DATA, "promotions.json"), JSON.stringify(promotions));
  const res = await fetch(`http://127.0.0.1:${PORT}/api/pricing`);
  const data = await res.json();
  const fns = factory({ ...DEFAULTS, ...data });
  const issues = [];
  for (const b of BOTS) for (const m of MONTHS) {
    const r = compute(fns, b, m);
    if (r.fmtErr) issues.push(`bots=${b} m=${m}: ${r.fmtErr}`);
    else if (expect) {
      const e = expect(b, m, r);
      if (e) issues.push(`bots=${b} m=${m}: ${e}`);
    }
    if ((r.usd && /NaN|Infinity/i.test(r.usd + "|" + (r.rub || ""))) || !isFinite(r.total)) issues.push(`bots=${b} m=${m}: ${r.usd} / ${r.rub}`);
    if (r.total < -1e-9) issues.push(`bots=${b} m=${m}: отрицательный итог ${r.total}`);
  }
  report(name, issues.length ? "fail" : "pass", issues.slice(0, 6).join(" | "));
  return data;
}

/* ---------- Базовая конфигурация: пакеты 10 = $20, 20 = $35, 30 = $55 ---------- */
const baseContent = {
  pricing: {
    heading: "t", sub: "t", note: "t",
    botPrices: [
      { min: 1, max: 10, price: 2 },
      { min: 11, max: 20, price: 1.5 },
      { min: 21, max: 30, price: 2 },
    ],
    periods: [
      { months: 1, discount: 0 },
      { months: 3, discount: 10 },
      { months: 6, discount: 15 },
      { months: 12, discount: 25 },
    ],
  },
};
const NO_PROMOS = [];
const ACTIVE = { startDate: "2020-01-01", endDate: "2099-01-01", usageLimit: null, used: 0, appliesTo: {}, minBots: null, maxBots: null };

/* Месячная цена пакета по маржинальным блокам (эталон) */
const M = (b) => (b <= 10 ? 2 * b : b <= 20 ? 20 + 1.5 * (b - 10) : 35 + 2 * (b - 20));

/* ---------- 0. Якоря и точные значения ---------- */
await scenario("0. якоря пакетов: 10=$20, 20=$35, 30=$55 + точность", {
  content: baseContent, promotions: NO_PROMOS,
  expect: (b, m, r) => {
    const coef = { 1: 1, 2: 2, 3: 2.7, 6: 5.1, 12: 9 }[m];
    const expTotal = M(b) * coef;
    const expSave = Math.max(0, M(b) * m - expTotal);
    if (Math.abs(r.monthly - M(b)) > 1e-9) return `месячная цена ${r.monthly} ≠ ${M(b)}`;
    if (Math.abs(r.total - expTotal) > 1e-9) return `итог ${r.total} ≠ ${expTotal}`;
    if (Math.abs(r.save - expSave) > 1e-9) return `экономия ${r.save} ≠ ${expSave}`;
    return null;
  },
});
/* Монотонность: цена пакета не должна падать при росте количества ботов */
{
  const data = await scenario("M. монотонность: больше ботов ≠ дешевле пакет", { content: baseContent, promotions: NO_PROMOS });
  const fns = factory({ ...DEFAULTS, ...data });
  let bad = null, prev = -1;
  for (let b = 1; b <= 30; b++) {
    const m = fns.priceMonthlyFor(b);
    if (m + 1e-9 < prev) { bad = `${b} ботов: цена упала ${prev} → ${m}`; break; }
    prev = m;
  }
  if (!bad) { if (Math.abs(fns.priceMonthlyFor(10) - 20) > 1e-9 || Math.abs(fns.priceMonthlyFor(20) - 35) > 1e-9 || Math.abs(fns.priceMonthlyFor(30) - 55) > 1e-9) bad = "якоря нарушены"; }
  report("M. монотонность", bad ? "fail" : "pass", bad || "");
}

/* ---------- A. Нормализация botPrices (блоки) сервером ---------- */
const withPricing = (patch) => ({ pricing: { ...baseContent.pricing, ...patch } });
await scenario("A1. ставки строкой «1.5» → число", { content: withPricing({ botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, price: "1.5" } : t) }), promotions: NO_PROMOS });
await scenario("A2. ставка блока = 0 → эти боты бесплатны", { content: withPricing({ botPrices: [{ min: 1, max: 10, price: 2 }, { min: 11, max: 20, price: 0 }, { min: 21, max: 30, price: 2 }] }), promotions: NO_PROMOS,
  expect: (b, m, r) => {
    const exp = b <= 10 ? 2 * b : b <= 20 ? 20 : 20 + 2 * (b - 20);
    return Math.abs(r.monthly - exp) > 1e-9 ? `monthly ${r.monthly} ≠ ${exp}` : null;
  } });
await scenario("A3. botPrices = объект → сервер подставляет DEFAULTS (якоря)", { content: withPricing({ botPrices: { min: 1, max: 10, price: 2 } }), promotions: NO_PROMOS,
  expect: (b, m, r) => Math.abs(r.monthly - M(b)) > 1e-9 ? `monthly ${r.monthly} ≠ ${M(b)} (DEFAULTS)` : null });
await scenario("A4. botPrices отсутствует → DEFAULTS", { content: { pricing: { heading: "t", sub: "t", note: "t", periods: baseContent.pricing.periods } }, promotions: NO_PROMOS,
  expect: (b, m, r) => Math.abs(r.monthly - M(b)) > 1e-9 ? `monthly ${r.monthly} ≠ ${M(b)} (DEFAULTS)` : null });
await scenario("A5. отрицательная ставка блока → сервер зажимает в 0", { content: withPricing({ botPrices: [{ min: 1, max: 10, price: -2 }, { min: 11, max: 20, price: 1.5 }, { min: 21, max: 30, price: 2 }] }), promotions: NO_PROMOS,
  expect: (b, m, r) => { if (b <= 10 && Math.abs(r.monthly) > 1e-9) return "отрицательная ставка не должна давать цену"; return null; } });
await scenario("A6. мусорная ставка «abc» → 0 (бесплатный блок)", { content: withPricing({ botPrices: [{ min: 1, max: 10, price: "abc" }, { min: 11, max: 20, price: 1.5 }, { min: 21, max: 30, price: 2 }] }), promotions: NO_PROMOS });
await scenario("A7. блоки с дырой (11–20 нет) → боты в дыре бесплатны (warn)", { content: withPricing({ botPrices: [{ min: 1, max: 10, price: 2 }, { min: 21, max: 30, price: 2 }] }), promotions: NO_PROMOS,
  expect: (b, m, r) => { if (b === 15 && Math.abs(r.monthly - 20) > 1e-9) return "15 ботов должны стоить как 10 (дыра бесплатна): " + r.monthly; return null; } });

/* ---------- B. Периоды: коэффициенты из скидки ---------- */
const perB = (patch, i) => baseContent.pricing.periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
const expCoefB = (m) => ({ 1: 1, 2: 2, 3: 2.7, 6: 5.1, 12: 9 }[m]);
await scenario("B1. months строкой «3»", { content: withPricing({ periods: perB({ months: "3" }, 1) }), promotions: NO_PROMOS });
await scenario("B2. скидка 17% → coef 2.49", { content: withPricing({ periods: perB({ discount: 17 }, 1) }), promotions: NO_PROMOS,
  expect: (b, m, r) => m === 3 && Math.abs(r.coef - 2.49) > 1e-9 ? `coef ${r.coef} ≠ 2.49` : null });
await scenario("B3. скидка 100% → coef 0, итог 0", { content: withPricing({ periods: perB({ discount: 100 }, 1) }), promotions: NO_PROMOS,
  expect: (b, m, r) => m === 3 && Math.abs(r.total) > 1e-9 ? "скидка 100% должна давать 0" : null });
await scenario("B4. скидка 150% → сервер зажимает до 100%", { content: withPricing({ periods: perB({ discount: 150 }, 1) }), promotions: NO_PROMOS,
  expect: (b, m, r) => m === 3 && Math.abs(r.total) > 1e-9 ? "скидка >100% должна зажиматься в 0" : null });
await scenario("B5. periods = [] → DEFAULTS", { content: withPricing({ periods: [] }), promotions: NO_PROMOS,
  expect: (b, m, r) => { const exp = expCoefB(m); return Math.abs(r.coef - exp) > 1e-9 ? `coef ${r.coef} ≠ ${exp}` : null; } });

/* ---------- C. Промо ---------- */
const promoContent = () => ({ ...baseContent, schemaVersion: 2 });
await scenario("C1. percent −30% на 1 мес (пакет 20×3 база $94.50)", { content: promoContent(),
  promotions: [{ id: "p1", name: "P1", description: "", banner: "−30%", type: "percent", value: 30, ...ACTIVE, appliesTo: { periods: [1] } }],
  expect: (b, m, r) => { if (m === 1 && r.promo) { const exp = M(b) * (1 - 0.3); return Math.abs(r.total - exp) > 1e-9 ? `промо: ${r.total} ≠ ${exp}` : null; } return null; } });
await scenario("C2. percent 100% → $0.00", { content: promoContent(),
  promotions: [{ id: "p2", name: "P2", description: "", banner: "−100%", type: "percent", value: 100, ...ACTIVE }],
  expect: (b, m, r) => { if (m === 1 && Math.abs(r.total) > 1e-9) return "100% должно давать 0"; return null; } });
await scenario("C3. percent 150% → зажим в 100% (без отрицательных сумм)", { content: promoContent(),
  promotions: [{ id: "p3", name: "P3", description: "", banner: "−150%", type: "percent", value: 150, ...ACTIVE }],
  expect: (b, m, r) => { if (r.total < -1e-9) return "отрицательная цена!"; return null; } });
await scenario("C4. fixed $1000 больше суммы → $0", { content: promoContent(),
  promotions: [{ id: "p4", name: "P4", description: "", banner: "−$1000", type: "fixed", value: 1000, ...ACTIVE }],
  expect: (b, m, r) => Math.abs(r.total) > 1e-9 ? "fixed больше суммы должен давать 0" : null });
await scenario("C5. bots-gift не меняет цену", { content: promoContent(),
  promotions: [{ id: "p5", name: "P5", description: "", banner: "+5 ботов", type: "bots-gift", value: 5, ...ACTIVE }],
  expect: (b, m, r) => Math.abs(r.total - r.prePromo) > 1e-9 ? "bots-gift не должен менять цену" : null });
await scenario("C6. промо в прошлом не применяется", { content: promoContent(),
  promotions: [{ id: "p6", name: "Old", description: "", banner: "", type: "percent", value: 30, ...ACTIVE, startDate: "2000-01-01", endDate: "2001-01-01" }],
  expect: (b, m, r) => r.promo ? "просроченное промо не должно применяться" : null });

/* ---------- D. Курс ₽ ---------- */
await scenario("D1. rate=85: формат рублей", { content: baseContent, promotions: NO_PROMOS,
  expect: (b, m, r) => {
    if (r.total < 0) return null;
    const expRub = Math.round((r.total * 85) / 100) * 100;
    /* toLocaleString("ru-RU") вставляет неразрывные пробелы — сравниваем без пробелов */
    const norm = (s) => String(s).replace(/[\s\u00A0\u202F]/g, "");
    return norm(r.rub) === norm("≈ " + expRub + " ₽") ? null : "руб: " + r.rub;
  } });

child.kill();
fs.rmSync(DATA, { recursive: true, force: true });

/* ---------- D2/D3. RUB_RATE из env: нечисло и ноль ---------- */
for (const [rateEnv, label] of [["abc", "D2. RUB_RATE=abc"], ["0", "D3. RUB_RATE=0"]]) {
  const dir2 = "./data-rate-" + rateEnv;
  fs.rmSync(dir2, { recursive: true, force: true });
  const c2 = spawn(process.execPath, ["server/admin-server.mjs"], {
    env: { ...process.env, DATA_DIR: dir2, ADMIN_PASS: "test", PORT: "3218", RUB_RATE: rateEnv },
    stdio: ["ignore", "ignore", "ignore"],
  });
  let up2 = false;
  for (let i = 0; i < 40 && !up2; i++) {
    try { const r = await fetch("http://127.0.0.1:3218/api/status"); if (r.ok) up2 = true; } catch {}
    if (!up2) await new Promise((r) => setTimeout(r, 250));
  }
  const d2 = await (await fetch("http://127.0.0.1:3218/api/pricing")).json();
  const fns2 = factory({ ...DEFAULTS, ...d2 });
  let bad = null;
  if (!isFinite(d2.rate) || d2.rate <= 0 || d2.rate !== 85) bad = "rate должен упасть в 85, получено " + d2.rate;
  if (!bad) {
    for (const b of BOTS) for (const m of MONTHS) {
      const r = compute(fns2, b, m);
      if (!isFinite(r.total) || (r.rub && r.rub.includes("NaN")) || (r.rub && !r.rub.endsWith("₽"))) { bad = `bots=${b} m=${m} ${r.rub}`; break; }
    }
  }
  report(label, bad ? "fail" : "pass", bad ? bad : "rate в API: " + d2.rate);
  c2.kill();
  fs.rmSync(dir2, { recursive: true, force: true });
}

console.log(`RESULT pass=${pass} fail=${fail} warn=${warn}`);
process.exit(fail ? 1 : 0);
