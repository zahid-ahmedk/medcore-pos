const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function getStorageDir() {
  const dDrive = "D:\\MedCoreData";
  try {
    if (fs.existsSync("D:\\")) {
      if (!fs.existsSync(dDrive)) fs.mkdirSync(dDrive, { recursive: true });
      return dDrive;
    }
  } catch {}
  const fallback = path.join(app.getPath("documents"), "MedCoreData");
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const DB_FILE = path.join(getStorageDir(), "medcore_enterprise_db.json");

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    title: "MedCore AI Pro | Enterprise Pharmacy OS",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
}

ipcMain.handle("db:path", () => DB_FILE);

ipcMain.handle("db:load", () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (err) {
    console.error("DB Read Error:", err);
  }
  return null;
});

ipcMain.handle("db:save", (_event, payload) => {
  try {
    const tmpFile = DB_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
    fs.renameSync(tmpFile, DB_FILE);
    return { ok: true, path: DB_FILE };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("printer:silent", (event) => {
  return new Promise((resolve) => {
    event.sender.print({ silent: true, printBackground: true }, (success, failureReason) => {
      resolve({ success, failureReason });
    });
  });
});

ipcMain.handle("ai:chat", async (_event, { apiKey, prompt, context }) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are MedCore Clinical AI, an expert pharmacy decision-support copilot. Keep answers concise, clinical, and structured.\n\nLive Pharmacy Context:\n${context}\n\nPharmacist Question: ${prompt}`
          }]
        }]
      })
    });
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return { ok: false, error: data?.error?.message || "No response from Gemini API." };
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});