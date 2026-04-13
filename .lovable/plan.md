

# Redesign Daily Summary Page — Professional Cash Report

## Overview
Completely redesign the Summary page to work like a professional daily cash management report. Instead of the current aggregate-only view, it will fetch actual bills and ledger entries for a selected date and organize them into clear sections.

## New Page Structure

```text
┌─────────────────────────────────────────────┐
│  Daily Report       [Date Picker] [Sync]    │
├─────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐   │
│  │  NET CASH = Total Income - Expenses  │   │
│  │  Rs XX,XXX                           │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌─────┐ ┌──────────┐ ┌─────────┐ ┌─────┐  │
│  │Cash │ │JazzCash  │ │EasyPaisa│ │Bank │  │
│  │Rs X │ │Rs X      │ │Rs X     │ │Rs X │  │
│  └─────┘ └──────────┘ └─────────┘ └─────┘  │
│                                             │
│  ── Expenses Summary ──                     │
│  Total Expenses: Rs X,XXX                   │
│                                             │
│  ═══════════════════════════════════════     │
│  CASH BILLS (paid fully in cash)            │
│  ┌─ Invoice | Customer | Amount | Time ─┐   │
│  └──────────────────────────────────────┘   │
│                                             │
│  JAZZCASH BILLS                             │
│  ┌─ ... ─┐                                 │
│                                             │
│  EASYPAISA BILLS                            │
│  ┌─ ... ─┐                                 │
│                                             │
│  BANK TRANSFER BILLS                        │
│  ┌─ ... ─┐                                 │
│                                             │
│  SPLIT PAYMENT BILLS (multiple methods)     │
│  ┌─ Invoice | Customer | Total | Split ─┐   │
│  └──────────────────────────────────────┘   │
│                                             │
│  UNPAID / DUE BILLS                         │
│  ┌─ Invoice | Customer | Total | Due ───┐   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ── Monthly Groups (existing, below) ──     │
└─────────────────────────────────────────────┘
```

## Data Sources
- **Bills**: Query `sale_transactions` for the selected date, joined with `contacts` for customer names
- **Ledger credits**: Query `ledger_entries` for the date — credits count as income
- **Expenses**: Query `expenses` for the date
- **Payment method parsing**: The `payment_method` field stores either a single method (`"cash"`) or split format (`"cash:5000, bank:3000"`). Parse this to categorize bills and calculate per-method totals.

## Implementation Steps

1. **Add date picker** at the top (defaults to today) and a refresh button
2. **Fetch all bills, ledger entries, and expenses** for the selected date in parallel
3. **Parse payment methods** from each bill:
   - Single method (e.g. `"cash"`) → categorize as Cash/JazzCash/EasyPaisa/Bank bill
   - Multiple methods (e.g. `"cash:5000, bank:3000"`) → categorize as Split bill
   - `payment_status === "due"` → categorize as Unpaid/Due bill
4. **Calculate per-method totals**: Sum cash received, jazzcash received, easypaisa received, bank received (from both single and split bills)
5. **Add ledger credits** to income totals (cash column)
6. **Net Cash section**: `(Total Cash + JazzCash + EasyPaisa + Bank + Ledger Credits) - Total Expenses`
7. **Render 6 grouped bill tables**: Cash → JazzCash → EasyPaisa → Bank → Split → Due
8. **Keep existing monthly summary** section below the daily report

## Technical Details
- File modified: `src/pages/SummaryPage.tsx` (major rewrite of the top section)
- Payment method parser: split string by `, ` then by `:` to extract method and amount
- Each bill table shows: Invoice#, Customer, Total, Paid Amount, Time
- Split bills table additionally shows the breakdown per method
- Due bills show remaining balance

