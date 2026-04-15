import {
  CONSTANTS,
  addMember,
  applyDeposit,
  applySetValuation,
  applyWithdrawal,
  createInitialState,
  deserializeState,
  getMemberSummaries,
  getNavCentsPerUnit,
  serializeState,
} from "./model.js";
import { renderDoughnutChart } from "./doughnut.js";

const API = {
  ledger: "/api/ledger",
  import: "/api/ledger/import",
  export: "/api/ledger/export",
  stop: "/api/server/stop",
};

const DB_SCHEMA_VERSION = 1;
const MAX_CHANGE_HISTORY = 200;

const TX_LABELS = {
  [CONSTANTS.TX_TYPES.DEPOSIT]: "Deposit",
  [CONSTANTS.TX_TYPES.WITHDRAWAL]: "Withdrawal",
  [CONSTANTS.TX_TYPES.PROFIT_LOSS]: "Profit/Loss",
  [CONSTANTS.TX_TYPES.SET_VALUATION]: "Set Valuation",
};

const els = {
  navTabs: Array.from(document.querySelectorAll(".navTab[data-view]")),
  viewPanels: Array.from(document.querySelectorAll("[data-view-panel]")),
  memberForm: document.getElementById("memberForm"),
  memberName: document.getElementById("memberName"),
  transactionForm: document.getElementById("transactionForm"),
  valuationForm: document.getElementById("valuationForm"),
  txDate: document.getElementById("txDate"),
  txType: document.getElementById("txType"),
  txMember: document.getElementById("txMember"),
  txAmount: document.getElementById("txAmount"),
  txNote: document.getElementById("txNote"),
  valuationDate: document.getElementById("valuationDate"),
  valuationAmount: document.getElementById("valuationAmount"),
  valuationNote: document.getElementById("valuationNote"),
  txHint: document.getElementById("txHint"),
  memberField: document.getElementById("memberField"),
  amountLabel: document.getElementById("amountLabel"),
  amountLabelText: document.getElementById("amountLabelText"),
  membersTableBody: document.getElementById("membersTableBody"),
  transactionsTableBody: document.getElementById("transactionsTableBody"),
  changesTableBody: document.getElementById("changesTableBody"),
  saveNow: document.getElementById("saveNow"),
  exportDb: document.getElementById("exportDb"),
  importDb: document.getElementById("importDb"),
  stopServer: document.getElementById("stopServer"),
  importFile: document.getElementById("importFile"),
  autosaveState: document.getElementById("autosaveState"),
  statusMessage: document.getElementById("statusMessage"),
  statPortfolio: document.getElementById("statPortfolio"),
  statNav: document.getElementById("statNav"),
  statUnits: document.getElementById("statUnits"),
  statMembers: document.getElementById("statMembers"),
  equityDistributionChart: document.getElementById("equityDistributionChart"),
  equityDistributionLegend: document.getElementById("equityDistributionLegend"),
  valuationPrevious: document.getElementById("valuationPrevious"),
  valuationDiff: document.getElementById("valuationDiff"),
  valuationTotalProfit: document.getElementById("valuationTotalProfit"),
};

let state = createInitialState();
let changeHistory = [];
let nextChangeId = 1;
let activeView = "calculator";

bindEvents();
initNavigation();
setDefaultDate();
updateAutosaveState("File DB: connecting...");
void init();

async function init() {
  const loaded = await loadDbFromServer();
  state = loaded.state;
  changeHistory = loaded.changeHistory;
  nextChangeId = loaded.nextChangeId;

  if (changeHistory.length === 0) {
    const firstAction = loaded.migratedFromLegacy ? "migrate" : "baseline";
    const firstSummary = loaded.migratedFromLegacy
      ? "Migrated legacy ledger and created baseline snapshot."
      : "Initial baseline snapshot.";
    appendChangeRecord(firstAction, firstSummary);
    const saved = await persistState({ manual: true });
    setStatusWithSaveOutcome("Initialized app-change history.", saved);
  } else {
    setStatus("Loaded from data/ledger.json.");
  }

  renderAll();
}

function bindEvents() {
  els.navTabs.forEach((tab) => tab.addEventListener("click", handleNavClick));
  els.memberForm.addEventListener("submit", handleMemberSubmit);
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.valuationForm.addEventListener("submit", handleValuationSubmit);
  els.txType.addEventListener("change", updateTxFormFields);
  els.saveNow.addEventListener("click", handleManualSave);
  els.exportDb.addEventListener("click", handleExport);
  els.importDb.addEventListener("click", handleImportClick);
  els.importFile.addEventListener("change", handleImportFile);
  els.stopServer.addEventListener("click", handleStopServer);
  els.changesTableBody.addEventListener("click", handleChangeTableClick);
}

function initNavigation() {
  window.addEventListener("hashchange", handleHashChange);
  const hashView = sanitizeView(window.location.hash.slice(1));
  setActiveView(hashView || "calculator", { updateHash: false });
}

function handleNavClick(event) {
  const target = event.currentTarget;
  const view = sanitizeView(target?.dataset?.view);
  if (!view) {
    return;
  }
  setActiveView(view, { updateHash: true });
}

function handleHashChange() {
  const hashView = sanitizeView(window.location.hash.slice(1));
  if (!hashView || hashView === activeView) {
    return;
  }
  setActiveView(hashView, { updateHash: false });
}

function setActiveView(view, { updateHash }) {
  if (view === activeView && updateHash === false) {
    return;
  }
  activeView = view;

  for (const tab of els.navTabs) {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle("isActive", isActive);
    if (isActive) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  }

  for (const panel of els.viewPanels) {
    const isActive = panel.dataset.viewPanel === view;
    panel.classList.toggle("isActive", isActive);
    panel.hidden = !isActive;
  }

  if (updateHash && window.location.hash !== `#${view}`) {
    window.location.hash = view;
  }
}

function sanitizeView(value) {
  if (value === "calculator" || value === "family-dashboard") {
    return value;
  }
  return "";
}

function setDefaultDate() {
  if (!els.txDate.value) {
    els.txDate.value = todayISO();
  }
  if (!els.valuationDate.value) {
    els.valuationDate.value = todayISO();
  }
}

async function handleMemberSubmit(event) {
  event.preventDefault();

  try {
    state = addMember(state, els.memberName.value, todayISO());
    appendChangeRecord(
      "add_member",
      `Added person "${els.memberName.value.trim()}".`,
    );
    const saved = await persistState({ manual: false });
    els.memberName.value = "";
    renderAll();
    setStatusWithSaveOutcome("Person added.", saved);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleTransactionSubmit(event) {
  event.preventDefault();

  const txType = els.txType.value;
  const payload = {
    amount: els.txAmount.value,
    date: els.txDate.value || todayISO(),
    note: els.txNote.value,
    memberId: Number(els.txMember.value),
  };

  try {
    if (txType === CONSTANTS.TX_TYPES.DEPOSIT) {
      state = applyDeposit(state, payload);
    } else if (txType === CONSTANTS.TX_TYPES.WITHDRAWAL) {
      state = applyWithdrawal(state, payload);
    } else {
      throw new Error("Unsupported transaction type.");
    }

    appendChangeRecord(
      txType,
      `${TX_LABELS[txType]} recorded${payload.note ? ` (${payload.note})` : ""}.`,
    );

    const saved = await persistState({ manual: false });
    els.txAmount.value = "";
    els.txNote.value = "";
    renderAll();
    setStatusWithSaveOutcome(`${TX_LABELS[txType]} recorded.`, saved);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleValuationSubmit(event) {
  event.preventDefault();

  const payload = {
    amount: els.valuationAmount.value,
    date: els.valuationDate.value || todayISO(),
    note: els.valuationNote.value,
  };

  try {
    const previousPortfolio = state.portfolioCents;
    state = applySetValuation(state, payload);
    const diff = state.portfolioCents - previousPortfolio;

    appendChangeRecord(
      "set_total_value",
      `Set total value to ${formatCents(state.portfolioCents)} (change ${formatSignedCents(diff)}).`,
    );

    const saved = await persistState({ manual: false });
    els.valuationAmount.value = "";
    els.valuationNote.value = "";
    renderAll();
    setStatusWithSaveOutcome(
      `Total account value updated. Difference: ${formatSignedCents(diff)}.`,
      saved,
    );
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleManualSave() {
  const saved = await persistState({ manual: true });
  if (saved) {
    setStatus("Saved to data/ledger.json.");
  } else {
    setStatus("Failed to save. Is the server running?", true);
  }
}

function handleExport() {
  setStatus("Downloading ledger.json...");
  window.location.href = API.export;
}

function handleImportClick() {
  els.importFile.value = "";
  els.importFile.click();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setStatus("Selected file is not valid JSON.", true);
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    setStatus("Imported JSON must be an object.", true);
    return;
  }

  const importedDb = normalizeDbPayload(parsed);
  state = importedDb.state;
  changeHistory = importedDb.changeHistory;
  nextChangeId = importedDb.nextChangeId;
  appendChangeRecord("import", `Imported DB from file "${file.name}".`);

  const saved = await writeDbToServer({ endpoint: API.import });
  if (!saved) {
    setStatus("Import failed while writing data/ledger.json.", true);
    return;
  }

  renderAll();
  setStatus(`Imported ${file.name} into data/ledger.json.`);
}

async function handleStopServer() {
  const confirmed = window.confirm(
    "Stop server now? This will end the local session for all open tabs.",
  );
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(API.stop, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Server stop failed (${response.status}).`);
    }
    setStatus("Server is stopping. Attempting to close this tab...");
    setTimeout(attemptCloseCurrentTab, 300);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleChangeTableClick(event) {
  const trigger = event.target.closest("button[data-change-id]");
  if (!trigger) {
    return;
  }
  const id = Number(trigger.dataset.changeId);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }
  await revertToChange(id);
}

async function revertToChange(changeId) {
  const target = changeHistory.find((entry) => entry.id === changeId);
  if (!target) {
    setStatus("Selected change snapshot not found.", true);
    return;
  }

  const confirmed = window.confirm(
    `Restore app state to change #${target.id} (${target.action})?`,
  );
  if (!confirmed) {
    return;
  }

  try {
    state = snapshotToState(target.snapshot);
    appendChangeRecord(
      "revert",
      `Restored snapshot from change #${target.id} (${target.action}).`,
    );
    const saved = await persistState({ manual: true });
    renderAll();
    setStatusWithSaveOutcome(`Reverted to change #${target.id}.`, saved);
  } catch {
    setStatus("Revert failed: snapshot is invalid.", true);
  }
}

function renderAll() {
  renderOverview();
  renderMemberOptions();
  updateTxFormFields();
  renderValuationSummary();
  renderEquityDistributionChart();
  renderMemberTable();
  renderTransactionsTable();
  renderChangesTable();
}

function renderOverview() {
  els.statPortfolio.textContent = formatCents(state.portfolioCents);
  els.statNav.textContent = formatNav(state);
  els.statUnits.textContent = formatUnits(state.totalUnitsMicro);
  els.statMembers.textContent = String(state.members.length);
}

function renderMemberOptions() {
  const options = state.members
    .map(
      (member) =>
        `<option value="${member.id}">${escapeHtml(member.name)}</option>`,
    )
    .join("");

  els.txMember.innerHTML = options;
  if (!options) {
    els.txMember.innerHTML = '<option value="">No people yet</option>';
  }
}

function updateTxFormFields() {
  const txType = els.txType.value;
  const needsPerson =
    txType === CONSTANTS.TX_TYPES.DEPOSIT ||
    txType === CONSTANTS.TX_TYPES.WITHDRAWAL;

  els.memberField.style.display = needsPerson ? "block" : "none";
  els.txMember.disabled = !needsPerson;
  els.txMember.required = needsPerson;

  if (txType === CONSTANTS.TX_TYPES.DEPOSIT) {
    if (els.amountLabelText) {
      els.amountLabelText.textContent = "Amount (cash in)";
    }
    els.txAmount.min = "0.01";
    els.txHint.textContent =
      "Deposit buys units at current NAV. Late entries cannot claim earlier profit.";
  } else {
    if (els.amountLabelText) {
      els.amountLabelText.textContent = "Amount (cash out)";
    }
    els.txAmount.min = "0.01";
    els.txHint.textContent =
      "Withdrawal redeems units at current NAV based on the selected person's owned units. For market/account value changes, use Manual Total Account Update.";
  }
}

function renderValuationSummary() {
  const setValuationTxs = state.transactions.filter(
    (tx) => tx.type === CONSTANTS.TX_TYPES.SET_VALUATION,
  );
  const latestSet = setValuationTxs.length
    ? setValuationTxs[setValuationTxs.length - 1]
    : null;

  let previousTotalCents = state.portfolioCents;
  let lastDiffCents = 0n;
  if (latestSet) {
    lastDiffCents = latestSet.amountCents;
    if (typeof latestSet.valuationCents === "bigint") {
      previousTotalCents = latestSet.valuationCents - latestSet.amountCents;
    }
  }

  const netCashInCents = getNetCashInCents();
  const totalProfitCents = state.portfolioCents - netCashInCents;

  els.valuationPrevious.textContent = formatCents(previousTotalCents);
  els.valuationDiff.textContent = formatSignedCents(lastDiffCents);
  els.valuationTotalProfit.textContent = formatSignedCents(totalProfitCents);
}

function renderEquityDistributionChart() {
  const summaries = getMemberSummaries(state);
  let totalEquityCents = 0n;
  const slices = [];
  for (const summary of summaries) {
    if (summary.equityCents <= 0n) {
      continue;
    }
    totalEquityCents += summary.equityCents;
    slices.push({
      label: summary.name,
      value: Number(summary.equityCents),
      meta: `${formatCents(summary.equityCents)} | Net ${formatSignedCents(summary.netProfitCents)}`,
    });
  }

  renderDoughnutChart({
    canvas: els.equityDistributionChart,
    legendEl: els.equityDistributionLegend,
    slices,
    emptyLabel: "Add members and deposits to view distribution.",
    centerLabel: "Total Equity",
    centerValue: formatCents(totalEquityCents),
  });
}

function renderMemberTable() {
  const summaries = getMemberSummaries(state);
  if (!summaries.length) {
    els.membersTableBody.innerHTML =
      '<tr><td colspan="7" class="empty">No people added yet.</td></tr>';
    return;
  }

  els.membersTableBody.innerHTML = summaries
    .map((summary) => {
      const ownership = (summary.ownershipRatio * 100).toFixed(4);
      return `
      <tr>
        <td>${escapeHtml(summary.name)}</td>
        <td>${formatUnits(summary.unitsMicro)}</td>
        <td>${ownership}%</td>
        <td>${formatCents(summary.equityCents)}</td>
        <td>${formatCents(summary.totalContributedCents)}</td>
        <td>${formatCents(summary.totalWithdrawnCents)}</td>
        <td>${formatSignedCents(summary.netProfitCents)}</td>
      </tr>
    `;
    })
    .join("");
}

function renderTransactionsTable() {
  const txs = [...state.transactions].sort((a, b) => b.id - a.id);
  if (!txs.length) {
    els.transactionsTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No activity recorded yet.</td></tr>';
    return;
  }

  els.transactionsTableBody.innerHTML = txs
    .map((tx) => {
      const person = tx.memberId ? findMemberName(tx.memberId) : "—";
      const note =
        tx.type === CONSTANTS.TX_TYPES.SET_VALUATION &&
        typeof tx.valuationCents === "bigint"
          ? `${escapeHtml(tx.note || "")} ${escapeHtml(
              tx.note ? "| " : "",
            )}Valuation: ${formatCents(tx.valuationCents)}`
          : escapeHtml(tx.note || "");

      return `
      <tr>
        <td>${tx.date}</td>
        <td>${TX_LABELS[tx.type] ?? tx.type}</td>
        <td>${escapeHtml(person)}</td>
        <td>${formatSignedCents(tx.amountCents)}</td>
        <td>${tx.unitsMicro === 0n ? "—" : formatSignedUnits(tx.unitsMicro)}</td>
        <td>${formatNavFromSnapshot(tx)}</td>
        <td>${formatCents(tx.portfolioAfterCents)}</td>
        <td>${note}</td>
      </tr>
    `;
    })
    .join("");
}

function renderChangesTable() {
  const rows = [...changeHistory].sort((a, b) => b.id - a.id);
  if (!rows.length) {
    els.changesTableBody.innerHTML =
      '<tr><td colspan="5" class="empty">No app-level changes yet.</td></tr>';
    return;
  }

  els.changesTableBody.innerHTML = rows
    .map((entry) => {
      return `
      <tr>
        <td>#${entry.id}</td>
        <td>${formatDateTime(entry.occurredAt)}</td>
        <td>${escapeHtml(entry.action)}</td>
        <td>${escapeHtml(entry.summary)}</td>
        <td><button type="button" class="revertBtn" data-change-id="${entry.id}">Revert</button></td>
      </tr>
    `;
    })
    .join("");
}

async function loadDbFromServer() {
  try {
    const response = await fetch(API.ledger, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Load failed (${response.status}).`);
    }
    const payload = await response.json();
    const db = normalizeDbPayload(payload);
    updateAutosaveState("File DB: data/ledger.json | connected");
    return db;
  } catch (error) {
    updateAutosaveState("File DB: offline");
    setStatus(
      `Could not load file DB from server. Using empty in-memory state. ${error.message}`,
      true,
    );
    return {
      state: createInitialState(),
      changeHistory: [],
      nextChangeId: 1,
      migratedFromLegacy: false,
    };
  }
}

async function persistState({ manual }) {
  const saved = await writeDbToServer({ endpoint: API.ledger });
  if (!saved) {
    updateAutosaveState("File DB: save failed");
    return false;
  }

  const mode = manual ? "Saved" : "Autosaved";
  updateAutosaveState(`File DB: data/ledger.json | ${mode} at ${formatTime(new Date())}`);
  return true;
}

async function writeDbToServer({ endpoint }) {
  try {
    const response = await fetch(endpoint, {
      method: endpoint === API.import ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDbEnvelope()),
    });
    if (!response.ok) {
      throw new Error(`Write failed (${response.status}).`);
    }
    return true;
  } catch {
    return false;
  }
}

function buildDbEnvelope() {
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    state: stateToSnapshot(state),
    changeHistory: [...changeHistory],
    nextChangeId,
  };
}

function normalizeDbPayload(payload) {
  if (isDbEnvelope(payload)) {
    const loadedState = snapshotToState(payload.state);
    const loadedHistory = normalizeChangeHistory(payload.changeHistory);
    const maxHistoryId = loadedHistory.reduce(
      (maxValue, entry) => Math.max(maxValue, entry.id),
      0,
    );
    const loadedNextChangeId = sanitizePositiveInt(payload.nextChangeId, 1);
    return {
      state: loadedState,
      changeHistory: loadedHistory,
      nextChangeId: Math.max(loadedNextChangeId, maxHistoryId + 1),
      migratedFromLegacy: false,
    };
  }

  return {
    state: snapshotToState(payload),
    changeHistory: [],
    nextChangeId: 1,
    migratedFromLegacy: true,
  };
}

function isDbEnvelope(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.prototype.hasOwnProperty.call(payload, "state")
  );
}

function normalizeChangeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized = [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = sanitizePositiveInt(entry.id, null);
    if (id === null) {
      continue;
    }
    try {
      const snapshot = stateToSnapshot(snapshotToState(entry.snapshot));
      normalized.push({
        id,
        occurredAt: sanitizeDateTime(entry.occurredAt),
        action: sanitizeShortText(entry.action, "change", 40),
        summary: sanitizeShortText(entry.summary, "State updated.", 220),
        snapshot,
      });
    } catch {
      continue;
    }
  }

  normalized.sort((a, b) => a.id - b.id);

  const deduped = [];
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    deduped.push(entry);
  }

  if (deduped.length > MAX_CHANGE_HISTORY) {
    return deduped.slice(deduped.length - MAX_CHANGE_HISTORY);
  }
  return deduped;
}

function appendChangeRecord(action, summary) {
  changeHistory.push({
    id: nextChangeId,
    occurredAt: new Date().toISOString(),
    action: sanitizeShortText(action, "change", 40),
    summary: sanitizeShortText(summary, "State updated.", 220),
    snapshot: stateToSnapshot(state),
  });
  nextChangeId += 1;

  if (changeHistory.length > MAX_CHANGE_HISTORY) {
    changeHistory = changeHistory.slice(changeHistory.length - MAX_CHANGE_HISTORY);
  }
}

function stateToSnapshot(targetState) {
  return JSON.parse(serializeState(targetState));
}

function snapshotToState(snapshot) {
  return deserializeState(JSON.stringify(snapshot));
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("error", isError);
  els.statusMessage.classList.toggle("ok", !isError);
}

function setStatusWithSaveOutcome(baseMessage, saved) {
  if (saved) {
    setStatus(baseMessage);
    return;
  }
  setStatus(`${baseMessage} Warning: server file DB save failed.`, true);
}

function updateAutosaveState(message) {
  if (!els.autosaveState) {
    return;
  }
  els.autosaveState.textContent = message;
}

function findMemberName(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  return member ? member.name : "Unknown";
}

function attemptCloseCurrentTab() {
  try {
    window.open("about:blank", "_self");
    window.close();
  } catch {
    // Browser may block scripted tab close.
  }
}

function getNetCashInCents() {
  let totalContributed = 0n;
  let totalWithdrawn = 0n;
  for (const member of state.members) {
    totalContributed += member.totalContributedCents;
    totalWithdrawn += member.totalWithdrawnCents;
  }
  return totalContributed - totalWithdrawn;
}

function formatCents(cents) {
  const amount = Number(cents) / Number(CONSTANTS.CENTS_PER_DOLLAR);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedCents(cents) {
  if (cents === 0n) {
    return formatCents(0n);
  }
  return `${cents > 0n ? "+" : "-"}${formatCents(cents > 0n ? cents : -cents)}`;
}

function formatUnits(unitsMicro) {
  const units = Number(unitsMicro) / Number(CONSTANTS.UNIT_SCALE);
  return units.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

function formatSignedUnits(unitsMicro) {
  if (unitsMicro === 0n) {
    return "0.0000";
  }
  return `${unitsMicro > 0n ? "+" : "-"}${formatUnits(
    unitsMicro > 0n ? unitsMicro : -unitsMicro,
  )}`;
}

function formatNav(currentState) {
  const navCents = getNavCentsPerUnit(currentState);
  const navDollars = navCents / Number(CONSTANTS.CENTS_PER_DOLLAR);
  return navDollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function formatNavFromSnapshot(tx) {
  if (tx.totalUnitsAfterMicro <= 0n) {
    return "$1.0000";
  }
  const navCents =
    (Number(tx.portfolioAfterCents) * Number(CONSTANTS.UNIT_SCALE)) /
    Number(tx.totalUnitsAfterMicro);
  const navDollars = navCents / Number(CONSTANTS.CENTS_PER_DOLLAR);
  return navDollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function sanitizeDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function sanitizeShortText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || fallback;
}

function sanitizePositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function todayISO() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
