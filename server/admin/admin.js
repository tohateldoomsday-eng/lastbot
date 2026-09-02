/* ============================================================
   LASTBOT Admin — редактор контента + бизнес-разделы
   (акции, триалы, балансы, рефералы, отзывы, счётчики)
   ============================================================ */
(function () {
  "use strict";
  window.__LB_ADMIN_READY__ = true; // флаг для inline-диагностики загрузки

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- Схема редактируемого контента ---------- */
  const SCHEMA = [
    {
      id: "hero", label: "Главный экран", desc: "Шапка сайта, заголовки, подзаголовок",
      fields: [
        { path: "hero.badge", label: "Бейдж над заголовком", type: "text" },
        { path: "hero.titleLine1", label: "Первая строка заголовка", type: "text" },
        { path: "hero.word1", label: "Слово 1 (кино-типографика)", type: "text" },
        { path: "hero.word2", label: "Слово 2", type: "text" },
        { path: "hero.word3", label: "Слово 3", type: "text" },
        { path: "hero.subtitle", label: "Подзаголовок", type: "textarea" },
        { path: "hero.trust", label: "Строка гарантий", type: "list" },
      ],
    },
    {
      id: "why", label: "Преимущества", desc: "Блок «Почему командиры выбирают LASTBOT»",
      fields: [
        { path: "why.heading", label: "Заголовок блока", type: "text" },
        { path: "why.sub", label: "Подзаголовок", type: "text" },
        {
          path: "why.cards", label: "Карточки", type: "objects",
          spec: [
            { key: "title", label: "Заголовок", type: "text" },
            { key: "text", label: "Текст", type: "textarea" },
            { key: "label", label: "Подпись XP-бара", type: "text" },
          ],
        },
      ],
    },
    {
      id: "features", label: "Функции", desc: "Bento-сетка функций ботов (7 модулей)",
      fields: [
        { path: "features.heading", label: "Заголовок блока", type: "text" },
        { path: "features.sub", label: "Подзаголовок", type: "text" },
        {
          path: "features.items", label: "Функции", type: "objects",
          spec: [
            { key: "tag", label: "Бейдж (TOP / 24/7 / AI / BONUS / …)", type: "text" },
            { key: "title", label: "Заголовок", type: "text" },
            { key: "text", label: "Описание", type: "textarea" },
          ],
        },
      ],
    },
    {
      id: "pricing", label: "Калькулятор цен", desc: "Маржинальные блоки ботов (пакеты 10/20/30) и сроки подписки",
      fields: [
        { path: "pricing.heading", label: "Заголовок блока", type: "text" },
        { path: "pricing.sub", label: "Подзаголовок", type: "text" },
        { path: "pricing.note", label: "Примечание об оплате", type: "textarea" },
        {
          path: "pricing.botPrices", label: "Блоки добавочных ботов", type: "objects",
          desc: "Каждый блок оплачивается за ботов в своём диапазоне. Пример: 1–10 по $2.00 + 11–20 по $1.50 → 20 ботов = $35; 21–30 по $2.00 → 30 ботов = $55.",
          spec: [
            { key: "min", label: "От ботов", type: "number" },
            { key: "max", label: "До ботов", type: "number" },
            { key: "price", label: "Ставка блока, $ за бота", type: "number" },
          ],
        },
        {
          path: "pricing.periods", label: "Сроки подписки", type: "objects",
          spec: [
            { key: "months", label: "Месяцев", type: "number" },
            { key: "discount", label: "Скидка, % (цена = срок × (1 − скидка/100))", type: "number" },
          ],
        },
      ],
    },
    {
      id: "news", label: "Новости", desc: "Лента новостей (показывается первой)",
      fields: [
        { path: "news.heading", label: "Заголовок блока", type: "text" },
        { path: "news.sub", label: "Подзаголовок", type: "text" },
        {
          path: "news.items", label: "Новости", type: "objects",
          spec: [
            { key: "title", label: "Заголовок", type: "text" },
            { key: "date", label: "Дата (как показывать)", type: "text" },
            { key: "url", label: "Ссылка", type: "text" },
            { key: "source", label: "Источник", type: "text" },
          ],
        },
      ],
    },
    {
      id: "codes", label: "Промокоды", desc: "Вкладка «Промокоды» + панель в hero",
      fields: [
        {
          path: "codes.items", label: "Промокоды", type: "objects",
          spec: [
            { key: "code", label: "Код", type: "text" },
            { key: "reward", label: "Награда", type: "text" },
            { key: "expires", label: "Срок действия", type: "text" },
            { key: "active", label: "Активен (1/0, пусто=да)", type: "text" },
            { key: "minBots", label: "Мин. ботов (пусто=нет)", type: "number" },
            { key: "maxBots", label: "Макс. ботов (пусто=нет)", type: "number" },
          ],
        },
      ],
    },
    {
      id: "faq", label: "FAQ", desc: "Вопросы и ответы",
      fields: [
        { path: "faq.heading", label: "Заголовок блока", type: "text" },
        {
          path: "faq.items", label: "Вопросы", type: "objects",
          spec: [
            { key: "q", label: "Вопрос", type: "text" },
            { key: "a", label: "Ответ", type: "textarea" },
          ],
        },
      ],
    },
    {
      id: "cta", label: "CTA-баннер", desc: "Финальный призыв к действию",
      fields: [
        { path: "cta.heading", label: "Заголовок", type: "text" },
        { path: "cta.text", label: "Текст", type: "textarea" },
      ],
    },
    {
      id: "how", label: "Шаги", desc: "Блок «Как это работает»",
      fields: [
        {
          path: "how.items", label: "Шаги", type: "objects",
          spec: [
            { key: "title", label: "Заголовок шага", type: "text" },
            { key: "text", label: "Текст", type: "textarea" },
          ],
        },
      ],
    },
    {
      id: "contacts", label: "Контакты", desc: "Почта, Telegram, слоган в подвале",
      fields: [
        { path: "contacts.email", label: "Email", type: "text" },
        { path: "contacts.telegramHandle", label: "Telegram (текст ссылки)", type: "text" },
        { path: "contacts.telegramUrl", label: "Telegram (ссылка)", type: "text" },
        { path: "contacts.tagline", label: "Слоган в подвале", type: "textarea" },
      ],
    },
    {
      id: "stats", label: "Счётчики", desc: "Счётчик «альянсов доверяют» в hero",
      fields: [
        { path: "stats.alliancesCount", label: "Альянсов доверяют (счётчик в hero)", type: "text" },
        { path: "stats.hoursSaved", label: "Сэкономлено часов (маркетинг)", type: "text" },
      ],
    },
    {
      id: "testimonials", label: "Отзывы", desc: "Блок «Что говорят командиры»",
      fields: [
        {
          path: "testimonials", label: "Отзывы", type: "objects",
          spec: [
            { key: "name", label: "Имя", type: "text" },
            { key: "alliance", label: "Альянс", type: "text" },
            { key: "text", label: "Текст отзыва", type: "textarea" },
            { key: "rating", label: "Оценка (1–5)", type: "text" },
            { key: "date", label: "Дата", type: "text" },
          ],
        },
      ],
    },
    {
      id: "menu", label: "Меню", desc: "Ссылки в верхнем меню сайта",
      fields: [
        { path: "dashboard.url", label: "Ссылка кнопки «Дашборд» (кнопка всегда в меню)", type: "text" },
      ],
    },
  ];

  /* ---------- Утилиты ---------- */
  function getPath(obj, pathStr) {
    if (!pathStr) return undefined;
    const keys = pathStr.split(".");
    let cur = obj;
    for (const k of keys) {
      if (cur == null) return undefined;
      cur = cur[k];
    }
    return cur;
  }

  function setPath(obj, pathStr, value) {
    const keys = pathStr.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  /* ---------- API ---------- */
  async function api(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        headers: options && options.body ? { "Content-Type": "application/json" } : undefined,
        ...options,
        signal: ctrl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* не JSON */ }
      return { status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function toast(text, kind) {
    const el = $("#saveStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "save-status show " + (kind || "ok");
    setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- Вход ---------- */
  const loginView = $("#loginView");
  const appView = $("#appView");
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");
  const loginStatus = $("#loginStatus");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    if (loginStatus) {
      loginStatus.textContent = "Отправляем запрос…";
      loginStatus.style.color = "";
    }
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ u: $("#loginUser").value.trim(), p: $("#loginPass").value }),
    });
    if (res.status === 200 && res.data && res.data.ok) {
      if (loginStatus) loginStatus.textContent = "Вход выполнен, загружаю панель…";
      enterDashboard();
    } else {
      loginError.textContent = (res.data && res.data.error) || "Ошибка входа";
      loginError.hidden = false;
      if (loginStatus) { loginStatus.textContent = "Ошибка входа — проверьте данные"; loginStatus.style.color = "#f87171"; }
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    location.reload();
  });

  /* ---------- Панель ---------- */
  function panelError(text) {
    if (loginStatus) {
      loginStatus.textContent = text;
      loginStatus.style.color = "#f87171";
    }
    if (window.console && console.error) console.error("[admin] " + text);
  }

  async function enterDashboard() {
    loginView.hidden = true;
    appView.hidden = false;
    try {
      await loadContent();
    } catch (err) {
      appView.hidden = true;
      loginView.hidden = false;
      panelError("Ошибка отрисовки панели: " + (err && err.message ? err.message : err));
    }
  }

  async function loadContent() {
    let res;
    try {
      res = await api("/api/content");
    } catch (err) {
      throw new Error("нет связи с сервером (" + err + ")");
    }
    if (res.status === 401) {
      appView.hidden = true;
      loginView.hidden = false;
      loginError.hidden = true;
      panelError("Сессия истекла — войдите снова");
      return;
    }
    if (res.status !== 200) {
      appView.hidden = true;
      loginView.hidden = false;
      panelError("Ошибка загрузки контента: код " + res.status);
      return;
    }
    renderTabs(res.data || {});
  }

  /* ---------- Вкладки ---------- */
  const EXTRA_TABS = [
    { id: "promotions", label: "Акции", desc: "Скидки и спецпредложения (data/promotions.json)" },
    { id: "trials", label: "Триалы", desc: "Заявки на бесплатный триал (data/trials.json)" },
    { id: "balances", label: "Балансы", desc: "Бото-месяцы и кэшбэк альянсов (data/balances.json)" },
    { id: "referrals", label: "Рефералы", desc: "Коды альянсов, покупки, начисление бонусов" },
    { id: "users", label: "Пользователи", desc: "Зарегистрированные альянсы (data/users.json)" },
    { id: "bonus-requests", label: "Заявки на списание", desc: "Заявки на применение бонусных бото-месяцев" },
  ];

  function renderTabs(content) {
    const nav = $("#tabNav");
    const panels = $("#tabPanels");
    nav.textContent = "";
    panels.textContent = "";

    const allSections = [
      ...SCHEMA.map((s) => ({ id: s.id, label: s.label, kind: "schema", schema: s })),
      ...EXTRA_TABS.map((s) => ({ id: s.id, label: s.label, kind: "extra", extra: s })),
    ];

    allSections.forEach((section, si) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-tab" + (si === 0 ? " is-active" : "");
      btn.textContent = section.label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(si === 0));
      btn.addEventListener("click", () => {
        $$(".app-tab").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", String(b === btn));
        });
        $$(".app-panel").forEach((p) => {
          p.classList.toggle("is-active", p.dataset.panel === section.id);
        });
      });
      nav.append(btn);

      const panel = document.createElement("section");
      panel.className = "app-panel" + (si === 0 ? " is-active" : "");
      panel.dataset.panel = section.id;
      panel.setAttribute("role", "tabpanel");

      const head = document.createElement("div");
      head.className = "panel-head";
      const h2 = document.createElement("h2");
      h2.textContent = section.label;
      const p = document.createElement("p");
      p.textContent = (section.schema && section.schema.desc) || (section.extra && section.extra.desc) || "";
      head.append(h2, p);
      panel.append(head);

      if (section.kind === "schema") {
        section.schema.fields.forEach((field) => {
          panel.append(renderField(field, getPath(content, field.path)));
        });
      } else {
        panel.append(renderExtra(section.extra));
      }
      panels.append(panel);
    });
  }

  function renderField(field, value) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = field.label;
    wrap.append(label);

    if (field.type === "text" || field.type === "textarea") {
      const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
      input.dataset.path = field.path;
      input.value = value == null ? "" : String(value);
      wrap.append(input);
    } else if (field.type === "list") {
      const editor = listEditor(field.path, Array.isArray(value) ? value : []);
      wrap.append(editor);
    } else if (field.type === "objects") {
      const editor = objectsEditor(field.path, Array.isArray(value) ? value : [], field.spec || []);
      wrap.append(editor);
    }
    if (field.saveEmpty) wrap.dataset.saveEmpty = "1";
    return wrap;
  }

  function listEditor(path, items) {
    const wrap = document.createElement("div");
    wrap.className = "list-editor";
    wrap.dataset.path = path;

    const render = () => {
      wrap.querySelectorAll(".list-row").forEach((r) => r.remove());
      items.forEach((item, i) => {
        const row = document.createElement("div");
        row.className = "list-row";
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.path = path + "[" + i + "]";
        input.value = item == null ? "" : String(item);
        input.addEventListener("input", () => { items[i] = input.value; });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "row-del";
        del.textContent = "✕";
        del.setAttribute("aria-label", "Удалить");
        del.addEventListener("click", () => {
          items.splice(i, 1);
          render();
        });
        row.append(input, del);
        wrap.append(row);
      });
    };
    render();

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-btn";
    add.textContent = "+ Добавить строку";
    add.addEventListener("click", () => {
      items.push("");
      render();
    });
    wrap.append(add);
    return wrap;
  }

  function objectsEditor(path, items, spec) {
    const wrap = document.createElement("div");
    wrap.className = "obj-list";
    wrap.dataset.path = path;

    const render = () => {
      wrap.querySelectorAll(".obj-item").forEach((r) => r.remove());
      items.forEach((obj, i) => {
        const card = document.createElement("div");
        card.className = "obj-item";

        const head = document.createElement("div");
        head.className = "obj-head";
        const title = document.createElement("span");
        title.className = "obj-title";
        title.textContent = "#" + (i + 1);
        const controls = document.createElement("div");
        controls.className = "obj-move";

        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        up.setAttribute("aria-label", "Выше");
        up.addEventListener("click", () => {
          if (i === 0) return;
          [items[i - 1], items[i]] = [items[i], items[i - 1]];
          render();
        });
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        down.setAttribute("aria-label", "Ниже");
        down.addEventListener("click", () => {
          if (i === items.length - 1) return;
          [items[i + 1], items[i]] = [items[i], items[i + 1]];
          render();
        });
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "✕";
        del.setAttribute("aria-label", "Удалить");
        del.addEventListener("click", () => {
          items.splice(i, 1);
          render();
        });
        controls.append(up, down, del);
        head.append(title, controls);
        card.append(head);

        const fieldsWrap = document.createElement("div");
        fieldsWrap.className = "obj-fields";
        spec.forEach((f) => {
          const fl = document.createElement("label");
          const flLabel = document.createElement("span");
          flLabel.textContent = f.label;
          fl.append(flLabel);

          if (f.type === "textarea") {
            const ta = document.createElement("textarea");
            ta.value = obj[f.key] == null ? "" : String(obj[f.key]);
            ta.addEventListener("input", () => { obj[f.key] = ta.value; });
            fl.append(ta);
          } else if (f.type === "list") {
            const sub = listEditor(path + "[" + i + "]." + f.key, Array.isArray(obj[f.key]) ? obj[f.key] : []);
            fl.append(sub);
          } else if (f.type === "number") {
            /* числовые поля храним числами, чтобы калькулятор не падал */
            const input = document.createElement("input");
            input.type = "number";
            input.step = "any";
            input.value = obj[f.key] == null ? "" : String(obj[f.key]);
            input.addEventListener("input", () => { obj[f.key] = input.value === "" ? "" : parseFloat(input.value); });
            fl.append(input);
          } else {
            const input = document.createElement("input");
            input.type = "text";
            input.value = obj[f.key] == null ? "" : String(obj[f.key]);
            input.addEventListener("input", () => { obj[f.key] = input.value; });
            fl.append(input);
          }
          fieldsWrap.append(fl);
        });
        card.append(fieldsWrap);
        wrap.append(card);
      });
    };
    render();

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-btn";
    add.textContent = "+ Добавить элемент";
    add.addEventListener("click", () => {
      const blank = {};
      spec.forEach((f) => { blank[f.key] = f.type === "list" ? [] : ""; });
      items.push(blank);
      render();
    });
    wrap.append(add);
    return wrap;
  }

  /* ---------- Сборка объекта контента из полей ---------- */
  function collectContent() {
    const content = {};
    $$(".field").forEach((field) => {
      const kids = Array.from(field.children);
      const input = kids.find((el) => el.matches("input[data-path], textarea[data-path]"));
      if (input) {
        if (input.value !== "" || field.dataset.saveEmpty) setPath(content, input.dataset.path, input.value);
        return;
      }
      const list = kids.find((el) => el.classList.contains("list-editor"));
      if (list) {
        const arr = [];
        list.querySelectorAll(":scope > .list-row input").forEach((inp) => arr.push(inp.value));
        setPath(content, list.dataset.path, arr);
        return;
      }
      const obj = kids.find((el) => el.classList.contains("obj-list"));
      if (obj) {
        const items = objectState.get(obj.dataset.path);
        if (items) setPath(content, obj.dataset.path, JSON.parse(JSON.stringify(items)));
      }
    });
    return content;
  }

  /* Живое состояние объектных списков (мутации через input-слушатели) */
  const objectState = new Map();
  const _origObjectsEditor = objectsEditor;
  objectsEditor = function (path, items, spec) {
    objectState.set(path, items);
    return _origObjectsEditor(path, items, spec);
  };

  /* ---------- Сохранение контента ---------- */
  $("#saveBtn").addEventListener("click", async () => {
    const content = collectContent();
    const res = await api("/api/content", { method: "PUT", body: JSON.stringify(content) });
    if (res.status === 200 && res.data && res.data.ok) {
      toast("Сохранено. Изменения уже на сайте.", "ok");
    } else if (res.status === 401) {
      toast("Сессия истекла — войдите снова", "err");
      location.reload();
    } else {
      toast((res.data && res.data.error) || "Ошибка сохранения", "err");
    }
  });

  /* Публикация новостей в Telegram-канал */
  const tgPostBtn = $("#tgPostBtn");
  if (tgPostBtn) {
    tgPostBtn.addEventListener("click", async () => {
      tgPostBtn.disabled = true;
      tgPostBtn.textContent = "→ TG: отправка…";
      const res = await api("/api/telegram/post-news", { method: "POST" });
      tgPostBtn.disabled = false;
      tgPostBtn.textContent = "→ TG: новости";
      if (res.status === 200 && res.data && res.data.ok) {
        toast("Опубликовано в Telegram: " + (res.data.posted || 0) + " новостей", "ok");
      } else if (res.status === 401) {
        toast("Сессия истекла — войдите снова", "err");
      } else {
        toast("Telegram: " + ((res.data && res.data.error) || "ошибка публикации"), "err");
      }
    });
  }

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Вернуть весь контент к значениям по умолчанию?")) return;
    const res = await api("/api/content/reset", { method: "POST" });
    if (res.status === 200 && res.data && res.data.ok) {
      toast("Контент сброшен к значениям по умолчанию", "ok");
      await loadContent();
    } else {
      toast("Ошибка сброса", "err");
    }
  });

  /* ============================================================
     Новые разделы: акции, триалы, балансы, рефералы
     ============================================================ */

  function renderExtra(extra) {
    const wrap = document.createElement("div");
    wrap.className = "extra-panel";
    wrap.dataset.extra = extra.id;

    if (extra.id === "promotions") return renderPromotions(wrap);
    if (extra.id === "trials") return renderTrials(wrap);
    if (extra.id === "balances") return renderBalances(wrap);
    if (extra.id === "referrals") return renderReferrals(wrap);
    if (extra.id === "users") return renderUsers(wrap);
    if (extra.id === "bonus-requests") return renderBonusRequests(wrap);
    return wrap;
  }

  /* --- Акции --- */
  function renderPromotions(wrap) {
    const table = document.createElement("div");
    table.className = "data-table-wrap";
    wrap.append(table);

    let promotions = [];

    function draw() {
      table.textContent = "";
      promotions.forEach((pr, i) => {
        if (!pr) return;
        const card = document.createElement("div");
        card.className = "obj-item promo-item";

        const head = document.createElement("div");
        head.className = "obj-head";
        const title = document.createElement("span");
        title.className = "obj-title";
        title.textContent = (pr.name || "Акция #" + (i + 1));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "row-del";
        del.textContent = "✕";
        del.addEventListener("click", () => {
          promotions.splice(i, 1);
          draw();
        });
        head.append(title, del);
        card.append(head);

        const fields = document.createElement("div");
        fields.className = "obj-fields";
        const defs = [
          { key: "name", label: "Название" },
          { key: "description", label: "Описание" },
          { key: "banner", label: "Баннер (текст)" },
          { key: "value", label: "Значение (%, $ или боты)" },
          { key: "minBots", label: "Мин. ботов (пусто=нет)" },
          { key: "maxBots", label: "Макс. ботов (пусто=нет)" },
          { key: "startDate", label: "Дата начала (ГГГГ-ММ-ДД)" },
          { key: "endDate", label: "Дата конца (ГГГГ-ММ-ДД)" },
          { key: "usageLimit", label: "Лимит использований (пусто=∞)" },
          { key: "used", label: "Использовано" },
          { key: "periods", label: "Сроки (через запятую, пусто=все)" },
        ];
        defs.forEach((d) => {
          const fl = document.createElement("label");
          const sp = document.createElement("span");
          sp.textContent = d.label;
          fl.append(sp);
          const input = document.createElement("input");
          input.type = "text";
          input.value = pr[d.key] == null ? "" : String(pr[d.key]);
          input.addEventListener("input", () => { pr[d.key] = input.value; });
          fl.append(input);
          fields.append(fl);
        });

        const typeFl = document.createElement("label");
        const typeSp = document.createElement("span");
        typeSp.textContent = "Тип акции";
        typeFl.append(typeSp);
        const typeSel = document.createElement("select");
        [["percent", "Процентная скидка"], ["fixed", "Фиксированная скидка ($)"], ["bots-gift", "Подарок: +боты"]].forEach(([val, lbl]) => {
          const opt = document.createElement("option");
          opt.value = val;
          opt.textContent = lbl;
          if (pr.type === val) opt.selected = true;
          typeSel.append(opt);
        });
        typeSel.addEventListener("change", () => { pr.type = typeSel.value; });
        typeFl.append(typeSel);
        fields.append(typeFl);
        card.append(fields);
        table.append(card);
      });
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-btn";
    addBtn.textContent = "+ Добавить акцию";
    addBtn.addEventListener("click", () => {
      promotions.push({ name: "", description: "", banner: "", type: "percent", value: 10, appliesTo: {}, minBots: null, maxBots: null, startDate: "", endDate: "", usageLimit: null, used: 0 });
      draw();
    });
    wrap.append(addBtn);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Сохранить акции";
    saveBtn.addEventListener("click", async () => {
      const body = promotions.map((pr) => ({
        id: pr.id || ("promo-" + Math.random().toString(36).slice(2, 8)),
        name: pr.name || "",
        description: pr.description || "",
        banner: pr.banner || "",
        type: pr.type || "percent",
        value: parseFloat(pr.value) || 0,
        appliesTo: { ...(pr.appliesTo || {}), periods: String(pr.periods || "").split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x)) },
        minBots: pr.minBots === "" || pr.minBots == null ? null : parseInt(pr.minBots, 10),
        maxBots: pr.maxBots === "" || pr.maxBots == null ? null : parseInt(pr.maxBots, 10),
        startDate: pr.startDate || null,
        endDate: pr.endDate || null,
        usageLimit: pr.usageLimit === "" || pr.usageLimit == null ? null : parseInt(pr.usageLimit, 10),
        used: parseInt(pr.used, 10) || 0,
      }));
      const res = await api("/api/promotions", { method: "PUT", body: JSON.stringify(body) });
      if (res.status === 200 && res.data && res.data.ok) toast("Акции сохранены", "ok");
      else if (res.status === 401) { toast("Сессия истекла", "err"); }
      else toast((res.data && res.data.error) || "Ошибка сохранения", "err");
    });
    wrap.append(saveBtn);

    (async () => {
      const res = await api("/api/promotions?all=1");
      if (res.status === 200 && res.data && res.data.ok) {
        promotions = (res.data.promotions || []).map((pr) => ({
          ...pr,
          /* сервер хранит сроки в appliesTo.periods; для поля редактора
             держим строку вида «1,3,6» в pr.periods */
          periods: pr.appliesTo && Array.isArray(pr.appliesTo.periods) ? pr.appliesTo.periods.join(",") : "",
        }));
        draw();
      } else if (res.status === 401) {
        toast("Сессия истекла — войдите снова", "err");
      }
    })();
    return wrap;
  }

  /* --- Триалы --- */
  function renderTrials(wrap) {
    const table = document.createElement("div");
    table.className = "data-table-wrap";
    wrap.append(table);
    let trials = [];

    function draw() {
      table.textContent = "";
      if (!trials.length) {
        const empty = document.createElement("p");
        empty.className = "data-empty";
        empty.textContent = "Заявок пока нет";
        table.append(empty);
        return;
      }
      const tbl = document.createElement("table");
      tbl.className = "data-table";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Дата", "Альянс", "Лидер", "Telegram", "Реф-код", "Статус", "", ""].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.append(th);
      });
      thead.append(trh);
      tbl.append(thead);
      const tbody = document.createElement("tbody");
      trials.forEach((t, i) => {
        const tr = document.createElement("tr");
        const status = t.status === "approved" ? "✓ одобрен" : t.status === "rejected" ? "✕ отклонён" : "новая";
        [t.date ? t.date.slice(0, 10) : "", t.allianceName, t.leaderName, t.contactTelegram, t.referralCode || getReferralCodeLocal(t.allianceName), status].forEach((v) => {
          const td = document.createElement("td");
          td.textContent = v || "—";
          tr.append(td);
        });
        /* Одобрить / отклонить (только новые заявки) */
        const tdDecide = document.createElement("td");
        if (!t.status) {
          const ok = document.createElement("button");
          ok.type = "button";
          ok.className = "row-ok";
          ok.textContent = "✓";
          ok.title = "Одобрить";
          ok.addEventListener("click", () => decideTrial(t.id, "approve"));
          const no = document.createElement("button");
          no.type = "button";
          no.className = "row-del";
          no.textContent = "✕";
          no.title = "Отклонить";
          no.addEventListener("click", () => decideTrial(t.id, "reject"));
          tdDecide.append(ok, no);
        }
        tr.append(tdDecide);
        const tdDel = document.createElement("td");
        const del = document.createElement("button");
        del.type = "button";
        del.className = "row-del";
        del.textContent = "🗑";
        del.title = "Удалить";
        del.addEventListener("click", () => {
          trials.splice(i, 1);
          saveTrials();
        });
        tdDel.append(del);
        tr.append(tdDel);
        tbody.append(tr);
      });
      tbl.append(tbody);
      table.append(tbl);
    }

    async function decideTrial(id, decision) {
      const res = await api("/api/trials/decide", { method: "POST", body: JSON.stringify({ id, decision }) });
      if (res.status === 200 && res.data && res.data.ok) {
        toast(decision === "approve" ? "Триал одобрен" : "Триал отклонён", "ok");
        const refresh = await api("/api/trials");
        if (refresh.status === 200 && refresh.data && refresh.data.ok) {
          trials = refresh.data.items || [];
          draw();
        }
      } else if (res.status === 401) {
        toast("Сессия истекла — войдите снова", "err");
      } else {
        toast((res.data && res.data.error) || "Ошибка", "err");
      }
    }

    async function saveTrials() {
      const res = await api("/api/trials", { method: "PUT", body: JSON.stringify(trials) });
      if (res.status === 200 && res.data && res.data.ok) { toast("Триалы обновлены", "ok"); draw(); }
      else toast("Ошибка сохранения", "err");
    }

    (async () => {
      const res = await api("/api/trials");
      if (res.status === 200 && res.data && res.data.ok) {
        trials = res.data.items || [];
        draw();
      } else if (res.status === 401) {
        toast("Сессия истекла — войдите снова", "err");
      }
    })();
    return wrap;
  }

  function getReferralCodeLocal(allianceName) {
    return referralCodesCache[allianceName] || "";
  }

  /* --- Балансы --- */
  function renderBalances(wrap) {
    const table = document.createElement("div");
    table.className = "data-table-wrap";
    wrap.append(table);
    let balances = {};

    function draw() {
      table.textContent = "";
      const codes = Object.keys(balances);
      if (!codes.length) {
        const empty = document.createElement("p");
        empty.className = "data-empty";
        empty.textContent = "Балансов пока нет — они появятся после подтверждения первой покупки";
        table.append(empty);
        return;
      }
      const tbl = document.createElement("table");
      tbl.className = "data-table";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Код", "Альянс", "Бото-месяцы", "Кэшбэк, $", "Покупок", "Рефералов"].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.append(th);
      });
      thead.append(trh);
      tbl.append(thead);
      const tbody = document.createElement("tbody");
      codes.forEach((code) => {
        const b = balances[code] || {};
        const tr = document.createElement("tr");
        const tdCode = document.createElement("td");
        tdCode.className = "mono";
        tdCode.textContent = code;
        tr.append(tdCode);
        const tdName = document.createElement("td");
        tdName.textContent = b.name || "—";
        tr.append(tdName);
        const tdMonths = document.createElement("td");
        const inpMonths = document.createElement("input");
        inpMonths.type = "number";
        inpMonths.value = b.bonusMonths || 0;
        inpMonths.addEventListener("input", () => { b.bonusMonths = parseInt(inpMonths.value, 10) || 0; });
        tdMonths.append(inpMonths);
        tr.append(tdMonths);
        const tdCash = document.createElement("td");
        const inpCash = document.createElement("input");
        inpCash.type = "number";
        inpCash.step = "0.01";
        inpCash.value = ((b.cashbackCents || 0) / 100).toFixed(2);
        inpCash.addEventListener("input", () => { b.cashbackCents = Math.round((parseFloat(inpCash.value) || 0) * 100); });
        tdCash.append(inpCash);
        tr.append(tdCash);
        const tdP = document.createElement("td");
        tdP.textContent = (b.purchases || []).length;
        tr.append(tdP);
        const tdR = document.createElement("td");
        tdR.textContent = (b.referrals || []).length;
        tr.append(tdR);
        tbody.append(tr);
      });
      tbl.append(tbody);
      table.append(tbl);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Сохранить балансы";
    saveBtn.addEventListener("click", async () => {
      const res = await api("/api/balances", { method: "PUT", body: JSON.stringify(balances) });
      if (res.status === 200 && res.data && res.data.ok) toast("Балансы сохранены", "ok");
      else if (res.status === 401) { toast("Сессия истекла", "err"); }
      else toast((res.data && res.data.error) || "Ошибка сохранения", "err");
    });
    wrap.append(saveBtn);

    (async () => {
      const res = await api("/api/balances");
      if (res.status === 200 && res.data && res.data.ok) {
        balances = res.data.balances || {};
        draw();
      } else if (res.status === 401) {
        toast("Сессия истекла — войдите снова", "err");
      }
    })();
    return wrap;
  }

  /* --- Рефералы --- */
  const referralCodesCache = {};

  function renderReferrals(wrap) {
    const form = document.createElement("div");
    form.className = "mini-form";
    form.innerHTML = "<h3>Сгенерировать код альянса</h3>";
    const genRow = document.createElement("div");
    genRow.className = "mini-form-row";
    const genInput = document.createElement("input");
    genInput.type = "text";
    genInput.placeholder = "Название альянса";
    const genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.className = "btn btn-primary";
    genBtn.textContent = "Сгенерировать";
    genBtn.addEventListener("click", async () => {
      const name = genInput.value.trim();
      if (!name) return;
      const res = await api("/api/referral/generate", { method: "POST", body: JSON.stringify({ allianceName: name }) });
      if (res.status === 200 && res.data && res.data.ok) {
        toast("Код: " + res.data.referralCode, "ok");
        loadReferrals();
      } else toast((res.data && res.data.error) || "Ошибка", "err");
    });
    genRow.append(genInput, genBtn);
    form.append(genRow);

    const purForm = document.createElement("div");
    purForm.className = "mini-form";
    purForm.innerHTML = "<h3>Подтвердить покупку (кэшбэк + реферальный бонус)</h3>";
    const purInputs = [
      { id: "pAllianceCode", ph: "Код альянса-покупателя" },
      { id: "pAllianceName", ph: "Название альянса" },
      { id: "pBots", ph: "Ботов (число)" },
      { id: "pMonths", ph: "Срок, мес (число)" },
      { id: "pPrice", ph: "Сумма, $" },
      { id: "pRefCode", ph: "Реф-код пригласившего (опц.)" },
    ];
    const purRow = document.createElement("div");
    purRow.className = "mini-form-grid";
    const purRefs = {};
    purInputs.forEach((f) => {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = f.ph;
      purRefs[f.id] = inp;
      purRow.append(inp);
    });
    const purBtn = document.createElement("button");
    purBtn.type = "button";
    purBtn.className = "btn btn-primary";
    purBtn.textContent = "Провести покупку";
    purBtn.addEventListener("click", async () => {
      const body = {
        allianceCode: purRefs.pAllianceCode.value.trim().toUpperCase(),
        allianceName: purRefs.pAllianceName.value.trim(),
        botsCount: parseInt(purRefs.pBots.value, 10) || 0,
        periodMonths: parseInt(purRefs.pMonths.value, 10) || 1,
        totalPriceUsd: parseFloat(purRefs.pPrice.value) || 0,
        referralCode: purRefs.pRefCode.value.trim().toUpperCase() || null,
      };
      const res = await api("/api/purchase", { method: "POST", body: JSON.stringify(body) });
      if (res.status === 200 && res.data && res.data.ok) {
        let msg = "Покупка проведена. Кэшбэк: " + (res.data.cashbackMonths || 0) + " мес.";
        if (res.data.referralAward) {
          msg += " | Рефереру: +" + res.data.referralAward.bonusMonths + " мес, $" + ((res.data.referralAward.cashbackCents || 0) / 100).toFixed(2);
        }
        toast(msg, "ok");
        loadReferrals();
      } else toast((res.data && res.data.error) || "Ошибка", "err");
    });
    purForm.append(purRow, purBtn);

    const list = document.createElement("div");
    list.className = "data-table-wrap";

    async function loadReferrals() {
      const res = await api("/api/referrals");
      if (res.status !== 200 || !res.data || !res.data.ok) {
        if (res.status === 401) toast("Сессия истекла — войдите снова", "err");
        return;
      }
      Object.keys(referralCodesCache).forEach((k) => delete referralCodesCache[k]);
      const codes = res.data.codes || {};
      Object.entries(codes).forEach(([code, meta]) => { referralCodesCache[meta && meta.allianceName] = code; });

      list.textContent = "";
      const codesH = document.createElement("h3");
      codesH.textContent = "Коды альянсов";
      list.append(codesH);
      if (Object.keys(codes).length) {
        const tbl = document.createElement("table");
        tbl.className = "data-table";
        const tbody = document.createElement("tbody");
        Object.entries(codes).forEach(([code, meta]) => {
          const tr = document.createElement("tr");
          const td1 = document.createElement("td");
          td1.className = "mono";
          td1.textContent = code;
          const td2 = document.createElement("td");
          td2.textContent = (meta && meta.allianceName) || "—";
          tr.append(td1, td2);
          tbody.append(tr);
        });
        tbl.append(tbody);
        list.append(tbl);
      }

      const links = res.data.links || [];
      const linksH = document.createElement("h3");
      linksH.textContent = "Связи (кто кого привёл) — " + links.length;
      list.append(linksH);
      if (links.length) {
        const tbl2 = document.createElement("table");
        tbl2.className = "data-table";
        const thead = document.createElement("thead");
        const trh = document.createElement("tr");
        ["Реферер", "Покупатель", "Ботов", "Месяцев", "Сумма, $"].forEach((h) => {
          const th = document.createElement("th");
          th.textContent = h;
          trh.append(th);
        });
        thead.append(trh);
        tbl2.append(thead);
        const tbody2 = document.createElement("tbody");
        links.forEach((l) => {
          const tr = document.createElement("tr");
          [l.referrerCode, l.buyerAlliance || l.buyer || "—", l.bots, l.months, l.priceUsd].forEach((v) => {
            const td = document.createElement("td");
            td.textContent = v == null ? "—" : String(v);
            tr.append(td);
          });
          tbody2.append(tr);
        });
        tbl2.append(tbody2);
        list.append(tbl2);
      }
    }

    wrap.append(form, purForm, list);
    loadReferrals();
    return wrap;
  }

  /* --- Пользователи --- */
  function renderUsers(wrap) {
    const table = document.createElement("div");
    table.className = "data-table-wrap";
    wrap.append(table);

    async function load() {
      const res = await api("/api/users");
      if (res.status !== 200 || !res.data || !res.data.ok) {
        if (res.status === 401) toast("Сессия истекла — войдите снова", "err");
        return;
      }
      const users = res.data.users || [];
      table.textContent = "";
      if (!users.length) {
        const empty = document.createElement("p");
        empty.className = "data-empty";
        empty.textContent = "Пользователей пока нет";
        table.append(empty);
        return;
      }
      const tbl = document.createElement("table");
      tbl.className = "data-table";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Email", "Альянс", "Код", "Реф-код", "Бото-мес.", "Кэшбэк, $", "Покупок", "Регистрация"].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.append(th);
      });
      thead.append(trh);
      tbl.append(thead);
      const tbody = document.createElement("tbody");
      users.forEach((u) => {
        const tr = document.createElement("tr");
        const cells = [
          u.email || "—",
          u.allianceName || "—",
          u.allianceCode || "—",
          u.referralCode || "—",
          (u.balance && u.balance.bonusMonths) || 0,
          "$" + (((u.balance && u.balance.cashbackCents) || 0) / 100).toFixed(2),
          ((u.balance && u.balance.purchases) || []).length,
          u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "—",
        ];
        cells.forEach((v, i) => {
          const td = document.createElement("td");
          td.textContent = String(v);
          if (i === 2 || i === 3) td.className = "mono";
          tr.append(td);
        });
        tbody.append(tr);
      });
      tbl.append(tbody);
      table.append(tbl);
    }
    load();
    return wrap;
  }

  /* --- Заявки на списание бонусов --- */
  function renderBonusRequests(wrap) {
    const table = document.createElement("div");
    table.className = "data-table-wrap";
    wrap.append(table);

    const STATUS = { new: "Новая", approved: "Одобрена", rejected: "Отклонена" };

    async function load() {
      const res = await api("/api/bonus-requests");
      if (res.status !== 200 || !res.data || !res.data.ok) {
        if (res.status === 401) toast("Сессия истекла — войдите снова", "err");
        return;
      }
      const items = res.data.items || [];
      table.textContent = "";
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "data-empty";
        empty.textContent = "Заявок пока нет";
        table.append(empty);
        return;
      }
      const tbl = document.createElement("table");
      tbl.className = "data-table";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Дата", "Альянс", "Email", "Пакет", "Бонусы", "Статус", "Действия"].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.append(th);
      });
      thead.append(trh);
      tbl.append(thead);
      const tbody = document.createElement("tbody");
      items.forEach((r) => {
        const tr = document.createElement("tr");
        const cells = [
          (r.date || "").slice(0, 10),
          r.allianceName || "—",
          r.email || "—",
          r.botsCount + " ботов × " + r.months + " мес",
          r.useBonusMonths ? "да (баланс " + (r.bonusBalance || 0) + " мес)" : "нет",
          STATUS[r.status] || r.status,
        ];
        cells.forEach((v) => {
          const td = document.createElement("td");
          td.textContent = String(v);
          tr.append(td);
        });
        const tdAct = document.createElement("td");
        if (r.status === "new") {
          const okBtn = document.createElement("button");
          okBtn.type = "button";
          okBtn.className = "btn btn-primary";
          okBtn.textContent = "Одобрить";
          okBtn.addEventListener("click", async () => {
            const d = await api("/api/bonus-requests/decide", { method: "POST", body: JSON.stringify({ id: r.id, decision: "approve" }) });
            if (d.status === 200 && d.data && d.data.ok) { toast("Заявка одобрена — бонусы списаны", "ok"); load(); }
            else toast((d.data && d.data.error) || "Ошибка", "err");
          });
          const noBtn = document.createElement("button");
          noBtn.type = "button";
          noBtn.className = "row-del";
          noBtn.textContent = "Отклонить";
          noBtn.addEventListener("click", async () => {
            const d = await api("/api/bonus-requests/decide", { method: "POST", body: JSON.stringify({ id: r.id, decision: "reject" }) });
            if (d.status === 200 && d.data && d.data.ok) { toast("Заявка отклонена", "ok"); load(); }
            else toast((d.data && d.data.error) || "Ошибка", "err");
          });
          tdAct.append(okBtn, noBtn);
          tdAct.style.display = "flex";
          tdAct.style.gap = "8px";
        } else {
          tdAct.textContent = "—";
        }
        tr.append(tdAct);
        tbody.append(tr);
      });
      tbl.append(tbody);
      table.append(tbl);
    }
    load();
    return wrap;
  }

  /* ---------- Старт: проверяем, авторизованы ли уже ---------- */
  (async () => {
    try {
      const res = await api("/api/status");
      if (res.status === 200 && res.data && res.data.authed) {
        enterDashboard();
      }
    } catch {
      /* сервер недоступен — остаёмся на форме входа */
    }
  })();
})();
