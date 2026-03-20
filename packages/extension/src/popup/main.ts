const statusEl = document.getElementById("status")!;
const challengeEl = document.getElementById("challenge")!;
const checkBtn = document.getElementById("check-btn")!;
const resultEl = document.getElementById("result")!;
const graphImg = document.getElementById("graph-img") as HTMLImageElement;

interface Challenge {
  targetExpressions: string[];
  graphData: {
    xRange?: [number, number];
    yRange?: [number, number];
  };
  date: string;
}

let currentChallenge: Challenge | null = null;

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function renderTargetPreview(
  tabId: number,
  challenge: Challenge
): Promise<string | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (
      expressions: string[],
      xRange: [number, number],
      yRange: [number, number]
    ) => {
      const Desmos = (window as any).Desmos;
      if (!Desmos) return null;

      const div = document.createElement("div");
      div.style.cssText =
        "width:800px;height:600px;position:absolute;left:-9999px;top:-9999px;";
      document.body.appendChild(div);

      let calc: any;
      try {
        calc = Desmos.GraphingCalculator(div, {
          expressions: false,
          settingsMenu: false,
          zoomButtons: false,
          keypad: false,
          autosize: false,
          border: false,
          showGrid: false,
          showXAxis: false,
          showYAxis: false,
        });
        calc.resize();
        calc.setMathBounds({
          left: xRange[0],
          right: xRange[1],
          bottom: yRange[0],
          top: yRange[1],
        });

        for (let i = 0; i < expressions.length; i++) {
          calc.setExpression({
            id: `target-${i}`,
            latex: expressions[i],
            color: "#000000",
          });
        }

        const png: string = await new Promise((resolve) => {
          calc.asyncScreenshot(
            {
              width: 400,
              height: 300,
              targetPixelRatio: 1,
              mode: "stretch",
              mathBounds: {
                left: xRange[0],
                right: xRange[1],
                bottom: yRange[0],
                top: yRange[1],
              },
            },
            resolve
          );
        });

        return png;
      } catch {
        return null;
      } finally {
        if (calc) calc.destroy();
        div.remove();
      }
    },
    args: [
      challenge.targetExpressions,
      challenge.graphData.xRange ?? [-10, 10],
      challenge.graphData.yRange ?? [-10, 10],
    ],
  });

  return results?.[0]?.result ?? null;
}

async function loadChallenge() {
  try {
    const res = await fetch("http://localhost:3000/api/challenges/today");
    if (!res.ok) throw new Error("Failed to fetch challenge");

    const challenge: Challenge = await res.json();
    currentChallenge = challenge;
    statusEl.textContent = challenge.date;
    challengeEl.classList.remove("hidden");

    const tab = await getActiveTab();
    if (!tab?.id) {
      graphImg.alt = "Open Desmos to see the target graph";
      return;
    }

    const png = await renderTargetPreview(tab.id, challenge);
    if (png) {
      graphImg.src = png;
    } else {
      graphImg.alt = "Could not render target graph";
    }
  } catch {
    statusEl.textContent = "Could not load today's challenge.";
  }
}

checkBtn.addEventListener("click", async () => {
  if (!currentChallenge) return;

  const tab = await getActiveTab();
  if (!tab?.id) return;

  resultEl.classList.remove("hidden", "success", "error");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (
        targetExprs: string[],
        xRange: [number, number],
        yRange: [number, number]
      ) => {
        const Desmos = (window as any).Desmos;
        const Calc = (window as any).Calc;
        if (!Desmos || !Calc) return { match: false, score: 0, error: "Desmos API not found" };

        const userExpressions: string[] = Calc.getExpressions()
          .filter((e: any) => e.latex && e.type === "expression")
          .map((e: any) => e.latex);

        if (userExpressions.length === 0) return { match: false, score: 0 };

        const div = document.createElement("div");
        div.style.cssText =
          "width:800px;height:600px;position:absolute;left:-9999px;top:-9999px;";
        document.body.appendChild(div);

        let calc: any;
        try {
          calc = Desmos.GraphingCalculator(div, {
            expressions: false,
            settingsMenu: false,
            zoomButtons: false,
            keypad: false,
            autosize: false,
            border: false,
            showGrid: false,
            showXAxis: false,
            showYAxis: false,
          });
          calc.resize();

          const bounds = {
            left: xRange[0],
            right: xRange[1],
            bottom: yRange[0],
            top: yRange[1],
          };
          const shotOpts = {
            width: 400,
            height: 300,
            targetPixelRatio: 1,
            mode: "stretch" as const,
            mathBounds: bounds,
          };

          // Render target
          calc.setMathBounds(bounds);
          for (let i = 0; i < targetExprs.length; i++) {
            calc.setExpression({
              id: `t-${i}`,
              latex: targetExprs[i],
              color: "#000000",
            });
          }
          const targetPng: string = await new Promise((r) =>
            calc.asyncScreenshot(shotOpts, r)
          );

          // Render user
          calc.setBlank();
          calc.setMathBounds(bounds);
          for (let i = 0; i < userExpressions.length; i++) {
            calc.setExpression({
              id: `u-${i}`,
              latex: userExpressions[i],
              color: "#000000",
            });
          }
          const userPng: string = await new Promise((r) =>
            calc.asyncScreenshot(shotOpts, r)
          );

          // Pixel comparison
          const W = 400;
          const H = 300;

          async function loadImageData(dataUrl: string): Promise<Uint8ClampedArray> {
            const img = new Image();
            img.src = dataUrl;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
            });
            const canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, W, H);
            return ctx.getImageData(0, 0, W, H).data;
          }

          const targetData = await loadImageData(targetPng);
          const userData = await loadImageData(userPng);

          let intersection = 0;
          let union = 0;

          for (let i = 0; i < targetData.length; i += 4) {
            const tDrawn = !(
              targetData[i] > 240 &&
              targetData[i + 1] > 240 &&
              targetData[i + 2] > 240
            );
            const uDrawn = !(
              userData[i] > 240 &&
              userData[i + 1] > 240 &&
              userData[i + 2] > 240
            );

            if (tDrawn || uDrawn) union++;
            if (tDrawn && uDrawn) intersection++;
          }

          const score = union === 0 ? 0 : intersection / union;
          console.log("[Desmos Daily] Pixel comparison score:", score);

          return { match: score >= 0.85, score };
        } catch (err: any) {
          return { match: false, score: 0, error: err?.message ?? "Unknown error" };
        } finally {
          if (calc) calc.destroy();
          div.remove();
        }
      },
      args: [
        currentChallenge.targetExpressions,
        currentChallenge.graphData.xRange ?? [-10, 10],
        currentChallenge.graphData.yRange ?? [-10, 10],
      ],
    });

    const result = results?.[0]?.result as
      | { match: boolean; score: number; error?: string }
      | undefined;

    if (result?.error) {
      resultEl.textContent = "Could not read Desmos. Is the calculator open?";
      resultEl.classList.add("error");
    } else if (result?.match) {
      resultEl.textContent = "Challenge Completed!";
      resultEl.classList.add("success");
    } else {
      resultEl.textContent = "Not quite — keep trying!";
      resultEl.classList.add("error");
    }
  } catch {
    resultEl.textContent = "Could not read Desmos. Is the calculator open?";
    resultEl.classList.add("error");
  }
});

loadChallenge();
