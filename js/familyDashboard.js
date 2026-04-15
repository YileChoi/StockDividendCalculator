import { renderDoughnutChart } from "./doughnut.js";
import { renderLineChart } from "./lineChart.js";

const API = {
  db: "/api/family-db",
  import: "/api/family-db/import",
  export: "/api/family-db/export",
};

const SCHEMA_VERSION = 1;
const NETWORK_TIMEOUT_MS = 8000;

export function initFamilyDashboard() {
  const els = collectElements();
  if (!els.familyCreateForm) {
    return;
  }

  const ctx = {
    els,
    db: createInitialDb(),
    activeFamilyId: null,
  };

  bindEvents(ctx);
  setDefaultDates(els);
  void init(ctx);
}

async function init(ctx) {
  setDbState(ctx.els, "Family DB: connecting...");
  const loaded = await loadDbFromServer();
  ctx.db = loaded.db;
  setDbState(
    ctx.els,
    loaded.connected
      ? "Family DB: data/family_dashboard.json | connected"
      : "Family DB: offline (in-memory fallback)",
  );

  const hashFamilyId = parseFamilyIdFromHash(window.location.hash);
  if (hashFamilyId !== null && findFamily(ctx.db, hashFamilyId)) {
    ctx.activeFamilyId = hashFamilyId;
  } else if (ctx.db.state.families.length > 0) {
    ctx.activeFamilyId = ctx.db.state.families[0].id;
  }

  if (
    ctx.activeFamilyId !== null &&
    typeof window.location.hash === "string" &&
    window.location.hash.startsWith("#family-dashboard")
  ) {
    setFamilyHash(ctx.activeFamilyId);
  }
  renderAll(ctx);
}

function collectElements() {
  return {
    familyCreateForm: document.getElementById("familyCreateForm"),
    familyNameInput: document.getElementById("familyNameInput"),
    familyTableBody: document.getElementById("familyTableBody"),
    familyHubStatus: document.getElementById("familyHubStatus"),
    familyExport: document.getElementById("familyExport"),
    familyImport: document.getElementById("familyImport"),
    familyResetDb: document.getElementById("familyResetDb"),
    familyImportFile: document.getElementById("familyImportFile"),
    familyDbState: document.getElementById("familyDbState"),

    familyDetailEmpty: document.getElementById("familyDetailEmpty"),
    familyDetailPage: document.getElementById("familyDetailPage"),
    familySelectedTitle: document.getElementById("familySelectedTitle"),
    familyDeleteSelected: document.getElementById("familyDeleteSelected"),

    familyStatTotalValue: document.getElementById("familyStatTotalValue"),
    familyStatTotalInvested: document.getElementById("familyStatTotalInvested"),
    familyStatNet: document.getElementById("familyStatNet"),
    familyStatAccountCount: document.getElementById("familyStatAccountCount"),

    familyAllocationChart: document.getElementById("familyAllocationChart"),
    familyAllocationLegend: document.getElementById("familyAllocationLegend"),

    familyTrendAccountSelect: document.getElementById("familyTrendAccountSelect"),
    familyTrendChart: document.getElementById("familyTrendChart"),
    familyTrendMeta: document.getElementById("familyTrendMeta"),

    familyAccountForm: document.getElementById("familyAccountForm"),
    familyMemberName: document.getElementById("familyMemberName"),
    familyAccountName: document.getElementById("familyAccountName"),
    familyCurrentValue: document.getElementById("familyCurrentValue"),
    familyInvestedValue: document.getElementById("familyInvestedValue"),
    familyAccountDate: document.getElementById("familyAccountDate"),
    familyAccountNote: document.getElementById("familyAccountNote"),

    familyChangeForm: document.getElementById("familyChangeForm"),
    familyChangeDate: document.getElementById("familyChangeDate"),
    familyChangeAccount: document.getElementById("familyChangeAccount"),
    familyCurrentDelta: document.getElementById("familyCurrentDelta"),
    familyInvestedDelta: document.getElementById("familyInvestedDelta"),
    familyChangeNote: document.getElementById("familyChangeNote"),

    familyMemberCards: document.getElementById("familyMemberCards"),
    familyAccountsTableBody: document.getElementById("familyAccountsTableBody"),
    familyEventsTableBody: document.getElementById("familyEventsTableBody"),
    familyStatusMessage: document.getElementById("familyStatusMessage"),
  };
}

function bindEvents(ctx) {
  const { els } = ctx;
  els.familyCreateForm.addEventListener("submit", (event) =>
    handleCreateFamily(ctx, event),
  );
  els.familyTableBody.addEventListener("click", (event) =>
    handleFamilyTableClick(ctx, event),
  );
  els.familyDeleteSelected.addEventListener("click", () =>
    handleDeleteSelectedFamily(ctx),
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
  els.familyChangeForm.addEventListener("submit", (event) =>
    handleRecordChange(ctx, event),
  );
  els.familyTrendAccountSelect.addEventListener("change", () =>
    renderTrendChart(ctx),
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

async function handleCreateFamily(ctx, event) {
  event.preventDefault();
  try {
    const name = sanitizeText(ctx.els.familyNameInput.value, 80);
    if (!name) {
      throw new Error("Family name is required.");
    }
    const duplicate = ctx.db.state.families.find(
      (family) => family.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`"${name}" already exists.`);
    }

    const family = {
      id: ctx.db.state.nextFamilyId,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextAccountId: 1,
      nextEventId: 1,
      accounts: [],
      events: [],
    };
    ctx.db.state.families.push(family);
    ctx.db.state.nextFamilyId += 1;
    ctx.activeFamilyId = family.id;

    const saved = await persistDb(ctx, { endpoint: API.db });
    if (!saved) {
      throw new Error("Could not save family DB.");
    }

    ctx.els.familyNameInput.value = "";
    setFamilyHash(family.id);
    renderAll(ctx);
    setHubStatus(ctx.els, `Family "${name}" created.`);
  } catch (error) {
    setHubStatus(ctx.els, error.message, true);
  }
}

function handleFamilyTableClick(ctx, event) {
  const openBtn = event.target.closest("button[data-family-open]");
  if (openBtn) {
    const familyId = toPositiveInt(openBtn.dataset.familyOpen, null);
    if (familyId !== null && findFamily(ctx.db, familyId)) {
      ctx.activeFamilyId = familyId;
      setFamilyHash(familyId);
      renderAll(ctx);
      setHubStatus(ctx.els, "Opened family page.");
    }
  }
}

async function handleDeleteSelectedFamily(ctx) {
  const family = getActiveFamily(ctx);
  if (!family) {
    return;
  }

  const confirmed = window.confirm(
    `Delete family "${family.name}" and all its accounts/history?`,
  );
  if (!confirmed) {
    return;
  }

  ctx.db.state.families = ctx.db.state.families.filter((item) => item.id !== family.id);
  ctx.activeFamilyId = ctx.db.state.families.length
    ? ctx.db.state.families[0].id
    : null;

  const saved = await persistDb(ctx, { endpoint: API.db });
  if (!saved) {
    setFamilyStatus(ctx.els, "Could not save family DB after delete.", true);
    return;
  }

  if (ctx.activeFamilyId !== null) {
    setFamilyHash(ctx.activeFamilyId);
  } else {
    setFamilyHash(null);
  }
  renderAll(ctx);
  setHubStatus(ctx.els, "Family deleted.");
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
    const normalized = normalizeDbPayload(parsed);
    const previousActive = ctx.activeFamilyId;
    ctx.db = normalized;

    const saved = await persistDb(ctx, { endpoint: API.import });
    if (!saved) {
      throw new Error("Could not write imported file to family DB.");
    }

    if (previousActive !== null && findFamily(ctx.db, previousActive)) {
      ctx.activeFamilyId = previousActive;
    } else if (ctx.db.state.families.length > 0) {
      ctx.activeFamilyId = ctx.db.state.families[0].id;
    } else {
      ctx.activeFamilyId = null;
    }
    if (ctx.activeFamilyId !== null) {
      setFamilyHash(ctx.activeFamilyId);
    }

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
  ctx.activeFamilyId = null;
  const saved = await persistDb(ctx, { endpoint: API.db });
  if (!saved) {
    setHubStatus(ctx.els, "Could not reset family DB on server.", true);
    return;
  }
  setFamilyHash(null);
  renderAll(ctx);
  setHubStatus(ctx.els, "Family DB has been reset.");
}

async function handleAddAccount(ctx, event) {
  event.preventDefault();
  const family = getActiveFamily(ctx);
  if (!family) {
    setFamilyStatus(ctx.els, "Open a family page first.", true);
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
    setFamilyStatus(ctx.els, "Account added and logged.");
  } catch (error) {
    setFamilyStatus(ctx.els, error.message, true);
  }
}

async function handleRecordChange(ctx, event) {
  event.preventDefault();
  const family = getActiveFamily(ctx);
  if (!family) {
    setFamilyStatus(ctx.els, "Open a family page first.", true);
    return;
  }

  try {
    const accountId = toPositiveInt(ctx.els.familyChangeAccount.value, null);
    if (accountId === null) {
      throw new Error("Select an account.");
    }
    const account = family.accounts.find((item) => item.id === accountId);
    if (!account) {
      throw new Error("Selected account is not valid.");
    }

    const currentDeltaCents = parseSignedCents(
      ctx.els.familyCurrentDelta.value,
      "Current value change",
    );
    const investedDeltaCents = parseSignedCents(
      ctx.els.familyInvestedDelta.value,
      "Invested amount change",
    );
    if (currentDeltaCents === 0 && investedDeltaCents === 0) {
      throw new Error("At least one change value must be non-zero.");
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
    const date = normalizeDate(ctx.els.familyChangeDate.value || todayISO());
    const note = sanitizeText(ctx.els.familyChangeNote.value, 180);

    appendFamilyEvent(family, {
      date,
      type: classifyChangeType(currentDeltaCents, investedDeltaCents),
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
      throw new Error("Could not save change to family DB.");
    }

    ctx.els.familyCurrentDelta.value = "0";
    ctx.els.familyInvestedDelta.value = "0";
    ctx.els.familyChangeNote.value = "";
    renderAll(ctx);
    setFamilyStatus(ctx.els, "Change recorded with timestamp.");
  } catch (error) {
    setFamilyStatus(ctx.els, error.message, true);
  }
}

function handleHashChange(ctx) {
  const familyId = parseFamilyIdFromHash(window.location.hash);
  if (familyId !== null && findFamily(ctx.db, familyId)) {
    if (ctx.activeFamilyId !== familyId) {
      ctx.activeFamilyId = familyId;
      renderAll(ctx);
    }
  }
}

function renderAll(ctx) {
  renderFamilyTable(ctx);
  renderActiveFamilyView(ctx);
}

function renderFamilyTable(ctx) {
  const families = [...ctx.db.state.families].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (!families.length) {
    ctx.els.familyTableBody.innerHTML =
      '<tr><td colspan="5" class="empty">No families yet.</td></tr>';
    return;
  }

  ctx.els.familyTableBody.innerHTML = families
    .map((family) => {
      const stats = getFamilyStats(family);
      const activeTag = family.id === ctx.activeFamilyId ? " (Active)" : "";
      return `<tr>
        <td>${escapeHtml(family.name)}${escapeHtml(activeTag)}</td>
        <td>${stats.memberCount}</td>
        <td>${stats.accountCount}</td>
        <td>${formatCents(stats.totalValueCents)}</td>
        <td><button type="button" class="tableAction ghostBtn" data-family-open="${family.id}">Open</button></td>
      </tr>`;
    })
    .join("");
}

function renderActiveFamilyView(ctx) {
  const family = getActiveFamily(ctx);
  if (!family) {
    ctx.els.familyDetailEmpty.hidden = false;
    ctx.els.familyDetailPage.hidden = true;
    return;
  }

  ctx.els.familyDetailEmpty.hidden = true;
  ctx.els.familyDetailPage.hidden = false;
  ctx.els.familySelectedTitle.textContent = `${family.name} - Individual Page`;

  const stats = getFamilyStats(family);
  ctx.els.familyStatTotalValue.textContent = formatCents(stats.totalValueCents);
  ctx.els.familyStatTotalInvested.textContent = formatCents(stats.totalInvestedCents);
  ctx.els.familyStatNet.textContent = formatSignedCents(stats.totalNetCents);
  ctx.els.familyStatAccountCount.textContent = String(stats.accountCount);
  ctx.els.familyStatNet.classList.toggle("valuePositive", stats.totalNetCents > 0);
  ctx.els.familyStatNet.classList.toggle("valueNegative", stats.totalNetCents < 0);

  renderAllocationChart(ctx, family);
  renderMemberCards(ctx, family);
  renderAccountsTable(ctx, family);
  renderEventsTable(ctx, family);
  renderAccountSelectors(ctx, family);
  renderTrendChart(ctx);
}

function renderAllocationChart(ctx, family) {
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
    emptyLabel: "Add accounts to build this chart.",
    centerLabel: "Total Value",
    centerValue: formatCents(
      memberSummaries.reduce((sum, member) => sum + member.currentCents, 0),
    ),
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
      '<tr><td colspan="7" class="empty">No accounts recorded yet.</td></tr>';
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
        <td>${escapeHtml(account.note || "—")}</td>
      </tr>`;
    })
    .join("");
}

function renderEventsTable(ctx, family) {
  const events = [...family.events].sort(compareEventsDesc);
  if (!events.length) {
    ctx.els.familyEventsTableBody.innerHTML =
      '<tr><td colspan="10" class="empty">No history events yet.</td></tr>';
    return;
  }

  ctx.els.familyEventsTableBody.innerHTML = events
    .map((event) => {
      return `<tr>
        <td>${event.date}</td>
        <td>${formatDateTime(event.occurredAt)}</td>
        <td>${escapeHtml(event.type)}</td>
        <td>${escapeHtml(event.memberName)}</td>
        <td>${escapeHtml(event.accountName)}</td>
        <td>${formatSignedCents(event.currentDeltaCents)}</td>
        <td>${formatSignedCents(event.investedDeltaCents)}</td>
        <td>${formatCents(event.currentAfterCents)}</td>
        <td>${formatCents(event.investedAfterCents)}</td>
        <td>${escapeHtml(event.note || "—")}</td>
      </tr>`;
    })
    .join("");
}

function renderAccountSelectors(ctx, family) {
  const options = family.accounts
    .map(
      (account) =>
        `<option value="${account.id}">${escapeHtml(account.memberName)} | ${escapeHtml(account.accountName)}</option>`,
    )
    .join("");

  ctx.els.familyChangeAccount.innerHTML = options;
  if (!options) {
    ctx.els.familyChangeAccount.innerHTML =
      '<option value="">No accounts yet</option>';
  }
  ctx.els.familyChangeAccount.disabled = !options;

  const existingTrendValue = ctx.els.familyTrendAccountSelect.value;
  ctx.els.familyTrendAccountSelect.innerHTML = `<option value="all">Family Total</option>${options}`;
  const hasExisting = ctx.els.familyTrendAccountSelect.querySelector(
    `option[value="${escapeAttribute(existingTrendValue)}"]`,
  );
  if (hasExisting) {
    ctx.els.familyTrendAccountSelect.value = existingTrendValue;
  } else {
    ctx.els.familyTrendAccountSelect.value = "all";
  }
}

function renderTrendChart(ctx) {
  const family = getActiveFamily(ctx);
  if (!family) {
    return;
  }
  const mode = ctx.els.familyTrendAccountSelect.value || "all";
  let points = [];
  let meta = "";

  if (mode === "all") {
    points = buildFamilyTotalSeries(family);
    meta = "Showing total family current value over recorded change history.";
  } else {
    const accountId = toPositiveInt(mode, null);
    const account = family.accounts.find((item) => item.id === accountId);
    points = buildAccountSeries(family, accountId);
    meta = account
      ? `Showing account value trend: ${account.memberName} | ${account.accountName}`
      : "Selected account not found.";
  }

  renderLineChart({
    canvas: ctx.els.familyTrendChart,
    points,
    emptyLabel: "Record account changes to plot trend.",
    yFormatter: (value) => formatCompactCents(value),
    lineColor: "#2f6f95",
  });
  ctx.els.familyTrendMeta.textContent = meta;
}

function buildAccountSeries(family, accountId) {
  if (accountId === null) {
    return [];
  }
  return [...family.events]
    .filter((event) => event.accountId === accountId)
    .sort(compareEventsAsc)
    .map((event) => ({
      label: shortDateLabel(event.date),
      value: event.currentAfterCents,
    }));
}

function buildFamilyTotalSeries(family) {
  const events = [...family.events].sort(compareEventsAsc);
  if (!events.length) {
    return [];
  }

  const accountValues = new Map();
  const series = [];
  for (const event of events) {
    accountValues.set(event.accountId, event.currentAfterCents);
    let total = 0;
    for (const value of accountValues.values()) {
      total += value;
    }
    series.push({
      label: shortDateLabel(event.date),
      value: total,
    });
  }
  return series;
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

function classifyChangeType(currentDeltaCents, investedDeltaCents) {
  if (investedDeltaCents > 0) {
    return "invest_add";
  }
  if (investedDeltaCents < 0) {
    return "invest_reduce";
  }
  if (currentDeltaCents > 0) {
    return "value_gain";
  }
  if (currentDeltaCents < 0) {
    return "value_drop";
  }
  return "adjustment";
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

function getActiveFamily(ctx) {
  if (ctx.activeFamilyId === null) {
    return null;
  }
  return findFamily(ctx.db, ctx.activeFamilyId);
}

function findFamily(db, familyId) {
  return db.state.families.find((family) => family.id === familyId) || null;
}

function parseFamilyIdFromHash(hash) {
  if (typeof hash !== "string") {
    return null;
  }
  const match = hash.match(/^#family-dashboard\/family-(\d+)$/);
  if (!match) {
    return null;
  }
  return toPositiveInt(match[1], null);
}

function setFamilyHash(familyId) {
  const nextHash =
    familyId === null ? "#family-dashboard" : `#family-dashboard/family-${familyId}`;
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

function parseSignedCents(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    throw new Error(`${label} is required.`);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a valid number.`);
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

function escapeAttribute(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}
