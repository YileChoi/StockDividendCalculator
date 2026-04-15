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

const STORAGE_KEY = "stock-equity-dilution-calculator-v1";
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
  autosaveState: document.getElementById("autosaveState"),
  statusMessage: document.getElementById("statusMessage"),
  statPortfolio: document.getElementById("statPortfolio"),
  statNav: document.getElementById("statNav"),
  statUnits: document.getElementById("statUnits"),
  statMembers: document.getElementById("statMembers"),
};

let state = loadState();
bindEvents();
setDefaultDate();
renderAll();
updateAutosaveState("Autosave: ON");

function bindEvents() {
  els.memberForm.addEventListener("submit", handleMemberSubmit);
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.txType.addEventListener("change", updateTxFormFields);
  els.resetData.addEventListener("click", handleReset);
  els.saveNow.addEventListener("click", handleManualSave);
  window.addEventListener("beforeunload", () => {
    persistState({ manual: false });
  });
}

function setDefaultDate() {
  if (!els.txDate.value) {
    els.txDate.value = todayISO();
  }
}

function handleMemberSubmit(event) {
  event.preventDefault();

  try {
    state = addMember(state, els.memberName.value, todayISO());
    const saved = persistState({ manual: false });
    els.memberName.value = "";
    renderAll();
    setStatusWithSaveOutcome("Person added.", saved);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function handleTransactionSubmit(event) {
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

    const saved = persistState({ manual: false });
    els.txAmount.value = "";
    els.txNote.value = "";
    renderAll();
    setStatusWithSaveOutcome(`${TX_LABELS[txType]} recorded.`, saved);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function handleReset() {
  const confirmed = window.confirm(
    "Reset all members and transaction history? This cannot be undone.",
  );
  if (!confirmed) {
    return;
  }
  state = createInitialState();
  const saved = persistState({ manual: true });
  renderAll();
  setStatusWithSaveOutcome("All data reset.", saved);
}

function handleManualSave() {
  if (persistState({ manual: true })) {
    setStatus("Saved to local record.");
  } else {
    setStatus("Failed to save. Check browser storage settings.", true);
  }
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
    .map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`)
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

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return deserializeState(raw);
}

function persistState({ manual }) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(state));
    const stamp = formatTime(new Date());
    const mode = manual ? "Saved" : "Autosaved";
    updateAutosaveState(`Autosave: ON | ${mode} at ${stamp}`);
    return true;
  } catch {
    updateAutosaveState("Autosave: OFF (storage unavailable)");
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
  setStatus(
    `${baseMessage} Warning: browser storage is unavailable, so this is not persisted.`,
    true,
  );
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
