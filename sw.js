const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    title: "MedCore AI Pro - Pharmacy POS",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false }
  });
  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });