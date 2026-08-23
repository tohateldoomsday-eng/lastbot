/* ============================================================
   LASTBOT — интерактив
   Анимации · лента новостей · частицы
   ============================================================ */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /* ---------- Мультиязычность ---------- */
  function detectLang() {
    try {
      const saved = localStorage.getItem("lb_lang");
      if (saved && window.LB_I18N && window.LB_I18N[saved]) return saved;
      const nav = (navigator.language || "ru").toLowerCase().slice(0, 2);
      if (window.LB_I18N && window.LB_I18N[nav]) return nav;
    } catch { /* приватный режим */ }
    return "ru";
  }

  let currentLang = detectLang();

  function tUI(key) {
    const dict = (window.LB_I18N && window.LB_I18N[currentLang]) || null;
    if (dict && dict.ui && dict.ui[key] != null && dict.ui[key] !== "") return dict.ui[key];
    const ru = (window.LB_I18N && window.LB_I18N.ru && window.LB_I18N.ru.ui) || {};
    return ru[key] || "";
  }

  function applyUI(ui) {
    if (!ui) return;
    document.querySelectorAll("[data-ui]").forEach((el) => {
      const key = el.dataset.ui;
      if (ui[key] != null && ui[key] !== "") el.textContent = ui[key];
    });
  }

  function updateLangUI() {
    const cur = document.getElementById("langCurrent");
    if (cur) cur.textContent = currentLang.toUpperCase();
  }

  function applyLanguage(lang, isInit) {
    currentLang = lang;
    try { localStorage.setItem("lb_lang", lang); } catch { /* приватный режим */ }
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const dict = (window.LB_I18N && window.LB_I18N[lang]) || null;
    applyUI(dict ? dict.ui : null);
    if (lang === "ru") {
      loadContent().then((c) => {
        if (currentLang === "ru") applyContent(c);
        else if (c) applyDashboard(c);
      });
    } else if (dict) {
      applyContent(dict);
      loadContent().then((c) => {
        if (c) applyDashboard(c);
      });
    }
    if (!isInit || lang !== "ru") {
      if (typeof loadNews === "function") loadNews();
    }
    updateLangUI();
  }

  /* Переключатель языка */
  const langBtn = document.getElementById("langBtn");
  const langMenu = document.getElementById("langMenu");
  if (langBtn && langMenu) {
    langBtn.addEventListener("click", () => {
      const open = langMenu.hidden;
      langMenu.hidden = !open;
      langBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!langBtn.contains(e.target) && !langMenu.contains(e.target)) {
        langMenu.hidden = true;
        langBtn.setAttribute("aria-expanded", "false");
      }
    });
    langMenu.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-lang]");
      if (!opt) return;
      langMenu.hidden = true;
      langBtn.setAttribute("aria-expanded", "false");
      applyLanguage(opt.dataset.lang, false);
    });
  }

  /* ---------- Год в футере ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Header: состояние при скролле ---------- */
  const header = $("#siteHeader");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Мобильное меню ---------- */
  const navToggle = $("#navToggle");
  const mainNav = $("#mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", () => {
      const open = mainNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    });
    $$("a", mainNav).forEach((a) =>
      a.addEventListener("click", () => {
        mainNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---------- Reveal при скролле ---------- */
  const revealEls = $$(".reveal");
  const reveal = (el) => {
    if (el.classList.contains("in-view")) return;
    const siblings = $$(".reveal", el.parentElement);
    const idx = siblings.indexOf(el);
    if (idx > -1 && !el.style.getPropertyValue("--d")) {
      el.style.setProperty("--d", `${Math.min(idx, 8) * 0.08}s`);
    }
    el.classList.add("in-view");
  };
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in-view"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Счётчики ---------- */
  const counters = $$("[data-count]");
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const dur = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (reducedMotion || !("IntersectionObserver" in window)) {
    counters.forEach((el) => (el.textContent = el.dataset.count));
  } else {
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !e.target.dataset.done) {
            e.target.dataset.done = "1";
            animateCount(e.target);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------- Прогресс-бары (геймификация) ---------- */
  const bars = $$(".xp-fill[data-progress]");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    bars.forEach((b) => (b.style.width = b.dataset.progress + "%"));
  } else {
    const bio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !e.target.dataset.done) {
            e.target.dataset.done = "1";
            e.target.style.width = e.target.dataset.progress + "%";
            bio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    bars.forEach((b) => bio.observe(b));
  }

  /* Страховка при очень быстром скролле: всё видимое проявляется гарантированно */
  if (!reducedMotion) {
    const inViewport = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.96; // всё, что выше нижней границы экрана (или уже пройдено)
    };
    let sweepTimer = null;
    const sweep = () => {
      sweepTimer = null;
      revealEls.forEach((el) => {
        if (!el.classList.contains("in-view") && inViewport(el)) reveal(el);
      });
      counters.forEach((el) => {
        if (!el.dataset.done && inViewport(el)) {
          el.dataset.done = "1";
          animateCount(el);
        }
      });
      bars.forEach((el) => {
        if (!el.dataset.done && inViewport(el)) {
          el.dataset.done = "1";
          el.style.width = el.dataset.progress + "%";
        }
      });
    };
    window.addEventListener("scroll", () => {
      if (!sweepTimer) sweepTimer = setTimeout(sweep, 180);
    }, { passive: true });
    sweep();
  }

  /* ---------- FAQ: закрывать соседние пункты ---------- */
  function bindFaq() {
    const faqItems = $$(".faq-item");
    faqItems.forEach((item) => {
      item.addEventListener("toggle", () => {
        if (item.open) {
          faqItems.forEach((other) => {
            if (other !== item && other.open) other.open = false;
          });
        }
      });
    });
  }
  bindFaq();

  /* ---------- Контент из админ-панели (гидрация) ---------- */
  function setText(sel, value) {
    if (value == null || value === "") return;
    const el = document.querySelector(sel);
    if (!el) return;
    const cur = (el.textContent || "").trim();
    if (cur !== String(value).trim()) el.textContent = value;
  }

  function setTextIn(root, sel, value) {
    if (value == null || value === "" || !root) return;
    const el = sel ? root.querySelector(sel) : root;
    if (!el) return;
    const cur = (el.textContent || "").trim();
    if (cur !== String(value).trim()) el.textContent = value;
  }

  async function loadContent() {
    try {
      const res = await fetch("/api/content", { credentials: "same-origin" });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  /* Кнопка «Дашборд» в меню: ссылка задаётся в админ-панели */
  function applyDashboard(c) {
    const dash = document.getElementById("dashboardLink");
    if (!dash) return;
    const url = (c.dashboard && c.dashboard.url) || "";
    dash.hidden = !url;
    if (url) dash.href = url;
  }

  function applyContent(c) {
    if (!c) return;

    /* Hero */
    setText(".hero-badge-text", c.hero && c.hero.badge);
    setText(".hero-line-1", c.hero && c.hero.titleLine1);
    setText(".kw-1", c.hero && c.hero.word1);
    setText(".kw-2", c.hero && c.hero.word2);
    setText(".kw-3", c.hero && c.hero.word3);
    setText(".hero-sub", c.hero && c.hero.subtitle);
    const trustUl = document.querySelector(".hero-trust");
    if (trustUl && Array.isArray(c.hero && c.hero.trust)) {
      trustUl.textContent = "";
      c.hero.trust.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        trustUl.append(li);
      });
    }

    /* Заголовки секций */
    setText("#why .section-head h2", c.why && c.why.heading);
    setText("#why .section-head p", c.why && c.why.sub);
    setText("#features .section-head h2", c.features && c.features.heading);
    setText("#features .section-head p", c.features && c.features.sub);
    setText("#pricing .section-head h2", c.pricing && c.pricing.heading);
    setText("#pricing .section-head p", c.pricing && c.pricing.sub);
    setText("#news .section-head h2", c.news && c.news.heading);
    setText("#news .section-head p", c.news && c.news.sub);
    setText("#faq .section-head h2", c.faq && c.faq.heading);

    /* Преимущества */
    document.querySelectorAll(".why-grid .glass-card").forEach((card, i) => {
      const d = (c.why && c.why.cards && c.why.cards[i]) || null;
      if (!d) return;
      setTextIn(card, "h3", d.title);
      setTextIn(card, "p", d.text);
      setTextIn(card, ".xp-fill span", d.label);
    });

    /* Функции */
    document.querySelectorAll(".bento-item").forEach((card, i) => {
      const d = (c.features && c.features.items && c.features.items[i]) || null;
      if (!d) return;
      setTextIn(card, "h3", d.title);
      setTextIn(card, "p", d.text);
      const tag = card.querySelector(".bento-tag");
      if (tag) {
        if (d.tag && d.tag !== "") {
          tag.textContent = d.tag;
          tag.style.display = "";
        } else {
          tag.style.display = "none";
        }
      }
    });

    /* Тарифы */
    document.querySelectorAll(".price-card").forEach((card, i) => {
      const t = (c.pricing && c.pricing.tiers && c.pricing.tiers[i]) || null;
      if (!t) return;
      setTextIn(card, "h3", t.name);
      setTextIn(card, ".price-bots strong", t.bots);
      setTextIn(card, ".price-amount", t.price);
      const ul = card.querySelector(".price-features");
      if (ul && Array.isArray(t.features)) {
        ul.textContent = "";
        t.features.forEach((f) => {
          const li = document.createElement("li");
          li.textContent = f;
          ul.append(li);
        });
      }
    });
    setText(".pricing-notes .note-renewal", c.pricing && c.pricing.note);

    /* FAQ: полная перестройка из данных панели */
    const faqList = document.querySelector(".faq-list");
    if (faqList && Array.isArray(c.faq && c.faq.items) && c.faq.items.length) {
      faqList.textContent = "";
      c.faq.items.forEach((item) => {
        const details = document.createElement("details");
        details.className = "faq-item glass-card reveal in-view";
        const summary = document.createElement("summary");
        const q = document.createElement("span");
        q.textContent = item.q || "";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M12 5v14M5 12h14");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
        summary.append(q, svg);
        const body = document.createElement("div");
        body.className = "faq-body";
        const pEl = document.createElement("p");
        pEl.textContent = item.a || "";
        body.append(pEl);
        details.append(summary, body);
        faqList.append(details);
      });
      bindFaq();
    }

    /* CTA */
    setText(".cta-panel h2", c.cta && c.cta.heading);
    setText(".cta-panel p", c.cta && c.cta.text);

    /* Контакты */
    if (c.contacts) {
      const mailLink = document.querySelector('.footer-nav a[href^="mailto:"]');
      if (mailLink && c.contacts.email) {
        mailLink.href = "mailto:" + c.contacts.email;
        setTextIn(mailLink, null, c.contacts.email);
      }
      const tgLink = document.querySelector('.footer-nav a[href^="https://t.me/"]');
      if (tgLink && c.contacts.telegramUrl) {
        tgLink.href = c.contacts.telegramUrl;
        setTextIn(tgLink, null, c.contacts.telegramHandle);
      }
      setText(".footer-tagline", c.contacts.tagline);
    }

    /* Шаги */
    const steps = document.querySelectorAll(".step");
    if (steps.length && Array.isArray(c.how && c.how.items)) {
      c.how.items.forEach((s, i) => {
        const el = steps[i];
        if (!el || !s) return;
        setTextIn(el, "h3", s.title);
        setTextIn(el, "p", s.text);
      });
    }

    /* Кнопка «Дашборд» в меню */
    applyDashboard(c);

    /* Новости и промокоды — подмена базовых списков */
    if (Array.isArray(c.news && c.news.items) && c.news.items.length) {
      VK_NEWS.length = 0;
      c.news.items.forEach((n) => VK_NEWS.push({
        title: n.title || "",
        date: n.date || "",
        ts: 0,
        official: true,
        url: n.url || "https://vk.ru/doomsday_last_survivors_ru",
        source: n.source || "Админ-панель",
      }));
      if (newsList && newsList.querySelector(".news-item")) {
        render(VK_NEWS, newsStatus ? newsStatus.textContent : "Сводка из админ-панели");
      }
    }
    if (Array.isArray(c.codes && c.codes.items) && c.codes.items.length) {
      CODES.length = 0;
      c.codes.items.forEach((cd) => CODES.push({
        code: cd.code || "",
        reward: cd.reward || "",
        expires: cd.expires || "",
        url: "https://claude-gaming.com/doomsday-last-survivors-codes/",
        checked: tUI("codesFromAdmin"),
      }));
      renderCodes();
    }
  }

  /* ---------- Частицы ---------- */
  const canvas = $("#particles");
  if (canvas && !reducedMotion) {
    const ctx = canvas.getContext("2d");
    let w, h, raf;
    let dots = [];
    const COLORS = ["34,211,238", "139,92,246", "163,255,94", "77,124,255"];
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    // Спрайты свечения отрисовываются один раз: drawImage в разы дешевле,
    // чем shadowBlur на каждый кадр для каждой частицы
    const sprites = COLORS.map((rgb) => {
      const s = 48;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, `rgba(${rgb},0.85)`);
      grad.addColorStop(0.35, `rgba(${rgb},0.3)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      return c;
    });

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.min(56, Math.floor((w * h) / 26000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.5,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22 - 0.06,
        ci: (Math.random() * COLORS.length) | 0,
        a: Math.random() * 0.5 + 0.15,
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += d.vx;
        d.y += d.vy;
        d.tw += 0.02;
        if (d.x < -30) d.x = w + 30;
        if (d.x > w + 30) d.x = -30;
        if (d.y < -30) d.y = h + 30;
        if (d.y > h + 30) d.y = -30;
        const size = d.r * 26;
        ctx.globalAlpha = d.a * (0.65 + 0.35 * Math.sin(d.tw));
        ctx.drawImage(sprites[d.ci], d.x - size / 2, d.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = null;
      } else if (!raf) {
        raf = requestAnimationFrame(step);
      }
    });
    raf = requestAnimationFrame(step);
  }

  /* ============================================================
     Лента новостей
     ============================================================ */
  const newsList = $("#newsList");
  const newsStatus = $("#newsStatus");
  const newsRefresh = $("#newsRefresh");
  if (!newsList) return;

  /* Основная лента — официальное сообщество DLS ВКонтакте.
     Посты собраны из группы vk.ru/doomsday_last_survivors_ru.
     Чтобы добавить свежий пост: скопируй заголовок, дату и ссылку
     в конец массива VK_NEWS (ts — ключ сортировки: ГГГГММДД). */
  const VK_NEWS = [
    {
      title: "DLS × FAIRY TAIL — коллаборация в игре, осталось 2 дня!",
      date: "авг 2026",
      ts: 20260818,
      official: true,
      url: "https://vk.ru/doomsday_last_survivors_ru",
      source: "VK · DLS Official",
    },
    {
      title: "Эксклюзивные подарки Чемпионата мира IGG 2026",
      date: "авг 2026",
      ts: 20260810,
      official: true,
      url: "https://vk.ru/doomsday_last_survivors_ru",
      source: "VK · DLS Official",
    },
    {
      title: "Командиры, помогите установить мировой рекорд онлайн-каллиграммы",
      date: "авг 2026",
      ts: 20260802,
      official: true,
      url: "https://vk.ru/doomsday_last_survivors_ru",
      source: "VK · DLS Official",
    },
    {
      title: "Наше сообщество в Discord преодолело новую отметку",
      date: "авг 2026",
      ts: 20260715,
      official: true,
      url: "https://vk.ru/doomsday_last_survivors_ru",
      source: "VK · DLS Official",
    },
    {
      title: "Обратная связь разработчиков #6 — Часть 2: оптимизации и обновления 2026",
      date: "2026",
      ts: 20260601,
      official: true,
      url: "https://vk.com/@doomsday_last_survivors_ru-obratnaya-svyaz-razrabotchikov-6-chast-2optimizacii-i-obn",
      source: "VK · DLS Official",
    },
  ];
  const cacheKey = () => "lastbot-news-v1-" + currentLang;
  const REFRESH_MS = 4 * 60 * 60 * 1000; // автообновление ленты раз в 4 часа
  const CACHE_TTL = REFRESH_MS;          // кэш живёт те же 4 часа


  function render(items, statusText) {
    newsList.textContent = "";
    // официальные — с приоритетом сверху, остальные — от новых к старым
    [...items]
      .sort((a, b) => {
        if (!!a.official !== !!b.official) return a.official ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      })
      .slice(0, 8)
      .forEach((item) => {
      const li = document.createElement("li");
      li.className = "news-item reveal in-view";

      const date = document.createElement("time");
      date.className = "news-date";
      date.textContent = item.date;

      const body = document.createElement("div");
      const a = document.createElement("a");
      a.className = "news-title";
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.title;
      if (item.official) {
        const badge = document.createElement("span");
        badge.className = "news-badge official";
        badge.textContent = "ОФИЦИАЛЬНО";
        a.append(badge);
      }
      const src = document.createElement("span");
      src.className = "news-source";
      src.textContent = item.source;
      body.append(a, src);

      li.append(date, body);
      newsList.append(li);
    });
    if (newsStatus) newsStatus.textContent = statusText;
  }

  /* Лента приходит с собственного бэкенда (/api/news) — без сторонних CORS-прокси */
  async function fetchNews() {
    const res = await fetch("/api/news?lang=" + encodeURIComponent(currentLang), { credentials: "same-origin" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || !data.ok || !Array.isArray(data.items) || !data.items.length) throw new Error("empty feed");
    const locale = currentLang === "ru" ? "ru-RU" : currentLang;
    return data.items.map((it) => ({
      title: it.title || "Doomsday: Last Survivors",
      date: it.date ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(it.date)) : "",
      ts: it.date ? Math.floor(new Date(it.date).getTime() / 1000) : 0,
      url: it.url || "https://dls.igg.com/",
      source: it.source || "Google News",
    }));
  }

  function loadCached() {
    try {
      const raw = localStorage.getItem(cacheKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > CACHE_TTL) return null;
      return data; // { ts, items }
    } catch {
      return null;
    }
  }

  let lastFetchedAt = 0; // время последнего успешного получения ленты

  function saveCache(items) {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ ts: Date.now(), items }));
    } catch {
      /* приватный режим — игнорируем */
    }
  }

  async function loadNews(force) {
    const myLang = currentLang; // ответы другого языка игнорируем
    if (newsRefresh) {
      newsRefresh.classList.add("loading");
      newsRefresh.disabled = true;
    }
    try {
      const fresh = await fetchNews();
      if (myLang !== currentLang) return;
      saveCache(fresh);
      lastFetchedAt = Date.now();
      const time = new Date().toLocaleTimeString(currentLang === "ru" ? "ru-RU" : currentLang, { hour: "2-digit", minute: "2-digit" });
      render([...VK_NEWS, ...fresh], `${tUI("newsUpdated")} · ${time}`);
    } catch {
      if (myLang !== currentLang) return;
      const cached = loadCached();
      if (cached) {
        render([...VK_NEWS, ...cached.items], tUI("newsCached"));
      } else {
        render(VK_NEWS, tUI("newsOffline"));
      }
    } finally {
      if (newsRefresh) {
        newsRefresh.classList.remove("loading");
        newsRefresh.disabled = false;
      }
    }
  }

  const cached = loadCached();
  lastFetchedAt = cached ? cached.ts : 0;
  if (cached) {
    render([...VK_NEWS, ...cached.items], tUI("newsCached"));
    if (Date.now() - cached.ts >= REFRESH_MS) {
      loadNews(); // кэш устарел — обновляем
    }
  } else {
    render(VK_NEWS, tUI("newsLoadingInitial"));
    loadNews();
  }

  /* Автообновление раз в 4 часа, пока страница открыта */
  setInterval(() => loadNews(), REFRESH_MS);

  /* Вкладка была в фоне, а по возвращении данные устарели — обновляем */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastFetchedAt > REFRESH_MS) loadNews();
  });

  /* ---------- Вкладки: новости / промокоды ---------- */
  const tabNewsBtn = $("#tabNewsBtn");
  const tabCodesBtn = $("#tabCodesBtn");
  const tabNews = $("#newsTab");
  const tabCodes = $("#codesTab");

  function selectTab(btn, panel) {
    [tabNewsBtn, tabCodesBtn].forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
    });
    tabNews.hidden = panel !== tabNews;
    tabCodes.hidden = panel !== tabCodes;
    if (newsRefresh) newsRefresh.style.display = panel === tabNews ? "" : "none";
  }

  if (tabNewsBtn && tabCodesBtn && tabNews && tabCodes) {
    tabNewsBtn.addEventListener("click", () => selectTab(tabNewsBtn, tabNews));
    tabCodesBtn.addEventListener("click", () => selectTab(tabCodesBtn, tabCodes));
  }

  /* ---------- Промокоды ---------- */
  const CODES = [
    {
      code: "DLSODS",
      reward: "Бесплатные награды",
      expires: "до 31.08.2026",
      url: "https://claude-gaming.com/doomsday-last-survivors-codes/",
      checked: tUI("codesChecked"),
    },
    {
      code: "DLSFAIRYTAIL",
      reward: "Бесплатные награды",
      expires: "истекает скоро",
      url: "https://claude-gaming.com/doomsday-last-survivors-codes/",
      checked: tUI("codesChecked"),
    },
  ];

  const codesListEl = $("#codesList");

  function copyCode(btn, code) {
    const done = () => {
      btn.classList.add("copied");
      btn.textContent = "Скопировано ✓";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = "Копировать";
      }, 1600);
    };
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        /* не критично */
      }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function renderCodes() {
    if (!codesListEl) return;
    codesListEl.textContent = "";
    CODES.forEach((c) => {
      const card = document.createElement("article");
      card.className = "code-card";

      const row = document.createElement("div");
      row.className = "code-row";
      const value = document.createElement("code");
      value.className = "code-value";
      value.textContent = c.code;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "Копировать";
      btn.setAttribute("aria-label", "Скопировать код " + c.code);
      btn.addEventListener("click", () => copyCode(btn, c.code));
      row.append(value, btn);

      const meta = document.createElement("div");
      meta.className = "code-meta";
      const rew = document.createElement("span");
      rew.textContent = "🎁 " + c.reward;
      const exp = document.createElement("span");
      exp.className = "code-exp";
      exp.textContent = "⏳ " + c.expires;
      const src = document.createElement("a");
      src.href = c.url;
      src.target = "_blank";
      src.rel = "noopener noreferrer";
      src.textContent = c.checked;
      meta.append(rew, exp, src);

      card.append(row, meta);
      codesListEl.append(card);
    });
  }

  renderCodes();

  if (newsRefresh) newsRefresh.addEventListener("click", () => loadNews(true));

  /* Язык: переводы или админ-контент (для русского) */
  applyLanguage(detectLang(), true);
})();
