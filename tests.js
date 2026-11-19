"use strict";
// Встроенные средства Node.js — внешние библиотеки не нужны.
const assert = require("node:assert/strict");
const { parseMeasurement, calculateBMI, classifyBMI, markerPosition } = require("./script.js");
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`OK: ${name}`); }
test("170 см, 65 кг → 22,4913…", () => assert.ok(Math.abs(calculateBMI(170, 65) - 22.49134948096886) < 1e-10));
test("200 см, 100 кг → 25", () => assert.equal(calculateBMI(200, 100), 25));
for (const [bmi, key] of [[16,"underweight"],[18.4999,"underweight"],[18.5,"normal"],[24.9999,"normal"],[25,"overweight"],[29.9999,"overweight"],[30,"obesity"],[40,"obesity"]]) {
  test(`Категория для ${bmi}: ${key}`, () => assert.equal(classifyBMI(bmi).key, key));
}
for (const value of ["65,5", "65.5", " 65,5 "]) test(`Дробное число «${value}»`, () => assert.equal(parseMeasurement(value,"вес",20,500,"кг"),65.5));
for (const value of ["", " ", "abc", "65кг", "1e2", "0", "-5", "Infinity", "65,5.2", "19.99", "500.01"]) {
  test(`Отклонён неверный вес «${value}»`, () => assert.throws(() => parseMeasurement(value,"вес",20,500,"кг")));
}
for (const height of [100,250]) test(`Допустимый рост ${height}`, () => assert.equal(parseMeasurement(String(height),"рост",100,250,"см"),height));
for (const weight of [20,500]) test(`Допустимый вес ${weight}`, () => assert.equal(parseMeasurement(String(weight),"вес",20,500,"кг"),weight));
for (const height of [99,251]) test(`Рост ${height} вне границ`, () => assert.throws(() => parseMeasurement(String(height),"рост",100,250,"см")));
test("Шкала: границы и середина", () => { assert.equal(markerPosition(10),0); assert.equal(markerPosition(40),100); assert.equal(markerPosition(60),100); assert.equal(markerPosition(28),50); });
test("Неверные числа в расчёте", () => { for (const x of [0,-1,NaN,Infinity]) assert.throws(() => calculateBMI(x,65)); });
test("Неверный ИМТ", () => { for (const x of [0,-1,NaN,Infinity]) assert.throws(() => classifyBMI(x)); });
const { HISTORY_KEY, THEME_KEY, HISTORY_LIMIT, resolveTheme, decodeHistory, createHistoryStore, chartGeometry } = require("./dashboard.js");
function memoryStorage() {
  const data = new Map();
  return { getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key) };
}
const entry = (id = "one", height = 170, weight = 65) => ({ id, date:"2026-11-19T06:00:00.000Z", height, weight });
test("Пустое хранилище", () => assert.deepEqual(createHistoryStore(memoryStorage()).entries, []));
test("Расчёт сохраняется и восстанавливается в новом сеансе", () => {
  const storage = memoryStorage();
  createHistoryStore(storage).add(entry());
  const restored = createHistoryStore(storage).entries;
  assert.deepEqual(restored, [entry()]);
  assert.equal(classifyBMI(calculateBMI(restored[0].height,restored[0].weight)).key,"normal");
});
test("Повреждённый JSON не ломает историю", () => { for (const raw of [null,"{broken",'{}','"text"']) assert.deepEqual(decodeHistory(raw),[]); });
test("Повреждённые записи отбрасываются, корректные остаются", () => {
  const rows = [null,entry(),entry("two",0),entry("three",170,501),{...entry("four"),date:"bad"},{...entry("five"),weight:"65"}];
  assert.deepEqual(decodeHistory(JSON.stringify(rows)),[entry()]);
});
test("Дубли идентификаторов не создают повторные точки", () => assert.equal(decodeHistory(JSON.stringify([entry(),entry()])).length,1));
test("Сохранённое поддельное значение ИМТ не используется", () => assert.deepEqual(decodeHistory(JSON.stringify([{...entry(),bmi:999}])),[entry()]));
test("Сохраняются последние 50 записей", () => {
  const store = createHistoryStore(memoryStorage());
  for (let i=0;i<55;i++) store.add(entry(String(i)));
  assert.equal(store.entries.length,HISTORY_LIMIT);
  assert.equal(store.entries[0].id,"5");
  assert.equal(store.entries.at(-1).id,"54");
});
test("Удаление одной записи сохраняет остальные после перезапуска", () => {
  const storage = memoryStorage(); const store = createHistoryStore(storage);
  store.add(entry("a")); store.add(entry("b"));
  assert.equal(store.remove("a"),true);
  assert.deepEqual(createHistoryStore(storage).entries,[entry("b")]);
});
test("Полное удаление истории не затрагивает тему и чужие ключи", () => {
  const storage = memoryStorage(); storage.setItem(THEME_KEY,"dark"); storage.setItem("other-app","data");
  const store = createHistoryStore(storage); store.add(entry());
  assert.equal(store.clear(),true);
  assert.equal(storage.getItem(HISTORY_KEY),null);
  assert.equal(storage.getItem(THEME_KEY),"dark");
  assert.equal(storage.getItem("other-app"),"data");
  assert.deepEqual(createHistoryStore(storage).entries,[]);
});
test("История защищена от изменения через полученный массив", () => {
  const store = createHistoryStore(memoryStorage()); store.add(entry());
  store.entries[0].weight = 500;
  assert.equal(store.entries[0].weight,65);
});
test("Запрещённое хранилище: расчёты доступны в текущем сеансе", () => {
  const fail = () => { throw new Error("SecurityError"); };
  const store = createHistoryStore({getItem:fail,setItem:fail,removeItem:fail});
  assert.equal(store.available,false); assert.equal(store.add(entry()),false);
  assert.deepEqual(store.entries,[entry()]);
});
test("Ошибка удаления не выдаётся за успешное удаление", () => {
  const storage = memoryStorage(); const store = createHistoryStore(storage); store.add(entry());
  storage.removeItem = () => { throw new Error("blocked"); };
  storage.setItem = () => { throw new Error("quota"); };
  assert.equal(store.clear(),false); assert.equal(store.remove("one"),false);
  assert.deepEqual(store.entries,[entry()]);
});
test("Переполнение хранилища сохраняет расчёт в памяти", () => {
  const storage = memoryStorage(); const store = createHistoryStore(storage);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.equal(store.add(entry()),false); assert.equal(store.entries.length,1);
});
test("Одна точка графика находится в центре, координаты конечны", () => {
  const g = chartGeometry([22.49]); assert.equal(g.x(0),380); assert.ok(Number.isFinite(g.y(22.49)));
});
test("График охватывает крайние допустимые ИМТ без обрезания", () => {
  const values = [calculateBMI(250,20),calculateBMI(100,500)]; const g = chartGeometry(values);
  for(const value of values) assert.ok(g.y(value)>24 && g.y(value)<232);
  assert.equal(g.x(0),60); assert.equal(g.x(1),700);
});
test("Границы цветных полос графика расположены правильно", () => {
  const g = chartGeometry([22.49]); assert.ok(g.y(18.5)>g.y(25)); assert.ok(g.y(25)>g.y(30));
});
test("График с 50 записями оставляет место для выбора точек", () => {
  const values = Array(50).fill(22); const g = chartGeometry(values,1680);
  assert.ok(g.x(1)-g.x(0)>=32); assert.equal(g.x(49),1660);
});
test("Выбранная светлая тема имеет приоритет над системной", () => assert.equal(resolveTheme("light",true),false));
test("Выбранная тёмная тема имеет приоритет над системной", () => assert.equal(resolveTheme("dark",false),true));
test("Без сохранённой темы используется системная", () => { assert.equal(resolveTheme(null,true),true); assert.equal(resolveTheme(null,false),false); });
test("Повреждённая настройка темы заменяется системной", () => assert.equal(resolveTheme("invalid",true),true));
test("Изменения другой вкладки читаются без сброса формы", () => {
  const storage = memoryStorage(); const first = createHistoryStore(storage); const second = createHistoryStore(storage);
  first.add(entry()); assert.equal(second.refresh(),true); assert.deepEqual(second.entries,[entry()]);
  first.clear(); second.refresh(); assert.deepEqual(second.entries,[]);
});
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
test("Идентификаторы HTML уникальны", () => assert.equal(ids.length,new Set(ids).size));
test("Скрипты подключены, используемые элементы существуют", () => {
  for(const file of ["script.js","dashboard.js"]) {
    assert.ok(html.includes(`src="${file}" defer`));
    const source = fs.readFileSync(path.join(__dirname,file),"utf8");
    for(const match of source.matchAll(/getElementById\("([^"]+)"\)/g)) assert.ok(ids.includes(match[1]),`Отсутствует ${match[1]}`);
  }
});
console.log(`\nПроверок пройдено: ${checks}`);
require("./tests-contrast.js");
require("./tests-static.js");
