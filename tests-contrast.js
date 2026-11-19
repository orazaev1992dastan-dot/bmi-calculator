"use strict";

// Контраст по формуле относительной яркости WCAG, без внешних библиотек.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const blocks = [...css.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g)];
assert.equal(blocks.length, 2, "Должны существовать ровно две централизованные палитры");
function variables(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]+)\s*;/gi)].map(match => [match[1], match[2]]));
}
const light = variables(blocks[0][1]);
const dark = { ...light, ...variables(blocks[1][1]) };
function rgb(hex) {
  return hex.slice(1).match(/../g).slice(0, 3).map(channel => parseInt(channel, 16) / 255);
}
function luminance(color) {
  const channels = rgb(color).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function blend(front, back, opacity) {
  const a = rgb(front), b = rgb(back);
  return "#" + a.map((value, index) => Math.round((value * opacity + b[index] * (1 - opacity)) * 255).toString(16).padStart(2, "0")).join("");
}
let checks = 0;
const report = [];
for (const [name, palette] of [["Светлая", light], ["Тёмная", dark]]) {
  let minimumText = Infinity;
  const check = (foreground, background, required, label) => {
    const value = contrast(palette[foreground], palette[background]);
    assert.ok(value >= required, `${name}: ${label}: ${value.toFixed(3)} < ${required}`);
    if (required === 4.5) minimumText = Math.min(minimumText, value);
    checks++;
  };
  // Заголовки, логотип, подписи полей, карточки, подсказки, список, ссылки.
  for (const background of ["--page", "--surface", "--soft", "--field"]) {
    for (const foreground of ["--text", "--muted", "--teal"]) {
      check(foreground, background, 4.5, `${foreground} на ${background}`);
    }
  }
  check("--placeholder", "--field", 4.5, "подсказка внутри поля");
  for (const state of ["--primary", "--primary-hover", "--primary-active"]) {
    check("--on-primary", state, 4.5, `текст основной кнопки ${state}`);
  }
  for (const background of ["--surface", "--soft"]) {
    check("--error", background, 4.5, "ошибки и кнопки удаления");
    for (const category of ["underweight", "normal", "overweight", "obesity"]) {
      check(`--category-${category}`, background, 4.5, `результат ${category}`);
    }
  }
  for (const background of ["--surface", "--field", "--soft"]) {
    check("--control-border", background, 3, "границы элементов управления");
    check("--focus", background, 3, "фокус клавиатуры");
  }
  check("--focus", "--page", 3, "фокус ссылки на фоне страницы");
  for (const band of ["--blue", "--green", "--amber", "--coral"]) {
    const background = blend(palette[band], palette["--surface"], 0.13);
    assert.ok(contrast(palette["--teal"], background) >= 3, `${name}: линия графика на полосе ${band}`);
    checks++;
  }
  report.push(`${name} тема: минимальный контраст проверенного текста ${minimumText.toFixed(2)}:1`);
}

// Регрессия исходной ошибки: :root больше не задаёт постоянный цвет текста.
assert.match(blocks[0][1], /(?:^|;)\s*color\s*:\s*var\(--text\)/);
assert.match(css, /body, h1, h2, h3, label, \.brand, \.card\s*\{\s*color:\s*var\(--text\)/);
const rules = css.replace(/:root(?:\[data-theme="dark"\])?\s*\{[^}]+\}/g, "");
assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rules), "Цвета должны находиться в палитре, а не в отдельных правилах");
const script = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
assert.ok(!/\.style\.color\s*=/.test(script), "JavaScript не должен перебивать тему встроенным цветом");
checks += 4;
console.log(report.join("\n"));
console.log(`Проверок контраста и регрессий: ${checks}`);
