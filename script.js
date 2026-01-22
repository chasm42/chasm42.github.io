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
let lastSnappedYear = null;

let autoCalcTimeout = null;

let scenarios = [];
let activeScenarioIndex = 0;

let supabaseClient;

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
  render();
}

(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) applyTheme(saved);
  else applyTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

/* ===============================
   AUTH FUNCTIONS (GLOBAL SCOPE)
================================ */

async function signUp(email, password) {
  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Check your email to confirm your account");
  }
}

async function signIn(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
  }
}

async function signInWithMagicLink(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Check your email for the login link");
  }
}

async function checkUser() {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (user) {
    console.log("Logged in:", user.email);
  } else {
    console.log("Not logged in");
  }
}

/* ===============================
   MODAL FUNCTIONS
================================ */

function openAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  const emailInput = document.getElementById("auth-email");
  overlay.classList.remove("hidden");
  emailInput.focus();
}

function closeAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  overlay.classList.add("hidden");
}

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", () => {
  // Create Supabase client
  supabaseClient = supabase.createClient(
    "https://gdnofslwtaducxozegtb.supabase.co",
    "sb_publishable_35Zc4aiUlnYro4BuvP8OXQ_qV3XWK2s"
  );

  checkUser();

  canvas = document.getElementById("growthChart");
  ctx = canvas.getContext("2d");

  resizeCanvas();
  
  // Initialize with one scenario
  if (scenarios.length === 0) {
    scenarios.push(createScenario());
    activeScenarioIndex = 0;
  }

  // Menu button
  const menuBtn = document.querySelector(".menu-btn");
  const appMenu = document.getElementById("appMenu");

  if (menuBtn && appMenu) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      appMenu.classList.toggle("open");
    });

    document.addEventListener("click", () => {
      appMenu.classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        appMenu.classList.remove("open");
      }
    });
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });

  // Mouse/touch interactions (single set of listeners)
  let isInteracting = false;

  canvas.addEventListener("pointerdown", e => {
    isInteracting = true;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    rawX = e.clientX - rect.left;
    targetX = rawX;
    currentX = rawX;
    render();
  });

  canvas.addEventListener("pointermove", e => {
    const rect = canvas.getBoundingClientRect();
    rawX = e.clientX - rect.left;
    targetX = rawX;
    if (currentX === null) currentX = targetX;
    render();
  });

  canvas.addEventListener("pointerup", e => {
    isInteracting = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    clearCursor();
  });

  canvas.addEventListener("pointercancel", () => {
    isInteracting = false;
    clearCursor();
  });

  canvas.addEventListener("mouseleave", () => {
    clearCursor();
  });

  // Input listeners
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", scheduleCalculate);
    el.addEventListener("change", scheduleCalculate);
  });

  // Add comma formatting to number inputs
  const numberInputs = document.querySelectorAll('input[type="number"]');
  numberInputs.forEach(input => {
    // Format on blur
    input.addEventListener('blur', function() {
      if (this.value) {
        const value = parseFloat(this.value.replace(/,/g, ''));
        if (!isNaN(value)) {
          this.value = value.toLocaleString('en-US', {
            maximumFractionDigits: 2
          });
        }
      }
    });

    // Remove commas on focus
    input.addEventListener('focus', function() {
      this.value = this.value.replace(/,/g, '');
    });
  });

  // Chart menu
  const chartMenuBtn = document.getElementById("chartMenuBtn");
  const chartMenu = document.getElementById("chartMenu");

  if (chartMenuBtn && chartMenu) {
    chartMenuBtn.onclick = async () => {
      const { data } = await supabaseClient.auth.getUser();
      if (!data.user) {
        openAuthModal();
        return;
      }
      chartMenu.style.display = chartMenu.style.display === "block" ? "none" : "block";
    };

    document.addEventListener("click", e => {
      if (!chartMenu.contains(e.target) && e.target !== chartMenuBtn) {
        chartMenu.style.display = "none";
      }
    });
  }

  // Auth modal
  const overlay = document.getElementById("auth-overlay");
  const emailInput = document.getElementById("auth-email");
  const magicBtn = document.getElementById("magic-link-btn");
  const closeBtn = document.querySelector(".auth-close");

  if (overlay) {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeAuthModal();
    });
  }

  if (closeBtn) {
    closeBtn.onclick = closeAuthModal;
  }

  if (magicBtn && emailInput) {
    magicBtn.onclick = async () => {
      const email = emailInput.value.trim();
      if (!email) return;

      const { error } = await supabaseClient.auth.signInWithOtp({ email });

      if (error) {
        alert(error.message);
      } else {
        magicBtn.textContent = "Check your email";
        magicBtn.disabled = true;
      }
    };
  }

  // Scenario controls
  const addBtn = document.getElementById("addScenario");
  const prevBtn = document.getElementById("prevScenario");
  const nextBtn = document.getElementById("nextScenario");

  if (addBtn) {
    addBtn.onclick = () => {
      if (scenarios.length === 2) {
        // Remove the second scenario
        scenarios.pop();
        activeScenarioIndex = 0;
        updateScenarioUI();
      } else if (scenarios.length < 2) {
        // Add a new scenario
        scenarios.push(createScenario());
        activeScenarioIndex = scenarios.length - 1;
        updateScenarioUI();
      }
    };
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (activeScenarioIndex > 0) {
        activeScenarioIndex--;
        updateScenarioUI();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (activeScenarioIndex < scenarios.length - 1) {
        activeScenarioIndex++;
        updateScenarioUI();
      }
    };
  }

  calculateAll();
});

/* ===============================
   SCHEDULE CALCULATE
================================ */

function scheduleCalculate() {
  clearTimeout(autoCalcTimeout);
  autoCalcTimeout = setTimeout(calculateAll, 40);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ===============================
   CORE FINANCE
================================ */

function futureValue(P, r, t, PMT, n) {
  const factor = Math.pow(1 + r / n, n * t);
  return P * factor + PMT * ((factor - 1) / (r / n));
}

/* ===============================
   SCENARIO SYSTEM
================================ */

function createScenario() {
  const principal = document.getElementById("principal");
  const rate = document.getElementById("rate");
  const years = document.getElementById("years");
  const contributions = document.getElementById("contributions");
  const contributionFreq = document.getElementById("contributionFreq");
  const compoundFreq = document.getElementById("compoundFreq");

  return {
    inputs: {
      principal: principal ? +principal.value || 10000 : 10000,
      rate: rate ? +rate.value || 7 : 7,
      years: years ? +years.value || 30 : 30,
      contribution: contributions ? +contributions.value || 0 : 0,
      contributionFreq: contributionFreq ? contributionFreq.value : "annual",
      compoundFreq: compoundFreq ? +compoundFreq.value : 12
    },
    data: [],
    contributionData: []
  };
}

function updateScenarioUI() {
  updateScenarioIndicator();
  const total = scenarios.length;
  const index = activeScenarioIndex + 1;

  const label = document.getElementById("scenarioIndex");
  const prevBtn = document.getElementById("prevScenario");
  const nextBtn = document.getElementById("nextScenario");
  const addBtn = document.getElementById("addScenario");

  /* ---------- LABEL ---------- */
  label.textContent =
    total === 1 ? `` : `Scenario ${index} of ${total}`;

  /* ---------- ARROW STATES ---------- */
  prevBtn.disabled = total === 1 || activeScenarioIndex === 0;
  nextBtn.disabled = total === 1 || activeScenarioIndex === total - 1;

  prevBtn.classList.toggle("disabled", prevBtn.disabled);
  nextBtn.classList.toggle("disabled", nextBtn.disabled);

  /* ---------- UPDATE ADD/REMOVE BUTTON ---------- */
  if (addBtn) {
    if (total === 2) {
      addBtn.textContent = "− Remove comparison";
    } else {
      addBtn.textContent = "+ Add comparison";
    }
  }

  /* ---------- LOAD INPUTS ---------- */
  const s = scenarios[activeScenarioIndex];

  principal.value = s.inputs.principal;
  rate.value = s.inputs.rate;
  years.value = s.inputs.years;
  contributions.value = s.inputs.contribution;
  contributionFreq.value = s.inputs.contributionFreq;
  compoundFreq.value = s.inputs.compoundFreq;

  // Track scenario switch for glow animation
  window.lastScenarioSwitch = Date.now();

  calculateAll();
}

function saveInputsToScenario() {
  const s = scenarios[activeScenarioIndex];

  const principal = document.getElementById("principal");
  const rate = document.getElementById("rate");
  const years = document.getElementById("years");
  const contributions = document.getElementById("contributions");
  const contributionFreq = document.getElementById("contributionFreq");
  const compoundFreq = document.getElementById("compoundFreq");

  s.inputs = {
    principal: principal ? parseFloat(principal.value.replace(/,/g, '')) || 0 : 10000,
    rate: rate ? parseFloat(rate.value.replace(/,/g, '')) || 0 : 7,
    years: years ? parseFloat(years.value.replace(/,/g, '')) || 0 : 30,
    contribution: contributions ? parseFloat(contributions.value.replace(/,/g, '')) || 0 : 0,
    contributionFreq: contributionFreq ? contributionFreq.value : "annual",
    compoundFreq: compoundFreq ? +compoundFreq.value : 12
  };
}

function calculateScenario(s) {
  const {
    principal,
    rate,
    years,
    contribution,
    contributionFreq,
    compoundFreq
  } = s.inputs;

  const P = principal;
  const r = rate / 100;
  const t = years;
  const n = compoundFreq;

  let PMT;
  if (contributionFreq === "daily") PMT = (contribution * 365) / n;
  else if (contributionFreq === "monthly") PMT = (contribution * 12) / n;
  else PMT = contribution / n;

  s.data = [];
  s.contributionData = [];

  const months = t * 12;

  for (let m = 0; m <= months; m++) {
    const y = m / 12;
    const totalValue = futureValue(P, r, y, PMT, n);
    const contribValue = P + PMT * n * y;
    s.data.push(totalValue);
    s.contributionData.push(contribValue);
  }
}

function calculateAll() {
  saveInputsToScenario();
  
  const s = scenarios[activeScenarioIndex];
  
  // Validation
  if (s.inputs.principal <= 0 || s.inputs.rate <= 0 || s.inputs.rate > 50 || 
      s.inputs.years < 1 || s.inputs.years > 100 || s.inputs.contribution < 0) {
    const chartTotal = document.getElementById("chartTotal");
    if (chartTotal) {
      chartTotal.textContent = "Please enter valid values";
    }
    return;
  }
  
  scenarios.forEach(calculateScenario);

  yearsTotal = s.inputs.years;

  const chartTotal = document.getElementById("chartTotal");
  if (chartTotal && s.data.length) {
    const total = s.data[s.data.length - 1];
    const contrib = s.contributionData[s.contributionData.length - 1];
    const growth = total - contrib;

    chartTotal.innerHTML = `
      <div class="result-main">
        <span class="result-prefix">After ${s.inputs.years} years</span>
        <span class="result-amount"><b>${formatMoneyExact(total)}</b></span>
      </div>
      <div class="result-breakdown">
        <div><span>Principal & Contributions: ${formatMoneyExact(contrib)}</span></div>
        <div><span>Growth: ${formatMoneyExact(growth)}</span></div>
      </div>
    `;
  }

  render();
}

/* ===============================
   RENDERING
================================ */

function render() {
  if (!ctx || !canvas) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allValues = scenarios.flatMap(s => s.data);
  if (!allValues.length) return;

  const min = Math.min(...allValues) * 0.95;
  const max = Math.max(...allValues);

  drawGrid();
  drawAxes(min, max);

  // Draw inactive scenario first, then active one (for proper overlap)
  const sortedScenarios = [...scenarios].sort((a, b) => {
    const aIndex = scenarios.indexOf(a);
    const bIndex = scenarios.indexOf(b);
    if (aIndex === activeScenarioIndex) return 1;
    if (bIndex === activeScenarioIndex) return -1;
    return 0;
  });

  sortedScenarios.forEach((s) => {
    const i = scenarios.indexOf(s);
    drawContributionLine(s.contributionData, min, max, i);
    drawLine(s.data, min, max, i);

  });

  if (rawX !== null) {
    drawCursor();
  }
  
  // Continue glow animation
  const glowTime = Date.now() - (window.lastScenarioSwitch || 0);
  if (glowTime < 800) {
    requestAnimationFrame(render);
  }
}

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

function drawLine(lineData, min, max, scenarioIndex) {
  if (!lineData || !lineData.length) return;
  
  const isActive = scenarioIndex === activeScenarioIndex;
  const glowTime = Date.now() - (window.lastScenarioSwitch || 0);
  const shouldGlow = isActive && glowTime < 800;
  
  ctx.strokeStyle = getLineColor(scenarioIndex);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Add glow effect
  if (shouldGlow) {
    const glowIntensity = 1 - (glowTime / 800);
    ctx.shadowBlur = 20 * glowIntensity;
    ctx.shadowColor = getLineColor(scenarioIndex);
  }

  ctx.beginPath();
  lineData.forEach((v, i) => {
    const x = padding + (i * plotWidth()) / (lineData.length - 1);
    const y = mapY(v, min, max);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Reset shadow
  ctx.shadowBlur = 0;
}

function drawContributionLine(lineData, min, max, scenarioIndex) {
  if (!lineData || !lineData.length) return;
  
  ctx.strokeStyle = scenarioIndex === 0 ? "#00ae49" : "#60a5fa";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  lineData.forEach((v, i) => {
    const x = padding + (i * plotWidth()) / (lineData.length - 1);
    const y = mapY(v, min, max);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.setLineDash([]);
}

 function drawCursor() {
  const s = scenarios[activeScenarioIndex];
  if (!s.data.length || rawX === null) return;

  const rel = (rawX - padding) / plotWidth();
  if (rel < 0 || rel > 1) return;

  const rawIndex = rel * (s.data.length - 1);
  const snappedIndex = Math.round(rawIndex);
  const year = Math.round(snappedIndex / 12 * 10) / 10;

  if (snappedIndex !== lastSnappedYear) {
    lastSnappedYear = snappedIndex;
    if (navigator.vibrate) {
      navigator.vibrate(6);
    }
  }

  const allValues = scenarios.flatMap(sc => sc.data);
  const min = Math.min(...allValues) * 0.95;
  const max = Math.max(...allValues);

  const px = padding + (snappedIndex / (s.data.length - 1)) * plotWidth();
  const dark = document.body.classList.contains("dark");

  // Draw vertical line with smooth animation
  ctx.strokeStyle = dark ? "#9ca3af" : "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, padding);
  ctx.lineTo(px, canvasHeight() - padding);
  ctx.stroke();

  // Draw cursor dots for each scenario
  scenarios.forEach((scenario, i) => {
    const totalValue = scenario.data[snappedIndex];
    const py = mapY(totalValue, min, max);
    
    ctx.fillStyle = getLineColor(i);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Add white outline
    ctx.strokeStyle = dark ? "#0f172a" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 2; // reset
  });

  // Prepare data for all scenarios with Y positions
  const scenarioData = scenarios.map((scenario, i) => ({
    totalValue: scenario.data[snappedIndex],
    contribValue: scenario.contributionData[snappedIndex],
    growthValue: scenario.data[snappedIndex] - scenario.contributionData[snappedIndex],
    color: getLineColor(i),
    index: i,
    py: mapY(scenario.data[snappedIndex], min, max)
  }));

  // Sort by Y position (top to bottom) for proper ordering
  const sortedScenarios = [...scenarioData].sort((a, b) => a.py - b.py);

  // Build lines based on number of scenarios - ORDERED BY POSITION
  let lines = [];
  let colorMap = [];
  let fontStyles = [];
  
  if (scenarios.length === 1) {
    const data = scenarioData[0];
    lines = [
      formatMoneySmart(data.totalValue),
      `${formatMoneySmart(data.contribValue)} principal`,
      `${formatMoneySmart(data.growthValue)} growth`,
      `Year ${year}`
    ];
    colorMap = [null, null, null, null];
    fontStyles = ['bold-large', 'normal', 'normal', 'normal'];
  } else {
    // Two scenarios - show both ordered by Y position (higher = first)
    lines = [`Year ${year}`, ''];
    colorMap = [null, null];
    fontStyles = ['bold', null];
    
    sortedScenarios.forEach((data, displayIdx) => {
      lines.push(`Scenario ${data.index + 1}`);
      colorMap.push(data.color);
      fontStyles.push('bold');
      
      lines.push(`  ${formatMoneySmart(data.totalValue)} total`);
      colorMap.push(null);
      fontStyles.push('bold-medium');
      
      lines.push(`  ${formatMoneySmart(data.contribValue)} principal`);
      colorMap.push(null);
      fontStyles.push('normal');
      
      lines.push(`  ${formatMoneySmart(data.growthValue)} growth`);
      colorMap.push(null);
      fontStyles.push('normal');
      
      if (displayIdx < sortedScenarios.length - 1) {
        lines.push('');
        colorMap.push(null);
        fontStyles.push(null);
      }
    });
  }

  // Set default font for measurement
  ctx.font = "15px Candara, 'Segoe UI', system-ui, sans-serif";

  const paddingX = 12;
  const paddingY = 10;
  const lineHeight = 18;

  // Calculate box dimensions
  const textWidths = lines.map((l, i) => {
    if (l === '') return 0;
    const style = fontStyles[i];
    if (style === 'bold-large') {
      ctx.font = "bold 20px Candara, 'Segoe UI', system-ui, sans-serif";
    } else if (style === 'bold-medium') {
      ctx.font = "bold 16px Candara, 'Segoe UI', system-ui, sans-serif";
    } else if (style === 'bold') {
      ctx.font = "bold 15px Candara, 'Segoe UI', system-ui, sans-serif";
    } else {
      ctx.font = "15px Candara, 'Segoe UI', system-ui, sans-serif";
    }
    return ctx.measureText(l).width;
  });
  const boxWidth = Math.max(...textWidths) + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2;

  // Use the midpoint between the two scenarios for positioning
  const py = scenarios.length === 1 
    ? mapY(s.data[snappedIndex], min, max)
    : (sortedScenarios[0].py + sortedScenarios[sortedScenarios.length - 1].py) / 2;

  let boxX = px + 12;
  if (boxX + boxWidth > canvasWidth() - 8) {
    boxX = px - boxWidth - 12;
  }

  // Constrain box vertically within chart bounds
  let boxY = py - boxHeight / 2;
  const minY = padding + 6;
  const maxY = canvasHeight() - padding - boxHeight - 6;
  
  boxY = Math.max(minY, Math.min(boxY, maxY));

  // AWARD-WINNING GLASSY TOOLTIP STYLING
  const boxBg = dark ? "rgba(18, 22, 28, 0.75)" : "rgba(255, 255, 255, 0.9)";
  const boxBorder = dark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.12)";
  const innerBorder = dark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.8)";
  
  // Multiple layered shadows for depth
  ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.8)" : "rgba(15, 23, 42, 0.2)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;
  
  // Main background
  ctx.fillStyle = boxBg;
  if (typeof roundRect === 'function') {
    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 16);
    ctx.fill();
  } else {
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  }
  
  // Reset shadow for inner elements
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Subtle gradient overlay for depth
  const gradientOverlay = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxHeight);
  if (dark) {
    gradientOverlay.addColorStop(0, "rgba(255, 255, 255, 0.03)");
    gradientOverlay.addColorStop(0.3, "rgba(255, 255, 255, 0.01)");
    gradientOverlay.addColorStop(1, "rgba(0, 0, 0, 0.1)");
  } else {
    gradientOverlay.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    gradientOverlay.addColorStop(0.4, "rgba(255, 255, 255, 0)");
    gradientOverlay.addColorStop(1, "rgba(15, 23, 42, 0.02)");
  }
  ctx.fillStyle = gradientOverlay;
  if (typeof roundRect === 'function') {
    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 16);
    ctx.fill();
  }

  // Outer border
  ctx.strokeStyle = boxBorder;
  ctx.lineWidth = 1;
  if (typeof roundRect === 'function') {
    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 16);
    ctx.stroke();
  } else {
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  }
  
  // Inner highlight border (inset glow effect)
  ctx.strokeStyle = innerBorder;
  ctx.lineWidth = 1.5;
  if (typeof roundRect === 'function') {
    roundRect(ctx, boxX + 1, boxY + 1, boxWidth - 2, boxHeight - 2, 15);
    ctx.stroke();
  }
  
  ctx.lineWidth = 2; // reset

  // Draw text with color coding and dynamic styling
  lines.forEach((text, i) => {
    if (text === '') return; // skip spacer
    
    // Apply font style based on fontStyles array
    const style = fontStyles[i];
    if (style === 'bold-large') {
      ctx.font = "bold 20px Candara, 'Segoe UI', system-ui, sans-serif";
    } else if (style === 'bold-medium') {
      ctx.font = "bold 16px Candara, 'Segoe UI', system-ui, sans-serif";
    } else if (style === 'bold') {
      ctx.font = "bold 15px Candara, 'Segoe UI', system-ui, sans-serif";
    } else {
      ctx.font = "15px Candara, 'Segoe UI', system-ui, sans-serif";
    }
    
    // Apply color
    if (colorMap[i]) {
      ctx.fillStyle = colorMap[i];
    } else {
      ctx.fillStyle = dark ? "#f5f7fa" : "#111827";
    }
    
    ctx.fillText(text, boxX + paddingX, boxY + paddingY + (i + 1) * lineHeight - 6);
  });
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
  return canvasHeight() - padding - ((v - min) / (max - min || 1)) * plotHeight();
}

function formatMoneySmart(value) {
  const abs = Math.abs(value);
  if (abs < 1000) return `$${Math.round(value)}`;
  if (abs < 1000000) return `$${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs < 1000000000) return `$${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  return `$${(value / 1000000000).toFixed(1).replace(/\.0$/, "")}B`;
}

function formatMoneyExact(value) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function clearCursor() {
  targetX = null;
  rawX = null;
  setTimeout(() => {
    currentX = null;
    render();
  }, 60);
}

function getLineColor(i) {
  return i === 0 ? "#00ae49" : "#2563eb";
}


/* ===============================
   ROUNDED RECT HELPER
================================ */

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* ===============================
   EXPORT
================================ */

function buildExportHTML() {
  const principal = document.getElementById("principal");
  const rate = document.getElementById("rate");
  const years = document.getElementById("years");
  const contributions = document.getElementById("contributions");
  const contributionFreq = document.getElementById("contributionFreq");
  const compoundFreq = document.getElementById("compoundFreq");

  const inputs = [
    ["Initial Investment", formatMoneyExact(+principal.value)],
    ["Annual Rate", `${rate.value}%`],
    ["Years", years.value],
    ["Contribution", `${formatMoneyExact(+contributions.value || 0)} (${contributionFreq.value})`],
    ["Compound Frequency", compoundFreq.options[compoundFreq.selectedIndex].text]
  ];

  const resultAmount = document.querySelector(".result-amount");
  const resultBreakdown = document.querySelector(".result-breakdown");

  const summaryHTML = `
    <h3>Yieldora.ai</h3>
    <h2>Compound Interest Graph</h2>
    <div style="font-size:32px;font-weight:700;margin:10px 0;">
      ${resultAmount ? resultAmount.innerText : ""}
    </div>
    <div style="color:#666;margin-bottom:20px">
      ${resultBreakdown ? resultBreakdown.innerText : ""}
    </div>
  `;

  const inputHTML = `
    <h3>Inputs</h3>
    <table cellspacing="0" cellpadding="6">
      ${inputs.map(([k, v]) =>
        `<tr><td style="color:#666">${k}</td><td><strong>${v}</strong></td></tr>`
      ).join("")}
    </table>
  `;

  const chartImg = canvas.toDataURL("image/png");
  return `
    <html>
    <head>
      <title>Yieldora.ai - Compound Interest Graph</title>
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
      <img src="${chartImg}" style="width:100%;max-width:600px;margin-top:0px"/>
    </body>
    </html>
  `;
}

function exportChart(type) {
  const html = buildExportHTML();
  const win = window.open("");

  win.document.write(html);
  win.document.close();

  win.onload = () => {
    const img = win.document.querySelector("img");
    if (!img) {
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

// Make export function globally available
window.exportChart = exportChart;

function animateScenario(direction) {
  const wrapper = document.getElementById("inputsWrapper");

  wrapper.classList.remove("animate-left", "animate-right");

  // Force reflow (important)
  void wrapper.offsetWidth;

  wrapper.classList.add(
    direction === "next" ? "animate-left" : "animate-right"
  );
}

document.getElementById("prevScenario").onclick = () => {
  if (activeScenarioIndex > 0) {
    activeScenarioIndex--;
    animateScenario("prev");
    updateScenarioUI();
  }
};

document.getElementById("nextScenario").onclick = () => {
  if (activeScenarioIndex < scenarios.length - 1) {
    activeScenarioIndex++;
    animateScenario("next");
    updateScenarioUI();
  }
};


document.getElementById("addScenario").onclick = () => {
  if (scenarios.length >= 2) return;

  scenarios.push(createScenario());
  activeScenarioIndex = 1;

  animateScenario("next");
  updateScenarioUI();
};

document.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") prevScenario.click();
  if (e.key === "ArrowRight") nextScenario.click();
});

function updateScenarioIndicator() {
  const indicator = document.getElementById("scenarioIndicator");
  const dot = indicator.querySelector(".scenario-dot");
  const text = indicator.querySelector(".scenario-text");
  const prevArrow = indicator.querySelector(".scenario-arrow.prev");
  const nextArrow = indicator.querySelector(".scenario-arrow.next");

  if (scenarios.length <= 1) {
    indicator.classList.remove("visible");
    indicator.classList.add("hidden");
    return;
  }

  indicator.classList.remove("hidden");
  requestAnimationFrame(() => indicator.classList.add("visible"));

  const index = activeScenarioIndex + 1;
  const total = scenarios.length;

  text.textContent = `Scenario ${index} of ${total}`;
  dot.style.background = getLineColor(activeScenarioIndex);
  
  // Update arrow states
  prevArrow.classList.toggle("disabled", activeScenarioIndex === 0);
  nextArrow.classList.toggle("disabled", activeScenarioIndex === total - 1);
}


document.querySelectorAll(".scenario-arrow.prev").forEach(el => {
  el.addEventListener("click", () => {
    if (activeScenarioIndex > 0) {
      activeScenarioIndex--;
      animateScenario("prev");
      updateScenarioUI();
    }
  });
});

document.querySelectorAll(".scenario-arrow.next").forEach(el => {
  el.addEventListener("click", () => {
    if (activeScenarioIndex < scenarios.length - 1) {
      activeScenarioIndex++;
      animateScenario("next");
      updateScenarioUI();
    }
  });
});

document.querySelectorAll(".scenario-arrow.next").forEach(el => {
  el.addEventListener("click", () => {
    if (activeScenarioIndex < scenarios.length - 1) {
      activeScenarioIndex++;
      animateScenario("next");
      updateScenarioUI();
    }
  });
});
