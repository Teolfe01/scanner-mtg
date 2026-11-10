// Biblioteca MTG para Windows: janela própria que abre o app publicado (atualiza sozinho).
// Login do Google: o Google bloqueia login dentro de apps como este, então o login abre no navegador
// padrão e a conta volta para cá por um endereço local (127.0.0.1) que só este app escuta.
const { app, BrowserWindow, shell, session, ipcMain, dialog } = require("electron");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const APP_URL = "https://teolfe01.github.io/scanner-mtg/?source=desktop";
const LOGIN_URL = "https://teolfe01.github.io/scanner-mtg/desktop-login.html";
const SITE = "https://teolfe01.github.io";
let win = null;
const APP_ID = "io.github.teolfe01.bibliotecamtg.desktop";
// O .exe portátil roda de uma cópia temporária. Para o atalho fixado na barra de tarefas apontar para o .exe de verdade
// (e não para a cópia que some ao fechar), informamos ao Windows o caminho original.
const REAL_EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

// registro de erros em %APPDATA%\\Biblioteca MTG\\log.txt
function log(...a) { try { fs.appendFileSync(path.join(app.getPath("userData"), "log.txt"), new Date().toISOString() + " " + a.map(x => x && x.stack ? x.stack : String(x)).join(" ") + "\n"); } catch (e) {} }
process.on("uncaughtException", (e) => { log("ERRO", e); try { dialog.showErrorBox("Biblioteca MTG", "Algo deu errado:\n" + (e && e.message || e) + "\n\nDetalhes em: " + path.join(app.getPath("userData"), "log.txt")); } catch (x) {} });
log("abrindo", app.getVersion(), process.platform, process.arch);

// uma cópia só: abrir de novo traz a janela (e recria se ela tiver sumido)
if (!app.requestSingleInstanceLock()) { log("já estava aberto — chamando a janela existente"); app.quit(); }
app.on("second-instance", () => {
  log("segunda instância");
  if (!app.isReady()) return;
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore(); if (!win.isVisible()) win.show(); win.focus();
});

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 380, minHeight: 600, backgroundColor: "#121316", title: "Biblioteca MTG",
    icon: path.join(__dirname, "build", "icon.png"), autoHideMenuBar: true,
    // barra de título integrada ao app: só os botões de minimizar/maximizar/fechar, desenhados sobre a barra do topo
    titleBarStyle: "hidden", titleBarOverlay: { color: "#131418", symbolColor: "#c9ced8", height: 56 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  if (process.platform === "win32") { try { win.setAppDetails({ appId: APP_ID, relaunchCommand: `"${REAL_EXE}"`, relaunchDisplayName: "Biblioteca MTG", appIconPath: REAL_EXE, appIconIndex: 0 }); } catch (e) { log("setAppDetails", e); } }
  // se a página travar, avisa e oferece recarregar (o que estava salvo continua salvo)
  let hangT = null;
  win.on("unresponsive", () => { log("janela parou de responder"); clearTimeout(hangT); hangT = setTimeout(async () => {
    if (!win || win.isDestroyed()) return;
    const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["Recarregar", "Esperar"], defaultId: 0, title: "Biblioteca MTG", message: "O app parou de responder.", detail: "Recarregar não apaga nada do que já foi salvo." });
    if (r.response === 0 && win && !win.isDestroyed()) { log("recarregando após travar"); win.webContents.forcefullyCrashRenderer(); } }, 2500); });
  win.on("responsive", () => { clearTimeout(hangT); log("voltou a responder"); });
  // erros da página vão para o log, para dar para investigar
  win.webContents.on("console-message", (e, level, message, line, src) => { if (level >= 3) log("página:", message, src ? src.split("/").pop() + ":" + line : ""); });
  win.on("closed", () => { win = null; });
  win.webContents.on("render-process-gone", (e, d) => { log("página caiu", JSON.stringify(d)); if (win && !win.isDestroyed()) setTimeout(() => win.reload(), 800); });
  win.loadURL(APP_URL).catch(() => win.loadFile(path.join(__dirname, "offline.html")));
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html")); });
  // links externos (LigaMagic, EDHREC, Amazon…) abrem no navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE + "/scanner-mtg")) return { action: "allow" };
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(SITE) && !url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
  // F5 recarrega, F11 tela cheia, Ctrl+= / Ctrl+- zoom
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F5") win.webContents.reloadIgnoringCache();
    else if (i.key === "F11") win.setFullScreen(!win.isFullScreen());
    else if (i.control && (i.key === "=" || i.key === "+")) win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
    else if (i.control && i.key === "-") win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
    else if (i.control && i.key === "0") win.webContents.setZoomLevel(0);
  });
}

app.whenReady().then(() => {
  // câmera (webcam no scanner) e microfone (comandos de voz) só para o app
  log("pronto");
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const ok = (details.requestingUrl || "").startsWith(SITE) && ["media", "clipboard-read", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(perm);
    cb(ok);
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => origin === SITE && ["media", "clipboard-read", "clipboard-sanitized-write"].includes(perm));
  createWindow();
});
app.on("window-all-closed", () => { log("fechando"); app.quit(); });
app.on("will-quit", () => log("saiu"));

// ---- Login do Google pelo navegador ----
ipcMain.handle("google-login", () => new Promise((resolve, reject) => {
  const state = crypto.randomBytes(16).toString("hex");
  let done = false;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/cb") { res.writeHead(404); return res.end(); }
    const page = (msg) => `<!doctype html><meta charset="utf-8"><title>Biblioteca MTG</title><body style="font-family:system-ui;background:#121316;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${msg}</h2><p>Pode fechar esta aba e voltar para o app.</p></div><script>setTimeout(()=>window.close(),1500)</script>`;
    if (u.searchParams.get("state") !== state) { res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }); return res.end(page("Link de login inválido")); }
    const err = u.searchParams.get("error");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(err ? "Não deu certo: " + err : "✓ Login feito!"));
    done = true; clearTimeout(timer); server.close();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    if (err) reject(new Error(err)); else resolve({ idToken: u.searchParams.get("id") || "", accessToken: u.searchParams.get("at") || "" });
  });
  const timer = setTimeout(() => { if (!done) { server.close(); reject(new Error("tempo esgotado")); } }, 5 * 60 * 1000);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    shell.openExternal(`${LOGIN_URL}?port=${port}&state=${state}`);
  });
}));
