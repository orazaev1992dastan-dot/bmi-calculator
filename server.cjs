"use strict";

// Локальный сервер на встроенных модулях Node.js. npm и установка пакетов не нужны.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Показываем только файлы приложения, независимо от папки запуска команды.
const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/script.js": "script.js",
  "/dashboard.js": "dashboard.js"
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  const file = files[new URL(request.url, "http://localhost").pathname];
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  fs.readFile(path.join(__dirname, file), (error, data) => {
    if (error) {
      response.writeHead(500);
      response.end("Cannot read file");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)],
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : data);
  });
});

server.on("error", error => {
  console.error(error.code === "EADDRINUSE"
    ? "Port 8000 is already in use. Stop the previous server before restarting."
    : error.message);
  process.exit(1);
});
server.listen(8000, "127.0.0.1", () => {
  console.log("Balance: http://127.0.0.1:8000/");
  console.log("Press Ctrl+C to stop.");
});
