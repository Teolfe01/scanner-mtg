// Ponte mínima entre o app (página) e o Windows: só o login do Google pelo navegador.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bmtgDesktop", { version: "1", googleLogin: () => ipcRenderer.invoke("google-login") });
