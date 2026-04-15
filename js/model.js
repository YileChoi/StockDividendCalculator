const CENTS_PER_DOLLAR = 100n;
const UNIT_SCALE = 100000000n; // 1e-8 unit precision
const BASE_NAV_CENTS = 100n; // $1.00 baseline when fund starts empty
const MAX_NOTE_LENGTH = 180;

const TX_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  PROFIT_LOSS: "profit_loss",
  SET_VALUATION: "set_valuation",
};

export const CONSTANTS = {
  CENTS_PER_DOLLAR,
  UNIT_SCALE,
  BASE_NAV_CENTS,
  TX_TYPES,
};

export function createInitialState() {
  return {
    version: 1,
    members: [],
    totalUnitsMicro: 0n,
    portfolioCents: 0n,
    transactions: [],
    nextMemberId: 1,
    nextTransactionId: 1,
  };
}

export function serializeState(state) {
  return JSON.stringify(state, (_, value) => {
    if (typeof value === "bigint") {
      return { __bigint: value.toString() };
    }
    return value;
  });
}

export function deserializeState(serialized) {
  if (!serialized || typeof serialized !== "string") {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(serialized, (_, value) => {
      if (
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, "__bigint")
      ) {
        return BigInt(value.__bigint);
      }
      return value;
    });
    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

export function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const members = Array.isArray(raw.members) ? raw.members : [];
  base.members = members
    .map((member, index) => {
      const name = sanitizeName(member?.name ?? `Person ${index + 1}`);
      if (!name) {
        return null;
      }

      return {
        id: toPositiveInt(member?.id, index + 1),
        name,
        unitsMicro: toNonNegativeBigInt(member?.unitsMicro),
        totalContributedCents: toNonNegativeBigInt(member?.totalContributedCents),
        totalWithdrawnCents: toNonNegativeBigInt(member?.totalWithdrawnCents),
        createdAt: normalizeDate(member?.createdAt),
      };
    })
    .filter(Boolean);

  base.members.sort((a, b) => a.id - b.id);
  base.totalUnitsMicro = base.members.reduce(
    (acc, member) => acc + member.unitsMicro,
    0n,
  );

  base.portfolioCents = toNonNegativeBigInt(raw.portfolioCents);
  if (base.totalUnitsMicro === 0n) {
    base.portfolioCents = 0n;
  }

  const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
  base.transactions = transactions
    .map((tx, index) => normalizeTransaction(tx, index + 1))
    .filter(Boolean);
  base.transactions.sort((a, b) => a.id - b.id);

  base.nextMemberId = Math.max(
    toPositiveInt(raw.nextMemberId, 1),
    base.members.reduce((maxId, m) => Math.max(maxId, m.id), 0) + 1,
  );

  base.nextTransactionId = Math.max(
    toPositiveInt(raw.nextTransactionId, 1),
    base.transactions.reduce((maxId, tx) => Math.max(maxId, tx.id), 0) + 1,
  );

  assertState(base);
  return base;
}

export function addMember(state, name, createdAt = todayISO()) {
  const normalizedName = sanitizeName(name);
  if (!normalizedName) {
    throw new Error("Name is required.");
  }

  const lowerName = normalizedName.toLowerCase();
  const duplicate = state.members.find(
    (member) => member.name.toLowerCase() === lowerName,
  );
  if (duplicate) {
    throw new Error(`"${normalizedName}" already exists.`);
  }

  const next = cloneState(state);
  next.members.push({
    id: next.nextMemberId,
    name: normalizedName,
    unitsMicro: 0n,
    totalContributedCents: 0n,
    totalWithdrawnCents: 0n,
    createdAt: normalizeDate(createdAt),
  });
  next.nextMemberId += 1;
  assertState(next);
  return next;
}

export function applyDeposit(
  state,
  { memberId, amount, date = todayISO(), note = "" },
) {
  const cents = parseAmountToCents(amount, {
    allowNegative: false,
    allowZero: false,
    label: "Deposit amount",
  });

  const next = cloneState(state);
  const member = getMemberOrThrow(next, memberId);

  if (next.totalUnitsMicro > 0n && next.portfolioCents === 0n) {
    throw new Error(
      "Portfolio is $0.00 with existing units. Set portfolio value above zero before new deposits.",
    );
  }

  const unitsBoughtMicro =
    next.totalUnitsMicro === 0n
      ? (cents * UNIT_SCALE) / CENTS_PER_DOLLAR
      : divideFloor(cents * next.totalUnitsMicro, next.portfolioCents);

  if (unitsBoughtMicro <= 0n) {
    throw new Error(
      "Deposit is too small for current NAV precision. Increase amount.",
    );
  }

  member.unitsMicro += unitsBoughtMicro;
  member.totalContributedCents += cents;

  next.totalUnitsMicro += unitsBoughtMicro;
  next.portfolioCents += cents;

  next.transactions.push(
    createTransaction(next, {
      type: TX_TYPES.DEPOSIT,
      date,
      memberId: member.id,
      amountCents: cents,
      unitsMicro: unitsBoughtMicro,
      note,
    }),
  );

  assertState(next);
  return next;
}

export function applyWithdrawal(
  state,
  { memberId, amount, date = todayISO(), note = "" },
) {
  const cents = parseAmountToCents(amount, {
    allowNegative: false,
    allowZero: false,
    label: "Withdrawal amount",
  });

  const next = cloneState(state);
  const member = getMemberOrThrow(next, memberId);

  if (next.totalUnitsMicro <= 0n || next.portfolioCents <= 0n) {
    throw new Error("No available portfolio value to withdraw.");
  }

  const maxMemberValue = divideFloor(
    member.unitsMicro * next.portfolioCents,
    next.totalUnitsMicro,
  );
  if (cents > maxMemberValue) {
    throw new Error(
      `Withdrawal exceeds ${member.name}'s current equity (${formatCents(maxMemberValue)}).`,
    );
  }

  const unitsRedeemedMicro = divideCeil(
    cents * next.totalUnitsMicro,
    next.portfolioCents,
  );
  if (unitsRedeemedMicro <= 0n) {
    throw new Error(
      "Withdrawal is too small for current NAV precision. Increase amount.",
    );
  }
  if (unitsRedeemedMicro > member.unitsMicro) {
    throw new Error(
      `Withdrawal would overdraw ${member.name}'s units. Reduce amount.`,
    );
  }

  member.unitsMicro -= unitsRedeemedMicro;
  member.totalWithdrawnCents += cents;

  next.totalUnitsMicro -= unitsRedeemedMicro;
  next.portfolioCents -= cents;

  if (next.totalUnitsMicro === 0n) {
    // No owners left, so residual cents from integer rounding are closed out.
    next.portfolioCents = 0n;
    for (const m of next.members) {
      m.unitsMicro = 0n;
    }
  }

  next.transactions.push(
    createTransaction(next, {
      type: TX_TYPES.WITHDRAWAL,
      date,
      memberId: member.id,
      amountCents: -cents,
      unitsMicro: -unitsRedeemedMicro,
      note,
    }),
  );

  assertState(next);
  return next;
}

export function applyProfitLoss(state, { amount, date = todayISO(), note = "" }) {
  const cents = parseAmountToCents(amount, {
    allowNegative: true,
    allowZero: false,
    label: "Profit/Loss amount",
  });

  const next = cloneState(state);
  if (next.totalUnitsMicro <= 0n) {
    throw new Error("Add deposits first before recording profit/loss.");
  }

  const nextPortfolio = next.portfolioCents + cents;
  if (nextPortfolio < 0n) {
    throw new Error("Profit/Loss would make portfolio value negative.");
  }

  next.portfolioCents = nextPortfolio;

  next.transactions.push(
    createTransaction(next, {
      type: TX_TYPES.PROFIT_LOSS,
      date,
      memberId: null,
      amountCents: cents,
      unitsMicro: 0n,
      note,
    }),
  );

  assertState(next);
  return next;
}

export function applySetValuation(
  state,
  { amount, date = todayISO(), note = "" },
) {
  const valuationCents = parseAmountToCents(amount, {
    allowNegative: false,
    allowZero: true,
    label: "Portfolio value",
  });

  const next = cloneState(state);
  if (next.totalUnitsMicro <= 0n && valuationCents > 0n) {
    throw new Error("Add at least one deposit before setting a positive value.");
  }

  const delta = valuationCents - next.portfolioCents;
  next.portfolioCents = valuationCents;

  next.transactions.push(
    createTransaction(next, {
      type: TX_TYPES.SET_VALUATION,
      date,
      memberId: null,
      amountCents: delta,
      valuationCents,
      unitsMicro: 0n,
      note,
    }),
  );

  assertState(next);
  return next;
}

export function getNavCentsPerUnit(state) {
  if (state.totalUnitsMicro <= 0n) {
    return Number(BASE_NAV_CENTS);
  }
  const numerator = Number(state.portfolioCents) * Number(UNIT_SCALE);
  const denominator = Number(state.totalUnitsMicro);
  return numerator / denominator;
}

export function getMemberSummaries(state) {
  return state.members
    .map((member) => {
      const equityCents =
        state.totalUnitsMicro > 0n
          ? divideNearest(
              member.unitsMicro * state.portfolioCents,
              state.totalUnitsMicro,
            )
          : 0n;
      const ownershipRatio =
        state.totalUnitsMicro > 0n
          ? Number(member.unitsMicro) / Number(state.totalUnitsMicro)
          : 0;
      const netProfitCents =
        member.totalWithdrawnCents + equityCents - member.totalContributedCents;

      return {
        ...member,
        ownershipRatio,
        equityCents,
        netProfitCents,
      };
    })
    .sort((a, b) => {
      if (a.unitsMicro === b.unitsMicro) {
        return a.name.localeCompare(b.name);
      }
      return a.unitsMicro > b.unitsMicro ? -1 : 1;
    });
}

function createTransaction(
  state,
  { type, date, memberId, amountCents, unitsMicro, note, valuationCents = null },
) {
  const tx = {
    id: state.nextTransactionId,
    type,
    date: normalizeDate(date),
    memberId,
    amountCents,
    unitsMicro,
    portfolioAfterCents: state.portfolioCents,
    totalUnitsAfterMicro: state.totalUnitsMicro,
    note: sanitizeNote(note),
  };
  if (valuationCents !== null) {
    tx.valuationCents = valuationCents;
  }
  state.nextTransactionId += 1;
  return tx;
}

function normalizeTransaction(tx, fallbackId) {
  if (!tx || typeof tx !== "object") {
    return null;
  }
  const type = Object.values(TX_TYPES).includes(tx.type)
    ? tx.type
    : TX_TYPES.PROFIT_LOSS;

  const normalized = {
    id: toPositiveInt(tx.id, fallbackId),
    type,
    date: normalizeDate(tx.date),
    memberId:
      tx.memberId === null || tx.memberId === undefined
        ? null
        : toPositiveInt(tx.memberId, null),
    amountCents: toBigInt(tx.amountCents, 0n),
    unitsMicro: toBigInt(tx.unitsMicro, 0n),
    portfolioAfterCents: toNonNegativeBigInt(tx.portfolioAfterCents),
    totalUnitsAfterMicro: toNonNegativeBigInt(tx.totalUnitsAfterMicro),
    note: sanitizeNote(tx.note),
  };
  if (Object.prototype.hasOwnProperty.call(tx, "valuationCents")) {
    normalized.valuationCents = toNonNegativeBigInt(tx.valuationCents);
  }
  return normalized;
}

function cloneState(state) {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return deserializeState(serializeState(state));
}

function getMemberOrThrow(state, memberId) {
  const id = toPositiveInt(memberId, null);
  const member = state.members.find((item) => item.id === id);
  if (!member) {
    throw new Error("Select a valid person.");
  }
  return member;
}

function assertState(state) {
  if (state.totalUnitsMicro < 0n || state.portfolioCents < 0n) {
    throw new Error("Internal state error: negative totals.");
  }
  let sumUnits = 0n;
  for (const member of state.members) {
    if (
      member.unitsMicro < 0n ||
      member.totalContributedCents < 0n ||
      member.totalWithdrawnCents < 0n
    ) {
      throw new Error("Internal state error: negative member values.");
    }
    sumUnits += member.unitsMicro;
  }
  if (sumUnits !== state.totalUnitsMicro) {
    throw new Error("Internal state error: unit ledger mismatch.");
  }
  if (state.totalUnitsMicro === 0n && state.portfolioCents !== 0n) {
    throw new Error("Internal state error: unowned portfolio value.");
  }
}

function divideNearest(numerator, denominator) {
  if (denominator <= 0n) {
    throw new Error("Division by zero in unit calculation.");
  }
  if (numerator >= 0n) {
    return (numerator + denominator / 2n) / denominator;
  }
  return -((-numerator + denominator / 2n) / denominator);
}

function divideFloor(numerator, denominator) {
  if (denominator <= 0n) {
    throw new Error("Division by zero in unit calculation.");
  }
  return numerator / denominator;
}

function divideCeil(numerator, denominator) {
  if (denominator <= 0n) {
    throw new Error("Division by zero in unit calculation.");
  }
  if (numerator <= 0n) {
    return 0n;
  }
  return (numerator + denominator - 1n) / denominator;
}

function parseAmountToCents(raw, { allowNegative, allowZero, label }) {
  if (raw === null || raw === undefined || raw === "") {
    throw new Error(`${label} is required.`);
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    throw new Error(`${label} must be a valid number.`);
  }

  const scaled = Math.round(amount * Number(CENTS_PER_DOLLAR));
  if (!Number.isSafeInteger(scaled)) {
    throw new Error(`${label} is too large to process safely.`);
  }
  const cents = BigInt(scaled);
  if (!allowNegative && cents < 0n) {
    throw new Error(`${label} cannot be negative.`);
  }
  if (!allowZero && cents === 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return cents;
}

function sanitizeName(name) {
  if (typeof name !== "string") {
    return "";
  }
  return name.trim().replace(/\s+/g, " ").slice(0, 60);
}

function sanitizeNote(note) {
  if (typeof note !== "string") {
    return "";
  }
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}

function normalizeDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return todayISO();
}

function todayISO() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toBigInt(value, fallback) {
  try {
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
      return BigInt(value.trim());
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function toNonNegativeBigInt(value) {
  const parsed = toBigInt(value, 0n);
  return parsed < 0n ? 0n : parsed;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatCents(cents) {
  const abs = cents < 0n ? -cents : cents;
  const dollars = Number(abs) / Number(CENTS_PER_DOLLAR);
  const formatted = dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0n ? `-${formatted}` : formatted;
}
