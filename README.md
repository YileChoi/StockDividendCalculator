# Stock Equity Dilution Calculator

Pure HTML/CSS/JS frontend served by Flask for tracking multi-person stock account ownership fairly over time.

## Why This Model Is Economically Fair

This app uses **fund unit accounting (unitization/NAV method)**:

- Each deposit buys units at current NAV (net asset value per unit).
- Each withdrawal redeems units at current NAV.
- Market profit/loss changes NAV, not units.

That means:

- People who joined earlier keep their earned gains.
- New entrants only get exposure from their entry point forward.
- Ownership always reflects actual contributed capital timing.

## Core Equations

- `NAV = Portfolio Value / Total Units`
- `Units Bought (Deposit) = Deposit Amount / NAV`
- `Units Redeemed (Withdrawal) = Withdrawal Amount / NAV`
- `Member Equity = Member Units * NAV`
- `Member Net P/L = Total Withdrawn + Current Equity - Total Contributed`

## Precision / Safety Choices

- Cash is stored as **integer cents**.
- Ownership units are stored as **scaled integers (1e-8 units)**.
- Internal invariants are checked after each transaction:
  - Sum of member units must equal total units.
  - No negative balances.
  - No unowned portfolio value.
- Full transaction history is stored for auditability.

## Project Structure

```
StockDividendCalculator/
├── app.py
├── local.sh
├── index.html
├── logic.html
├── styles.css
├── requirements.txt
└── js/
  ├── app.js
  └── model.js
```

## Run Server (Single Command)

1. Open terminal in:
   - `/Users/yilechoi/Desktop/Dev/Stock equity dividor/StockDividendCalculator`
2. Start server:

```bash
./local.sh
```

3. Open:
   - `http://127.0.0.1:5000/` (calculator)
   - `http://127.0.0.1:5000/logic` (calculation logic page)

`local.sh` handles:
- Creating `.venv` automatically (first run only).
- Installing Flask dependencies if missing.
- Running Flask dev server on `127.0.0.1:5000`.

If you get permission denied once, run:

```bash
chmod +x ./local.sh
./local.sh
```

## Waitress (Later Deploy)

When you are ready to switch from Flask dev server to Waitress deploy server, install Waitress and start using:

```bash
waitress-serve --listen=0.0.0.0:8080 app:app
```

## Recommended Usage Flow

1. Add each family member once.
2. Record each deposit/withdrawal on the actual date.
3. Record account performance:
   - `Profit / Loss` for delta changes, or
   - `Set Portfolio Value` using broker statement total.
4. Use Ownership Snapshot as the source of truth for fair ratios.

## Save Behavior

- Autosave is enabled and visible in the top header (`Autosave: ON`).
- Every successful add/update transaction is saved automatically to local browser storage.
- A visible `Save Now` button is available for manual save confirmation.
- Closing the tab accidentally will not lose recorded data on the same browser/device.

## Important Operational Discipline

Accuracy depends on complete and correct event entry.  
Do not skip transactions. Record them in real chronological order based on actual cash movement and valuation dates.
