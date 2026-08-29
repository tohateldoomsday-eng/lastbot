/* ============================================================
   LASTBOT — личный кабинет альянса (/account)
   Регистрация/вход (JWT-кука lb_client_token), баланс,
   реферальная программа, история покупок, заявка на списание.
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const LANG_KEY = "lb_lang";
  const THEME_KEY = "lb_theme";

  let currentLang = "ru";
  let dict = (window.LB_I18N && window.LB_I18N.ru) || null;

  function detectLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && window.LB_I18N && window.LB_I18N[saved]) return saved;
    } catch { /* приватный режим */ }
    const nav = (navigator.language || "ru").slice(0, 2).toLowerCase();
    return window.LB_I18N && window.LB_I18N[nav] ? nav : "ru";
  }

  function tUI(key) {
    if (dict && dict.ui && dict.ui[key] != null) return dict.ui[key];
    return null;
  }

  /* ---------- Тема ---------- */
  function currentTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* приватный режим */ }
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  function applyTheme(t, save) {
    document.documentElement.classList.toggle("light", t === "light");
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "light" ? "#eef2fa" : "#05070f";
    const btn = $("#themeToggle");
    if (btn) btn.setAttribute("aria-label", t === "light" ? (tUI("themeToDark") || "Тёмная тема") : (tUI("themeToLight") || "Светлая тема"));
    if (save) {
      try { localStorage.setItem(THEME_KEY, t); } catch { /* приватный режим */ }
    }
  }
  applyTheme(currentTheme(), false);
  const themeToggle = $("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light", true);
    });
  }

  /* ---------- Язык ---------- */
  const langBtn = $("#langBtn");
  const langMenu = $("#langMenu");
  const langCurrent = $("#langCurrent");

  function applyLang(lang) {
    currentLang = lang;
    dict = window.LB_I18N[lang];
    document.documentElement.lang = lang;
    if (lang === "ar") document.documentElement.dir = "rtl";
    else document.documentElement.dir = "ltr";
    if (langCurrent) langCurrent.textContent = lang.toUpperCase();
    $$("[data-ui]").forEach((el) => {
      const v = tUI(el.dataset.ui);
      if (v != null) el.textContent = v;
    });
    if (langBtn) langBtn.setAttribute("aria-label", tUI("langLabel") || "Language");
    /* Обновляем динамический интерфейс, если залогинены */
    if (currentProfile) renderDashboard(currentProfile);
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* приватный режим */ }
  }

  if (langBtn && langMenu) {
    langBtn.addEventListener("click", () => {
      const isOpen = !langMenu.hidden;
      langMenu.hidden = isOpen;
      langBtn.setAttribute("aria-expanded", String(!isOpen));
    });
    langMenu.addEventListener("click", (e) => {
      const item = e.target.closest("li[data-lang]");
      if (!item) return;
      langMenu.hidden = true;
      langBtn.setAttribute("aria-expanded", "false");
      applyLang(item.dataset.lang);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#langSwitch")) {
        langMenu.hidden = true;
        langBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- API ---------- */
  async function api(url, options) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: options && options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch { /* пустой ответ */ }
    return { status: res.status, data };
  }

  /* ---------- Появление блоков (reveal, как на главной) ---------- */
  (function initReveal() {
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window) || reducedMotion) {
      els.forEach((el) => el.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach((el) => io.observe(el));
  })();

  /* ---------- Копирование в буфер ---------- */
  function copyText(text, btn, doneLabel) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = doneLabel || (tUI("copyDone") || "Скопировано ✓");
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = old;
        btn.classList.remove("copied");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch { /* буфер недоступен */ }
  }

  /* ---------- Представления ---------- */
  const authView = $("#authView");
  const accountView = $("#accountView");
  const loginCard = $("#loginCard");
  const registerCard = $("#registerCard");
  let currentProfile = null;

  function showAuth() {
    currentProfile = null;
    authView.hidden = false;
    accountView.hidden = true;
    if (loginCard) loginCard.hidden = false;
    if (registerCard) registerCard.hidden = true;
  }
  function showDashboard() {
    authView.hidden = true;
    accountView.hidden = false;
  }

  /* ---------- Дашборд ---------- */
  function fmtCash(cents) {
    return "$" + ((cents || 0) / 100).toFixed(2);
  }

  function renderDashboard(profile) {
    currentProfile = profile;
    showDashboard();

    $("#accGreeting").textContent = (profile.allianceName || "—") + " · " + profile.email;
    $("#accBonusMonths").textContent = profile.balance.bonusMonths || 0;
    $("#accCashback").textContent = fmtCash(profile.balance.cashbackCents);

    /* Реферальный блок */
    const codeBtn = $("#accReferralCode");
    codeBtn.textContent = profile.referralCode || "—";
    codeBtn.addEventListener("click", () => copyText(profile.referralCode, codeBtn));

    const invite = "https://lastbot.gg/?ref=" + (profile.referralCode || "");
    $("#accInviteLink").textContent = invite;
    const copyInviteBtn = $("#copyInviteBtn");
    copyInviteBtn.addEventListener("click", () => copyText(invite, copyInviteBtn, tUI("copyDone") || "Скопировано ✓"));

    const referrals = profile.balance.referrals || [];
    $("#accReferredCount").textContent = referrals.length;
    const earnedMonths = referrals.reduce((sum, r) => sum + (r.bonusMonths || 0), 0);
    const earnedCash = referrals.reduce((sum, r) => sum + (r.cashbackCents || 0), 0);
    $("#accEarnedMonths").textContent = earnedMonths;
    $("#accEarnedCashback").textContent = fmtCash(earnedCash);

    renderTable("accReferralsBody", "accReferralsEmpty", referrals.map((r) => [
      r.buyerAlliance || "—", r.date || "—", r.bots || 0, "+" + (r.bonusMonths || 0), fmtCash(r.cashbackCents),
    ]));

    /* История покупок */
    const purchases = profile.balance.purchases || [];
    renderTable("accPurchasesBody", "accPurchasesEmpty", purchases.map((p) => [
      p.date || "—", p.bots || 0,
      (p.months || 0) + " мес",
      p.priceUsd > 0 ? "$" + p.priceUsd : (p.bonusSpent ? "бонусы −" + p.bonusSpent + " мес" : "—"),
      "+" + (p.cashbackMonths || 0),
    ]));

    /* Подсказка в форме заявки */
    updateApplyHint();
  }

  function updateApplyHint() {
    const el = $("#applyBonusHint");
    if (!el || !currentProfile) return;
    const n = currentProfile.balance.bonusMonths || 0;
    const tpl = tUI("balanceAvailable") || "Доступно бонусов: {n} мес.";
    el.textContent = tpl.replace("{n}", n);
  }

  function renderTable(bodyId, emptyId, rows) {
    const body = document.getElementById(bodyId);
    const empty = document.getElementById(emptyId);
    if (!body) return;
    body.textContent = "";
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((cells) => {
      const tr = document.createElement("tr");
      cells.forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v == null ? "" : String(v);
        tr.append(td);
      });
      body.append(tr);
    });
  }

  /* ---------- Вход ---------- */
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    if (!email || !password) {
      loginError.textContent = tUI("errLogin") || "Неверный email или пароль";
      loginError.hidden = false;
      return;
    }
    const res = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (res.status === 200 && res.data && res.data.ok) {
      renderDashboard({ email: email, allianceName: res.data.allianceName, allianceCode: res.data.allianceCode, referralCode: res.data.referralCode, balance: res.data.balance });
    } else {
      loginError.textContent = localError(res.data);
      loginError.hidden = false;
    }
  });

  /* ---------- Регистрация ---------- */
  const registerForm = $("#registerForm");
  const registerError = $("#registerError");
  const registerSuccess = $("#registerSuccess");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerError.hidden = true;
    registerSuccess.hidden = true;
    const email = $("#regEmail").value.trim();
    const password = $("#regPassword").value;
    const allianceName = $("#regAlliance").value.trim();
    const referralCode = $("#regReferral").value.trim();
    const allianceCode = ($("#regAllianceCode") && $("#regAllianceCode").value.trim()) || "";

    if (!email || password.length < 8 || allianceName.length < 2) {
      registerError.textContent = !email ? (tUI("errInvalidEmail") || "Введите корректный email") : (password.length < 8 ? (tUI("errWeakPassword") || "Пароль должен быть не короче 8 символов") : (tUI("errAllianceName") || "Укажите название альянса"));
      registerError.hidden = false;
      return;
    }

    const res = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ email, password, allianceName, referralCode: referralCode || null, allianceCode: allianceCode || null }),
    });
    if (res.status === 200 && res.data && res.data.ok) {
      /* Автовход после регистрации */
      const loginRes = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (loginRes.status === 200 && loginRes.data && loginRes.data.ok) {
        renderDashboard({ email, allianceName: loginRes.data.allianceName, allianceCode: loginRes.data.allianceCode, referralCode: loginRes.data.referralCode, balance: loginRes.data.balance });
      } else {
        registerSuccess.textContent = tUI("registerCreated") || "Аккаунт создан — войдите с email и паролем.";
        registerSuccess.hidden = false;
      }
    } else {
      registerError.textContent = localError(res.data);
      registerError.hidden = false;
    }
  });

  /* ---------- Локализация ошибок сервера ---------- */
  function localError(data) {
    const code = data && data.error;
    if (code && tUI(code)) return tUI(code);
    if (code && code.startsWith("err")) return tUI("errServer") || "Ошибка сервера, попробуйте позже";
    return (data && data.error) || (tUI("errServer") || "Ошибка сервера, попробуйте позже");
  }

  /* ---------- Переключение Вход / Регистрация ---------- */
  const showRegisterBtn = $("#showRegisterBtn");
  const showLoginBtn = $("#showLoginBtn");
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", () => {
      if (loginCard) loginCard.hidden = true;
      if (registerCard) registerCard.hidden = false;
      const first = $("#regEmail");
      if (first) first.focus();
    });
  }
  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => {
      if (registerCard) registerCard.hidden = true;
      if (loginCard) loginCard.hidden = false;
    });
  }

  /* ---------- Выход ---------- */
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    showAuth();
  });

  /* ---------- Заявка на списание бонусов ---------- */
  const applyForm = $("#applyBonusForm");
  const applyError = $("#applyError");
  const applySuccess = $("#applySuccess");
  const applyBots = $("#applyBots");
  const applyUseBonus = $("#applyUseBonus");

  if (applyBots) {
    applyBots.addEventListener("input", updateApplyHint);
  }
  if (applyUseBonus) {
    applyUseBonus.addEventListener("change", updateApplyHint);
  }

  applyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    applyError.hidden = true;
    applySuccess.hidden = true;
    const botsCount = parseInt(applyBots.value, 10);
    const months = parseInt($("#applyMonths").value, 10);
    const useBonusMonths = applyUseBonus.checked;
    if (!botsCount || botsCount < 1 || botsCount > 30) {
      applyError.textContent = tUI("errApplyBonusInvalid") || "Неверные данные заявки";
      applyError.hidden = false;
      return;
    }
    const res = await api("/api/apply-bonus", {
      method: "POST",
      body: JSON.stringify({ botsCount, months, useBonusMonths }),
    });
    if (res.status === 200 && res.data && res.data.ok) {
      applySuccess.textContent = tUI("applyBonusSuccess") || "Заявка отправлена! Менеджер свяжется с вами.";
      applySuccess.hidden = false;
    } else {
      applyError.textContent = localError(res.data);
      applyError.hidden = false;
    }
  });

  /* ---------- Реф-код из URL (?ref=КОД) ---------- */
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && $("#regReferral")) $("#regReferral").value = ref.toUpperCase().slice(0, 64);
  } catch { /* нет параметров */ }

  /* ---------- Старт ---------- */
  (async () => {
    const res = await api("/api/profile");
    if (res.status === 200 && res.data && res.data.ok) {
      renderDashboard(res.data);
    } else {
      showAuth();
    }
  })();

  /* Год в футере */
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* Применяем язык (после парсинга DOM) */
  applyLang(detectLang());
})();
