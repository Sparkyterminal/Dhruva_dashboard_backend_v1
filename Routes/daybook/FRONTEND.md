# Daybook (Accounts Department) - API + Schema Spec

This document defines the request/response contract required by the frontend under:
`src/Dashboard/Accounts/DayBook`.

Base URL: `GET/POST/PUT/DELETE ${API_BASE_URL}daybook...`

---

## 1) GET Daybook (Range)

### Endpoint
`GET /daybook`

### Query Parameters
| Name | Type | Required | Example | Notes |
|---|---:|:---:|---|---|
| `startDate` | `YYYY-MM-DD` string | Yes | `2026-04-16` | Inclusive start date |
| `endDate` | `YYYY-MM-DD` string | Yes | `2026-04-20` | Inclusive end date |
| `limit` | integer | No | `200` | Max number of records returned per list (frontend passes it for inflow/outflow pagination) |

### Response (JSON)
The frontend expects the following shape:

```json
{
  "inflow": {
    "count": 0,
    "total": 0,
    "data": [
      {
        "_id": "string",
        "name": "string",
        "receivedDate": "YYYY-MM-DD",
        "receivedIn": "CASH|ACCOUNT",
        "accountName": "string|null",
        "amountReceived": 0,
        "receivedBy": "string",
        "eventReference": "string|null",
        "note": "string"
      }
    ]
  },
  "outflow": {
    "count": 0,
    "total": 0,
    "data": [
      {
        "_id": "string"
        // outflow fields are not part of this request; keep existing structure compatible
      }
    ]
  },
  "profitAndLoss": {
    "value": 0,
    "type": "PROFIT|LOSS"
  },
  "accounts": {
    "openCloseBalances": [
      {
        "_id": "string",
        "balanceDate": "YYYY-MM-DD",
        "cashOpeningBalance": 0,
        "cashClosingBalance": 0,
        "accountOpeningBalance": 0,
        "accountClosingBalance": 0
      }
    ]
  }
}
```

### Notes / Expectations
1. `accounts.openCloseBalances` must be an array for the full `startDate..endDate` range.
2. Each balance record must have `balanceDate` as `YYYY-MM-DD`.
3. If no records exist, return empty arrays and zeros:
   - `inflow.data: []`, `inflow.count: 0`, `inflow.total: 0`
   - `accounts.openCloseBalances: []`

---

## 2) Inflow CRUD (Manual Inflow Transactions)

## 2.1 Create Inflow

### Endpoint
`POST /daybook/inflows`

### Body
```json
{
  "name": "string",
  "receivedDate": "YYYY-MM-DD",
  "receivedIn": "CASH|ACCOUNT",
  "accountName": "HDFC|ICIC|DHRUVA|MONICA|null",
  "amountReceived": 0,
  "receivedBy": "string",
  "eventReference": "eventId|null",
  "note": "string"
}
```

### Validation Rules
1. `name` required, non-empty.
2. `receivedDate` required and must be `YYYY-MM-DD`.
3. `receivedIn` required and must be `CASH` or `ACCOUNT`.
4. If `receivedIn === "ACCOUNT"`, then `accountName` is required and must be one of:
   - `HDFC`, `ICIC`, `DHRUVA`, `MONICA`
5. If `receivedIn === "CASH"`, then `accountName` should be `null` (or omitted).
6. `amountReceived` required, number >= 0.
7. `receivedBy` required, non-empty string.
8. `eventReference` is optional; if provided, it must be a valid event id.
9. `note` is optional; if omitted, backend will store it as empty string.

## 2.2 Update Inflow

### Endpoint
`PUT /daybook/inflows/:id`

### Params
`id` (path) - inflow `_id`

### Body
Same as **Create Inflow**.

## 2.3 Delete Inflow

### Endpoint
`DELETE /daybook/inflows/:id`

### Params
`id` (path) - inflow `_id`

---

## 3) Accounts Open/Close Balance CRUD (Per Day)

These records represent the opening/closing balances for:
- Cash
- Account (bank/account)

## 3.1 Create Balance Record

### Endpoint
`POST /daybook/accounts/open-close-balances`

### Body
```json
{
  "balanceDate": "YYYY-MM-DD",
  "cashOpeningBalance": 0,
  "cashClosingBalance": 0,
  "accountOpeningBalance": 0,
  "accountClosingBalance": 0
}
```

### Validation Rules
1. `balanceDate` required, must be `YYYY-MM-DD`.
2. All balances required numbers and must be >= 0.

### Uniqueness (Recommended)
Add a unique index on `(balanceDate)` so one record exists per day:
- `unique: true` for `balanceDate`.

## 3.2 Update Balance Record

### Endpoint
`PUT /daybook/accounts/open-close-balances/:id`

### Params
`id` (path) - balance record `_id`

### Body
Same as **Create Balance Record**.

## 3.3 Delete Balance Record

### Endpoint
`DELETE /daybook/accounts/open-close-balances/:id`

### Params
`id` (path) - balance record `_id`

---

## 4) Data Model (Mongoose Schema Suggestions)

### 4.1 DaybookInflow
```js
{
  name: { type: String, required: true, trim: true },
  receivedDate: { type: String, required: true }, // store as YYYY-MM-DD
  receivedIn: { type: String, required: true, enum: ["CASH", "ACCOUNT"] },
  accountName: { type: String, required: false }, // required only when receivedIn === "ACCOUNT"
  amountReceived: { type: Number, required: true, min: 0 },
  receivedBy: { type: String, required: true, trim: true },
  createdBy: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
}
```

### 4.2 DaybookAccountsOpenCloseBalance
```js
{
  balanceDate: { type: String, required: true }, // store as YYYY-MM-DD
  cashOpeningBalance: { type: Number, required: true, min: 0 },
  cashClosingBalance: { type: Number, required: true, min: 0 },
  accountOpeningBalance: { type: Number, required: true, min: 0 },
  accountClosingBalance: { type: Number, required: true, min: 0 },
  createdBy: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
}
```

Recommended unique index:
```js
db.DaybookAccountsOpenCloseBalance.createIndex({ balanceDate: 1 }, { unique: true })
```

---

## 5) Notes About Frontend Field Mapping
The frontend expects:
- Inflow list rows: `{ _id, name, receivedDate, receivedIn, accountName, amountReceived, receivedBy }`
- Accounts list rows: `{ _id, balanceDate, cashOpeningBalance, cashClosingBalance, accountOpeningBalance, accountClosingBalance }`

