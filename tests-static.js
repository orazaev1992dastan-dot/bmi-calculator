"use strict";

// Проверки статического сайта и запуск браузерных скриптов в модели DOM.
// Нужен только Node.js для тестов; HTTP-сервер не создаётся.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const css = fs.readFileSync(path.join(__dirname,"styles.css"),"utf8");
const sources = ["script.js","dashboard.js"].map(file => fs.readFileSync(path.join(__dirname,file),"utf8"));
let checks = 0;
function test(name, run) { run(); checks++; console.log(`OK: ${name}`); }

test("Ресурсы используют относительные пути и работают в подпапке Pages", () => {
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]).filter(value=>!value.startsWith("https://"));
  assert.ok(assets.length>=4);
  for(const asset of assets) {
    assert.ok(!asset.startsWith("/") && !asset.includes(":"),asset);
    assert.ok(fs.readdirSync(__dirname).includes(asset),asset);
    assert.equal(new URL(asset,"https://example.invalid/bmi-calculator/").pathname,"/bmi-calculator/"+asset);
  }
  assert.ok(fs.existsSync(path.join(__dirname,".nojekyll")));
});
test("Нет внешних ресурсов, API, аналитики и отправки формы", () => {
  assert.ok(!/<(?:script|img|iframe)\b[^>]*\bsrc=["'](?:https?:)?\/\//i.test(html));
  assert.ok(!/<link\b[^>]*\bhref=["'](?:https?:)?\/\//i.test(html));
  assert.ok(!/@import\b|url\s*\(/i.test(css));
  assert.ok(!/\baction\s*=|\bping\s*=/i.test(html));
  for(const source of sources) {
    assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/.test(source));
    assert.ok(!/\b(?:require\s*\(|import\s*\(|document\.cookie|location\.(?:href|assign|replace)\s*[=(])/.test(source));
  }
});
test("Единственная внешняя ссылка — ВОЗ, без передачи referrer", () => {
  const links = [...html.matchAll(/<a\b[^>]*href="https?:[^>]+>/g)].map(match=>match[0]);
  assert.equal(links.length,1);
  assert.ok(links[0].includes("https://www.who.int/"));
  assert.ok(links[0].includes("noreferrer"));
});
test("Мобильная разметка и изолированная прокрутка графика сохранены", () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /\.calculator-grid\{grid-template-columns:1fr/);
  assert.match(css, /\.chart-scroll\{[^}]*overflow-x:auto/);
  assert.match(css, /@media\(max-width:400px\)/);
});

class Element {
  constructor(tag="div") { this.tag=tag; this.children=[]; this.attributes={}; this.dataset={}; this.style={}; this.listeners={}; this.value=""; this.hidden=false; this._text=""; this.className=""; }
  get textContent() { return this._text+this.children.map(child=>child.textContent).join(""); }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) { this.textContent=value; }
  get classList() { const self=this; return {toggle(name,on){const names=new Set(self.className.split(/\s+/).filter(Boolean));if(on===undefined)on=!names.has(name);if(on)names.add(name);else names.delete(name);self.className=[...names].join(" ");},remove(name){this.toggle(name,false);}}; }
  setAttribute(name,value) { this.attributes[name]=String(value); if(name==="class")this.className=String(value); if(name==="data-id")this.dataset.id=String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name,listener) { (this.listeners[name]??=[]).push(listener); }
  fire(name) { const event={preventDefault(){},target:this}; for(const listener of this.listeners[name]||[]) listener(event); }
  append(...nodes) { for(const node of nodes) { node.parent=this;this.children.push(node); } }
  replaceChildren(...nodes) { this._text="";this.children=[];this.append(...nodes); }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this); }
  focus() {}
  querySelectorAll(selector) { const all=this.children.flatMap(child=>[child,...child.querySelectorAll("*")]);return all.filter(child=>selector==="*" || (selector.startsWith(".")?child.className.split(/\s+/).includes(selector.slice(1)):child.tag===selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
}
function offlineApp(data=new Map(),blocked=false) {
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element()]));
  const storage={getItem:key=>{if(blocked)throw Error("Storage unavailable");return data.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error("Storage unavailable");data.set(key,value);},removeItem:key=>{if(blocked)throw Error("Storage unavailable");data.delete(key);}};
  const listeners={};let networkCalls=0;
  const document={documentElement:new Element(),getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},querySelectorAll:()=>[],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>{const node=new Element();node.textContent=text;return node;},addEventListener:(name,listener)=>(listeners[name]??=[]).push(listener),dispatchEvent:event=>(listeners[event.type]||[]).forEach(listener=>listener(event))};
  const denyNetwork=()=>{networkCalls++;throw Error("Network forbidden in offline test");};
  let id=0;
  const context=vm.createContext({document,window:{localStorage:storage,matchMedia:()=>({matches:false}),crypto:{randomUUID:()=>`test-${++id}`},addEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},fetch:denyNetwork,XMLHttpRequest:denyNetwork,WebSocket:denyNetwork,navigator:{sendBeacon:denyNetwork}});
  sources.forEach(source=>vm.runInContext(source,context));
  return {elements,data,get networkCalls(){return networkCalls;},calculate(height="170",weight="65"){elements.get("height").value=height;elements.get("weight").value=weight;elements.get("bmi-form").fire("submit");}};
}
test("Без HTTP-сервера и Node API в браузерных скриптах работают расчёт, история и график", () => {
  const app=offlineApp();app.calculate();
  assert.ok(app.elements.get("bmi-value").textContent.startsWith("22,49"));
  assert.equal(app.elements.get("category").textContent,"Нормальная масса тела");
  assert.equal(app.elements.get("history-list").children.length,1);
  assert.equal(app.elements.get("bmi-chart").querySelectorAll(".chart-point").length,1);
  assert.equal(app.networkCalls,0);
});
test("Тема и история восстанавливаются без обращения к серверу", () => {
  const app=offlineApp();app.calculate();app.elements.get("theme-toggle").fire("click");
  const restored=offlineApp(app.data);
  assert.equal(restored.elements.get("history-list").children.length,1);
  assert.equal(restored.elements.get("theme-toggle").attributes["aria-pressed"],"true");
  assert.equal(restored.networkCalls,0);
});
test("Ошибочный ввод не попадает в историю и не отправляется по сети", () => {
  const app=offlineApp();app.calculate("170","abc");
  assert.equal(app.data.has("balance.bmi.history.v1"),false);
  assert.equal(app.elements.get("weight").attributes["aria-invalid"],"true");
  assert.equal(app.networkCalls,0);
});
test("Подтверждённое удаление истории сохраняет тему", () => {
  const app=offlineApp();app.calculate();app.elements.get("theme-toggle").fire("click");
  app.elements.get("clear-history").fire("click");app.elements.get("cancel-clear").fire("click");
  assert.equal(app.elements.get("history-list").children.length,1);
  app.elements.get("clear-history").fire("click");app.elements.get("confirm-clear").fire("click");
  assert.equal(app.data.has("balance.bmi.history.v1"),false);
  assert.equal(app.data.get("balance.theme.v1"),"dark");
});
test("Запрет localStorage не мешает автономному расчёту", () => {
  const app=offlineApp(new Map(),true);app.calculate();
  assert.ok(app.elements.get("bmi-value").textContent.startsWith("22,49"));
  assert.equal(app.elements.get("history-list").children.length,1);
  assert.ok(app.elements.get("storage-status").textContent.includes("не сохранён"));
  assert.equal(app.networkCalls,0);
});
console.log(`Проверок статического сайта и автономной работы: ${checks}`);
