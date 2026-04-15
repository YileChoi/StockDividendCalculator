const PALETTE = [
  "#177245",
  "#2e8b57",
  "#2a9d8f",
  "#4b7a9f",
  "#607fb8",
  "#8c6eb7",
  "#b47651",
  "#9e5f5f",
  "#5e8f5b",
  "#c08b39",
];

export function renderDoughnutChart({
  canvas,
  legendEl,
  slices,
  emptyLabel = "No data yet.",
  centerLabel = "",
  centerValue = "",
}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const prepared = prepareCanvas(canvas);
  if (!prepared) {
    return;
  }
  const { ctx, width, height } = prepared;
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, width, height);

  const normalized = normalizeSlices(slices);
  if (!normalized.length) {
    drawEmptyState(ctx, width, height, emptyLabel);
    renderLegend(legendEl, [], 0);
    return;
  }

  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.floor(Math.min(width, height) * 0.42);
  const innerRadius = Math.floor(outerRadius * 0.6);
  let startAngle = -Math.PI / 2;

  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index];
    const ratio = item.value / total;
    const sweep = ratio * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const color = PALETTE[index % PALETTE.length];
    item.color = color;
    item.ratio = ratio;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    startAngle = endAngle;
  }

  // Cutout center to convert pie into doughnut.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#f7fcf9";
  ctx.fill();
  ctx.strokeStyle = "#d8e7de";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (centerLabel) {
    ctx.fillStyle = "#4f6a5e";
    ctx.font = "600 12px Avenir Next, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(centerLabel, cx, cy - 10);
  }
  if (centerValue) {
    ctx.fillStyle = "#1f3b2f";
    ctx.font = "700 15px Avenir Next, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(centerValue, cx, cy + 10);
  }

  renderLegend(legendEl, normalized, total);
}

function normalizeSlices(slices) {
  if (!Array.isArray(slices)) {
    return [];
  }
  return slices
    .map((item) => {
      const value = Number(item?.value);
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      return {
        label: sanitizeText(item?.label, "Unnamed"),
        value,
        meta: typeof item?.meta === "string" ? item.meta : "",
      };
    })
    .filter(Boolean);
}

function drawEmptyState(ctx, width, height, emptyLabel) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.floor(Math.min(width, height) * 0.4);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#edf5f0";
  ctx.fill();
  ctx.strokeStyle = "#d8e4dd";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.floor(radius * 0.6), 0, Math.PI * 2);
  ctx.fillStyle = "#f9fdfb";
  ctx.fill();
  ctx.strokeStyle = "#deebe3";
  ctx.stroke();

  ctx.fillStyle = "#5f766a";
  ctx.font = "600 12px Avenir Next, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emptyLabel, cx, cy);
}

function renderLegend(legendEl, slices, total) {
  if (!(legendEl instanceof HTMLElement)) {
    return;
  }
  if (!slices.length || total <= 0) {
    legendEl.innerHTML =
      '<li class="chartLegendItem"><span class="chartLegendMeta">No values to display yet.</span></li>';
    return;
  }

  legendEl.innerHTML = slices
    .map((item) => {
      const pct = ((item.value / total) * 100).toFixed(2);
      const meta = item.meta || `${pct}% of total`;
      return `<li class="chartLegendItem">
        <div class="chartLegendHead">
          <span class="chartLegendSwatch" style="background:${escapeHtml(item.color)}"></span>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
        <span class="chartLegendMeta">${escapeHtml(meta)}</span>
      </li>`;
    })
    .join("");
}

function sanitizeText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.width || 320));
  const height = Math.max(1, Math.round(rect.height || canvas.height || width));
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}
