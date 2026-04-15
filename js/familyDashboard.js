import { renderDoughnutChart } from "./doughnut.js";

const STORAGE_KEY = "family_investment_dashboard_v1";
const SCHEMA_VERSION = 1;

export function initFamilyDashboard() {
  const els = collectElements();
  if (!els.form) {
    return;
  }

  const ctx = {
    els,
    state: loadState(),
  };

  bindEvents(ctx);
  renderAll(ctx);
}

function collectElements() {
  return {
    form: document.getElementById("familyAccountForm"),
    accountId: document.getElementById("familyAccountId"),
    memberName: document.getElementById("familyMemberName"),
    accountName: document.getElementById("familyAccountName"),
    currentValue: document.getElementById("familyCurrentValue"),
    investedValue: document.getElementById("familyInvestedValue"),
    note: document.getElementById("familyAccountNote"),
    saveAccount: document.getElementById("familySaveAccount"),
    cancelEdit: document.getElementById("familyCancelEdit"),
    formHint: document.getElementById("familyFormHint"),
    allocationChart: document.getElementById("familyAllocationChart"),
    allocationLegend: document.getElementById("familyAllocationLegend"),
    memberCards: document.getElementById("familyMemberCards"),
    accountsTableBody: document.getElementById("familyAccountsTableBody"),
    statusMessage: document.getElementById("familyStatusMessage"),
    statTotalValue: document.getElementById("familyStatTotalValue"),
    statTotalInvested: document.getElementById("familyStatTotalInvested"),
    statNet: document.getElementById("familyStatNet"),
    statAccountCount: document.getElementById("familyStatAccountCount"),
    exportBtn: document.getElementById("familyExport"),
    importBtn: document.getElementById("familyImport"),
    resetBtn: document.getElementById("familyReset"),
    importFile: document.getElementById("familyImportFile"),
  };
}

function bindEvents(ctx) {
  const { els } = ctx;
  els.form.addEventListener("submit", (event) => handleFormSubmit(ctx, event));
  els.cancelEdit.addEventListener("click", () => cancelEditMode(ctx));
  els.accountsTableBody.addEventListener("click", (event) =>
    handleTableAction(ctx, event),
  );
  els.exportBtn.addEventListener("click", () => handleExport(ctx));
  els.importBtn.addEventListener("click", () => {
    els.importFile.value = "";
    els.importFile.click();
  });
  els.importFile.addEventListener("change", (event) =>
    handleImportFile(ctx, event),
  );
  els.resetBtn.addEventListener("click", () => handleReset(ctx));
}

function handleFormSubmit(ctx, event) {
  event.preventDefault();

  try {
    const payload = readFormInput(ctx.els);
    const editId = toPositiveInt(ctx.els.accountId.value, null);
    if (editId === null) {
      const duplicate = ctx.state.accounts.find(
        (account) =>
          account.memberName.toLowerCase() === payload.memberName.toLowerCase() &&
          account.accountName.toLowerCase() === payload.accountName.toLowerCase(),
      );
      if (duplicate) {
        throw new Error(
          `Account "${payload.accountName}" already exists for ${payload.memberName}.`,
        );
      }

      ctx.state.accounts.push({
        id: ctx.state.nextId,
        memberName: payload.memberName,
        accountName: payload.accountName,
        currentCents: payload.currentCents,
        investedCents: payload.investedCents,
        note: payload.note,
        updatedAt: new Date().toISOString(),
      });
      ctx.state.nextId += 1;
      saveState(ctx.state);
      renderAll(ctx);
      clearForm(ctx.els);
      setStatus(ctx.els, "Account added.");
      return;
    }

    const index = ctx.state.accounts.findIndex((account) => account.id === editId);
    if (index < 0) {
      throw new Error("Selected account no longer exists.");
    }
    ctx.state.accounts[index] = {
      ...ctx.state.accounts[index],
      memberName: payload.memberName,
      accountName: payload.accountName,
      currentCents: payload.currentCents,
      investedCents: payload.investedCents,
      note: payload.note,
      updatedAt: new Date().toISOString(),
    };
    saveState(ctx.state);
    renderAll(ctx);
    clearForm(ctx.els);
    setStatus(ctx.els, "Account updated.");
  } catch (error) {
    setStatus(ctx.els, error.message || "Could not save account.", true);
  }
}

function handleTableAction(ctx, event) {
  const trigger = event.target.closest("button[data-action][data-id]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;
  const id = toPositiveInt(trigger.dataset.id, null);
  if (id === null) {
    return;
  }
  const account = ctx.state.accounts.find((item) => item.id === id);
  if (!account) {
    setStatus(ctx.els, "Selected account was not found.", true);
    return;
  }

  if (action === "edit") {
    ctx.els.accountId.value = String(account.id);
    ctx.els.memberName.value = account.memberName;
    ctx.els.accountName.value = account.accountName;
    ctx.els.currentValue.value = centsToInput(account.currentCents);
    ctx.els.investedValue.value = centsToInput(account.investedCents);
    ctx.els.note.value = account.note;
    ctx.els.saveAccount.textContent = "Update Account";
    ctx.els.cancelEdit.hidden = false;
    ctx.els.formHint.textContent =
      "Edit mode: update the fields and press Update Account.";
    setStatus(ctx.els, `Editing "${account.accountName}" for ${account.memberName}.`);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      `Delete account "${account.accountName}" for ${account.memberName}?`,
    );
    if (!confirmed) {
      return;
    }

    ctx.state.accounts = ctx.state.accounts.filter((item) => item.id !== id);
    saveState(ctx.state);
    renderAll(ctx);
    if (toPositiveInt(ctx.els.accountId.value, null) === id) {
      clearForm(ctx.els);
    }
    setStatus(ctx.els, "Account deleted.");
  }
}

function handleExport(ctx) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: {
      accounts: ctx.state.accounts,
      nextId: ctx.state.nextId,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "family-dashboard.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus(ctx.els, "Family dashboard JSON exported.");
}

async function handleImportFile(ctx, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const normalized = normalizeImportedPayload(payload);
    ctx.state = normalized;
    saveState(ctx.state);
    renderAll(ctx);
    clearForm(ctx.els);
    setStatus(ctx.els, `Imported ${file.name}.`);
  } catch (error) {
    setStatus(ctx.els, error.message || "Import failed.", true);
  }
}

function handleReset(ctx) {
  const confirmed = window.confirm(
    "Reset Family Investment Dashboard data? This does not affect the calculator data.",
  );
  if (!confirmed) {
    return;
  }
  ctx.state = { accounts: [], nextId: 1 };
  saveState(ctx.state);
  clearForm(ctx.els);
  renderAll(ctx);
  setStatus(ctx.els, "Family dashboard data reset.");
}

function cancelEditMode(ctx) {
  clearForm(ctx.els);
  setStatus(ctx.els, "Edit canceled.");
}

function clearForm(els) {
  els.accountId.value = "";
  els.memberName.value = "";
  els.accountName.value = "";
  els.currentValue.value = "";
  els.investedValue.value = "";
  els.note.value = "";
  els.saveAccount.textContent = "Save Account";
  els.cancelEdit.hidden = true;
  els.formHint.textContent =
    "Each account stores current value and cost basis so individual and family-level profit/loss can be tracked.";
}

function renderAll(ctx) {
  const memberSummaries = getMemberSummaries(ctx.state.accounts);
  renderStats(ctx.els, memberSummaries, ctx.state.accounts.length);
  renderAllocationChart(ctx.els, memberSummaries);
  renderMemberCards(ctx.els, memberSummaries);
  renderAccountsTable(ctx.els, ctx.state.accounts);
}

function renderStats(els, memberSummaries, accountCount) {
  let totalValueCents = 0;
  let totalInvestedCents = 0;
  for (const summary of memberSummaries) {
    totalValueCents += summary.currentCents;
    totalInvestedCents += summary.investedCents;
  }
  const netCents = totalValueCents - totalInvestedCents;

  els.statTotalValue.textContent = formatCents(totalValueCents);
  els.statTotalInvested.textContent = formatCents(totalInvestedCents);
  els.statNet.textContent = formatSignedCents(netCents);
  els.statNet.classList.toggle("valuePositive", netCents > 0);
  els.statNet.classList.toggle("valueNegative", netCents < 0);
  els.statAccountCount.textContent = String(accountCount);
}

function renderAllocationChart(els, memberSummaries) {
  const slices = memberSummaries
    .filter((member) => member.currentCents > 0)
    .map((member) => ({
      label: member.memberName,
      value: member.currentCents,
      meta: `${formatCents(member.currentCents)} | Net ${formatSignedCents(member.netCents)}`,
    }));

  const totalValue = memberSummaries.reduce(
    (sum, member) => sum + member.currentCents,
    0,
  );

  renderDoughnutChart({
    canvas: els.allocationChart,
    legendEl: els.allocationLegend,
    slices,
    emptyLabel: "Add an account to start charting.",
    centerLabel: "Family Total",
    centerValue: formatCents(totalValue),
  });
}

function renderMemberCards(els, memberSummaries) {
  if (!memberSummaries.length) {
    els.memberCards.innerHTML =
      '<div class="memberCard"><h3>No members yet</h3><div class="meta">Add at least one account to build the dashboard.</div></div>';
    return;
  }

  els.memberCards.innerHTML = memberSummaries
    .map((member) => {
      const netClass =
        member.netCents > 0
          ? "valuePositive"
          : member.netCents < 0
            ? "valueNegative"
            : "";
      return `<article class="memberCard">
        <h3>${escapeHtml(member.memberName)}</h3>
        <div class="meta">${member.accountCount} account${member.accountCount === 1 ? "" : "s"}</div>
        <div>Current Value: <strong>${formatCents(member.currentCents)}</strong></div>
        <div>Invested: <strong>${formatCents(member.investedCents)}</strong></div>
        <div>Net P/L: <strong class="${netClass}">${formatSignedCents(member.netCents)}</strong></div>
      </article>`;
    })
    .join("");
}

function renderAccountsTable(els, accounts) {
  if (!accounts.length) {
    els.accountsTableBody.innerHTML =
      '<tr><td colspan="7" class="empty">No accounts tracked yet.</td></tr>';
    return;
  }

  const sorted = [...accounts].sort((a, b) => {
    const memberCompare = a.memberName.localeCompare(b.memberName);
    if (memberCompare !== 0) {
      return memberCompare;
    }
    return a.accountName.localeCompare(b.accountName);
  });

  els.accountsTableBody.innerHTML = sorted
    .map((account) => {
      const netCents = account.currentCents - account.investedCents;
      const netClass =
        netCents > 0 ? "valuePositive" : netCents < 0 ? "valueNegative" : "";
      return `<tr>
        <td>${escapeHtml(account.memberName)}</td>
        <td>${escapeHtml(account.accountName)}</td>
        <td>${formatCents(account.currentCents)}</td>
        <td>${formatCents(account.investedCents)}</td>
        <td><strong class="${netClass}">${formatSignedCents(netCents)}</strong></td>
        <td>${escapeHtml(account.note || "—")}</td>
        <td>
          <div class="inlineActions">
            <button type="button" class="tableAction ghostBtn" data-action="edit" data-id="${account.id}">Edit</button>
            <button type="button" class="tableAction danger" data-action="delete" data-id="${account.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function getMemberSummaries(accounts) {
  const grouped = new Map();
  for (const account of accounts) {
    const key = account.memberName;
    if (!grouped.has(key)) {
      grouped.set(key, {
        memberName: key,
        currentCents: 0,
        investedCents: 0,
        netCents: 0,
        accountCount: 0,
      });
    }
    const summary = grouped.get(key);
    summary.currentCents += account.currentCents;
    summary.investedCents += account.investedCents;
    summary.netCents = summary.currentCents - summary.investedCents;
    summary.accountCount += 1;
  }
  return [...grouped.values()].sort((a, b) => {
    if (a.currentCents === b.currentCents) {
      return a.memberName.localeCompare(b.memberName);
    }
    return b.currentCents - a.currentCents;
  });
}

function readFormInput(els) {
  const memberName = sanitizeName(els.memberName.value);
  if (!memberName) {
    throw new Error("Family member name is required.");
  }
  const accountName = sanitizeText(els.accountName.value, 80);
  if (!accountName) {
    throw new Error("Account name is required.");
  }

  const currentCents = parseAmountToCents(
    els.currentValue.value,
    "Current account value",
  );
  const investedCents = parseAmountToCents(
    els.investedValue.value,
    "Invested amount",
  );
  const note = sanitizeText(els.note.value, 180);

  return {
    memberName,
    accountName,
    currentCents,
    investedCents,
    note,
  };
}

function parseAmountToCents(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    throw new Error(`${label} is required.`);
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    throw new Error(`${label} must be a valid number.`);
  }
  if (amount < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${label} is too large to process safely.`);
  }
  return cents;
}

function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { accounts: [], nextId: 1 };
    }
    const payload = JSON.parse(raw);
    return normalizeImportedPayload(payload);
  } catch {
    return { accounts: [], nextId: 1 };
  }
}

function saveState(state) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    state: {
      accounts: state.accounts,
      nextId: state.nextId,
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function normalizeImportedPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Imported JSON must be an object.");
  }

  const sourceState =
    payload.state && typeof payload.state === "object" ? payload.state : payload;
  const rawAccounts = Array.isArray(sourceState.accounts)
    ? sourceState.accounts
    : [];

  const accounts = [];
  const usedIds = new Set();
  let maxId = 0;

  for (const rawAccount of rawAccounts) {
    if (!rawAccount || typeof rawAccount !== "object") {
      continue;
    }
    const id = toPositiveInt(rawAccount.id, null);
    if (id === null || usedIds.has(id)) {
      continue;
    }

    const memberName = sanitizeName(rawAccount.memberName);
    const accountName = sanitizeText(rawAccount.accountName, 80);
    if (!memberName || !accountName) {
      continue;
    }

    const currentCents = toSafeNonNegativeInt(rawAccount.currentCents);
    const investedCents = toSafeNonNegativeInt(rawAccount.investedCents);
    const note = sanitizeText(rawAccount.note, 180);

    usedIds.add(id);
    maxId = Math.max(maxId, id);
    accounts.push({
      id,
      memberName,
      accountName,
      currentCents,
      investedCents,
      note,
      updatedAt: normalizeDateTime(rawAccount.updatedAt),
    });
  }

  accounts.sort((a, b) => a.id - b.id);
  const nextId = Math.max(toPositiveInt(sourceState.nextId, 1), maxId + 1);
  return { accounts, nextId };
}

function toSafeNonNegativeInt(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function toPositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function sanitizeName(value) {
  return sanitizeText(value, 60);
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function setStatus(els, message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("error", isError);
  els.statusMessage.classList.toggle("ok", !isError);
}

function formatCents(cents) {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedCents(cents) {
  if (cents === 0) {
    return formatCents(0);
  }
  if (cents > 0) {
    return `+${formatCents(cents)}`;
  }
  return `-${formatCents(-cents)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
