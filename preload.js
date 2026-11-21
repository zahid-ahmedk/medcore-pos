const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("medcoreNative", {
  loadDB: () => ipcRenderer.invoke("db:load"),
  saveDB: (data) => ipcRenderer.invoke("db:save", data),
  getDataPath: () => ipcRenderer.invoke("db:path"),
  silentPrint: () => ipcRenderer.invoke("printer:silent"),
  askAI: (payload) => ipcRenderer.invoke("ai:chat", payload)
});