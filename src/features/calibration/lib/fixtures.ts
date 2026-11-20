import type { CellMetrics } from "../../../shared/cell";

export interface Fixture {
  id: string;
  name: string;
  caption: string;
  canvas: HTMLCanvasElement;
}

const WIDTH = 480;
const HEIGHT = 300;

function surface(): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("当前浏览器无法创建 2D 画布");
  return { canvas, g };
}

/**
 * A thin-line figure: bright hairlines over near-black, plus a soft glow and
 * two hard edges. Mean-only selection smears the hairlines; structure-aware
 * selection should keep a cleaner step where the line runs.
 */
function lineArt(): HTMLCanvasElement {
  const { canvas, g } = surface();
  const bg = g.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#080a0e");
  bg.addColorStop(1, "#12151b");
  g.fillStyle = bg;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  g.lineCap = "round";
  // Hairline contours, 1 px wide at the fixture resolution.
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(232, 240, 214, ${0.9 - i * 0.05})`;
    g.lineWidth = i % 3 === 0 ? 1.6 : 0.9;
    g.beginPath();
    for (let x = 0; x <= WIDTH; x += 4) {
      const y =
        60 +
        i * 22 +
        Math.sin((x / WIDTH) * Math.PI * 2 + i * 0.7) * (26 - i * 2);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // A hard-edged bar and a fine cross-hatch patch.
  g.fillStyle = "#eff4e6";
  g.fillRect(38, 26, 150, 3);
  g.fillRect(38, 40, 96, 2);
  g.strokeStyle = "rgba(238, 244, 226, 0.75)";
  g.lineWidth = 1;
  for (let x = 300; x < 440; x += 6) {
    g.beginPath();
    g.moveTo(x, 250);
    g.lineTo(x + 22, 214);
    g.stroke();
  }
  // Soft dot, to exercise partial coverage.
  const glow = g.createRadialGradient(390, 70, 2, 390, 70, 44);
  glow.addColorStop(0, "rgba(240, 246, 226, 0.95)");
  glow.addColorStop(1, "rgba(240, 246, 226, 0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(390, 70, 44, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

/** A smooth horizontal gradient with a faint vertical falloff. */
function gradient(): HTMLCanvasElement {
  const { canvas, g } = surface();
  const ramp = g.createLinearGradient(0, 0, WIDTH, 0);
  ramp.addColorStop(0, "#05070a");
  ramp.addColorStop(0.5, "#8b93a0");
  ramp.addColorStop(1, "#fbfdf4");
  g.fillStyle = ramp;
  g.fillRect(0, 0, WIDTH, HEIGHT);
  const fall = g.createLinearGradient(0, 0, 0, HEIGHT);
  fall.addColorStop(0, "rgba(255,255,255,0.18)");
  fall.addColorStop(0.55, "rgba(255,255,255,0)");
  fall.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = fall;
  g.fillRect(0, 0, WIDTH, HEIGHT);
  return canvas;
}

export function fixtures(): Fixture[] {
  return [
    {
      id: "lines",
      name: "细线图",
      caption: "纤细线条与硬边 · 结构差异最明显",
      canvas: lineArt(),
    },
    {
      id: "gradient",
      name: "渐变图",
      caption: "连续明暗 · 阶梯是否平滑",
      canvas: gradient(),
    },
  ];
}

/** Keep the fixture at roughly the calibrated cell's aspect ratio. */
export function fixtureColumns(metrics: CellMetrics, columns = 58): {
  columns: number;
  rows: number;
} {
  const aspect = metrics.cellHeight / metrics.cellWidth;
  return {
    columns,
    rows: Math.max(1, Math.round((HEIGHT / WIDTH) * columns / aspect)),
  };
}
