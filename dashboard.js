"use strict";

const HISTORY_KEY = "balance.bmi.history.v1";
const THEME_KEY = "balance.theme.v1";
const HISTORY_LIMIT = 50;

function resolveTheme(saved, systemDark) {
  return saved === "dark" || (saved !== "light" && Boolean(systemDark));
}

// Любые данные из браузерного хранилища проверяем перед использованием.
function decodeHistory(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = new Set();
    return parsed.filter(row => {
      if (!row || typeof row.id !== "string" || !row.id || row.id.length > 100 || ids.has(row.id) ||
          typeof row.date !== "string" || !Number.isFinite(Date.parse(row.date)) ||
          !Number.isFinite(row.height) || row.height < 100 || row.height > 250 ||
          !Number.isFinite(row.weight) || row.weight < 20 || row.weight > 500) return false;
      ids.add(row.id);
      return true;
    }).slice(-HISTORY_LIMIT).map(({ id, date, height, weight }) => ({ id, date, height, weight }));
  } catch { return []; }
}

function createHistoryStore(storage) {
  let entries = [];
  let available = true;
  try { entries = decodeHistory(storage.getItem(HISTORY_KEY)); } catch { available = false; }
  return {
    get entries() { return entries.map(row => ({ ...row })); },
    get available() { return available; },
    refresh() {
      try { entries = decodeHistory(storage.getItem(HISTORY_KEY)); available = true; return true; }
      catch { available = false; return false; }
    },
    add(entry) {
      const next = decodeHistory(JSON.stringify([...entries, entry]));
      // При запрете записи новый расчёт всё равно доступен в текущем сеансе.
      entries = next;
      try { storage.setItem(HISTORY_KEY, JSON.stringify(next)); available = true; return true; }
      catch { available = false; return false; }
    },
    remove(id) {
      const next = entries.filter(row => row.id !== id);
      try { storage.setItem(HISTORY_KEY, JSON.stringify(next)); entries = next; available = true; return true; }
      catch { available = false; return false; }
    },
    clear() {
      try { storage.removeItem(HISTORY_KEY); entries = []; available = true; return true; }
      catch { available = false; return false; }
    }
  };
}

function chartGeometry(values, width = 720) {
  const min = Math.min(16, ...values) - 2;
  const max = Math.max(40, ...values) + 2;
  return {
    min, max,
    y: value => 232 - (value - min) / (max - min) * 208,
    x: index => values.length < 2 ? (width + 40) / 2 : 60 + index / (values.length - 1) * (width - 80)
  };
}

if (typeof document !== "undefined") {
  const storage = {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key)
  };
  const store = createHistoryStore(storage);
  const toggle = document.getElementById("theme-toggle");
  const status = document.getElementById("storage-status");
  let savedTheme;
  try { savedTheme = storage.getItem(THEME_KEY); } catch { /* Тема работает и без хранилища. */ }
  let dark = resolveTheme(savedTheme, window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  function applyTheme() {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    toggle.setAttribute("aria-pressed", String(Boolean(dark)));
    toggle.textContent = dark ? "Светлая тема" : "Тёмная тема";
    toggle.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
  }
  applyTheme();
  toggle.addEventListener("click", () => {
    dark = !dark;
    applyTheme();
    try { storage.setItem(THEME_KEY, dark ? "dark" : "light"); }
    catch { status.textContent = "Тема изменена, но браузер не разрешил её сохранить."; }
  });

  const chart = document.getElementById("bmi-chart");
  const list = document.getElementById("history-list");
  const clearButton = document.getElementById("clear-history");
  const confirmation = document.getElementById("delete-confirmation");
  const detail = document.getElementById("chart-detail");
  let selectedId = null;
  const number = value => value.toLocaleString("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const date = value => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function summary(row) {
    const bmi = calculateBMI(row.height, row.weight);
    return `${date(row.date)} · ${row.height} см · ${row.weight} кг · ИМТ ${number(bmi)} · ${classifyBMI(bmi).title}`;
  }
  function select(row) {
    selectedId = row.id;
    detail.textContent = summary(row);
    chart.querySelectorAll(".chart-point").forEach(point => {
      const active = point.dataset.id === row.id;
      point.classList.toggle("selected", active);
      point.setAttribute("aria-pressed", String(active));
    });
    list.querySelectorAll(".history-entry").forEach(item => item.classList.toggle("selected", item.dataset.id === row.id));
  }
  function svgElement(tag, attributes, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    chart.append(node);
    return node;
  }
  function render() {
    const entries = store.entries;
    const hasEntries = entries.length > 0;
    document.getElementById("history-empty").hidden = hasEntries;
    document.getElementById("history-content").hidden = !hasEntries;
    clearButton.disabled = !hasEntries;
    chart.querySelectorAll(".chart-drawing").forEach(node => node.remove());
    list.replaceChildren();
    if (!hasEntries) { selectedId = null; detail.textContent = "Выберите точку графика."; return; }
    const values = entries.map(row => calculateBMI(row.height, row.weight));
    const width = Math.max(720, entries.length * 32 + 80);
    chart.setAttribute("viewBox", `0 0 ${width} 280`);
    chart.style.minWidth = `${width}px`;
    const geometry = chartGeometry(values, width);
    const draw = (tag, attrs, text) => svgElement(tag, { ...attrs, class: `chart-drawing ${attrs.class || ""}` }, text);
    const bands = [[geometry.min,18.5,"underweight"],[18.5,25,"normal"],[25,30,"overweight"],[30,geometry.max,"obesity"]];
    bands.forEach(([low, high, category]) => draw("rect", { x:60, y:geometry.y(high), width:width-80, height:geometry.y(low)-geometry.y(high), class:`chart-band ${category}` }));
    [geometry.min,18.5,25,30,geometry.max].forEach(value => {
      draw("line", { x1:60, x2:width-20, y1:geometry.y(value), y2:geometry.y(value), class:"chart-grid" });
      draw("text", { x:50, y:geometry.y(value)+4, "text-anchor":"end", class:"chart-label" }, value.toLocaleString("ru-RU", { maximumFractionDigits:1 }));
    });
    draw("polyline", { points:values.map((value, index) => `${geometry.x(index)},${geometry.y(value)}`).join(" "), class:"chart-line" });
    entries.forEach((row, index) => {
      const point = draw("circle", { cx:geometry.x(index), cy:geometry.y(values[index]), r:9, class:"chart-point", tabindex:0, role:"button", "aria-label":summary(row), "aria-pressed":"false", "data-id":row.id });
      point.addEventListener("click", () => select(row));
      point.addEventListener("focus", () => select(row));
      point.addEventListener("pointerenter", () => select(row));
      point.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(row); } });
    });
    draw("text", { x:60, y:263, class:"chart-label" }, `Первый: ${date(entries[0].date)}`);
    if (entries.length > 1) draw("text", { x:width-20, y:263, "text-anchor":"end", class:"chart-label" }, `Последний: ${date(entries.at(-1).date)}`);
    [...entries].reverse().forEach(row => {
      const item = document.createElement("li");
      item.className = "history-entry";
      item.dataset.id = row.id;
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "history-select";
      const title = document.createElement("strong");
      title.textContent = `ИМТ ${number(calculateBMI(row.height, row.weight))} · ${classifyBMI(calculateBMI(row.height, row.weight)).title}`;
      const subtitle = document.createElement("span");
      subtitle.textContent = `${date(row.date)} · ${row.height} см · ${row.weight} кг`;
      choose.append(title, subtitle);
      choose.addEventListener("click", () => select(row));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button danger";
      remove.textContent = "Удалить";
      remove.setAttribute("aria-label", `Удалить расчёт от ${date(row.date)}`);
      remove.addEventListener("click", () => {
        if (store.remove(row.id)) {
          status.textContent = "Расчёт удалён.";
          render();
          const next = list.querySelector("button");
          (next || document.getElementById("height")).focus();
        } else status.textContent = "Не удалось удалить запись из хранилища. Браузер запретил доступ; история оставлена без изменений.";
      });
      item.append(choose, remove);
      list.append(item);
    });
    select(entries.find(row => row.id === selectedId) || entries.at(-1));
  }
  document.addEventListener("bmi-calculated", event => {
    const { height, weight } = event.detail;
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    selectedId = id;
    const saved = store.add({ id, date:new Date().toISOString(), height, weight });
    status.textContent = saved ? "Расчёт сохранён в этом браузере." : "Расчёт показан, но не сохранён: браузер запретил запись или хранилище заполнено. Новые данные доступны до закрытия страницы.";
    render();
  });
  clearButton.addEventListener("click", () => { confirmation.hidden = false; document.getElementById("cancel-clear").focus(); });
  document.getElementById("cancel-clear").addEventListener("click", () => { confirmation.hidden = true; clearButton.focus(); });
  document.getElementById("confirm-clear").addEventListener("click", () => {
    if (store.clear()) {
      confirmation.hidden = true;
      status.textContent = "Вся история удалена. Настройка темы сохранена.";
      render();
      document.getElementById("height").focus();
    } else status.textContent = "Не удалось удалить историю из хранилища. Проверьте разрешения браузера и попробуйте снова. История оставлена без изменений.";
  });
  window.addEventListener("storage", event => {
    if (event.key === HISTORY_KEY || event.key === null) {
      // Не перезаписываем изменения другой вкладки устаревшими данными.
      if (store.refresh()) {
        confirmation.hidden = true;
        render();
        status.textContent = "История обновлена из другой вкладки.";
      } else status.textContent = "Не удалось обновить историю из хранилища браузера.";
    }
  });
  render();
  if (!store.available) status.textContent = "Хранилище браузера недоступно. Расчёт работает; новые записи доступны только в текущем сеансе.";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HISTORY_KEY, THEME_KEY, HISTORY_LIMIT, resolveTheme, decodeHistory, createHistoryStore, chartGeometry };
}
