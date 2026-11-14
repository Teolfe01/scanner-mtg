// Biblioteca MTG para Windows: janela própria que abre o app publicado (atualiza sozinho).
// Login do Google: o Google bloqueia login dentro de apps como este, então o login abre no navegador
// padrão e a conta volta para cá por um endereço local (127.0.0.1) que só este app escuta.
const { app, BrowserWindow, shell, session, ipcMain, dialog, net } = require("electron");
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
// ícone fixo em %APPDATA% (a cópia temporária do .exe some ao fechar; o atalho fixado precisa de um ícone que continue existindo)
let ICON = path.join(__dirname, "icon.ico");
// Só copia se faltar ou mudar: o Windows (Explorer) costuma deixar o arquivo em uso, e se a cópia falhava o atalho fixado
// passava a apontar para o ícone da pasta temporária — que some ao fechar, deixando o ícone em branco.
try {
  const dst = path.join(app.getPath("userData"), "icon.ico"); fs.mkdirSync(path.dirname(dst), { recursive: true });
  const src = fs.readFileSync(ICON); let cur = null; try { cur = fs.readFileSync(dst); } catch (e) {}
  if (!cur || !cur.equals(src)) { try { fs.writeFileSync(dst, src); } catch (e) { const alt = path.join(app.getPath("userData"), "icon-" + Date.now() + ".ico"); fs.writeFileSync(alt, src); ICON = alt; } }
  if (ICON === path.join(__dirname, "icon.ico")) ICON = dst;
} catch (e) {}
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
    icon: ICON, autoHideMenuBar: true,
    // barra de título integrada ao app: só os botões de minimizar/maximizar/fechar, desenhados sobre a barra do topo
    titleBarStyle: "hidden", titleBarOverlay: { color: "#131418", symbolColor: "#c9ced8", height: 56 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  if (process.platform === "win32") { try { win.setAppDetails({ appId: APP_ID, relaunchCommand: `"${REAL_EXE}"`, relaunchDisplayName: "Biblioteca MTG", appIconPath: ICON, appIconIndex: 0 }); } catch (e) { log("setAppDetails", e); } }
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

// Conserta atalhos fixados (barra de tarefas / Iniciar) que apontem para a cópia temporária ou para um ícone que sumiu,
// e garante um atalho no menu Iniciar com o ícone certo.
function fixShortcuts() {
  if (process.platform !== "win32") return;
  const ad = app.getPath("appData"); let changed = false;
  const opts = { target: REAL_EXE, cwd: path.dirname(REAL_EXE), icon: ICON, iconIndex: 0, appUserModelId: APP_ID, description: "Biblioteca MTG" };
  const dirs = [path.join(ad, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar"), path.join(ad, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "StartMenu"), path.join(ad, "Microsoft", "Windows", "Start Menu", "Programs"), path.join(app.getPath("desktop"))];
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(d).filter(f => f.toLowerCase().endsWith(".lnk")); } catch (e) { continue; }
    for (const f of files) {
      const p = path.join(d, f);
      try {
        const l = shell.readShortcutLink(p);
        const ours = l.appUserModelId === APP_ID || /biblioteca ?mtg/i.test(f + " " + (l.target || ""));
        if (!ours) continue;
        const bad = l.target !== REAL_EXE || (l.icon || "") !== ICON || !fs.existsSync(l.icon || "") || l.appUserModelId !== APP_ID;
        if (bad) { shell.writeShortcutLink(p, "replace", opts); changed = true; log("atalho consertado:", p, "era", l.target, l.icon); }
      } catch (e) { log("atalho", p, e); }
    }
  }
  try { const sm = path.join(ad, "Microsoft", "Windows", "Start Menu", "Programs", "Biblioteca MTG.lnk"); if (!fs.existsSync(sm)) { shell.writeShortcutLink(sm, "create", opts); changed = true; } } catch (e) { log("menu iniciar", e); }
  if (changed) { try { require("child_process").spawn("ie4uinit.exe", ["-show"], { detached: true, stdio: "ignore" }).unref(); } catch (e) {} }
}
// ===== Atualização do próprio .exe =====
// A página (cartas, telas) já se atualiza sozinha. Isto aqui cuida de quando sai um .exe novo:
// avisa, baixa, fecha, troca o arquivo no mesmo lugar e abre de novo.
const REL = "https://github.com/Teolfe01/scanner-mtg/releases/download/desktop/";
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
let UPD_BUSY = false, UPD_SKIP = "";
async function checkExeUpdate(manual) {
  if (UPD_BUSY || !process.env.PORTABLE_EXECUTABLE_FILE) { if (manual && !process.env.PORTABLE_EXECUTABLE_FILE) return { ok: false, msg: "modo de desenvolvimento" }; return { ok: false }; }
  let info; try { const r = await net.fetch(REL + "desktop-version.json?t=" + Date.now(), { cache: "no-store" }); info = await r.json(); } catch (e) { log("checar versão", e); return { ok: false, msg: "sem internet" }; }
  log("versão publicada", info.version, "esta", app.getVersion());
  if (!newer(info.version, app.getVersion())) return { ok: true, latest: true, version: app.getVersion() };
  if (!manual && UPD_SKIP === info.version) return { ok: true, available: info.version };
  if (win && !win.isDestroyed()) win.webContents.send("exe-update", { version: info.version, current: app.getVersion() });
  const r = await dialog.showMessageBox(win, { type: "info", buttons: ["Atualizar agora", "Depois"], defaultId: 0, cancelId: 1, title: "Atualização do Biblioteca MTG",
    message: `Tem uma versão nova do app para Windows (${info.version}).`, detail: `Você está na ${app.getVersion()}. O app baixa a nova versão, fecha e abre de novo sozinho (leva menos de 1 minuto). Nada da coleção muda: está tudo na nuvem.` });
  if (r.response !== 0) { UPD_SKIP = info.version; return { ok: true, available: info.version }; }
  await installExe(info.version); return { ok: true, installing: true };
}
async function installExe(version) {
  UPD_BUSY = true;
  const os = require("os"); const tmp = path.join(os.tmpdir(), "BibliotecaMTG-" + version + ".exe");
  try {
    if (win && !win.isDestroyed()) win.setProgressBar(2);
    const res = await net.fetch(REL + "BibliotecaMTG.exe?t=" + Date.now(), { cache: "no-store" }); if (!res.ok) throw new Error("download " + res.status);
    const total = +res.headers.get("content-length") || 0; const reader = res.body.getReader(); const out = fs.createWriteStream(tmp); let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; out.write(Buffer.from(value)); if (total && win && !win.isDestroyed()) win.setProgressBar(got / total); }
    await new Promise((ok, bad) => { out.on("error", bad); out.end(ok); });
    if (total && fs.statSync(tmp).size !== total) throw new Error("download incompleto");
    // script que espera o app fechar, troca o .exe e abre de novo (tenta por até ~2 minutos, o Windows segura o arquivo por uns segundos)
    const cmd = path.join(os.tmpdir(), "bmtg-update.cmd");
    fs.writeFileSync(cmd, [
      "@echo off", "set n=0", ":retry", "timeout /t 2 /nobreak >nul", "set /a n+=1",
      `copy /y "${tmp}" "${REAL_EXE}" >nul 2>&1`, "if errorlevel 1 (if %n% lss 60 goto retry)",
      `del "${tmp}" >nul 2>&1`, `start "" "${REAL_EXE}"`, `del "%~f0"`].join("\r\n"));
    log("atualizando para", version, "->", REAL_EXE);
    require("child_process").spawn("cmd.exe", ["/c", cmd], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    app.quit();
  } catch (e) {
    log("atualização falhou", e); UPD_BUSY = false; if (win && !win.isDestroyed()) win.setProgressBar(-1);
    dialog.showMessageBox(win, { type: "warning", title: "Biblioteca MTG", message: "Não consegui baixar a atualização agora.", detail: "Tento de novo mais tarde. Se preferir, baixe o .exe novo manualmente." });
  }
}
ipcMain.handle("exe-update-check", () => checkExeUpdate(true));
ipcMain.handle("exe-version", () => app.getVersion());
app.whenReady().then(() => {
  setTimeout(fixShortcuts, 3000);
  setTimeout(() => checkExeUpdate(false), 8000); setInterval(() => checkExeUpdate(false), 6 * 3600e3);
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
