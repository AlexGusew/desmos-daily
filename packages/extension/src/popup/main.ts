const statusEl = document.getElementById("status")!;
const challengeEl = document.getElementById("challenge")!;
const resultEl = document.getElementById("result")!;

const TARGET_ID_PREFIX = "desmos-daily-target-";
const CHECK_INTERVAL_MS = 2000;

interface Challenge {
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
  date: string;
}

let currentChallenge: Challenge | null = null;
let completed = false;

function showHowItWorks() {
  statusEl.textContent = "Ready to play";
  challengeEl.classList.add("hidden");
  resultEl.classList.add("hidden");
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/** Inject target expressions + progress bar + auto-check loop onto the Desmos page */
async function injectOntoPage(
  tabId: number,
  challenge: Challenge
): Promise<boolean> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (
      expressions: string[],
      idPrefix: string,
      xRange: [number, number],
      yRange: [number, number],
      intervalMs: number
    ) => {
      const Desmos = (window as any).Desmos;
      const Calc = (window as any).Calc;
      if (!Desmos || !Calc) return false;

      // --- Clean up previous session ---
      const prev = (window as any).__desmosDaily;
      if (prev) {
        clearInterval(prev.interval);
        prev.bar?.remove();
        const existing = Calc.getExpressions();
        for (const e of existing) {
          if (e.id?.startsWith(idPrefix)) Calc.removeExpression({ id: e.id });
        }
      }

      // --- Inject target expressions ---
      for (let i = 0; i < expressions.length; i++) {
        Calc.setExpression({
          id: `${idPrefix}${i}`,
          latex: expressions[i],
          color: "#2d70b3",
          lineStyle: Calc.LineStyle?.DASHED ?? "DASHED",
          lineWidth: 4,
          lineOpacity: 0.5,
          secret: true,
        });
      }

      // --- Create fixed progress bar ---
      const bar = document.createElement("div");
      bar.id = "desmos-daily-bar";
      bar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#888">DESMOS DAILY</span>
          <span id="dd-pct" style="font-size:14px;font-weight:700;color:#1a1a1a">0%</span>
        </div>
        <div style="width:100%;height:6px;background:#e5e5e5;border-radius:3px;overflow:hidden">
          <div id="dd-fill" style="height:100%;width:0%;border-radius:3px;background:#dc2626;transition:width 0.4s ease-out,background 0.3s ease"></div>
        </div>
      `;
      bar.style.cssText = `
        position:fixed;bottom:20px;right:20px;z-index:99999;
        width:220px;padding:14px 16px;
        background:#fff;border:1px solid #e0e0e0;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.08);
        font-family:"Inter",system-ui,sans-serif;
      `;
      document.body.appendChild(bar);

      const pctEl = document.getElementById("dd-pct")!;
      const fillEl = document.getElementById("dd-fill")!;

      // --- Comparison engine ---
      const calcOpts = {
        expressions: false, settingsMenu: false, zoomButtons: false,
        keypad: false, autosize: false, border: false,
        showGrid: false, showXAxis: false, showYAxis: false,
      };
      const bounds = { left: xRange[0], right: xRange[1], bottom: yRange[0], top: yRange[1] };
      const shotOpts = {
        width: 400, height: 300, targetPixelRatio: 1,
        mode: "stretch" as const, mathBounds: bounds,
      };

      async function renderToImage(exprs: string[]): Promise<string> {
        const d = document.createElement("div");
        d.style.cssText = "width:800px;height:600px;position:absolute;left:-9999px;top:-9999px;";
        document.body.appendChild(d);
        const c = Desmos.GraphingCalculator(d, calcOpts);
        try {
          c.resize();
          c.setMathBounds(bounds);
          for (let i = 0; i < exprs.length; i++) {
            c.setExpression({ id: `e-${i}`, latex: exprs[i], color: "#000000" });
          }
          return await new Promise<string>((r) => c.asyncScreenshot(shotOpts, r));
        } finally {
          c.destroy();
          d.remove();
        }
      }

      async function loadImageData(dataUrl: string): Promise<Uint8ClampedArray> {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = dataUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 400, 300);
        return ctx.getImageData(0, 0, 400, 300).data;
      }

      // Cache target screenshot (never changes)
      let cachedTargetData: Uint8ClampedArray | null = null;
      let isRunning = false;
      let isDone = false;

      async function runCheck() {
        if (isRunning || isDone) return;
        isRunning = true;
        try {
          const userExprs: string[] = Calc.getExpressions()
            .filter((e: any) => e.latex && e.type === "expression" && !e.id?.startsWith(idPrefix))
            .map((e: any) => e.latex);

          if (userExprs.length === 0) {
            pctEl.textContent = "0%";
            fillEl.style.width = "0%";
            fillEl.style.background = "#dc2626";
            return;
          }

          // Render target once and cache
          if (!cachedTargetData) {
            const targetPng = await renderToImage(expressions);
            cachedTargetData = await loadImageData(targetPng);
          }

          const userPng = await renderToImage(userExprs);
          const userData = await loadImageData(userPng);

          let intersection = 0;
          let union = 0;

          for (let i = 0; i < cachedTargetData.length; i += 4) {
            const tDrawn = !(cachedTargetData[i] > 240 && cachedTargetData[i+1] > 240 && cachedTargetData[i+2] > 240);
            const uDrawn = !(userData[i] > 240 && userData[i+1] > 240 && userData[i+2] > 240);
            if (tDrawn || uDrawn) union++;
            if (tDrawn && uDrawn) intersection++;
          }

          const score = union === 0 ? 0 : intersection / union;
          const pct = Math.round(score * 100);

          pctEl.textContent = `${pct}%`;
          fillEl.style.width = `${pct}%`;

          if (pct >= 85) {
            fillEl.style.background = "#16a34a";
            pctEl.innerHTML = `<span style="color:#16a34a">&#x2713;</span>`;
            isDone = true;
          } else if (pct >= 50) {
            fillEl.style.background = "#f59e0b";
          } else {
            fillEl.style.background = "#dc2626";
          }
        } catch (err) {
          console.error("[Desmos Daily] Check error:", err);
        } finally {
          isRunning = false;
        }
      }

      // Run first check immediately, then every intervalMs
      runCheck();
      const intervalId = setInterval(runCheck, intervalMs);

      // Store reference for cleanup
      (window as any).__desmosDaily = { interval: intervalId, bar };

      return true;
    },
    args: [
      challenge.targetExpressions,
      TARGET_ID_PREFIX,
      challenge.graphData.xRange ?? [-10, 10],
      challenge.graphData.yRange ?? [-10, 10],
      CHECK_INTERVAL_MS,
    ],
  });

  return results?.[0]?.result ?? false;
}

async function loadChallenge() {
  try {
    const res = await fetch("http://osso8sk8occc00sc8k4scgsc.65.109.235.206.sslip.io/api/challenges/today");
    if (!res.ok) throw new Error("Failed to fetch challenge");

    const challenge: Challenge = await res.json();
    currentChallenge = challenge;
    const dateStr = String(challenge.date).slice(0, 10);
    const [y, m, day] = dateStr.split("-").map(Number);
    const d = new Date(y, m - 1, day);
    statusEl.textContent = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const tab = await getActiveTab();
    if (!tab?.id) {
      statusEl.textContent = "";
      return;
    }

    const injected = await injectOntoPage(tab.id, challenge);
    if (injected) {
      challengeEl.classList.remove("hidden");
    } else {
      statusEl.textContent = "";
    }
  } catch {
    showHowItWorks();
  }
}

const barToggle = document.getElementById("bar-toggle") as HTMLInputElement;
barToggle.addEventListener("change", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const visible = barToggle.checked;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (show: boolean) => {
      const bar = document.getElementById("desmos-daily-bar");
      if (bar) bar.style.display = show ? "block" : "none";
    },
    args: [visible],
  });
});

loadChallenge();
