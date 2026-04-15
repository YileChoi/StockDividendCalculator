export function renderLineChart({
  canvas,
  points,
  emptyLabel = "No history data yet.",
  yFormatter = (value) => String(value),
  lineColor = "#1f6f47",
}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const prepared = prepareCanvas(canvas);
  if (!prepared) {
    return;
  }
  const { ctx, width, height } = prepared;
  ctx.clearRect(0, 0, width, height);

  const normalized = normalizePoints(points);
  if (!normalized.length) {
    drawEmptyState(ctx, width, height, emptyLabel);
    return;
  }

  const padding = { top: 24, right: 18, bottom: 34, left: 56 };
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const values = normalized.map((point) => point.value);
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (minY === maxY) {
    const offset = Math.max(1, Math.abs(minY) * 0.1);
    minY -= offset;
    maxY += offset;
  }

  const yTicks = 4;
  ctx.strokeStyle = "#deebe2";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#567064";
  ctx.font = "11px Avenir Next, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let tick = 0; tick <= yTicks; tick += 1) {
    const ratio = tick / yTicks;
    const y = padding.top + chartHeight * ratio;
    const value = maxY - (maxY - minY) * ratio;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(yFormatter(value), padding.left - 8, y);
  }

  ctx.strokeStyle = "#c6ddd0";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  const lastIndex = normalized.length - 1;
  const coords = normalized.map((point, index) => {
    const x =
      lastIndex === 0
        ? padding.left + chartWidth / 2
        : padding.left + (chartWidth * index) / lastIndex;
    const y =
      padding.top +
      ((maxY - point.value) / Math.max(1e-9, maxY - minY)) * chartHeight;
    return { ...point, x, y };
  });

  ctx.beginPath();
  for (let index = 0; index < coords.length; index += 1) {
    const point = coords[index];
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.fillStyle = lineColor;
  for (const point of coords) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const labelIndexes = pickLabelIndexes(coords.length);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#5a7568";
  ctx.font = "11px Avenir Next, Segoe UI, sans-serif";
  for (const index of labelIndexes) {
    const point = coords[index];
    ctx.fillText(point.label, point.x, height - padding.bottom + 8);
  }
}

function normalizePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => {
      const value = Number(point?.value);
      if (!Number.isFinite(value)) {
        return null;
      }
      const label = sanitizeLabel(point?.label);
      return { label, value };
    })
    .filter(Boolean);
}

function pickLabelIndexes(length) {
  if (length <= 1) {
    return [0];
  }
  if (length <= 4) {
    return Array.from({ length }, (_, index) => index);
  }
  const middle = Math.floor((length - 1) / 2);
  return [0, middle, length - 1];
}

function sanitizeLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 14);
}

function drawEmptyState(ctx, width, height, emptyLabel) {
  ctx.fillStyle = "#f3f9f5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#5f796c";
  ctx.font = "600 12px Avenir Next, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emptyLabel, width / 2, height / 2);
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const attrWidth = Number(canvas.getAttribute("width")) || 420;
  const attrHeight = Number(canvas.getAttribute("height")) || 280;
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || attrWidth));
  const height = Math.max(
    1,
    Math.round(rect.height || canvas.clientHeight || attrHeight),
  );
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
