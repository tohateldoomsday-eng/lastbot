import { spawn } from "node:child_process";
import fs from "node:fs";

const DATA = "./data-smoke";
fs.rmSync(DATA, { recursive: true, force: true });

const child = spawn(process.execPath, ["server/admin-server.mjs"], {
  env: {
    ...process.env,
    DATA_DIR: DATA,
    ADMIN_PASS: "testpass123",
    ADMIN_USER: "ta-admin",
    CLIENT_JWT_SECRET: "smoketestsecret",
    PORT: "3210",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));

const base = "http://127.0.0.1:3210";
async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(base + "/api/status");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start\n" + serverLog);
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
}

await waitUp();

const J = { "Content-Type": "application/json" };
const post = (path, body, headers = J) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
const get = (path, headers) => fetch(base + path, { headers });

// 1. pricing
const pricing = await (await get("/api/pricing")).json();
check("pricing ok", pricing.ok === true && Array.isArray(pricing.botPrices));

// 2. register A (no codes)
let res = await post("/api/register", { email: "a@test.com", password: "password1", allianceName: "Alliance A" });
let a = await res.json();
check("register A", res.status === 200 && a.ok && a.allianceCode && a.referralCode, a);

// 3. register B with referral code of A
res = await post("/api/register", { email: "b@test.com", password: "password1", allianceName: "Alliance B", referralCode: a.referralCode });
let b = await res.json();
check("register B w/ ref", res.status === 200 && b.ok && b.allianceCode !== a.allianceCode, b);

// 4. admin login
let cookie = "";
{
  const r = await post("/api/login", { u: "ta-admin", p: "testpass123" });
  cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(";")[0]).join("; ");
  check("admin login", r.status === 200 && (await r.json()).ok === true && cookie.includes("lb_auth="));
}
const AH = { "Content-Type": "application/json", Cookie: cookie };

// 5. purchase #1 for B, no code -> auto-referral to A
res = await post("/api/purchase", { allianceCode: b.allianceCode, allianceName: "Alliance B", botsCount: 10, periodMonths: 1, totalPriceUsd: 20 }, AH);
let p1 = await res.json();
check("purchase#1 auto-referral", res.status === 200 && p1.ok && p1.referralAward && p1.referralAward.referrerCode === a.referralCode, p1);

// 6. purchase #2 for B -> no double credit
res = await post("/api/purchase", { allianceCode: b.allianceCode, allianceName: "Alliance B", botsCount: 5, periodMonths: 1, totalPriceUsd: 10 }, AH);
let p2 = await res.json();
check("purchase#2 no referralAward", res.status === 200 && p2.ok && p2.referralAward === null, p2);

// 7. balances: A credited on A.allianceCode; B cashback = 1 (10 bots) + 1 (5 bots, round half up) = 2
let balances = await (await get("/api/balances", AH)).json();
const balA = balances.balances[a.allianceCode];
const balB = balances.balances[b.allianceCode];
check("A bonusMonths=10 on allianceCode", balA && balA.bonusMonths === 10, balA);
check("A cashbackCents=200", balA && balA.cashbackCents === 200, balA);
check("A referrals length=1", balA && Array.isArray(balA.referrals) && balA.referrals.length === 1, balA);
check("B cashback bonusMonths=2", balB && balB.bonusMonths === 2, balB);
check("no phantom balance under A.refCode", !(a.referralCode in balances.balances), Object.keys(balances.balances));

// 8. register C claiming A's code -> 409
res = await post("/api/register", { email: "c@test.com", password: "password1", allianceName: "Thief", allianceCode: a.allianceCode });
let c = await res.json();
check("claim taken balance rejected 409", res.status === 409 && c.error === "errAllianceTaken", c);

// 9. register C2 with same name as A -> must NOT link, new code
res = await post("/api/register", { email: "c2@test.com", password: "password1", allianceName: "Alliance A" });
let c2 = await res.json();
check("same-name gets NEW code", res.status === 200 && c2.ok && c2.allianceCode !== a.allianceCode, c2);

// 10. dashboard by A's code (allianceCode — не реферальный код)
let dash = await (await get("/api/dashboard?code=" + a.allianceCode)).json();
check("dashboard by allianceCode shows balance", dash.ok === true && dash.balance.bonusMonths === 10, dash);
let dash2 = await (await get("/api/dashboard?code=" + a.referralCode)).json();
check("dashboard by referralCode also works", dash2.ok === true && dash2.balance.bonusMonths === 10, dash2);

// 11. profile of B shows own balance (client login)
{
  const r = await post("/api/login", { email: "b@test.com", password: "password1" });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((x) => x.split(";")[0]).join("; ");
  const prof = await (await get("/api/profile", { Cookie: ck })).json();
  check("B profile balance=2", prof.ok === true && prof.balance.bonusMonths === 2, prof);
}

// 12. admin /api/referral/apply credits A at allianceCode
res = await post("/api/referral/apply", { referralCode: a.referralCode, buyerAlliance: "Alliance X", botsCount: 4, periodMonths: 1, totalPrice: 10 }, AH);
let rapply = await res.json();
check("referral/apply ok", res.status === 200 && rapply.ok === true, rapply);
balances = await (await get("/api/balances", AH)).json();
check("A bonusMonths=14 after apply", balances.balances[a.allianceCode].bonusMonths === 14, balances.balances[a.allianceCode]);

// 13. trial flow: referralCode in record + decide approve/reject
res = await post("/api/trial", { allianceName: "Trial Alliance", leaderName: "TL", contactTelegram: "@tl" });
let trial = await res.json();
check("trial created with referralCode", res.status === 200 && trial.ok && !!trial.referralCode, trial);
let trials = await (await get("/api/trials", AH)).json();
const tEntry = (trials.items || []).find((t) => t.allianceName === "Trial Alliance");
check("trial record stores referralCode", !!tEntry && !!tEntry.referralCode, tEntry);
res = await post("/api/trials/decide", { id: tEntry.id, decision: "approve" }, AH);
check("trial approve ok", res.status === 200 && (await res.json()).ok === true);
res = await post("/api/trials/decide", { id: tEntry.id, decision: "reject" }, AH);
check("trial decide twice → 404", res.status === 404);
trials = await (await get("/api/trials", AH)).json();
check("trial status=approved", ((trials.items || []).find((t) => t.id === tEntry.id) || {}).status === "approved");

// 14. bots-gift: покупка 25 ботов активирует акцию +5 ботов, used=1
res = await post("/api/purchase", { allianceCode: b.allianceCode, allianceName: "Alliance B", botsCount: 25, periodMonths: 3, totalPriceUsd: 90 }, AH);
let p3 = await res.json();
check("purchase#3 giftBots=5", res.status === 200 && p3.ok && p3.giftBots === 5, p3);
check("purchase#3 cashback=8 (25×3×10%)", p3.cashbackMonths === 8, p3);
const promos = await (await get("/api/promotions?all=1", AH)).json();
const giftPromo = (promos.promotions || []).find((pr) => pr.id === "referral-gift");
check("gift promo used incremented to 1", !!giftPromo && giftPromo.used === 1, giftPromo);

// 15. защита от частичного списания: баланс 0, заявка на 10×3 с бонусами → approve 400
res = await post("/api/register", { email: "c3@test.com", password: "password1", allianceName: "Poor Alliance" });
let c3 = await res.json();
check("register c3", res.status === 200 && c3.ok, c3);
{
  const r3 = await post("/api/login", { email: "c3@test.com", password: "password1" });
  const ck3 = (r3.headers.getSetCookie ? r3.headers.getSetCookie() : []).map((x) => x.split(";")[0]).join("; ");
  res = await post("/api/apply-bonus", { botsCount: 10, months: 3, useBonusMonths: true }, { "Content-Type": "application/json", Cookie: ck3 });
  let ab = await res.json();
  const reqs = await (await get("/api/bonus-requests", AH)).json();
  const rq = (reqs.items || []).find((x) => x.id === ab.id);
  res = await post("/api/bonus-requests/decide", { id: rq.id, decision: "approve" }, AH);
  let dec = await res.json();
  check("bonus approve with insufficient balance → 400", res.status === 400 && dec.ok === false, dec);
}

// 16. мёртвый эндпоинт удалён
res = await get("/api/promocodes/active");
check("promocodes/active removed → 404", res.status === 404);

// 17. rate-limit дашборда (уже было несколько запросов; 60 на 10 минут)
let got429 = false;
for (let i = 0; i < 70; i++) {
  const r = await get("/api/dashboard?code=ABCDEF" + i);
  if (r.status === 429) { got429 = true; break; }
}
check("dashboard rate limit kicks in", got429);

child.kill();
fs.rmSync(DATA, { recursive: true, force: true });
console.log("RESULT pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
