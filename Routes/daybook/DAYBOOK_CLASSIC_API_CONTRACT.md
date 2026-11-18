# Daybook (Classic Tables) — Backend Schema & API Contract

Share this with the backend team. The frontend has been restored to the classic Ant Design Daybook (inflow / outflow / accounts open-close). It does **not** use spreadsheet workbooks (`daybook-inflow` / `daybook-outflow` Excel modules).

| Item | Value |
|------|--------|
| Frontend | `src/Dashboard/Accounts/DayBook/` |
| Route | `/user/daybook` (Accounts, Owner, Approver, CA) |
| Auth | `Authorization` JWT (same finance roles as before) |

**Do not require spreadsheet-workbooks for Daybook UI.**

---

## Product behaviour

| Tab / area | Behaviour |
|------------|-----------|
| Inflow | Manual cash/account receipts + optional merged event booking advances by `receivedDate` |
| Outflow | Paid requirement / vendor payments in the selected date range (read-only list from daybook aggregate) |
| Accounts | Per-day cash + bank open/close balances |
| Summary | Inflow total, outflow total, profit/loss |
| Date range | Inclusive `startDate`–`endDate` (`YYYY-MM-DD`) |
| Toggle | Include / exclude event advances in inflow |

---

## Endpoints overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/daybook` | Range aggregate: inflow, outflow, P&L, open-close balances |
| POST | `/daybook/inflows` | Create manual inflow |
| PUT | `/daybook/inflows/:id` | Update manual inflow |
| DELETE | `/daybook/inflows/:id` | Delete manual inflow |
| POST | `/daybook/accounts/open-close-balances` | Create day open/close |
| PUT | `/daybook/accounts/open-close-balances/:id` | Update day open/close |
| DELETE | `/daybook/accounts/open-close-balances/:id` | Delete day open/close |
| GET | `/events/minimal` | Event picker for optional `eventReference` on inflow |

---

## 1) `GET /daybook`

### Query

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `startDate` | `YYYY-MM-DD` | Yes* | Inclusive |
| `endDate` | `YYYY-MM-DD` | Yes* | Inclusive; must be ≥ `startDate` |
| `date` | `YYYY-MM-DD` | Yes* | Optional shorthand if start/end omitted (same day) |
| `limit` | number | No | Max rows in `inflow.data` / `outflow.data` (default ~200, max ~1000) |
| `includeEventAdvances` | string | No | Default `true`. Pass `false` / `0` / `no` to exclude booking advances from inflow |

\*Return **400** if dates missing/invalid or `startDate` > `endDate`.

### Example

```http
GET /daybook?startDate=2026-04-16&endDate=2026-04-20&limit=200
Authorization: <jwt>
```

```http
GET /daybook?startDate=2026-04-17&endDate=2026-04-17&includeEventAdvances=false
```

### Response shape

```json
{
  "inflow": {
    "count": 12,
    "total": 450000,
    "data": [
      {
        "_id": "674a...",
        "name": "Rahul",
        "receivedDate": "2026-04-17",
        "receivedIn": "CASH",
        "accountName": null,
        "amountReceived": 5000,
        "receivedBy": "ACCOUNTS",
        "eventReference": null,
        "note": ""
      },
      {
        "_id": "eventadvance:674b...:0:1",
        "name": "Priya & Arjun",
        "receivedDate": "2026-04-17",
        "receivedIn": "ACCOUNT",
        "accountName": null,
        "amountReceived": 25000,
        "receivedBy": "Coordinator A",
        "eventReference": "674b...",
        "note": "Advance — Wedding / Reception"
      }
    ]
  },
  "outflow": {
    "count": 3,
    "total": 12000,
    "data": [
      {
        "requestId": "...",
        "purpose": "Decoration advance",
        "vendor": { "name": "Vendor X", "vendor_code": "V001" },
        "amountPaid": 5000,
        "status": "APPROVED",
        "entityAccount": "HDFC",
        "paidAt": "2026-04-17T10:00:00.000Z",
        "requiredDate": "2026-04-17T00:00:00.000Z",
        "amountPaidTo": "Cashier",
        "eventReference": { "clientName": "Rahul", "name": "Wedding" },
        "groupBy": { "name": "Decor" },
        "remarks": ""
      }
    ]
  },
  "profitAndLoss": {
    "value": 438000,
    "type": "PROFIT"
  },
  "accounts": {
    "openCloseBalances": [
      {
        "_id": "...",
        "balanceDate": "2026-04-17",
        "cashOpeningBalance": 10000,
        "cashClosingBalance": 8500,
        "accountOpeningBalance": 200000,
        "accountClosingBalance": 204000,
        "accountBalances": [
          {
            "accountName": "Dhruva Kumar H P-HDFC bank-5540",
            "openingBalance": 100000,
            "closingBalance": 102000
          }
        ]
      }
    ]
  }
}
```

- `profitAndLoss.type` is `"PROFIT"` when `value >= 0`, else `"LOSS"`.
- `profitAndLoss.value` = `inflow.total - outflow.total` (absolute value or signed — frontend displays magnitude with `type`).

---

## 2) How inflow is built

When `includeEventAdvances` is **true** (default):

1. **Manual inflows** (`DaybookInflow`) where  
   `startDate <= receivedDate <= endDate` (`YYYY-MM-DD` string compare).
2. **Event advances** where `advances.receivedAmount > 0` and `advances.receivedDate` falls in  
   `[startDate 00:00:00.000Z, endDate 23:59:59.999Z]`.
3. Map both to the same row shape, sort by `receivedDate` desc, truncate `data` to `limit`.
4. `inflow.total` / `inflow.count`: over **all** matches (not limited by `limit`).

When `includeEventAdvances` is **false**: only manual inflows.

### Unified inflow row fields

| Field | Manual | Event advance |
|-------|--------|---------------|
| `_id` | Mongo ObjectId string | Synthetic `eventadvance:<eventId>:<eventTypeIndex>:<advanceIndex>` — **not** deletable via inflow CRUD |
| `name` | payer name | `clientName` |
| `receivedDate` | stored `YYYY-MM-DD` | UTC date from advance `receivedDate` |
| `receivedIn` | `CASH` \| `ACCOUNT` | from `modeOfPayment` (`account` → `ACCOUNT`, else `CASH`) |
| `accountName` | required when `ACCOUNT` | usually `null` |
| `amountReceived` | `amountReceived` | `receivedAmount` |
| `receivedBy` | `receivedBy` | `collectedBy` / `givenBy` |
| `eventReference` | optional event id | booking `_id` |
| `note` | optional text | e.g. `Advance — <event> / <event type>` |

Frontend disables edit/delete when `_id` starts with `eventadvance:`.

---

## 3) Outflow rows (from `GET /daybook`)

Outflow is **read-only** in this UI. Populate `outflow.data` from paid requirements / payments in range (existing backend logic). Fields used by UI:

| Field | Type | Notes |
|-------|------|-------|
| `requestId` | string | Optional; used in row key |
| `purpose` | string | |
| `vendor` | object | `{ name, vendor_code }` |
| `amountPaid` | number | |
| `status` | string | e.g. `PENDING`, `APPROVED`, `COMPLETED` |
| `entityAccount` | string | |
| `paidAt` | ISO date | |
| `requiredDate` | ISO date | |
| `amountPaidTo` | string | |
| `eventReference` | object \| string | Prefer `{ clientName, name }` |
| `groupBy` | object | `{ name }` |
| `remarks` | string | |

`outflow.total` = sum of `amountPaid`; `outflow.count` = matching row count.

---

## 4) Manual inflow CRUD

### `POST /daybook/inflows` / `PUT /daybook/inflows/:id`

```json
{
  "name": "Rahul",
  "receivedDate": "2026-04-17",
  "receivedIn": "ACCOUNT",
  "accountName": "Dhruva Kumar H P-HDFC bank-5540",
  "amountReceived": 5000,
  "receivedBy": "ACCOUNTS",
  "eventReference": "674b...",
  "note": "Optional note"
}
```

### Validation

| Rule | Detail |
|------|--------|
| `name` | required, non-empty |
| `receivedDate` | required `YYYY-MM-DD` |
| `receivedIn` | `CASH` or `ACCOUNT` |
| `accountName` | required when `receivedIn === "ACCOUNT"`; null/omit when `CASH` |
| `amountReceived` | number ≥ 0 |
| `receivedBy` | required, non-empty |
| `eventReference` | optional event id |
| `note` | optional string |

### Account names used by frontend today

- `Dhruva Kumar H P-HDFC bank-5540`
- `Skyblue -HDFC-5540`
- `Skyblue -ICICI-1458`
- `Monica`
- `Cash`

Prefer storing the string as sent; do **not** force the older short enum `HDFC|ICIC|DHRUVA|MONICA` if UI sends full labels.

### `DELETE /daybook/inflows/:id`

Only for real Mongo ids. Reject synthetic `eventadvance:…` ids with **400**.

---

## 5) Accounts open/close balances

### `POST /daybook/accounts/open-close-balances`  
### `PUT /daybook/accounts/open-close-balances/:id`

```json
{
  "balanceDate": "2026-04-17",
  "cashOpeningBalance": 10000,
  "cashClosingBalance": 8500,
  "accountOpeningBalance": 200000,
  "accountClosingBalance": 204000,
  "accountBalances": [
    {
      "accountName": "Dhruva Kumar H P-HDFC bank-5540",
      "openingBalance": 100000,
      "closingBalance": 102000
    },
    {
      "accountName": "Skyblue -HDFC-5540",
      "openingBalance": 50000,
      "closingBalance": 51000
    },
    {
      "accountName": "Skyblue -ICICI-1458",
      "openingBalance": 50000,
      "closingBalance": 51000
    }
  ]
}
```

### Rules

- `balanceDate` required `YYYY-MM-DD`.
- Cash + account totals required numbers ≥ 0.
- `accountOpeningBalance` / `accountClosingBalance` should equal sum of `accountBalances[].openingBalance` / `.closingBalance` (frontend sends both).
- Unique **one document per `balanceDate`** (recommended unique index).
- `GET /daybook` must return balances for every day in range that has a record (`accounts.openCloseBalances[]`).

### `DELETE /daybook/accounts/open-close-balances/:id`

Supported.

---

## 6) Suggested Mongo schemas

### `DaybookInflow`

```js
{
  name: { type: String, required: true, trim: true },
  receivedDate: { type: String, required: true }, // YYYY-MM-DD
  receivedIn: { type: String, required: true, enum: ["CASH", "ACCOUNT"] },
  accountName: { type: String, default: null },
  amountReceived: { type: Number, required: true, min: 0 },
  receivedBy: { type: String, required: true, trim: true },
  eventReference: { type: String, default: null }, // Event _id
  note: { type: String, default: "" },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}
// Indexes: { receivedDate: 1 }
```

### `DaybookAccountsOpenCloseBalance`

```js
{
  balanceDate: { type: String, required: true, unique: true }, // YYYY-MM-DD
  cashOpeningBalance: { type: Number, required: true, min: 0 },
  cashClosingBalance: { type: Number, required: true, min: 0 },
  accountOpeningBalance: { type: Number, required: true, min: 0 },
  accountClosingBalance: { type: Number, required: true, min: 0 },
  accountBalances: [
    {
      accountName: { type: String, required: true },
      openingBalance: { type: Number, min: 0 },
      closingBalance: { type: Number, min: 0 },
    },
  ],
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}
// unique per day
db.daybookAccountsOpenCloseBalances.createIndex({ balanceDate: 1 }, { unique: true });
```

---

## 7) `GET /events/minimal`

Used by inflow modal event dropdown.

```http
GET /events/minimal?search=rahul
Authorization: <jwt>
```

Response (any of these shapes is accepted):

```json
{ "events": [ { "_id": "...", "clientName": "...", "eventName": { "name": "Wedding" } } ] }
```

or `{ "data": [...] }` or a bare array.

---

## 8) Relation to Daybook Excel (deprecated for this UI)

| Model | Status |
|-------|--------|
| Classic `/daybook` APIs (this doc) | **Active** — used by restored UI |
| spreadsheet-workbooks modules `daybook-inflow` / `daybook-outflow` | **Not used** by current Daybook frontend |

Keep Excel workbook data if already stored; Daybook screen no longer calls it.

---

## Acceptance checklist

- [ ] `GET /daybook` returns `inflow` / `outflow` / `profitAndLoss` / `accounts` for a date range
- [ ] `includeEventAdvances=false` returns only manual inflows
- [ ] Event advance rows use synthetic `_id` and are not updatable/deletable as inflows
- [ ] Inflow create/update/delete works for manual rows
- [ ] Open-close balances support `accountBalances[]` + cash totals; unique per `balanceDate`
- [ ] Outflow rows include fields listed above (or safe nulls)
- [ ] No dependency on spreadsheet workbook modules for Daybook UI

---

## Related docs / code

| File | Notes |
|------|--------|
| `Routes/daybook/DAYBOOK_GET_FRONTEND.md` | Deeper notes on inflow merge rules |
| `Routes/daybook/DAYBOOK_OUTFLOW_FRONTEND.md` | Outflow column shape |
| `Controlers/daybook/index.js` | Implementation |
| `Modals/Daybook/DaybookInflow/index.js` | Manual inflow schema |
| `Modals/Daybook/DaybookAccountsOpenCloseBalance/index.js` | Open/close schema |
| Frontend: `Daybookhome.jsx`, `daybookApi.js` | Classic UI + API client |
| `daybook_api_spec.md` (if present) | Earlier CRUD notes — **superseded by this doc where they conflict**; prefer full account name strings + `accountBalances` |
