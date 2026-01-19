/* ===============================
   GLOBAL STATE
================================ */

let canvas, ctx;
let data = [];
let contributionData = [];
let yearsTotal = 0;

const padding = 56;

let rawX = null;
let targetX = null;
let currentX = null;

let autoCalcTimeout = null;

/* ===============================
   THEME
================================ */

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
}

function toggleDark() {
  const next = document.body.classList.contains("dark") ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("theme", next);
  draw();
}

(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) applyTheme(saved);
  else applyTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("growthChart");
  ctx = canvas.getContext("2d");

  resizeCanvas();
  draw();

  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    rawX = e.clientX - rect.left;
    targetX = rawX;
    if (currentX === null) currentX = targetX;
  });

  canvas.addEventListener("mouseleave", () => {
    rawX = targetX = currentX = null;
    draw();
  });

  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", scheduleCalculate);
    el.addEventListener("change", scheduleCalculate);
  });

  requestAnimationFrame(animate);
  calculate();
});

function scheduleCalculate() {
  clearTimeout(autoCalcTimeout);
  autoCalcTimeout = setTimeout(calculate, 40);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ===============================
   CORE FINANCE (NERDWALLET)
================================ */

function futureValue(principal, rate, years, pmt, n) {
  const factor = Math.pow(1 + rate / n, n * years);
  const fvPrincipal = principal * factor;
  const fvContrib =
    pmt === 0
      ? 0
      : pmt * ((factor - 1) / (rate / n));
  return fvPrincipal + fvContrib;
}

/* ===============================
   CALCULATE
================================ */

function calculate() {
  if (!principal.value || !rate.value || !years.value) {
    chartTotal.textContent = "Enter values to start";
    data = [];
    draw();
    return;
  }

  const P = +principal.value;
  const r = +rate.value / 100;
  const t = +years.value;
  const contribution = +contributions.value || 0;

  if (
    P <= 0 ||
    r <= 0 || r > 0.5 ||
    t < 1 || t > 100 ||
    contribution < 0
  ) {
    chartTotal.textContent = "Please enter realistic values";
    data = [];
    draw();
    return;
  }

  yearsTotal = t;

  const contribFreq = contributionFreq.value;
  const n = +compoundFreq.value;

  /* ---- Normalize contribution to compounding period ---- */
  let PMT;
  if (contribFreq === "daily") PMT = contribution * 365 / n;
  else if (contribFreq === "monthly") PMT = contribution * 12 / n;
  else PMT = contribution / n;

  /* ---- HERO NUMBER (EXACT) ---- */
  const total = futureValue(P, r, t, PMT, n);
  const principalAndContrib = P + PMT * n * t;
  const growth = total - principalAndContrib;

  chartTotal.innerHTML = `
    <div class="result-main">
      <span class="result-prefix">After ${t} years</span>
      <span class="result-amount"><b>${formatMoneyExact(total)}</b></span>
    </div>
    <div class="result-breakdown">
      <span>Principal & Contributions: ${formatMoneyExact(principalAndContrib)}</span>
      <span>Growth: ${formatMoneyExact(growth)}</span>
    </div>
  `;

  /* ---- GRAPH DATA (SAME FORMULA, SAMPLED MONTHLY) ---- */
  data = [];
  contributionData = [];

  const months = t * 12;

  for (let m = 0; m <= months; m++) {
    const yearsElapsed = m / 12;

    const value = futureValue(P, r, yearsElapsed, PMT, n);
    const contribLine = P + PMT * n * yearsElapsed;

    data.push(value);
    contributionData.push(contribLine);
  }

  draw();
}

/* ===============================
   DRAW LOOP
================================ */

function animate() {
  if (targetX !== null && rawX !== null) {
    currentX += (targetX - currentX) * 0.35;
    draw();
    drawCursor();
  }
  requestAnimationFrame(animate);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  if (!data.length) return;

  const min = data[0] * 0.95;
  const max = Math.max(...data);

  drawAxes(min, max);
  drawContributionLine(min, max);
  drawLine(min, max);
}

/* ===============================
   GRID & AXES
================================ */

function drawGrid() {
  ctx.strokeStyle = document.body.classList.contains("dark") ? "#1f2933" : "#e5e7eb";

  for (let i = 0; i <= 4; i++) {
    const y = padding + (i * plotHeight()) / 4;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvasWidth() - padding, y);
    ctx.stroke();
  }
}

function drawAxes(min, max) {
  ctx.font = "13px Manrope, sans-serif";
  ctx.fillStyle = document.body.classList.contains("dark") ? "#9ca3af" : "#6b7280";

  for (let i = 0; i <= 4; i++) {
    const v = min + (i * (max - min)) / 4;
    ctx.fillText(`$${Math.round(v).toLocaleString()}`, 2, mapY(v, min, max) + 4);
  }

  ctx.fillText("Year 0", padding + 6, canvasHeight() - 8);
  ctx.fillText(`Year ${yearsTotal}`, canvasWidth() - padding - 56, canvasHeight() - 8);
}

/* ===============================
   LINES
================================ */

function drawLine(min, max) {
  ctx.strokeStyle = document.body.classList.contains("dark") ? "#00ae49ff" : "#00ae49ff";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = padding + (i * plotWidth()) / (data.length - 1);
    const y = mapY(v, min, max);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawContributionLine(min, max) {
  ctx.strokeStyle = document.body.classList.contains("dark") ? "#6b7280" : "#9ca3af";
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  contributionData.forEach((v, i) => {
    const x = padding + (i * plotWidth()) / (data.length - 1);
    const y = mapY(v, min, max);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ===============================
   CURSOR
================================ */

function drawCursor() {
  if (!data.length || rawX === null) return;

  const rel = (rawX - padding) / plotWidth();
  if (rel < 0 || rel > 1) return;

  const idx = rel * (data.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, data.length - 1);
  const t = idx - i0;

  const totalValue = data[i0] * (1 - t) + data[i1] * t;
  const contribValue = contributionData[i0] * (1 - t) + contributionData[i1] * t;
  const growth = totalValue - contribValue;
  const year = (idx / 12).toFixed(1);

  const min = data[0] * 0.95;
  const max = Math.max(...data);

  const px = padding + rel * plotWidth();
  const py = mapY(totalValue, min, max);

  const dark = document.body.classList.contains("dark");

  ctx.strokeStyle = dark ? "#9ca3af" : "#374151";
  ctx.beginPath();
  ctx.moveTo(px, padding);
  ctx.lineTo(px, canvasHeight() - padding);
  ctx.stroke();

  const totalText = formatMoneySmart(totalValue);
  const subText = `${formatMoneySmart(contribValue)} principal · ${formatMoneySmart(growth)} growth`;

  ctx.font = "15px Manrope, sans-serif";
  const w = Math.max(ctx.measureText(totalText).width, ctx.measureText(subText).width) + 20;

  const boxX = px > canvasWidth() - w - 12 ? px - w - 10 : px + 10;
  const boxY = Math.max(py - 28, padding + 6);

  ctx.fillStyle = dark ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.9)";
  ctx.fillRect(boxX, boxY, w, 52);

  ctx.fillStyle = dark ? "#f5f7fa" : "#111827";
  ctx.fillText(totalText, boxX + 10, boxY + 18);

  ctx.font = "12px Manrope, sans-serif";
  ctx.fillStyle = dark ? "#9ca3af" : "#6b7280";
  ctx.fillText(subText, boxX + 10, boxY + 34);
  ctx.fillText(`Year ${year}`, boxX + 10, boxY + 48);
}

/* ===============================
   HELPERS
================================ */

function plotWidth() {
  return canvasWidth() - padding * 2;
}

function plotHeight() {
  return canvasHeight() - padding * 2;
}

function canvasWidth() {
  return canvas.width / devicePixelRatio;
}

function canvasHeight() {
  return canvas.height / devicePixelRatio;
}

function mapY(v, min, max) {
  return canvasHeight() - padding -
    ((v - min) / (max - min || 1)) * plotHeight();
}

function formatMoneySmart(value) {
  const abs = Math.abs(value);
  if (abs < 1_000) return `$${Math.round(value)}`;
  if (abs < 1_000_000) return `$${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs < 1_000_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}

function formatMoneyExact(value) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


const menuBtn = document.getElementById("chartMenuBtn");
const menu = document.getElementById("chartMenu");

menuBtn.onclick = () => {
  menu.style.display = menu.style.display === "block" ? "none" : "block";
};

document.addEventListener("click", e => {
  if (!menu.contains(e.target) && e.target !== menuBtn) {
    menu.style.display = "none";
  }
});


function buildExportHTML() {
  const inputs = [
    ["Initial Investment", formatMoneyExact(+principal.value)],
    ["Annual Rate", `${rate.value}%`],
    ["Years", years.value],
    ["Contribution", `${formatMoneyExact(+contributions.value || 0)} (${contributionFreq.value})`],
    ["Compound Frequency", compoundFreq.options[compoundFreq.selectedIndex].text]
  ];

  const summaryHTML = `
    <h2>Compound Interest Graph</h2>
    <div style="font-size:32px;font-weight:700;margin:10px 0;">
      ${document.querySelector(".result-amount").innerText}
    </div>
    <div style="color:#666;margin-bottom:20px">
      ${document.querySelector(".result-breakdown").innerText}
    </div>
  `;

  const inputHTML = `
    <h3>Inputs</h3>
    <table cellspacing="0" cellpadding="6">
      ${inputs.map(([k,v]) =>
        `<tr><td style="color:#666">${k}</td><td><strong>${v}</strong></td></tr>`
      ).join("")}
    </table>
  `;

  const chartImg = canvas.toDataURL("image/png");
  return `
    <html>
    <head>
      <title>Compound Interest Graph</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          padding: 30px;
        }
        h2, h3 { margin-bottom: 10px }
        table { margin-bottom: 30px }
      </style>
    </head>
    <body>
      ${summaryHTML}
      ${inputHTML}
      <img src="${chartImg}" style="width:100%;max-width:600px;margin-top:20px"/>
    </body>
    </html>
  `;
}

function exportChart(type) {
  const html = buildExportHTML();
  const win = window.open("");

  win.document.write(html);
  win.document.close();

  // Wait for chart image to load
  win.onload = () => {
    const img = win.document.querySelector("img");

    if (!img) {
      // fallback — should never happen
      if (type === "print" || type === "pdf") win.print();
      return;
    }

    img.onload = () => {
      if (type === "print" || type === "pdf") {
        win.focus();
        win.print();
      }
    };
  };
}
