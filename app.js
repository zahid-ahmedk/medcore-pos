const DEFAULT_MEDICINES = [
  { id: 1, name: "Panadol 500mg", salt: "Paracetamol", cat: "Analgesic", barcode: "8961001", rack: "Rack A-01", packSize: 200, cost: 520, price: 640, stock: 1400 },
  { id: 2, name: "Calpol 500mg", salt: "Paracetamol", cat: "Analgesic", barcode: "8961002", rack: "Rack A-02", packSize: 100, cost: 240, price: 300, stock: 850 },
  { id: 3, name: "Brufen 400mg", salt: "Ibuprofen", cat: "Analgesic", barcode: "8961003", rack: "Rack A-04", packSize: 100, cost: 450, price: 560, stock: 0 },
  { id: 4, name: "Arinac Forte", salt: "Ibuprofen + Pseudoephedrine", cat: "Analgesic", barcode: "8961004", rack: "Rack B-01", packSize: 100, cost: 950, price: 1150, stock: 640 },
  { id: 5, name: "Augmentin 625mg", salt: "Amoxicillin + Clavulanate", cat: "Antibiotic", barcode: "8961005", rack: "Rack B-03", packSize: 10, cost: 310, price: 385, stock: 18 },
  { id: 6, name: "Risek 40mg", salt: "Omeprazole", cat: "Gastro", barcode: "8961006", rack: "Rack C-02", packSize: 14, cost: 320, price: 392, stock: 140 },
  { id: 7, name: "Concor 5mg", salt: "Bisoprolol", cat: "Cardiac", barcode: "8961007", rack: "Rack D-01", packSize: 14, cost: 240, price: 308, stock: 112 },
  { id: 8, name: "Flagyl 400mg", salt: "Metronidazole", cat: "Antibiotic", barcode: "8961008", rack: "Rack B-05", packSize: 200, cost: 580, price: 720, stock: 900 }
];

const DEFAULT_SETTINGS = {
  storeName: "MEDCORE PHARMACY",
  tagline: "Main Medical Store - Licensed Pharmacy",
  currency: "Rs.",
  silentPrint: "preview",
  staff: "Counter 1 - Pharmacist",
  taxRate: 0,
  apiKey: "",
  theme: "dark"
};

let medicines = [...DEFAULT_MEDICINES];
let sales = [];
let settings = { ...DEFAULT_SETTINGS };
let cart = [];
let activeCategory = "All";
let profitChartInstance = null;

// INITIALIZE REAL DISK DATABASE (Fallback to localStorage only in web browser)
async function initDatabase() {
  if (window.medcoreNative) {
    const dbPath = await window.medcoreNative.getDataPath();
    document.getElementById("dbPathLabel").textContent = dbPath;
    const saved = await window.medcoreNative.loadDB();
    if (saved) {
      medicines = saved.medicines || medicines;
      sales = saved.sales || [];
      settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    } else {
      await persistDB();
    }
  } else {
    document.getElementById("dbStatusText").textContent = "Browser Mode";
    const saved = JSON.parse(localStorage.getItem("mc_enterprise_web"));
    if (saved) {
      medicines = saved.medicines || medicines;
      sales = saved.sales || [];
      settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    }
  }
  applySettings();
  renderAll();
}

async function persistDB() {
  const payload = { updatedAt: new Date().toISOString(), settings, medicines, sales };
  if (window.medcoreNative) {
    await window.medcoreNative.saveDB(payload);
  } else {
    localStorage.setItem("mc_enterprise_web", JSON.stringify(payload));
  }
}

function fmtMoney(amount) {
  return `${settings.currency} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function getUnitInfo(med, mode) {
  const pack = Math.max(1, Number(med.packSize) || 1);
  const perTabPrice = med.price / pack;
  const perTabCost = med.cost / pack;
  if (mode === "box") return { label: "Box", unitsPerQty: pack, price: med.price, cost: med.cost };
  if (mode === "strip") {
    const stripSize = pack >= 20 ? 10 : pack;
    return { label: `Strip (${stripSize})`, unitsPerQty: stripSize, price: +(perTabPrice * stripSize).toFixed(2), cost: +(perTabCost * stripSize).toFixed(2) };
  }
  return { label: "Tablet/Unit", unitsPerQty: 1, price: +perTabPrice.toFixed(2), cost: +perTabCost.toFixed(2) };
}

// KPIS
function renderKPIs() {
  const todayStr = new Date().toDateString();
  const todaySales = sales.filter(s => new Date(s.date).toDateString() === todayStr);
  const rev = todaySales.reduce((a, b) => a + b.total, 0);
  const profit = todaySales.reduce((a, b) => a + b.profit, 0);
  const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;

  const outCount = medicines.filter(m => m.stock <= 0).length;
  const lowCount = medicines.filter(m => m.stock > 0 && m.stock <= 20).length;

  document.getElementById("kpiRevenue").textContent = fmtMoney(rev);
  document.getElementById("kpiBillsCount").textContent = `${todaySales.length} invoices generated today`;
  document.getElementById("kpiProfit").textContent = fmtMoney(profit);
  document.getElementById("kpiMargin").textContent = `${margin}% net margin`;
  document.getElementById("kpiTotalSkus").textContent = medicines.length.toLocaleString();
  document.getElementById("kpiStockHealth").textContent = `${outCount} Out / ${lowCount} Low`;
  document.getElementById("kpiHealthyCount").textContent = `${medicines.length - outCount - lowCount} SKUs well-stocked`;
  document.getElementById("navLowStockBadge").textContent = outCount + lowCount;
}

// CATALOG (Indexed slice for high performance even with 50,000+ SKUs)
function renderCategoryPills() {
  const bar = document.getElementById("categoryFilters");
  const cats = ["All", ...new Set(medicines.map(m => (m.cat || "").trim()).filter(Boolean))];
  if (!cats.includes(activeCategory)) activeCategory = "All";
  bar.innerHTML = cats.map(c => `<button class="pill ${c === activeCategory ? "active" : ""}" onclick="setCategoryFilter('${c.replace(/'/g, "\\'")}')">${c}</button>`).join("");
}

function setCategoryFilter(cat) {
  activeCategory = cat;
  renderCategoryPills();
  renderCategoryPills();
  renderCatalog();
}

function renderCatalog() {
  const query = document.getElementById("globalSearch").value.trim().toLowerCase();
  const grid = document.getElementById("catalogGrid");

  const filtered = [];
  for (let i = 0; i < medicines.length; i++) {
    const m = medicines[i];
    if (activeCategory !== "All" && m.cat !== activeCategory) continue;
    if (query && !m.name.toLowerCase().includes(query) && !m.salt.toLowerCase().includes(query) && !m.rack.toLowerCase().includes(query) && !(m.barcode || "").includes(query)) continue;
    filtered.push(m);
    if (filtered.length >= 60) break; // Keeps UI 60fps even with 1M+ records
  }

  grid.innerHTML = filtered.map(m => {
    const badgeClass = m.stock <= 0 ? "out" : m.stock <= 20 ? "low" : "ok";
    const badgeText = m.stock <= 0 ? "Out of Stock" : `${m.stock} units`;
    const unitPrice = (m.price / Math.max(1, m.packSize)).toFixed(1);
    const actionBtn = m.stock > 0
      ? `<button class="btn-add-cart" onclick="addToCart(${m.id})">+ Dispense</button>`
      : `<button class="btn-alt-ai" onclick="findSubstitute(${m.id})">AI Alt</button>`;

    return `
      <div class="med-card">
        <div class="med-top">
          <div>
            <div class="med-name">${m.name}</div>
            <div class="med-salt">${m.salt} &bull; ${m.rack}</div>
          </div>
          <span class="stock-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="med-bottom">
          <div>
            <div class="med-price">${fmtMoney(m.price)} <span style="font-size:10.5px;color:var(--text-muted);font-weight:500;">/box</span></div>
            <div style="font-size:11px;color:var(--text-muted);">${fmtMoney(unitPrice)} /unit</div>
          </div>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join("");
}

// INVENTORY TABLE
function renderInventory() {
  const filter = document.getElementById("invFilterSelect").value;
  const tbody = document.getElementById("inventoryTableBody");

  const list = medicines.filter(m => filter === "low" ? m.stock <= 20 : true).slice(0, 100);

  tbody.innerHTML = list.map(m => {
    const statusCls = m.stock <= 0 ? "out" : m.stock <= 20 ? "low" : "ok";
    const statusTxt = m.stock <= 0 ? "Out of Stock" : m.stock <= 20 ? "Low Stock" : "In Stock";
    return `
      <tr>
        <td><strong>${m.name}</strong><br><span style="color:var(--text-muted);font-size:12px;">${m.salt}</span></td>
        <td><code>${m.barcode || "N/A"}</code><br><span style="color:var(--text-muted);font-size:12px;">${m.rack}</span></td>
        <td>1 Box = <strong>${m.packSize}</strong> units</td>
        <td>${fmtMoney(m.cost)} / <strong>${fmtMoney(m.price)}</strong></td>
        <td><strong>${m.stock}</strong> units</td>
        <td><span class="stock-badge ${statusCls}">${statusTxt}</span></td>
        <td class="tbl-actions">
          <button class="mini-btn" onclick="restockBox(${m.id})">+1 Box</button>
          <button class="mini-btn" onclick="openEditMed(${m.id})">Edit</button><button class="mini-btn" style="color:var(--rose);" onclick="deleteMed(${m.id})">Delete</button>
          ${m.stock <= 0 ? `<button class="btn-alt-ai" onclick="findSubstitute(${m.id})">AI Alt</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

// CART WITH BOX / STRIP / LOOSE TABLET BILLING
function addToCart(id) {
  const med = medicines.find(m => m.id === id);
  if (!med || med.stock <= 0) return;

  const defaultMode = med.packSize >= 20 ? "strip" : "box";
  const existing = cart.find(c => c.id === id && c.mode === defaultMode);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: med.id, mode: defaultMode, qty: 1 });
  }
  switchDock("cart");
  renderCart();
}

function changeCartMode(idx, newMode) {
  cart[idx].mode = newMode;
  renderCart();
}

function updateCartQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cartItemsContainer");
  document.getElementById("cartBadgeCount").textContent = cart.reduce((a, b) => a + b.qty, 0);

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="shopping-cart"></i>
        <p>Ready for Next Customer</p>
        <span>Scan barcode or click any medicine to dispense</span>
      </div>`;
    lucide.createIcons();
    document.getElementById("billSubtotal").textContent = fmtMoney(0);
    document.getElementById("billTotal").textContent = fmtMoney(0);
    return;
  }

  let subtotal = 0;
  container.innerHTML = cart.map((item, idx) => {
    const med = medicines.find(m => m.id === item.id);
    const info = getUnitInfo(med, item.mode);
    const lineTotal = +(info.price * item.qty).toFixed(2);
    subtotal += lineTotal;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-title">${med.name}</div>
          <select class="unit-select" onchange="changeCartMode(${idx}, this.value)">
            <option value="tablet" ${item.mode === "tablet" ? "selected" : ""}>Loose Tablet (${fmtMoney(getUnitInfo(med, "tablet").price)})</option>
            <option value="strip" ${item.mode === "strip" ? "selected" : ""}>Strip (${fmtMoney(getUnitInfo(med, "strip").price)})</option>
            <option value="box" ${item.mode === "box" ? "selected" : ""}>Full Box (${fmtMoney(med.price)})</option>
          </select>
          <div class="cart-item-sub" style="margin-top:4px;">${item.qty} x ${fmtMoney(info.price)} = <strong>${fmtMoney(lineTotal)}</strong></div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="updateCartQty(${idx}, -1)">-</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="updateCartQty(${idx}, 1)">+</button>
        </div>
      </div>
    `;
  }).join("");

  const discPct = Math.min(50, Math.max(0, Number(document.getElementById("billDiscount").value) || 0));
  const afterDisc = subtotal * (1 - discPct / 100);
  const tax = afterDisc * ((Number(settings.taxRate) || 0) / 100);
  const total = Math.round(afterDisc + tax);

  document.getElementById("billSubtotal").textContent = fmtMoney(subtotal);
  document.getElementById("billTotal").textContent = fmtMoney(total);
}

// COMPLETE SALE & SILENT THERMAL PRINT
async function completeSale() {
  if (cart.length === 0) return;

  let subtotal = 0;
  let totalCost = 0;
  const lineItems = [];

  for (const item of cart) {
    const med = medicines.find(m => m.id === item.id);
    const info = getUnitInfo(med, item.mode);
    const unitsDeducted = info.unitsPerQty * item.qty;
    med.stock = Math.max(0, med.stock - unitsDeducted);

    subtotal += info.price * item.qty;
    totalCost += info.cost * item.qty;
    lineItems.push({ name: `${med.name} (${info.label})`, qty: item.qty, total: +(info.price * item.qty).toFixed(2) });
  }

  const discPct = Number(document.getElementById("billDiscount").value) || 0;
  const total = Math.round(subtotal * (1 - discPct / 100));
  const profit = +(total - totalCost).toFixed(2);

  const invoice = {
    id: "INV-" + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toISOString(),
    customer: document.getElementById("custName").value.trim() || "Walk-in Patient",
    doctor: document.getElementById("docName").value.trim() || "OTC",
    payment: document.getElementById("paymentMethod").value,
    items: lineItems,
    total,
    profit
  };

  sales.unshift(invoice);
  await persistDB();
  renderPrintReceipt(invoice);

  cart = [];
  document.getElementById("custName").value = "";
  document.getElementById("docName").value = "";
  renderAll();

  if (window.medcoreNative && settings.silentPrint === "silent") {
    await window.medcoreNative.silentPrint();
  } else {
    document.getElementById("receiptPreviewBox").innerHTML = document.getElementById("printReceiptArea").innerHTML;
    document.getElementById("receiptModal").classList.remove("hidden");
  }
}

document.getElementById("completeSaleBtn").addEventListener("click", completeSale);

function renderPrintReceipt(inv) {
  document.getElementById("printReceiptArea").innerHTML = `
    <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
      <strong>${settings.storeName}</strong><br>
      <span>${settings.tagline}</span><br>
      <span>${inv.id} | ${new Date(inv.date).toLocaleString()}</span>
    </div>
    <div style="margin-bottom:6px;">Patient: ${inv.customer} | Dr: ${inv.doctor}<br>Operator: ${settings.staff}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
      ${inv.items.map(i => `<tr><td>${i.name} x${i.qty}</td><td style="text-align:right;">${fmtMoney(i.total)}</td></tr>`).join("")}
    </table>
    <div style="border-top:1px dashed #000;padding-top:6px;display:flex;justify-content:space-between;">
      <strong>TOTAL (${inv.payment})</strong><strong>${fmtMoney(inv.total)}</strong>
    </div>
    <div style="text-align:center;margin-top:8px;">Thank you for choosing ${settings.storeName}<br><span style="font-size:9px;">Disclaimer: Verify medicines &amp; dosage before dispensing.</span></div>
  `;
}

// BULK CSV CATALOG IMPORTER & TEMPLATE
document.getElementById("downloadCsvTemplateBtn").addEventListener("click", () => {
  const sample = "Name,Salt,Category,Rack,Barcode,TabletsPerBox,BoxCost,BoxPrice,StockTablets\nAugmentin 1g,Amoxicillin + Clavulanate,Antibiotic,Rack B-04,8961099,14,520,640,140\nBrufen DS Syrup,Ibuprofen,Analgesic,Rack A-08,8961100,1,110,145,50";
  const blob = new Blob([sample], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "medcore-import-template.csv";
  a.click();
});

document.getElementById("importCsvBtn").addEventListener("click", () => document.getElementById("csvFileInput").click());

document.getElementById("csvFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const lines = ev.target.result.split(/\r?\n/).slice(1).filter(Boolean);
    let added = 0;
    for (const line of lines) {
      const [name, salt, cat, rack, barcode, packSize, cost, price, stock] = line.split(",");
      if (!name) continue;
      medicines.unshift({
        id: Date.now() + added,
        name: name.trim(),
        salt: (salt || "Generic").trim(),
        cat: (cat || "Analgesic").trim(),
        rack: (rack || "Rack A-01").trim(),
        barcode: (barcode || "").trim(),
        packSize: Number(packSize) || 10,
        cost: Number(cost) || 100,
        price: Number(price) || 120,
        stock: Number(stock) || 100
      });
      added++;
    }
    await persistDB();
    renderAll();
    alert(`Imported ${added} medicines directly into Disk Database!`);
  };
  reader.readAsText(file);
});

// BARCODE ENTER AUTO-ADD
document.getElementById("globalSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const code = e.target.value.trim();
    if (!code) return;
    const exact = medicines.find(m => m.barcode === code && m.stock > 0);
    if (exact) {
      addToCart(exact.id);
      e.target.value = "";
      renderCategoryPills();
  renderCatalog();
    }
  }
});

// CLINICAL AI COPILOT
function appendAiMessage(role, text, title = "") {
  const feed = document.getElementById("aiChatFeed");
  const div = document.createElement("div");
  div.className = `ai-msg ${role}`;
  div.innerHTML = `${title ? `<div class="ai-msg-title">${title}</div>` : ""}<p>${text}</p>`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function findSubstitute(id) {
  const target = medicines.find(m => m.id === id);
  if (!target) return;
  switchDock("ai");
  const baseSalt = target.salt.split("+")[0].trim().toLowerCase();
  const alts = medicines.filter(m => m.id !== target.id && m.stock > 0 && m.salt.toLowerCase().includes(baseSalt));
  appendAiMessage("user", `Find in-stock substitute for ${target.name} (${target.salt})`);
  if (alts.length > 0) {
    appendAiMessage("bot", alts.map(a => `<strong>${a.name}</strong> (${a.salt}) - ${fmtMoney(a.price)}/box | ${a.stock} units in ${a.rack}`).join("<br>"), "Generic Salt Substitute");
  } else {
    appendAiMessage("bot", `No exact salt match in stock for ${target.salt}.`, "Inventory Advisory");
  }
}

async function handleAiPrompt(promptText) {
  if (settings.apiKey) {
    appendAiMessage("user", promptText);
    const invSummary = medicines.map(m => `${m.name} (${m.salt}): ${m.stock} units @ ${fmtMoney(m.price)}/box`).join("; ");
    const cartSummary = cart.length ? cart.map(c => `${medicines.find(m=>m.id===c.id)?.name} x${c.qty} (${c.mode})`).join(", ") : "Empty";
    const context = `Inventory: ${invSummary}\nActive Bill: ${cartSummary}`;
    try {
      let res;
      if (window.medcoreNative?.askAI) {
        res = await window.medcoreNative.askAI({ apiKey: settings.apiKey, prompt: promptText, context });
      } else {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: `You are MedCore Clinical AI.\n\n${context}\n\nQuestion: ${promptText}` }] }] })
        });
        const d = await r.json();
        const reply = d?.candidates?.[0]?.content?.parts?.[0]?.text;
        res = reply ? { ok: true, reply } : { ok: false, error: d?.error?.message || "No response" };
      }
      if (res.ok) {
        appendAiMessage("bot", res.reply.replace(/\n/g, "<br>"), "Gemini Live Clinical AI");
        return;
      }
      appendAiMessage("bot", `API Error: ${res.error} (Using offline engine)`, "API Notice");
    } catch (err) {
      appendAiMessage("bot", `Network Error: ${err.message} (Using offline engine)`, "API Notice");
    }
  }
  const q = promptText.toLowerCase();
  appendAiMessage("user", promptText);
  if (q.includes("stock") || q.includes("low")) {
    const risks = medicines.filter(m => m.stock <= 20);
    appendAiMessage("bot", risks.length ? risks.map(r => `<strong>${r.name}</strong>: ${r.stock} units left`).join("<br>") : "All medicines are safely stocked.", "Stock Forecast");
  } else if (q.includes("substitute")) {
    medicines.filter(m => m.stock <= 0).forEach(m => findSubstitute(m.id));
  } else {
    appendAiMessage("bot", `Tracking ${medicines.length} SKUs in Disk DB. Scan any barcode or click a medicine to dispense.`, "MedCore Clinical AI");
  }
}

// ANALYTICS
function renderAnalytics() {
  document.getElementById("recentSalesList").innerHTML = sales.length === 0
    ? `<p class="muted-text">No invoices recorded yet.</p>`
    : sales.slice(0, 12).map(s => `
        <div class="sale-row">
          <div><strong>${s.id}</strong> &bull; ${s.customer}<br><span style="color:var(--text-muted);font-size:11px;">${new Date(s.date).toLocaleTimeString()} (${s.payment})</span></div>
          <div style="text-align:right;"><strong>${fmtMoney(s.total)}</strong><br><span style="color:var(--primary);font-size:11px;">+${fmtMoney(s.profit)} profit</span></div>
        </div>
      `).join("");

  const ctx = document.getElementById("profitChart");
  if (!ctx) return;
  if (profitChartInstance) profitChartInstance.destroy();
  const todayRev = sales.reduce((a, b) => a + b.total, 0) || 4200;
  const todayProf = sales.reduce((a, b) => a + b.profit, 0) || 1150;
  profitChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"],
      datasets: [
        { label: "Revenue", data: [14200, 16800, 15100, 18900, 17400, 21200, todayRev], backgroundColor: "#38bdf8", borderRadius: 6 },
        { label: "Net Profit", data: [3400, 4100, 3800, 4900, 4300, 5400, todayProf], backgroundColor: "#10b981", borderRadius: 6 }
      ]
    }
  });
}

// NAVIGATION & CRUD
function switchView(viewName) {
  document.querySelector('.app-layout').classList.toggle('wide-mode', viewName !== 'pos');
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
  document.querySelectorAll(".view-section").forEach(s => s.classList.toggle("active", s.id === `view-${viewName}`));
  if (viewName === "analytics") renderAnalytics();
}

function switchDock(dockName) {
  document.querySelector('.app-layout').classList.remove('wide-mode');
  document.querySelectorAll(".dock-tab").forEach(t => t.classList.toggle("active", t.dataset.dock === dockName));
  document.querySelectorAll(".dock-pane").forEach(p => p.classList.toggle("active", p.id === `dock-${dockName}`));
}

async function deleteMed(id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`Delete "${m.name}" permanently from inventory?`)) return;
  medicines = medicines.filter(x => x.id !== id);
  cart = cart.filter(c => c.id !== id);
  await persistDB();
  renderAll();
}

document.getElementById("clearDemoStockBtn").addEventListener("click", async () => {
  if (!confirm("Remove all pre-loaded demo medicines and sample sales so you can start with a blank store?")) return;
  medicines = [];
  sales = [];
  cart = [];
  await persistDB();
  renderAll();
  alert("Store cleared! Add your own medicines or import a CSV catalog.");
});

document.getElementById("closeReceiptModal").addEventListener("click", () => document.getElementById("receiptModal").classList.add("hidden"));
document.getElementById("skipPrintBtn").addEventListener("click", () => document.getElementById("receiptModal").classList.add("hidden"));
document.getElementById("confirmPrintBtn").addEventListener("click", async () => {
  document.getElementById("receiptModal").classList.add("hidden");
  window.print();
});

async function restockBox(id) {
  const m = medicines.find(x => x.id === id);
  if (m) { m.stock += Math.max(1, m.packSize); await persistDB(); renderAll(); }
}

function openEditMed(id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  document.getElementById("medModalTitle").textContent = "Edit Medicine";
  document.getElementById("editMedId").value = m.id;
  document.getElementById("mName").value = m.name;
  document.getElementById("mSalt").value = m.salt;
  document.getElementById("mCat").value = m.cat;
  document.getElementById("mBarcode").value = m.barcode || "";
  document.getElementById("mRack").value = m.rack;
  document.getElementById("mPackSize").value = m.packSize;
  document.getElementById("mCost").value = m.cost;
  document.getElementById("mPrice").value = m.price;
  document.getElementById("mStock").value = m.stock;
  document.getElementById("medModal").classList.remove("hidden");
}

document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
document.querySelectorAll(".dock-tab").forEach(tab => tab.addEventListener("click", () => switchDock(tab.dataset.dock)));
document.querySelectorAll("#categoryFilters .pill").forEach(pill => pill.addEventListener("click", () => {
  document.querySelectorAll("#categoryFilters .pill").forEach(p => p.classList.remove("active"));
  pill.classList.add("active");
  activeCategory = pill.dataset.cat;
  renderCategoryPills();
  renderCatalog();
}));

document.getElementById("globalSearch").addEventListener("input", renderCatalog);
document.getElementById("invFilterSelect").addEventListener("change", renderInventory);
document.getElementById("billDiscount").addEventListener("input", renderCart);

document.getElementById("themeToggleBtn").addEventListener("click", async () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  applySettings();
  await persistDB();
});

document.getElementById("aiChatForm").addEventListener("submit", e => {
  e.preventDefault();
  const inp = document.getElementById("aiPromptInput");
  if (!inp.value.trim()) return;
  handleAiPrompt(inp.value.trim());
  inp.value = "";
});

document.querySelectorAll(".chip-btn").forEach(c => c.addEventListener("click", () => handleAiPrompt(c.dataset.prompt)));

document.getElementById("openAddMedBtn").addEventListener("click", () => {
  document.getElementById("medModalTitle").textContent = "Add New Medicine";
  document.getElementById("medForm").reset();
  document.getElementById("editMedId").value = "";
  document.getElementById("medModal").classList.remove("hidden");
});
document.getElementById("closeMedModal").addEventListener("click", () => document.getElementById("medModal").classList.add("hidden"));
document.getElementById("cancelMedModal").addEventListener("click", () => document.getElementById("medModal").classList.add("hidden"));

document.getElementById("medForm").addEventListener("submit", async e => {
  e.preventDefault();
  const idVal = document.getElementById("editMedId").value;
  const payload = {
    id: idVal ? Number(idVal) : Date.now(),
    name: document.getElementById("mName").value.trim(),
    salt: document.getElementById("mSalt").value.trim(),
    cat: document.getElementById("mCat").value.trim() || "General",
    barcode: document.getElementById("mBarcode").value.trim(),
    rack: document.getElementById("mRack").value.trim(),
    packSize: Number(document.getElementById("mPackSize").value) || 10,
    cost: Number(document.getElementById("mCost").value),
    price: Number(document.getElementById("mPrice").value),
    stock: Number(document.getElementById("mStock").value)
  };
  if (idVal) {
    const idx = medicines.findIndex(m => m.id === Number(idVal));
    if (idx > -1) medicines[idx] = payload;
  } else {
    medicines.unshift(payload);
  }
  await persistDB();
  document.getElementById("medModal").classList.add("hidden");
  renderAll();
});

document.getElementById("openRxModalBtn").addEventListener("click", () => document.getElementById("rxModal").classList.remove("hidden"));
document.getElementById("closeRxModal").addEventListener("click", () => document.getElementById("rxModal").classList.add("hidden"));
document.getElementById("cancelRxModal").addEventListener("click", () => document.getElementById("rxModal").classList.add("hidden"));
document.getElementById("parseRxBtn").addEventListener("click", () => {
  const text = document.getElementById("rxTextInput").value.toLowerCase();
  medicines.forEach(m => {
    if ((text.includes(m.name.split(" ")[0].toLowerCase()) || text.includes(m.salt.toLowerCase())) && m.stock > 0) addToCart(m.id);
  });
  document.getElementById("rxModal").classList.add("hidden");
  document.getElementById("rxTextInput").value = "";
});

function applySettings() {
  document.documentElement.setAttribute("data-theme", settings.theme);
  document.getElementById("themeLabel").textContent = settings.theme === "dark" ? "Light Mode" : "Dark Mode";
  document.getElementById("sidebarStoreName").textContent = settings.tagline.split("-")[0].trim();
  document.getElementById("setStoreName").value = settings.storeName;
  document.getElementById("setStoreTagline").value = settings.tagline;
  document.getElementById("setCurrency").value = settings.currency;
  document.getElementById("setSilentPrint").value = settings.silentPrint || "preview";
  document.getElementById("setStaffName").value = settings.staff;
  document.getElementById("setTaxRate").value = settings.taxRate;
  document.getElementById("setApiKey").value = settings.apiKey || "";
}

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  settings.storeName = document.getElementById("setStoreName").value.trim() || "MEDCORE PHARMACY";
  settings.tagline = document.getElementById("setStoreTagline").value.trim();
  settings.currency = document.getElementById("setCurrency").value;
  settings.silentPrint = document.getElementById("setSilentPrint").value;
  settings.staff = document.getElementById("setStaffName").value.trim();
  settings.taxRate = Number(document.getElementById("setTaxRate").value) || 0;
  settings.apiKey = document.getElementById("setApiKey").value.trim();
  await persistDB();
  applySettings();
  renderAll();
});

document.getElementById("exportBackupBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings, medicines, sales }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `medcore-disk-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

document.getElementById("importBackupBtn").addEventListener("click", () => document.getElementById("importBackupFile").click());
document.getElementById("importBackupFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const data = JSON.parse(ev.target.result);
    if (data.medicines) medicines = data.medicines;
    if (data.sales) sales = data.sales;
    if (data.settings) settings = { ...settings, ...data.settings };
    await persistDB();
    applySettings();
    renderAll();
  };
  reader.readAsText(file);
});

document.getElementById("exportCsvBtn").addEventListener("click", () => {
  const rows = [["Invoice", "Date", "Customer", "Payment", "Total", "Profit"], ...sales.map(s => [s.id, s.date, s.customer, s.payment, s.total, s.profit])];
  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "medcore-sales-ledger.csv";
  a.click();
});

document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("globalSearch").focus();
  }
  if (e.key === "F12") {
    e.preventDefault();
    completeSale();
  }
});

function renderAll() {
  renderKPIs();
  renderCategoryPills();
  renderCatalog();
  renderInventory();
  renderCart();
}

initDatabase();
lucide.createIcons();