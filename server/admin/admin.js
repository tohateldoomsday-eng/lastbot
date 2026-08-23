/* ============================================================
   LASTBOT Admin — редактор контента
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
      id: "why", label: "Преимущества", desc: "Блок «Почему мы»",
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
      id: "features", label: "Функции", desc: "Bento-сетка функций ботов",
      fields: [
        { path: "features.heading", label: "Заголовок блока", type: "text" },
        { path: "features.sub", label: "Подзаголовок", type: "text" },
        {
          path: "features.items", label: "Функции", type: "objects",
          spec: [
            { key: "tag", label: "Бейдж (TOP / 24/7 / AI / …)", type: "text" },
            { key: "title", label: "Заголовок", type: "text" },
            { key: "text", label: "Описание", type: "textarea" },
          ],
        },
      ],
    },
    {
      id: "pricing", label: "Тарифы", desc: "Три тарифа и примечание об оплате",
      fields: [
        { path: "pricing.heading", label: "Заголовок блока", type: "text" },
        { path: "pricing.sub", label: "Подзаголовок", type: "text" },
        { path: "pricing.note", label: "Примечание об автопродлении", type: "textarea" },
        {
          path: "pricing.tiers", label: "Тарифы", type: "objects",
          spec: [
            { key: "name", label: "Название", type: "text" },
            { key: "bots", label: "Количество ботов", type: "text" },
            { key: "price", label: "Цена", type: "text" },
            { key: "features", label: "Пункты тарифа", type: "list" },
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
      id: "codes", label: "Промокоды", desc: "Вкладка «Промокоды»",
      fields: [
        {
          path: "codes.items", label: "Промокоды", type: "objects",
          spec: [
            { key: "code", label: "Код", type: "text" },
            { key: "reward", label: "Награда", type: "text" },
            { key: "expires", label: "Срок действия", type: "text" },
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
      id: "menu", label: "Меню", desc: "Ссылки в верхнем меню сайта",
      fields: [
        { path: "dashboard.url", label: "Ссылка кнопки «Дашборд» (кнопка всегда в меню)", type: "text", saveEmpty: true },
      ],
    },
  ];

  /* ---------- Работа с путями ---------- */
  function getPath(obj, path) {
    return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  /* ---------- API ---------- */
  async function api(url, options) {
    // таймаут: вместо «вечного» зависания — понятная ошибка
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
    // любая ошибка после входа становится ВИДИМОЙ в строке статуса
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

  function renderTabs(content) {
    const nav = $("#tabNav");
    const panels = $("#tabPanels");
    nav.textContent = "";
    panels.textContent = "";

    SCHEMA.forEach((section, si) => {
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
      p.textContent = section.desc || "";
      head.append(h2, p);
      panel.append(head);

      section.fields.forEach((field) => {
        panel.append(renderField(field, getPath(content, field.path)));
      });
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
    // важно: ищем только ПРЯМЫХ детей .field, чтобы вложенные input
    // объектных карточек не путались с текстовыми полями
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
  // оборачиваем objectsEditor: регистрируем items в objectState
  const _origObjectsEditor = objectsEditor;
  objectsEditor = function (path, items, spec) {
    objectState.set(path, items);
    return _origObjectsEditor(path, items, spec);
  };

  /* ---------- Сохранение ---------- */
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
