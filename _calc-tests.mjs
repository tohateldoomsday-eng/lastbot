/* ============================================================
   Испытание калькулятора: меняем каждый параметр по одному,
   прогоняем расчёт (точная копия логики main.js) по всем
   комбинациям боты×сроки и ловим ошибки.
   ============================================================ */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DATA = "./data-calc-tests";
fs.rmSync(DATA, { recursive: true, force: true });
const PORT = 3217;

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

/* ---------- Точная копия логики калькулятора из main.js ---------- */
const PRICING_DEFAULTS = {
  botPrices: [
    { min: 1, max: 10, price: 2.0 },
    { min: 11, max: 20, price: 1.8 },
    { min: 21, max: 30, price: 1.5 },
  ],
  periods: [
    { months: 1, coef: 1.0, discount: 0 },
    { months: 3, coef: 2.5, discount: 17 },
    { months: 6, coef: 5.0, discount: 17 },
    { months: 12, coef: 9.0, discount: 25 },
  ],
  rate: 85,
  promotions: [],
  referral: { cashbackPercent: 10, commissionPercent: 10 },
};

function makeCalc(data) {
  const pricingData = { ...PRICING_DEFAULTS, ...data };
  function fmtUsd(n) { return "$" + n.toFixed(2); }
  function pricePerBotFor(n) {
    let price = 2.0;
    for (const tier of pricingData.botPrices || []) {
      if (n >= (parseFloat(tier.min) || 0) && n <= (parseFloat(tier.max) || Infinity)) { price = parseFloat(tier.price); break; }
    }
    return isFinite(price) ? price : 2.0;
  }
  function periodFor(months) {
    const list = pricingData.periods || [];
    const found = list.find((p) => Number(p.months) === months);
    if (found) {
      const coef = parseFloat(found.coef);
      return { months: Number(found.months), coef: isFinite(coef) ? coef : months, discount: parseFloat(found.discount) || 0 };
    }
    return { months, coef: months, discount: 0 };
  }
  function promoFor(months, bots) {
    const now = Date.now();
    return (pricingData.promotions || []).filter((pr) => {
      if (!pr || (pr.usageLimit != null && (pr.used || 0) >= pr.usageLimit)) return false;
      const applies = pr.appliesTo || {};
      if (Array.isArray(applies.periods) && applies.periods.length && !applies.periods.map(Number).includes(Number(months))) return false;
      if (pr.minBots != null && bots < pr.minBots) return false;
      if (pr.maxBots != null && bots > pr.maxBots) return false;
      const start = pr.startDate ? new Date(pr.startDate).getTime() : 0;
      let end = Infinity;
      if (pr.endDate) {
        const s = String(pr.endDate);
        const t = s.includes("T") ? Date.parse(s) : Date.parse(s + "T23:59:59");
        if (!isNaN(t)) end = t;
      }
      return now >= start && now <= end;
    });
  }
  function renderPrice(bots, months) {
    const perBot = pricePerBotFor(bots);
    const period = periodFor(months);
    const prePromo = perBot * bots * period.coef;
    const base = 2.0 * bots * months;
    let total = prePromo;
    let oldPrice = null;
    let promoOff = 0;
    const promo = promoFor(months, bots)[0];
    if (promo) {
      if (promo.type === "percent") {
        const v = parseFloat(promo.value) || 0;
        if (v > 0) { oldPrice = prePromo; total = prePromo * (1 - v / 100); promoOff = prePromo - total; }
      } else if (promo.type === "fixed") {
        const v = parseFloat(promo.value) || 0;
        if (v > 0) { oldPrice = prePromo; total = Math.max(0, prePromo - v); promoOff = prePromo - total; }
      }
    }
    let out, rub, threw = null;
    try { out = fmtUsd(total); } catch (e) { threw = e.message; out = "THROW: " + e.message; }
    try { rub = fmtRub(total, pricingData.rate); } catch (e) { threw = (threw || "") + " | rub: " + e.message; }
    return { perBot, coef: period.coef, prePromo, base, total, oldPrice, promoOff, save: Math.max(0, base - prePromo), promo: promo && promo.name, out, rub, threw };
  }
  return { pricingData, renderPrice, promoFor, periodFor, pricePerBotFor };
}
function fmtRub(total, rate) { return "≈ " + Math.round((total * rate) / 100) * 100 + " ₽"; }

const BOTS = [1, 5, 10, 11, 15, 20, 21, 25, 30];
const MONTHS = [1, 2, 3, 6, 12]; // 2 — проверка срока вне данных

let pass = 0, fail = 0, warn = 0;
function report(name, kind, detail) {
  if (kind === "pass") { pass++; console.log("PASS", name); }
  else if (kind === "warn") { warn++; console.log("WARN", name, detail || ""); }
  else { fail++; console.log("FAIL", name, detail || ""); }
}

async function runScenario(name, { content, promotions, expect, warnIf }) {
  if (content !== undefined) {
    /* schemaVersion обязателен: иначе миграция перезапишет pricing дефолтами */
    if (!content.schemaVersion) content = { schemaVersion: 2, ...content };
    fs.writeFileSync(path.join(DATA, "content.json"), JSON.stringify(content));
  }
  if (promotions !== undefined) {
    fs.writeFileSync(path.join(DATA, "promotions.json"), JSON.stringify(promotions));
  }
  const res = await fetch(`http://127.0.0.1:${PORT}/api/pricing`);
  const data = await res.json();
  const calc = makeCalc(data);
  let issues = [];
  for (const bots of BOTS) for (const months of MONTHS) {
    const r = calc.renderPrice(bots, months);
    if (r.threw || !isFinite(r.total)) issues.push(`bots=${bots} m=${months}: ${r.threw || "total=" + r.total}`);
    else if (expect) {
      const e = expect(bots, months, r);
      if (e) issues.push(`bots=${bots} m=${months}: ${e}`);
    }
  }
  if (issues.length) report(name, "fail", issues.slice(0, 4).join(" | "));
  else {
    const w = warnIf ? warnIf(calc) : null;
    report(name, w ? "warn" : "pass", w || "");
  }
}

/* ---------- Базовые данные ---------- */
const baseContent = {
  pricing: {
    heading: "t", sub: "t", note: "t",
    botPrices: [
      { min: 1, max: 10, price: 2 },
      { min: 11, max: 20, price: 1.8 },
      { min: 21, max: 30, price: 1.5 },
    ],
    periods: [
      { months: 1, coef: 1, discount: 0 },
      { months: 3, coef: 2.5, discount: 17 },
      { months: 6, coef: 5, discount: 17 },
      { months: 12, coef: 9, discount: 25 },
    ],
  },
};
const basePromos = [
  { id: "p1", name: "P1", description: "", banner: "−30%", type: "percent", value: 30, appliesTo: { periods: [1] }, minBots: null, maxBots: null, startDate: "2026-01-01", endDate: "2027-01-01", usageLimit: null, used: 0 },
];

/* 0. базовая конфигурация — эталонные значения */
await runScenario("0. база: точные значения", {
  content: baseContent, promotions: basePromos,
  expect: (bots, months, r) => {
    const expPerBot = bots <= 10 ? 2 : bots <= 20 ? 1.8 : 1.5;
    const expCoef = { 1: 1, 2: 2, 3: 2.5, 6: 5, 12: 9 }[months]; // 2 — вне данных → линейный fallback
    const pre = expPerBot * bots * expCoef;
    const promo = months === 1; // p1: −30% на 1 месяц
    const expTotal = promo ? pre * 0.7 : pre;
    const expSave = 2.0 * bots * months - pre; // экономия без акции
    if (Math.abs(r.total - expTotal) > 1e-9) return `ожидалось ${expTotal}, получено ${r.total}`;
    if (Math.abs(r.perBot - expPerBot) > 1e-9) return `perBot ожидался ${expPerBot}, получен ${r.perBot}`;
    if (Math.abs(r.save - expSave) > 1e-9) return `экономия ожидалась ${expSave}, получена ${r.save}`;
    return null;
  },
});

/* E. Экономия (без акции) должна монотонно расти со сроком для любого числа ботов */
{
  fs.writeFileSync(path.join(DATA, "content.json"), JSON.stringify({ schemaVersion: 2, ...baseContent }));
  fs.writeFileSync(path.join(DATA, "promotions.json"), JSON.stringify(basePromos));
  const data = await (await fetch(`http://127.0.0.1:${PORT}/api/pricing`)).json();
  const calc = makeCalc(data);
  let bad = null;
  for (const bots of BOTS) {
    let prev = -1;
    for (const months of MONTHS) {
      const r = calc.renderPrice(bots, months);
      if (r.save < prev - 1e-9) { bad = `bots=${bots}: экономия упала ${prev.toFixed(2)} → ${r.save.toFixed(2)} (срок ${months} мес)`; break; }
      prev = r.save;
    }
    if (bad) break;
  }
  report("E1. экономия монотонно растёт со сроком", bad ? "fail" : "pass", bad || "");
}

/* A. botPrices */
await runScenario("A1. price строкой «1.9»", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, price: "1.9" } : t) } }, promotions: basePromos });
await runScenario("A2. price tier2 = 0", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, price: 0 } : t) } }, promotions: basePromos,
  expect: (bots, months, r) => bots >= 11 && bots <= 20 && Math.abs(r.total) > 1e-9 ? "цена 0 должна давать total 0" : null });
await runScenario("A3. price tier3 пустая строка", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 2 ? { ...t, price: "" } : t) } }, promotions: basePromos,
  warnIf: () => "пустая цена → fallback 2.0 (тихий)" });
await runScenario("A4. min/max строками", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, min: "11", max: "20" } : t) } }, promotions: basePromos });
await runScenario("A5. перекрытие: tier2.min=5", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, min: 5 } : t) } }, promotions: basePromos,
  warnIf: () => "диапазоны перекрываются: bots 5-10 берут цену tier1 (первый победил)" });
await runScenario("A6. разрыв: tier2.min=12 (бот 11 без диапазона)", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 1 ? { ...t, min: 12 } : t) } }, promotions: basePromos,
  warnIf: (c) => "бот 11 вне диапазонов → fallback 2.0: " + c.pricePerBotFor(11) });
await runScenario("A7. только 2 диапазона (1-10, 11-30)", { content: { pricing: { ...baseContent.pricing, botPrices: [{ min: 1, max: 10, price: 2 }, { min: 11, max: 30, price: 1.8 }] } }, promotions: basePromos });
await runScenario("A8. botPrices = объект (не массив)", { content: { pricing: { ...baseContent.pricing, botPrices: { min: 1, max: 10, price: 2 } } }, promotions: basePromos,
  expect: (bots, months, r) => { const exp = bots <= 10 ? 2 : bots <= 20 ? 1.8 : 1.5; return Math.abs(r.perBot - exp) > 1e-9 ? "сервер должен подставить DEFAULTS, perBot=" + r.perBot + " ожид. " + exp : null; } });
await runScenario("A9. botPrices отсутствует", { content: { pricing: { heading: "t", sub: "t", note: "t", periods: baseContent.pricing.periods } }, promotions: basePromos,
  expect: (bots, months, r) => { const exp = bots <= 10 ? 2 : bots <= 20 ? 1.8 : 1.5; return Math.abs(r.perBot - exp) > 1e-9 ? "сервер должен вернуть DEFAULTS, perBot=" + r.perBot + " ожид. " + exp : null; } });
await runScenario("A10. диапазон без price", { content: { pricing: { ...baseContent.pricing, botPrices: baseContent.pricing.botPrices.map((t, i) => i === 2 ? { min: 21, max: 30 } : t) } }, promotions: basePromos,
  warnIf: (c) => "нет price → fallback 2.0 для 21-30: " + c.pricePerBotFor(25) });
await runScenario("A11. все диапазоны выше 30", { content: { pricing: { ...baseContent.pricing, botPrices: [{ min: 31, max: 40, price: 1 }] } }, promotions: basePromos,
  warnIf: (c) => "все боты вне диапазонов → цена 2.0 для всех: " + c.pricePerBotFor(10) });

/* B. periods */
const perB = (patch, i) => baseContent.pricing.periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
await runScenario("B1. months строкой «3»", { content: { pricing: { ...baseContent.pricing, periods: perB({ months: "3" }, 1) } }, promotions: basePromos });
await runScenario("B2. coef строкой «2.5»", { content: { pricing: { ...baseContent.pricing, periods: perB({ coef: "2.5" }, 1) } }, promotions: basePromos });
await runScenario("B3. coef = 0", { content: { pricing: { ...baseContent.pricing, periods: perB({ coef: 0 }, 1) } }, promotions: basePromos,
  expect: (bots, months, r) => months === 3 && Math.abs(r.total) > 1e-9 ? "coef 0 должен давать total 0" : null });
await runScenario("B4. coef = «abc»", { content: { pricing: { ...baseContent.pricing, periods: perB({ coef: "abc" }, 1) } }, promotions: basePromos,
  warnIf: () => "нечисловой coef → fallback coef=месяцы" });
await runScenario("B5. discount строкой «10»", { content: { pricing: { ...baseContent.pricing, periods: perB({ discount: "10" }, 1) } }, promotions: basePromos,
  warnIf: () => "discount только бейдж, на цену не влияет" });
await runScenario("B6. discount = 0", { content: { pricing: { ...baseContent.pricing, periods: perB({ discount: 0 }, 1) } }, promotions: basePromos,
  warnIf: () => "бейдж скрыт (discount 0)" });
await runScenario("B7. months=2 вместо 3 (кнопки строятся из данных)", { content: { pricing: { ...baseContent.pricing, periods: perB({ months: 2 }, 1) } }, promotions: basePromos,
  expect: (bots, months, r) => {
    const c = r.coef;
    const exp = months === 2 ? 2.5 : [1, 2.5, 5, 9][[1, 3, 6, 12].indexOf(months)];
    if (months === 2 && Math.abs(c - 2.5) > 1e-9) return "период months=2 должен иметь coef 2.5, получено " + c;
    return null;
  } });
await runScenario("B8. periods = []", { content: { pricing: { ...baseContent.pricing, periods: [] } }, promotions: basePromos,
  expect: (bots, months, r) => { const exp = { 1: 1, 2: 2, 3: 2.5, 6: 5, 12: 9 }[months]; return Math.abs(r.coef - exp) > 1e-9 ? "сервер должен вернуть DEFAULTS при пустом массиве, coef=" + r.coef + " ожид. " + exp : null; } });
await runScenario("B9. periods отсутствует", { content: { pricing: { heading: "t", sub: "t", note: "t", botPrices: baseContent.pricing.botPrices } }, promotions: basePromos,
  expect: (bots, months, r) => { const exp = { 1: 1, 2: 2, 3: 2.5, 6: 5, 12: 9 }[months]; return Math.abs(r.coef - exp) > 1e-9 ? "сервер должен вернуть DEFAULTS, coef=" + r.coef + " ожид. " + exp : null; } });

/* C. promotions */
const promoBase = () => JSON.parse(JSON.stringify(basePromos));
await runScenario("C1. promo.value строкой «30»", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, value: "30" })) });
await runScenario("C2. promo.value = 100 (percent)", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, value: 100 })),
  expect: (bots, months, r) => months === 1 && Math.abs(r.total) > 1e-9 ? "скидка 100% должна давать 0" : null });
await runScenario("C3. fixed promo больше суммы", { content: baseContent, promotions: [{ ...promoBase()[0], type: "fixed", value: 1000, appliesTo: {} }],
  expect: (bots, months, r) => Math.abs(r.total) > 1e-9 ? "fixed выше суммы → total должен быть 0" : null });
await runScenario("C4. appliesTo.periods строками [«3»]", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, appliesTo: { periods: ["3"] } })),
  expect: (bots, months, r) => { if (months === 3 && r.promo) return null; if (months === 3 && !r.promo) return "промо с periods=[\"3\"] не сработало на месяцах=3 (число vs строка)"; return null; } });
await runScenario("C5. endDate в прошлом", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, endDate: "2020-01-01" })),
  expect: (bots, months, r) => r.promo ? "просроченное промо не должно применяться" : null });
await runScenario("C6. startDate в будущем", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, startDate: "2030-01-01" })),
  expect: (bots, months, r) => r.promo ? "будущее промо не должно применяться" : null });
await runScenario("C7. usageLimit исчерпан", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, usageLimit: 5, used: 5 })),
  expect: (bots, months, r) => r.promo ? "исчерпанное промо не должно применяться" : null });
await runScenario("C8. minBots строкой «20»", { content: baseContent, promotions: promoBase().map((p) => ({ ...p, appliesTo: {}, minBots: "20" })),
  expect: (bots, months, r) => { if (bots >= 20 && !r.promo) return "промо с minBots=20 должно работать при 20+ ботах"; if (bots < 20 && r.promo) return "промо с minBots=20 не должно работать при <20 ботах"; return null; } });
await runScenario("C9. null в списке промо", { content: baseContent, promotions: [null, ...promoBase()] });
await runScenario("C10. промо с типом «percent» без value", { content: baseContent, promotions: promoBase().map((p) => { delete p.value; return p; }),
  expect: (bots, months, r) => r.oldPrice != null ? "без value не должно быть зачёркнутой цены" : null });

/* D. rate */
await runScenario("D1. rate=85 (курс в норме)", { content: baseContent, promotions: basePromos,
  expect: (bots, months, r) => { const expRub = Math.round((r.total * 85) / 100) * 100; return r.rub === "≈ " + expRub + " ₽" ? null : "руб неверно: " + r.rub + " ожид. " + expRub; } });

child.kill();
fs.rmSync(DATA, { recursive: true, force: true });

/* D2/D3. RUB_RATE из env: нечисло и ноль */
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
  const calc2 = makeCalc(d2);
  let bad = null;
  if (!isFinite(d2.rate) || d2.rate <= 0 || d2.rate !== 85) bad = "rate должен упасть в 85, получено " + d2.rate;
  if (!bad) {
    for (const bots of BOTS) for (const months of MONTHS) {
      const r = calc2.renderPrice(bots, months);
      if (r.threw || !isFinite(r.total) || r.rub.includes("NaN") || !r.rub.endsWith("₽")) { bad = "bots=" + bots + " m=" + months + " " + r.rub; break; }
    }
  }
  report(label, bad ? "fail" : "pass", bad ? bad : "rate в API: " + d2.rate);
  c2.kill();
  fs.rmSync(dir2, { recursive: true, force: true });
}

console.log(`RESULT pass=${pass} fail=${fail} warn=${warn}`);
process.exit(fail ? 1 : 0);
