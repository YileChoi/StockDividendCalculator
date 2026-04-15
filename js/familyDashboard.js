import { renderDoughnutChart } from "./doughnut.js";
import { renderLineChart } from "./lineChart.js";

const API = {
  db: "/api/family-db",
  import: "/api/family-db/import",
  export: "/api/family-db/export",
};

const SCHEMA_VERSION = 1;
const NETWORK_TIMEOUT_MS = 8000;
const DEFAULT_FAMILY_NAME = "My Family";

const ACTIVITY_LABELS = {
  account_created: "Account Added",
  account_removed: "Account Removed",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  set_value: "Set Current Value",
};

export function initFamilyDashboard() {
  const els = collectElements();
  if (!els.familyProfileForm) {
    return;
  }

  const ctx = {
    els,
    db: createInitialDb(),
    activePage: "dashboard",
    activeMemberName: null,
    activeAccountId: null,
  };

  bindEvents(ctx);
  setDefaultDates(els);
  updateChangeFormFields(ctx);
  void init(ctx);
}

async function init(ctx) {
  setDbState(ctx.els, "Family DB: connecting...");
  const loaded = await loadDbFromServer();
  ctx.db = loaded.db;

  const primary = ensurePrimaryFamily(ctx.db);
  if (primary.created) {
    await persistDb(ctx, { endpoint: API.db });
  }

  setDbState(
    ctx.els,
    loaded.connected
      ? "Family DB: data/family_dashboard.json | connected"
      : "Family DB: offline (in-memory fallback)",
  );

  if (ctx.db.state.families.length > 1) {
    setHubStatus(
      ctx.els,
      "Multiple families were found in DB. This dashboard uses the first family profile only.",
    );
  }

  syncPageFromHash(ctx);
  renderAll(ctx);
}

function collectElements() {
  return {
    familyProfileForm: document.getElementById("familyProfileForm"),
    familyNameInput: document.getElementById("familyNameInput"),
    familyHubStatus: document.getElementById("familyHubStatus"),
    familyExport: document.getElementById("familyExport"),
    familyImport: document.getElementById("familyImport"),
    familyResetDb: document.getElementById("familyResetDb"),
    familyImportFile: document.getElementById("familyImportFile"),
    familyDbState: document.getElementById("familyDbState"),

    familyDashboardPage: document.getElementById("familyDashboardPage"),
    familyMemberDetailPage: document.getElementById("familyMemberDetailPage"),
    familyAccountDetailPage: document.getElementById("familyAccountDetailPage"),

    familySelectedTitle: document.getElementById("familySelectedTitle"),
    familyStatTotalValue: document.getElementById("familyStatTotalValue"),
    familyStatTotalInvested: document.getElementById("familyStatTotalInvested"),
    familyStatNet: document.getElementById("familyStatNet"),
    familyStatAccountCount: document.getElementById("familyStatAccountCount"),

    familyAllocationChart: document.getElementById("familyAllocationChart"),
    familyAllocationLegend: document.getElementById("familyAllocationLegend"),

    familyAccountForm: document.getElementById("familyAccountForm"),
    familyMemberName: document.getElementById("familyMemberName"),
    familyAccountName: document.getElementById("familyAccountName"),
    familyCurrentValue: document.getElementById("familyCurrentValue"),
    familyInvestedValue: document.getElementById("familyInvestedValue"),
    familyAccountDate: document.getElementById("familyAccountDate"),
    familyAccountNote: document.getElementById("familyAccountNote"),

    familyMemberCards: document.getElementById("familyMemberCards"),
    familyAccountsTableBody: document.getElementById("familyAccountsTableBody"),

    familyBackFromMember: document.getElementById("familyBackFromMember"),
    familyMemberDetailTitle: document.getElementById("familyMemberDetailTitle"),
    familyMemberStatTotalValue: document.getElementById("familyMemberStatTotalValue"),
    familyMemberStatInvested: document.getElementById("familyMemberStatInvested"),
    familyMemberStatNet: document.getElementById("familyMemberStatNet"),
    familyMemberStatAccountCount: document.getElementById(
      "familyMemberStatAccountCount",
    ),
    familyMemberAllocationChart: document.getElementById(
      "familyMemberAllocationChart",
    ),
    familyMemberAllocationLegend: document.getElementById(
      "familyMemberAllocationLegend",
    ),
    familyMemberTrendChart: document.getElementById("familyMemberTrendChart"),
    familyMemberTrendMeta: document.getElementById("familyMemberTrendMeta"),
    familyMemberAccountsTableBody: document.getElementById(
      "familyMemberAccountsTableBody",
    ),

    familyBackToDashboard: document.getElementById("familyBackToDashboard"),
    familyAccountDetailTitle: document.getElementById("familyAccountDetailTitle"),
    familyAccountCurrentValue: document.getElementById("familyAccountCurrentValue"),
    familyAccountInvestedValue: document.getElementById(
      "familyAccountInvestedValue",
    ),
    familyAccountNetValue: document.getElementById("familyAccountNetValue"),

    familyChangeForm: document.getElementById("familyChangeForm"),
    familyChangeDate: document.getElementById("familyChangeDate"),
    familyChangeType: document.getElementById("familyChangeType"),
    familyChangeAmount: document.getElementById("familyChangeAmount"),
    familyChangeAmountLabel: document.getElementById("familyChangeAmountLabel"),
    familyChangeNote: document.getElementById("familyChangeNote"),
    familyChangeHint: document.getElementById("familyChangeHint"),

    familyTrendChart: document.getElementById("familyTrendChart"),
    familyTrendMeta: document.getElementById("familyTrendMeta"),
    familyEventsTableBody: document.getElementById("familyEventsTableBody"),

    familyStatusMessage: document.getElementById("familyStatusMessage"),
  };
}

function bindEvents(ctx) {
  const { els } = ctx;

  els.familyProfileForm.addEventListener("submit", (event) =>
    handleSaveFamilyProfile(ctx, event),
  );

  els.familyExport.addEventListener("click", () => handleExportFamilyDb(ctx));
  els.familyImport.addEventListener("click", () => {
    els.familyImportFile.value = "";
    els.familyImportFile.click();
  });
  els.familyImportFile.addEventListener("change", (event) =>
    handleImportFamilyDb(ctx, event),
  );
  els.familyResetDb.addEventListener("click", () => handleResetFamilyDb(ctx));

  els.familyAccountForm.addEventListener("submit", (event) =>
    handleAddAccount(ctx, event),
  );
  els.familyMemberCards.addEventListener("click", (event) =>
    handleMemberCardsClick(ctx, event),
  );

  els.familyBackFromMember.addEventListener("click", () => {
    openDashboardPage(ctx, { updateHash: true });
    renderAll(ctx);
  });

  els.familyMemberAccountsTableBody.addEventListener("click", (event) =>
    handleMemberAccountsTableClick(ctx, event),
  );

  els.familyBackToDashboard.addEventListener("click", () => {
    const family = getPrimaryFamily(ctx.db);
    if (family && ctx.activeMemberName && memberHasAccounts(family, ctx.activeMemberName)) {
      openMemberDetailPage(ctx, ctx.activeMemberName, { updateHash: true });
    } else {
      openDashboardPage(ctx, { updateHash: true });
    }
    renderAll(ctx);
  });

  els.familyChangeType.addEventListener("change", () => {
    updateChangeFormFields(ctx);
  });
  els.familyChangeForm.addEventListener("submit", (event) =>
    handleRecordChange(ctx, event),
  );

  window.addEventListener("hashchange", () => handleHashChange(ctx));
}

function setDefaultDates(els) {
  const today = todayISO();
  if (els.familyAccountDate && !els.familyAccountDate.value) {
    els.familyAccountDate.value = today;
  }
  if (els.familyChangeDate && !els.familyChangeDate.value) {
    els.familyChangeDate.value = today;
  }
}

function updateChangeFormFields(ctx) {
  const type = ctx.els.familyChangeType.value;
  if (type === "deposit") {
    ctx.els.familyChangeAmountLabel.textContent = "Amount To Add";
    ctx.els.familyChangeHint.textContent =
      "Deposit adds money into the account and increases both current value and invested amount.";
    ctx.els.familyChangeAmount.min = "0.01";
    return;
  }

  if (type === "withdrawal") {
    ctx.els.familyChangeAmountLabel.textContent = "Amount To Withdraw";
    ctx.els.familyChangeHint.textContent =
      "Withdrawal takes money out of the account and reduces both current value and invested amount.";
    ctx.els.familyChangeAmount.min = "0.01";
    return;
  }

  ctx.els.familyChangeAmountLabel.textContent = "New Current Account Value";
  ctx.els.familyChangeHint.textContent =
    "Set Current Value updates only current value (invested amount stays the same).";
  ctx.els.familyChangeAmount.min = "0";
}

async function handleSaveFamilyProfile(ctx, event) {
  event.preventDefault();
  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    setHubStatus(ctx.els, "Family profile is unavailable.", true);
    return;
  }

  try {
    const name = sanitizeText(ctx.els.familyNameInput.value, 80);
    if (!name) {
      throw new Error("Family name is required.");
    }

    family.name = name;
    family.updatedAt = new Date().toISOString();

    const saved = await persistDb(ctx, { endpoint: API.db });
    if (!saved) {
      throw new Error("Could not save family profile.");
    }

    renderAll(ctx);
    setHubStatus(ctx.els, "Family name saved.");
  } catch (error) {
    setHubStatus(ctx.els, error.message, true);
  }
}

async function handleAddAccount(ctx, event) {
  event.preventDefault();
  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    setHubStatus(ctx.els, "Family profile is unavailable.", true);
    return;
  }

  try {
    const payload = {
      memberName: sanitizeText(ctx.els.familyMemberName.value, 60),
      accountName: sanitizeText(ctx.els.familyAccountName.value, 80),
      currentCents: parseUnsignedCents(
        ctx.els.familyCurrentValue.value,
        "Initial current value",
      ),
      investedCents: parseUnsignedCents(
        ctx.els.familyInvestedValue.value,
        "Initial invested amount",
      ),
      date: normalizeDate(ctx.els.familyAccountDate.value || todayISO()),
      note: sanitizeText(ctx.els.familyAccountNote.value, 180),
    };

    if (!payload.memberName) {
      throw new Error("Family member name is required.");
    }
    if (!payload.accountName) {
      throw new Error("Account name is required.");
    }

    const duplicate = family.accounts.find(
      (account) =>
        account.memberName.toLowerCase() === payload.memberName.toLowerCase() &&
        account.accountName.toLowerCase() === payload.accountName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(
        `Account "${payload.accountName}" already exists for ${payload.memberName}.`,
      );
    }

    const account = {
      id: family.nextAccountId,
      memberName: payload.memberName,
      accountName: payload.accountName,
      currentCents: payload.currentCents,
      investedCents: payload.investedCents,
      note: payload.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    family.nextAccountId += 1;
    family.accounts.push(account);

    appendFamilyEvent(family, {
      date: payload.date,
      type: "account_created",
      memberName: account.memberName,
      accountId: account.id,
      accountName: account.accountName,
      currentDeltaCents: account.currentCents,
      investedDeltaCents: account.investedCents,
      currentAfterCents: account.currentCents,
      investedAfterCents: account.investedCents,
      note: payload.note || "Account created.",
    });

    family.updatedAt = new Date().toISOString();
    const saved = await persistDb(ctx, { endpoint: API.db });
    if (!saved) {
      throw new Error("Could not save account to family DB.");
    }

    ctx.els.familyAccountForm.reset();
    ctx.els.familyAccountDate.value = todayISO();
    renderAll(ctx);
    setHubStatus(ctx.els, "Account added.");
  } catch (error) {
    setHubStatus(ctx.els, error.message, true);
  }
}

function handleMemberCardsClick(ctx, event) {
  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    return;
  }

  const trigger = event.target.closest("button[data-member-open]");
  if (!trigger) {
    return;
  }

  const encodedName = trigger.dataset.memberOpen || "";
  let memberName = "";
  try {
    memberName = decodeURIComponent(encodedName);
  } catch {
    memberName = "";
  }

  if (!memberName || !memberHasAccounts(family, memberName)) {
    return;
  }

  openMemberDetailPage(ctx, memberName, { updateHash: true });
  renderAll(ctx);
}

async function handleMemberAccountsTableClick(ctx, event) {
  const family = getPrimaryFamily(ctx.db);
  if (!family || !ctx.activeMemberName) {
    return;
  }

  const openBtn = event.target.closest("button[data-account-open]");
  if (openBtn) {
    const accountId = toPositiveInt(openBtn.dataset.accountOpen, null);
    const account = findAccountById(family, accountId);
    if (!account) {
      return;
    }
    openAccountDetailPage(ctx, account.id, { updateHash: true });
    renderAll(ctx);
    return;
  }

  const removeBtn = event.target.closest("button[data-account-remove]");
  if (!removeBtn) {
    return;
  }

  const accountId = toPositiveInt(removeBtn.dataset.accountRemove, null);
  await removeAccount(ctx, accountId);
}

async function handleRecordChange(ctx, event) {
  event.preventDefault();

  const family = getPrimaryFamily(ctx.db);
  const account = getActiveAccount(ctx);
  if (!family || !account) {
    setFamilyStatus(ctx.els, "Open an account detail page first.", true);
    return;
  }

  try {
    const date = normalizeDate(ctx.els.familyChangeDate.value || todayISO());
    const type = ctx.els.familyChangeType.value;
    const amountCents = parseUnsignedCents(
      ctx.els.familyChangeAmount.value,
      "Activity amount",
    );
    const note = sanitizeText(ctx.els.familyChangeNote.value, 180);

    let currentDeltaCents = 0;
    let investedDeltaCents = 0;

    if (type === "deposit") {
      currentDeltaCents = amountCents;
      investedDeltaCents = amountCents;
    } else if (type === "withdrawal") {
      currentDeltaCents = -amountCents;
      investedDeltaCents = -amountCents;
    } else if (type === "set_value") {
      currentDeltaCents = amountCents - account.currentCents;
      investedDeltaCents = 0;
    } else {
      throw new Error("Unsupported activity type.");
    }

    if (currentDeltaCents === 0 && investedDeltaCents === 0) {
      throw new Error("No change detected.");
    }

    const nextCurrent = account.currentCents + currentDeltaCents;
    const nextInvested = account.investedCents + investedDeltaCents;

    if (nextCurrent < 0) {
      throw new Error("Current value would become negative.");
    }
    if (nextInvested < 0) {
      throw new Error("Invested amount would become negative.");
    }

    account.currentCents = nextCurrent;
    account.investedCents = nextInvested;
    account.updatedAt = new Date().toISOString();

    appendFamilyEvent(family, {
      date,
      type,
      memberName: account.memberName,
      accountId: account.id,
      accountName: account.accountName,
      currentDeltaCents,
      investedDeltaCents,
      currentAfterCents: nextCurrent,
      investedAfterCents: nextInvested,
      note,
    });

    family.updatedAt = new Date().toISOString();
    const saved = await persistDb(ctx, { endpoint: API.db });
    if (!saved) {
      throw new Error("Could not save account activity.");
    }

    ctx.els.familyChangeAmount.value = "";
    ctx.els.familyChangeNote.value = "";
    renderAll(ctx);
    setFamilyStatus(ctx.els, `${ACTIVITY_LABELS[type]} recorded.`);
  } catch (error) {
    setFamilyStatus(ctx.els, error.message, true);
  }
}

function handleExportFamilyDb(ctx) {
  setHubStatus(ctx.els, "Downloading family dashboard DB...");
  window.location.href = API.export;
}

async function handleImportFamilyDb(ctx, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    ctx.db = normalizeDbPayload(parsed);
    ensurePrimaryFamily(ctx.db);

    const saved = await persistDb(ctx, { endpoint: API.import });
    if (!saved) {
      throw new Error("Could not write imported file to family DB.");
    }

    syncPageFromHash(ctx);
    normalizeActivePageAfterDataChange(ctx, { updateHash: false });
    renderAll(ctx);
    setHubStatus(ctx.els, `Imported ${file.name}.`);
  } catch (error) {
    setHubStatus(ctx.els, error.message || "Import failed.", true);
  }
}

async function handleResetFamilyDb(ctx) {
  const confirmed = window.confirm(
    "Reset the Family Investment DB file? This does not affect stock dilution data.",
  );
  if (!confirmed) {
    return;
  }

  ctx.db = createInitialDb();
  ensurePrimaryFamily(ctx.db);
  openDashboardPage(ctx, { updateHash: isFamilyRoute() });

  const saved = await persistDb(ctx, { endpoint: API.db });
  if (!saved) {
    setHubStatus(ctx.els, "Could not reset family DB on server.", true);
    return;
  }

  renderAll(ctx);
  setHubStatus(ctx.els, "Family DB has been reset.");
}

function handleHashChange(ctx) {
  if (!isFamilyRoute()) {
    return;
  }
  syncPageFromHash(ctx);
  renderAll(ctx);
}

function syncPageFromHash(ctx) {
  if (!isFamilyRoute()) {
    return;
  }

  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    openDashboardPage(ctx, { updateHash: false });
    return;
  }

  const accountId = parseAccountIdFromHash(window.location.hash);
  const account = findAccountById(family, accountId);
  if (account) {
    openAccountDetailPage(ctx, account.id, { updateHash: false });
    return;
  }

  const memberName = parseMemberNameFromHash(window.location.hash);
  if (memberName && memberHasAccounts(family, memberName)) {
    openMemberDetailPage(ctx, memberName, { updateHash: false });
    return;
  }

  openDashboardPage(ctx, { updateHash: false });
}

function openDashboardPage(ctx, { updateHash }) {
  ctx.activePage = "dashboard";
  ctx.activeMemberName = null;
  ctx.activeAccountId = null;
  if (updateHash) {
    setDashboardHash();
  }
}

function openMemberDetailPage(ctx, memberName, { updateHash }) {
  ctx.activePage = "member";
  ctx.activeMemberName = memberName;
  ctx.activeAccountId = null;
  if (updateHash) {
    setMemberHash(memberName);
  }
}

function openAccountDetailPage(ctx, accountId, { updateHash }) {
  const family = getPrimaryFamily(ctx.db);
  const account = findAccountById(family, accountId);

  ctx.activePage = "account";
  ctx.activeAccountId = accountId;
  if (account) {
    ctx.activeMemberName = account.memberName;
  }

  if (updateHash) {
    setAccountHash(accountId);
  }
}

function normalizeActivePageAfterDataChange(ctx, { updateHash }) {
  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    openDashboardPage(ctx, { updateHash });
    return;
  }

  if (ctx.activePage === "account") {
    const activeAccount = getActiveAccount(ctx);
    if (activeAccount) {
      ctx.activeMemberName = activeAccount.memberName;
      if (updateHash) {
        setAccountHash(activeAccount.id);
      }
      return;
    }

    if (ctx.activeMemberName && memberHasAccounts(family, ctx.activeMemberName)) {
      openMemberDetailPage(ctx, ctx.activeMemberName, { updateHash });
      return;
    }

    openDashboardPage(ctx, { updateHash });
    return;
  }

  if (ctx.activePage === "member") {
    if (ctx.activeMemberName && memberHasAccounts(family, ctx.activeMemberName)) {
      if (updateHash) {
        setMemberHash(ctx.activeMemberName);
      }
      return;
    }

    openDashboardPage(ctx, { updateHash });
    return;
  }

  if (updateHash) {
    setDashboardHash();
  }
}

function renderAll(ctx) {
  const family = getPrimaryFamily(ctx.db);
  if (!family) {
    return;
  }

  normalizeActivePageAfterDataChange(ctx, { updateHash: false });

  ctx.els.familyNameInput.value = family.name;

  renderFamilySummary(ctx, family);
  renderFamilyAllocationChart(ctx, family);
  renderMemberCards(ctx, family);
  renderAccountsTable(ctx, family);

  const showDashboard = ctx.activePage === "dashboard";
  const showMemberDetail = ctx.activePage === "member";
  const showAccountDetail = ctx.activePage === "account";

  ctx.els.familyDashboardPage.hidden = !showDashboard;
  ctx.els.familyMemberDetailPage.hidden = !showMemberDetail;
  ctx.els.familyAccountDetailPage.hidden = !showAccountDetail;

  if (showMemberDetail && ctx.activeMemberName) {
    renderMemberDetail(ctx, family, ctx.activeMemberName);
  }

  const activeAccount = getActiveAccount(ctx);
  if (showAccountDetail && activeAccount) {
    renderAccountDetail(ctx, family, activeAccount);
  }
}

function renderFamilySummary(ctx, family) {
  const stats = getFamilyStats(family);
  ctx.els.familySelectedTitle.textContent = `${family.name} Dashboard`;
  ctx.els.familyStatTotalValue.textContent = formatCents(stats.totalValueCents);
  ctx.els.familyStatTotalInvested.textContent = formatCents(stats.totalInvestedCents);
  ctx.els.familyStatNet.textContent = formatSignedCents(stats.totalNetCents);
  ctx.els.familyStatAccountCount.textContent = String(stats.accountCount);
  ctx.els.familyStatNet.classList.toggle("valuePositive", stats.totalNetCents > 0);
  ctx.els.familyStatNet.classList.toggle("valueNegative", stats.totalNetCents < 0);
}

function renderFamilyAllocationChart(ctx, family) {
  const stats = getFamilyStats(family);
  const memberSummaries = getMemberSummaries(family.accounts);
  const slices = memberSummaries
    .filter((member) => member.currentCents > 0)
    .map((member) => ({
      label: member.memberName,
      value: member.currentCents,
      meta: `${formatCents(member.currentCents)} | Net ${formatSignedCents(member.netCents)}`,
    }));

  renderDoughnutChart({
    canvas: ctx.els.familyAllocationChart,
    legendEl: ctx.els.familyAllocationLegend,
    slices,
    emptyLabel: "Add accounts to build family allocation.",
    centerLabel: "Family Total",
    centerValue: formatCents(stats.totalValueCents),
  });
}

function renderMemberCards(ctx, family) {
  const summaries = getMemberSummaries(family.accounts);
  if (!summaries.length) {
    ctx.els.familyMemberCards.innerHTML =
      '<div class="memberCard"><h3>No members yet</h3><div class="meta">Add at least one account.</div></div>';
    return;
  }

  ctx.els.familyMemberCards.innerHTML = summaries
    .map((member) => {
      const netClass =
        member.netCents > 0
          ? "valuePositive"
          : member.netCents < 0
            ? "valueNegative"
            : "";
      const encodedMember = encodeURIComponent(member.memberName);

      return `<button type="button" class="memberCardButton" data-member-open="${encodedMember}">
        <h3>${escapeHtml(member.memberName)}</h3>
        <div class="meta">${member.accountCount} account${member.accountCount === 1 ? "" : "s"}</div>
        <div>Current Value: <strong>${formatCents(member.currentCents)}</strong></div>
        <div>Invested: <strong>${formatCents(member.investedCents)}</strong></div>
        <div>Net P/L: <strong class="${netClass}">${formatSignedCents(member.netCents)}</strong></div>
      </button>`;
    })
    .join("");
}

function renderAccountsTable(ctx, family) {
  const accounts = [...family.accounts].sort((a, b) => {
    const memberCompare = a.memberName.localeCompare(b.memberName);
    if (memberCompare !== 0) {
      return memberCompare;
    }
    return a.accountName.localeCompare(b.accountName);
  });

  if (!accounts.length) {
    ctx.els.familyAccountsTableBody.innerHTML =
      '<tr><td colspan="6" class="empty">No accounts recorded yet.</td></tr>';
    return;
  }

  ctx.els.familyAccountsTableBody.innerHTML = accounts
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
        <td>${formatDateTime(account.updatedAt)}</td>
      </tr>`;
    })
    .join("");
}

function renderMemberDetail(ctx, family, memberName) {
  const accounts = getMemberAccounts(family, memberName);
  const summary = getMemberSummary(accounts);

  ctx.els.familyMemberDetailTitle.textContent = `${memberName} | Member Details`;
  ctx.els.familyMemberStatTotalValue.textContent = formatCents(summary.currentCents);
  ctx.els.familyMemberStatInvested.textContent = formatCents(summary.investedCents);
  ctx.els.familyMemberStatNet.textContent = formatSignedCents(summary.netCents);
  ctx.els.familyMemberStatAccountCount.textContent = String(summary.accountCount);
  ctx.els.familyMemberStatNet.classList.toggle("valuePositive", summary.netCents > 0);
  ctx.els.familyMemberStatNet.classList.toggle("valueNegative", summary.netCents < 0);

  renderMemberAllocationChart(ctx, accounts, memberName, summary.currentCents);
  renderMemberTrendChart(ctx, family, memberName, summary.accountCount);
  renderMemberAccountsTable(ctx, accounts);
}

function renderMemberAllocationChart(ctx, accounts, memberName, totalCurrentCents) {
  const slices = accounts
    .filter((account) => account.currentCents > 0)
    .map((account) => ({
      label: account.accountName,
      value: account.currentCents,
      meta: `${formatCents(account.currentCents)} | Net ${formatSignedCents(account.currentCents - account.investedCents)}`,
    }));

  renderDoughnutChart({
    canvas: ctx.els.familyMemberAllocationChart,
    legendEl: ctx.els.familyMemberAllocationLegend,
    slices,
    emptyLabel: `Add accounts for ${memberName} to build allocation.`,
    centerLabel: "Member Total",
    centerValue: formatCents(totalCurrentCents),
  });
}

function renderMemberTrendChart(ctx, family, memberName, accountCount) {
  const points = buildMemberSeries(family, memberName);

  renderLineChart({
    canvas: ctx.els.familyMemberTrendChart,
    points,
    emptyLabel: "Record account activity to plot combined trend.",
    yFormatter: (value) => formatCompactCents(value),
    lineColor: "#2f6f95",
  });

  ctx.els.familyMemberTrendMeta.textContent =
    `Combined current value trend across ${accountCount} account${accountCount === 1 ? "" : "s"}.`;
}

function renderMemberAccountsTable(ctx, accounts) {
  if (!accounts.length) {
    ctx.els.familyMemberAccountsTableBody.innerHTML =
      '<tr><td colspan="7" class="empty">No accounts for this member.</td></tr>';
    return;
  }

  ctx.els.familyMemberAccountsTableBody.innerHTML = accounts
    .map((account) => {
      const netCents = account.currentCents - account.investedCents;
      const netClass =
        netCents > 0 ? "valuePositive" : netCents < 0 ? "valueNegative" : "";

      return `<tr>
        <td>${escapeHtml(account.accountName)}</td>
        <td>${formatCents(account.currentCents)}</td>
        <td>${formatCents(account.investedCents)}</td>
        <td><strong class="${netClass}">${formatSignedCents(netCents)}</strong></td>
        <td>${formatDateTime(account.updatedAt)}</td>
        <td><button type="button" class="tableAction ghostBtn" data-account-open="${account.id}">Open Details</button></td>
        <td><button type="button" class="tableAction danger" data-account-remove="${account.id}">Remove</button></td>
      </tr>`;
    })
    .join("");
}

function renderAccountDetail(ctx, family, account) {
  ctx.els.familyAccountDetailTitle.textContent = `${account.memberName} | ${account.accountName}`;
  ctx.els.familyAccountCurrentValue.textContent = formatCents(account.currentCents);
  ctx.els.familyAccountInvestedValue.textContent = formatCents(account.investedCents);

  const netCents = account.currentCents - account.investedCents;
  ctx.els.familyAccountNetValue.textContent = formatSignedCents(netCents);
  ctx.els.familyAccountNetValue.classList.toggle("valuePositive", netCents > 0);
  ctx.els.familyAccountNetValue.classList.toggle("valueNegative", netCents < 0);

  const canGoMemberBack =
    ctx.activeMemberName && memberHasAccounts(family, ctx.activeMemberName);
  ctx.els.familyBackToDashboard.textContent = canGoMemberBack
    ? "Back To Member"
    : "Back To Dashboard";

  renderAccountEventsTable(ctx, family, account.id);
  renderTrendChart(ctx, family, account.id);
  updateChangeFormFields(ctx);
}

function renderAccountEventsTable(ctx, family, accountId) {
  const events = [...family.events]
    .filter((event) => event.accountId === accountId)
    .sort(compareEventsDesc);

  if (!events.length) {
    ctx.els.familyEventsTableBody.innerHTML =
      '<tr><td colspan="7" class="empty">No history events yet.</td></tr>';
    return;
  }

  ctx.els.familyEventsTableBody.innerHTML = events
    .map((event) => {
      const activity = ACTIVITY_LABELS[event.type] || event.type;
      const cashFlow = formatEventCashFlow(event);
      return `<tr>
        <td>${event.date}</td>
        <td>${formatDateTime(event.occurredAt)}</td>
        <td>${escapeHtml(activity)}</td>
        <td>${escapeHtml(cashFlow)}</td>
        <td>${formatCents(event.currentAfterCents)}</td>
        <td>${formatCents(event.investedAfterCents)}</td>
        <td>${escapeHtml(event.note || "-")}</td>
      </tr>`;
    })
    .join("");
}

function renderTrendChart(ctx, family, accountId) {
  const account = findAccountById(family, accountId);
  const points = buildAccountSeries(family, accountId);

  renderLineChart({
    canvas: ctx.els.familyTrendChart,
    points,
    emptyLabel: "Record account activity to plot trend.",
    yFormatter: (value) => formatCompactCents(value),
    lineColor: "#2f6f95",
  });

  if (account) {
    ctx.els.familyTrendMeta.textContent =
      `Showing current value trend for ${account.memberName} | ${account.accountName}.`;
  } else {
    ctx.els.familyTrendMeta.textContent = "Selected account not found.";
  }
}

function buildAccountSeries(family, accountId) {
  return [...family.events]
    .filter((event) => event.accountId === accountId)
    .sort(compareEventsAsc)
    .map((event) => ({
      label: shortDateLabel(event.date),
      value: event.currentAfterCents,
    }));
}

function buildMemberSeries(family, memberName) {
  const memberEvents = [...family.events]
    .filter((event) => event.memberName === memberName)
    .sort(compareEventsAsc);

  if (!memberEvents.length) {
    return [];
  }

  const accountCurrentValues = new Map();
  const points = [];

  for (const event of memberEvents) {
    accountCurrentValues.set(event.accountId, event.currentAfterCents);

    let total = 0;
    for (const value of accountCurrentValues.values()) {
      total += value;
    }

    points.push({
      label: shortDateLabel(event.date),
      value: total,
    });
  }

  return points;
}

function formatEventCashFlow(event) {
  if (event.type === "set_value" || event.investedDeltaCents === 0) {
    return "-";
  }
  return formatSignedCents(event.investedDeltaCents);
}

async function removeAccount(ctx, accountId) {
  const family = getPrimaryFamily(ctx.db);
  const account = findAccountById(family, accountId);
  if (!family || !account) {
    return;
  }

  const confirmed = window.confirm(
    `Remove account "${account.accountName}" for ${account.memberName}?`,
  );
  if (!confirmed) {
    return;
  }

  appendFamilyEvent(family, {
    date: todayISO(),
    type: "account_removed",
    memberName: account.memberName,
    accountId: account.id,
    accountName: account.accountName,
    currentDeltaCents: -account.currentCents,
    investedDeltaCents: -account.investedCents,
    currentAfterCents: 0,
    investedAfterCents: 0,
    note: "Account removed.",
  });

  family.accounts = family.accounts.filter((item) => item.id !== account.id);
  family.updatedAt = new Date().toISOString();

  normalizeActivePageAfterDataChange(ctx, { updateHash: true });

  const saved = await persistDb(ctx, { endpoint: API.db });
  if (!saved) {
    setHubStatus(ctx.els, "Could not save after removing account.", true);
    return;
  }

  renderAll(ctx);
  setHubStatus(ctx.els, "Account removed.");
}

function appendFamilyEvent(family, payload) {
  family.events.push({
    id: family.nextEventId,
    occurredAt: new Date().toISOString(),
    date: normalizeDate(payload.date),
    type: sanitizeText(payload.type, 40) || "change",
    memberName: sanitizeText(payload.memberName, 60) || "Unknown",
    accountId: payload.accountId,
    accountName: sanitizeText(payload.accountName, 80) || "Unknown account",
    currentDeltaCents: payload.currentDeltaCents,
    investedDeltaCents: payload.investedDeltaCents,
    currentAfterCents: payload.currentAfterCents,
    investedAfterCents: payload.investedAfterCents,
    note: sanitizeText(payload.note || "", 180),
  });
  family.nextEventId += 1;
}

function getFamilyStats(family) {
  const memberNames = new Set();
  let totalValueCents = 0;
  let totalInvestedCents = 0;
  for (const account of family.accounts) {
    memberNames.add(account.memberName);
    totalValueCents += account.currentCents;
    totalInvestedCents += account.investedCents;
  }
  return {
    memberCount: memberNames.size,
    accountCount: family.accounts.length,
    totalValueCents,
    totalInvestedCents,
    totalNetCents: totalValueCents - totalInvestedCents,
  };
}

function getMemberSummary(accounts) {
  let currentCents = 0;
  let investedCents = 0;
  for (const account of accounts) {
    currentCents += account.currentCents;
    investedCents += account.investedCents;
  }
  return {
    currentCents,
    investedCents,
    netCents: currentCents - investedCents,
    accountCount: accounts.length,
  };
}

function getMemberSummaries(accounts) {
  const grouped = new Map();
  for (const account of accounts) {
    if (!grouped.has(account.memberName)) {
      grouped.set(account.memberName, {
        memberName: account.memberName,
        currentCents: 0,
        investedCents: 0,
        netCents: 0,
        accountCount: 0,
      });
    }
    const item = grouped.get(account.memberName);
    item.currentCents += account.currentCents;
    item.investedCents += account.investedCents;
    item.netCents = item.currentCents - item.investedCents;
    item.accountCount += 1;
  }
  return [...grouped.values()].sort((a, b) => b.currentCents - a.currentCents);
}

function getMemberAccounts(family, memberName) {
  return [...family.accounts]
    .filter((account) => account.memberName === memberName)
    .sort((a, b) => a.accountName.localeCompare(b.accountName));
}

function memberHasAccounts(family, memberName) {
  return family.accounts.some((account) => account.memberName === memberName);
}

function getPrimaryFamily(db) {
  return db.state.families[0] || null;
}

function ensurePrimaryFamily(db) {
  const existing = getPrimaryFamily(db);
  if (existing) {
    return { family: existing, created: false };
  }

  const family = {
    id: db.state.nextFamilyId,
    name: DEFAULT_FAMILY_NAME,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAccountId: 1,
    nextEventId: 1,
    accounts: [],
    events: [],
  };

  db.state.families.push(family);
  db.state.nextFamilyId += 1;
  return { family, created: true };
}

function getActiveAccount(ctx) {
  const family = getPrimaryFamily(ctx.db);
  if (!family || ctx.activeAccountId === null) {
    return null;
  }
  return findAccountById(family, ctx.activeAccountId);
}

function findAccountById(family, accountId) {
  if (!family || accountId === null) {
    return null;
  }
  return family.accounts.find((item) => item.id === accountId) || null;
}

function isFamilyRoute() {
  return (
    typeof window.location.hash === "string" &&
    window.location.hash.startsWith("#family-dashboard")
  );
}

function parseAccountIdFromHash(hash) {
  if (typeof hash !== "string") {
    return null;
  }
  const match = hash.match(/^#family-dashboard\/account-(\d+)$/);
  if (!match) {
    return null;
  }
  return toPositiveInt(match[1], null);
}

function parseMemberNameFromHash(hash) {
  if (typeof hash !== "string") {
    return null;
  }

  const match = hash.match(/^#family-dashboard\/member-(.+)$/);
  if (!match || !match[1]) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(match[1]);
    return decoded || null;
  } catch {
    return null;
  }
}

function setDashboardHash() {
  if (window.location.hash !== "#family-dashboard") {
    window.location.hash = "#family-dashboard";
  }
}

function setMemberHash(memberName) {
  const nextHash = `#family-dashboard/member-${encodeURIComponent(memberName)}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function setAccountHash(accountId) {
  const nextHash = `#family-dashboard/account-${accountId}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function compareEventsAsc(a, b) {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  return a.id - b.id;
}

function compareEventsDesc(a, b) {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }
  return b.id - a.id;
}

async function loadDbFromServer() {
  try {
    const response = await fetchWithTimeout(API.db, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Family DB load failed (${response.status}).`);
    }
    const payload = await response.json();
    return { db: normalizeDbPayload(payload), connected: true };
  } catch {
    return { db: createInitialDb(), connected: false };
  }
}

async function persistDb(ctx, { endpoint }) {
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: endpoint === API.import ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDbEnvelope(ctx.db)),
    });
    if (!response.ok) {
      throw new Error(`Family DB write failed (${response.status}).`);
    }
    setDbState(
      ctx.els,
      `Family DB: data/family_dashboard.json | saved at ${formatTime(new Date())}`,
    );
    return true;
  } catch {
    setDbState(ctx.els, "Family DB: save failed");
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timerId);
  }
}

function buildDbEnvelope(db) {
  return {
    schemaVersion: SCHEMA_VERSION,
    state: {
      families: db.state.families.map((family) => ({
        id: family.id,
        name: family.name,
        createdAt: family.createdAt,
        updatedAt: family.updatedAt,
        nextAccountId: family.nextAccountId,
        nextEventId: family.nextEventId,
        accounts: family.accounts.map((account) => ({ ...account })),
        events: family.events.map((event) => ({ ...event })),
      })),
      nextFamilyId: db.state.nextFamilyId,
    },
  };
}

function createInitialDb() {
  return {
    schemaVersion: SCHEMA_VERSION,
    state: {
      families: [],
      nextFamilyId: 1,
    },
  };
}

function normalizeDbPayload(payload) {
  const base = createInitialDb();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return base;
  }

  const sourceState =
    payload.state && typeof payload.state === "object" ? payload.state : payload;
  const rawFamilies = Array.isArray(sourceState.families) ? sourceState.families : [];

  const families = rawFamilies
    .map((family, index) => normalizeFamily(family, index + 1))
    .filter(Boolean);
  families.sort((a, b) => a.id - b.id);

  const maxId = families.reduce((maxValue, family) => Math.max(maxValue, family.id), 0);
  const nextFamilyId = Math.max(toPositiveInt(sourceState.nextFamilyId, 1), maxId + 1);

  return {
    schemaVersion: SCHEMA_VERSION,
    state: {
      families,
      nextFamilyId,
    },
  };
}

function normalizeFamily(rawFamily, fallbackId) {
  if (!rawFamily || typeof rawFamily !== "object") {
    return null;
  }
  const id = toPositiveInt(rawFamily.id, fallbackId);
  const name = sanitizeText(rawFamily.name, 80) || `Family ${id}`;
  const accountsRaw = Array.isArray(rawFamily.accounts) ? rawFamily.accounts : [];
  const eventsRaw = Array.isArray(rawFamily.events) ? rawFamily.events : [];

  const accounts = accountsRaw
    .map((rawAccount, index) => normalizeAccount(rawAccount, index + 1))
    .filter(Boolean);
  accounts.sort((a, b) => a.id - b.id);

  const events = eventsRaw
    .map((rawEvent, index) => normalizeEvent(rawEvent, index + 1))
    .filter(Boolean);
  events.sort(compareEventsAsc);

  const maxAccountId = accounts.reduce(
    (maxValue, account) => Math.max(maxValue, account.id),
    0,
  );
  const maxEventId = events.reduce((maxValue, event) => Math.max(maxValue, event.id), 0);

  return {
    id,
    name,
    createdAt: normalizeDateTime(rawFamily.createdAt),
    updatedAt: normalizeDateTime(rawFamily.updatedAt),
    nextAccountId: Math.max(toPositiveInt(rawFamily.nextAccountId, 1), maxAccountId + 1),
    nextEventId: Math.max(toPositiveInt(rawFamily.nextEventId, 1), maxEventId + 1),
    accounts,
    events,
  };
}

function normalizeAccount(rawAccount, fallbackId) {
  if (!rawAccount || typeof rawAccount !== "object") {
    return null;
  }
  const id = toPositiveInt(rawAccount.id, fallbackId);
  return {
    id,
    memberName: sanitizeText(rawAccount.memberName, 60) || "Unknown",
    accountName: sanitizeText(rawAccount.accountName, 80) || `Account ${id}`,
    currentCents: toNonNegativeSafeInt(rawAccount.currentCents),
    investedCents: toNonNegativeSafeInt(rawAccount.investedCents),
    note: sanitizeText(rawAccount.note, 180),
    createdAt: normalizeDateTime(rawAccount.createdAt),
    updatedAt: normalizeDateTime(rawAccount.updatedAt),
  };
}

function normalizeEvent(rawEvent, fallbackId) {
  if (!rawEvent || typeof rawEvent !== "object") {
    return null;
  }
  return {
    id: toPositiveInt(rawEvent.id, fallbackId),
    occurredAt: normalizeDateTime(rawEvent.occurredAt),
    date: normalizeDate(rawEvent.date),
    type: sanitizeText(rawEvent.type, 40) || "change",
    memberName: sanitizeText(rawEvent.memberName, 60) || "Unknown",
    accountId: toPositiveInt(rawEvent.accountId, 1),
    accountName: sanitizeText(rawEvent.accountName, 80) || "Unknown account",
    currentDeltaCents: toSignedSafeInt(rawEvent.currentDeltaCents),
    investedDeltaCents: toSignedSafeInt(rawEvent.investedDeltaCents),
    currentAfterCents: toNonNegativeSafeInt(rawEvent.currentAfterCents),
    investedAfterCents: toNonNegativeSafeInt(rawEvent.investedAfterCents),
    note: sanitizeText(rawEvent.note, 180),
  };
}

function parseUnsignedCents(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    throw new Error(`${label} is required.`);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  const cents = Math.round(numeric * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${label} is too large.`);
  }
  return cents;
}

function toPositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function toNonNegativeSafeInt(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function toSignedSafeInt(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    return 0;
  }
  return numeric;
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return todayISO();
}

function normalizeDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function setDbState(els, message) {
  els.familyDbState.textContent = message;
}

function setHubStatus(els, message, isError = false) {
  els.familyHubStatus.textContent = message;
  els.familyHubStatus.classList.toggle("error", isError);
  els.familyHubStatus.classList.toggle("ok", !isError);
}

function setFamilyStatus(els, message, isError = false) {
  els.familyStatusMessage.textContent = message;
  els.familyStatusMessage.classList.toggle("error", isError);
  els.familyStatusMessage.classList.toggle("ok", !isError);
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

function formatCompactCents(cents) {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
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

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortDateLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${month}/${day}`;
}

function todayISO() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
