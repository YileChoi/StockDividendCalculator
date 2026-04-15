import {
  CONSTANTS,
  addMember,
  applyDeposit,
  applyProfitLoss,
  applySetValuation,
  applyWithdrawal,
  createInitialState,
  deserializeState,
  getMemberSummaries,
  getNavCentsPerUnit,
  serializeState,
} from "./model.js";

const API = {
  ledger: "/api/ledger",
  import: "/api/ledger/import",
  export: "/api/ledger/export",
};

const TX_LABELS = {
  [CONSTANTS.TX_TYPES.DEPOSIT]: "Deposit",
  [CONSTANTS.TX_TYPES.WITHDRAWAL]: "Withdrawal",
  [CONSTANTS.TX_TYPES.PROFIT_LOSS]: "Profit/Loss",
  [CONSTANTS.TX_TYPES.SET_VALUATION]: "Set Valuation",
};

const els = {
  memberForm: document.getElementById("memberForm"),
  memberName: document.getElementById("memberName"),
  transactionForm: document.getElementById("transactionForm"),
  txDate: document.getElementById("txDate"),
  txType: document.getElementById("txType"),
  txMember: document.getElementById("txMember"),
  txAmount: document.getElementById("txAmount"),
  txNote: document.getElementById("txNote"),
  txHint: document.getElementById("txHint"),
  memberField: document.getElementById("memberField"),
  amountLabel: document.getElementById("amountLabel"),
  membersTableBody: document.getElementById("membersTableBody"),
  transactionsTableBody: document.getElementById("transactionsTableBody"),
  resetData: document.getElementById("resetData"),
  saveNow: document.getElementById("saveNow"),
  exportDb: document.getElementById("exportDb"),
  importDb: document.getElementById("importDb"),
  importFile: document.getElementById("importFile"),
  autosaveState: document.getElementById("autosaveState"),
  statusMessage: document.getElementById("statusMessage"),
  statPortfolio: document.getElementById("statPortfolio"),
  statNav: document.getElementById("statNav"),
  statUnits: document.getElementById("statUnits"),
  statMembers: document.getElementById("statMembers"),
};

let state = createInitialState();
bindEvents();
setDefaultDate();
updateAutosaveState("File DB: disconnected");
void init();

async function init() {
  state = await loadStateFromServer();
  renderAll();
}

function bindEvents() {
  els.memberForm.addEventListener("submit", handleMemberSubmit);
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.txType.addEventListener("change", updateTxFormFields);
  els.resetData.addEventListener("click", handleReset);
  els.saveNow.addEventListener("click", handleManualSave);
  els.exportDb.addEventListener("click", handleExport);
  els.importDb.addEventListener("click", handleImportClick);
  els.importFile.addEventListener("change", handleImportFile);
}

function setDefaultDate() {
  if (!els.txDate.value) {
    els.txDate.value = todayISO();
  }
}

async function handleMemberSubmit(event) {
  event.preventDefault();

  try {
    state = addMember(state, els.memberName.value, todayISO());
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
    } else if (txType === CONSTANTS.TX_TYPES.PROFIT_LOSS) {
      state = applyProfitLoss(state, payload);
    } else if (txType === CONSTANTS.TX_TYPES.SET_VALUATION) {
      state = applySetValuation(state, payload);
    } else {
      throw new Error("Unsupported transaction type.");
    }

    const saved = await persistState({ manual: false });
    els.txAmount.value = "";
    els.txNote.value = "";
    renderAll();
    setStatusWithSaveOutcome(`${TX_LABELS[txType]} recorded.`, saved);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleReset() {
  const confirmed = window.confirm(
    "Reset all members and transaction history? This cannot be undone.",
  );
  if (!confirmed) {
    return;
  }
  state = createInitialState();
  const saved = await persistState({ manual: true });
  renderAll();
  setStatusWithSaveOutcome("All data reset.", saved);
}

async function handleManualSave() {
  const saved = await persistState({ manual: true });
  if (saved) {
    setStatus("Saved to data/ledger.json.");
  } else {
    setStatus("Failed to save. Is the Flask server running?", true);
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
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    setStatus("Selected file is not valid JSON.", true);
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    setStatus("Imported JSON must be an object.", true);
    return;
  }

  const importedState = deserializeState(JSON.stringify(parsed));
  const saved = await writeImportedState(importedState);
  if (!saved) {
    setStatus("Import failed while writing server DB file.", true);
    return;
  }

  state = importedState;
  renderAll();
  setStatus(`Imported ${file.name} into data/ledger.json.`);
}

function renderAll() {
  renderOverview();
  renderMemberOptions();
  updateTxFormFields();
  renderMemberTable();
  renderTransactionsTable();
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
    els.amountLabel.textContent = "Amount (cash in)";
    els.txAmount.min = "0.01";
    els.txHint.textContent =
      "Deposit buys units at current NAV. Late entries cannot claim earlier profit.";
  } else if (txType === CONSTANTS.TX_TYPES.WITHDRAWAL) {
    els.amountLabel.textContent = "Amount (cash out)";
    els.txAmount.min = "0.01";
    els.txHint.textContent =
      "Withdrawal redeems units at current NAV based on the selected person's owned units.";
  } else if (txType === CONSTANTS.TX_TYPES.PROFIT_LOSS) {
    els.amountLabel.textContent = "Profit/Loss Amount (+/-)";
    els.txAmount.min = "";
    els.txHint.textContent =
      "Use positive for profit and negative for loss. Units stay unchanged; NAV changes.";
  } else {
    els.amountLabel.textContent = "New Portfolio Value";
    els.txAmount.min = "0";
    els.txHint.textContent =
      "Set the broker-reported portfolio total directly. The ledger stores the implied delta.";
  }
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

async function loadStateFromServer() {
  try {
    const response = await fetch(API.ledger, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Load failed (${response.status}).`);
    }
    const payload = await response.json();
    const loadedState = deserializeState(JSON.stringify(payload));
    updateAutosaveState("File DB: data/ledger.json | connected");
    setStatus("Loaded from data/ledger.json.");
    return loadedState;
  } catch (error) {
    updateAutosaveState("File DB: offline");
    setStatus(
      `Could not load file DB from server. Using empty in-memory state. ${error.message}`,
      true,
    );
    return createInitialState();
  }
}

async function persistState({ manual }) {
  try {
    const response = await fetch(API.ledger, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serializeState(state),
    });
    if (!response.ok) {
      throw new Error(`Save failed (${response.status}).`);
    }
    const payload = await response.json();
    const stamp = formatIsoToLocalTime(payload.updatedAt);
    const mode = manual ? "Saved" : "Autosaved";
    updateAutosaveState(
      `File DB: ${payload.path ?? "data/ledger.json"} | ${mode} at ${stamp}`,
    );
    return true;
  } catch {
    updateAutosaveState("File DB: save failed");
    return false;
  }
}

async function writeImportedState(importedState) {
  try {
    const response = await fetch(API.import, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializeState(importedState),
    });
    if (!response.ok) {
      throw new Error(`Import failed (${response.status}).`);
    }
    const payload = await response.json();
    const stamp = formatIsoToLocalTime(payload.updatedAt);
    updateAutosaveState(
      `File DB: ${payload.path ?? "data/ledger.json"} | Imported at ${stamp}`,
    );
    return true;
  } catch {
    updateAutosaveState("File DB: import failed");
    return false;
  }
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

function formatIsoToLocalTime(value) {
  if (!value) {
    return formatTime(new Date());
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatTime(new Date());
  }
  return formatTime(date);
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
