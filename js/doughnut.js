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

const hoverStateByCanvas = new WeakMap();
let hoverTooltipEl = null;

export function renderDoughnutChart({
  canvas,
  legendEl,
  slices,
  emptyLabel = "No data yet.",
  centerLabel = "",
  centerValue = "",
}) {
  void legendEl;

  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const prepared = prepareCanvas(canvas);
  if (!prepared) {
    return;
  }

  const { ctx, width, height } = prepared;
  ctx.clearRect(0, 0, width, height);

  const normalized = normalizeSlices(slices);
  if (!normalized.length) {
    drawEmptyState(ctx, width, height, emptyLabel);
    updateHoverModel(canvas, null);
    canvas.style.cursor = "default";
    hideTooltip();
    return;
  }

  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.floor(Math.min(width, height) * 0.42);
  const innerRadius = Math.floor(outerRadius * 0.6);
  let startAngle = -Math.PI / 2;

  const renderedSlices = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index];
    const ratio = item.value / total;
    const sweep = ratio * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const color = PALETTE[index % PALETTE.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    renderedSlices.push({
      label: item.label,
      meta: item.meta,
      value: item.value,
      ratio,
      color,
      startAngle: normalizeAngle(startAngle),
      endAngle: normalizeAngle(endAngle),
    });

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

  updateHoverModel(canvas, {
    width,
    height,
    cx,
    cy,
    innerRadius,
    outerRadius,
    slices: renderedSlices,
  });
}

function updateHoverModel(canvas, model) {
  let state = hoverStateByCanvas.get(canvas);
  if (!state) {
    const onPointerMove = (event) => {
      const currentState = hoverStateByCanvas.get(canvas);
      if (!currentState?.model) {
        canvas.style.cursor = "default";
        hideTooltip();
        return;
      }

      const hit = hitTestSlice(canvas, currentState.model, event);
      if (!hit) {
        canvas.style.cursor = "default";
        hideTooltip();
        return;
      }

      canvas.style.cursor = "pointer";
      showTooltip(event, hit);
    };

    const onPointerLeave = () => {
      canvas.style.cursor = "default";
      hideTooltip();
    };

    state = {
      model: null,
      onPointerMove,
      onPointerLeave,
    };
    hoverStateByCanvas.set(canvas, state);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointercancel", onPointerLeave);
    canvas.addEventListener("blur", onPointerLeave);
  }

  state.model = model;
}

function hitTestSlice(canvas, model, event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = ((event.clientX - rect.left) / rect.width) * model.width;
  const y = ((event.clientY - rect.top) / rect.height) * model.height;

  const dx = x - model.cx;
  const dy = y - model.cy;
  const radius = Math.hypot(dx, dy);

  if (radius < model.innerRadius || radius > model.outerRadius) {
    return null;
  }

  const angle = normalizeAngle(Math.atan2(dy, dx));
  for (const slice of model.slices) {
    if (isAngleInsideArc(angle, slice.startAngle, slice.endAngle)) {
      return slice;
    }
  }
  return null;
}

function isAngleInsideArc(angle, startAngle, endAngle) {
  if (startAngle <= endAngle) {
    return angle >= startAngle && angle <= endAngle;
  }
  return angle >= startAngle || angle <= endAngle;
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  let normalized = angle % full;
  if (normalized < 0) {
    normalized += full;
  }
  return normalized;
}

function showTooltip(event, slice) {
  const tooltip = ensureTooltip();
  const percentageText = `${(slice.ratio * 100).toFixed(2)}%`;
  const metaText = slice.meta || `${percentageText} of total`;

  tooltip.innerHTML = `
    <div class="doughnutHoverTipTitle">
      <span class="doughnutHoverSwatch" style="background:${escapeHtml(slice.color)}"></span>
      <strong>${escapeHtml(slice.label)}</strong>
    </div>
    <div class="doughnutHoverTipMeta">${escapeHtml(metaText)}</div>
  `;

  positionTooltip(tooltip, event.clientX, event.clientY);
  tooltip.classList.add("isVisible");
}

function hideTooltip() {
  if (!hoverTooltipEl) {
    return;
  }
  hoverTooltipEl.classList.remove("isVisible");
}

function ensureTooltip() {
  if (hoverTooltipEl) {
    return hoverTooltipEl;
  }

  hoverTooltipEl = document.createElement("div");
  hoverTooltipEl.className = "doughnutHoverTip";
  document.body.appendChild(hoverTooltipEl);
  return hoverTooltipEl;
}

function positionTooltip(tooltip, clientX, clientY) {
  const offset = 14;
  tooltip.style.left = `${clientX + offset}px`;
  tooltip.style.top = `${clientY + offset}px`;

  const rect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - 8;
  const maxY = window.innerHeight - 8;

  let nextLeft = clientX + offset;
  let nextTop = clientY + offset;

  if (nextLeft + rect.width > maxX) {
    nextLeft = Math.max(8, clientX - rect.width - offset);
  }
  if (nextTop + rect.height > maxY) {
    nextTop = Math.max(8, clientY - rect.height - offset);
  }

  tooltip.style.left = `${nextLeft}px`;
  tooltip.style.top = `${nextTop}px`;
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
  const attrWidth = getBaseCanvasDimension(canvas, "width", 320);
  const attrHeight = getBaseCanvasDimension(canvas, "height", attrWidth);
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

function getBaseCanvasDimension(canvas, axis, fallback) {
  const dataKey = axis === "width" ? "baseWidth" : "baseHeight";
  if (!canvas.dataset[dataKey]) {
    const initial = Number(canvas.getAttribute(axis));
    canvas.dataset[dataKey] =
      Number.isFinite(initial) && initial > 0 ? String(initial) : String(fallback);
  }
  const parsed = Number(canvas.dataset[dataKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
