// Ponte mínima entre o app (página) e o Windows: login do Google pelo navegador e atualização do .exe.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bmtgDesktop", { version: "3", wco: true, googleLogin: () => ipcRenderer.invoke("google-login"),
  checkExeUpdate: () => ipcRenderer.invoke("exe-update-check"), exeVersion: () => ipcRenderer.invoke("exe-version") });
