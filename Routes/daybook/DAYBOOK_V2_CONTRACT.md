# Daybook V2 — Backend Contract

**Status: implemented** in `Controlers/daybook`, `Routes/daybook`, `utils/daybook.js`,
`Modals/Daybook/{DaybookInflow,DaybookOutflow,DaybookOpeningBalance}`.
See **Backend implementation notes** at the end for the decisions this contract left open.

**Replaces** everything in `Routes/daybook/legacy/` (do not implement those any more).
**Frontend:** `src/Dashboard/Accounts/DayBook/` · **Route:** `/user/daybook` · **Auth:** `Authorization: <jwt>` (same finance roles as before: OWNER, ADMIN, CA, ACCOUNTS, APPROVER, DEPARTMENT)

The Daybook is now **a pure manual ledger**. It is no longer linked to expenses/requirements or to booking advances:

| Removed from the backend | Why |
|---|---|
| Merging paid requirements / vendor payments into `outflow` | Outflow is now typed in by Accounts |
| Merging booking advances (`eventadvance:` rows) into `inflow` | Inflow is now typed in by Accounts (otherwise it would be counted twice) |
| `POST/PUT/DELETE /daybook/accounts/open-close-balances` and stored daily balances | Balances are **calculated**, never typed |
| `includeEventAdvances` query param | No longer exists |

---

## 1. Money rules (the frontend shows these, the server MUST enforce them)

All amounts are rupees, max 2 decimals. `round2(x) = Math.round((x + Number.EPSILON) * 100) / 100`. **Never trust a net/actual amount sent by the client: recompute and store it.**

**Inflow**
```
netAmountReceived = round2(amountReceived - gstAmount - tdsAmount)
```
- `receivedIn = "CASH"`  → `gstAmount` and `tdsAmount` must be `0` (or omitted).
- `receivedIn = "ACCOUNT"` → `gstAmount`, `tdsAmount` ≥ 0 and `gstAmount + tdsAmount <= amountReceived`.
- What enters the balance and the surplus/deficit is **`netAmountReceived`**.

**Outflow** (GST is added on top, TDS is deducted)
```
actualAmountPaid = round2(amountPaid - tdsAmount + gstAmount)
```
- `tdsAmount`, `gstAmount` ≥ 0 (GST optional, default 0) and `tdsAmount <= amountPaid`.
- What leaves the balance and counts in the surplus/deficit is **`actualAmountPaid`**.

**Surplus / deficit** for any period = `Σ netAmountReceived − Σ actualAmountPaid`.
`type = "SURPLUS"` when value ≥ 0, else `"DEFICIT"` (`value` is signed).

---

## 2. Sources and balance carry-forward

A **source** is where money sits: `"Cash"` or one of the bank accounts. The bank account names are a fixed list shared with the frontend (`src/Dashboard/Accounts/DayBook/daybookConfig.js`, backend: `utils/daybook.js` `ACCOUNT_NAMES`):

```
Dhruva Kumar H P-HDFC bank-5540
Skyblue -HDFC-5540
Skyblue -ICICI-1458
Monica
```
Reject any `accountName` outside this list with `400`.

Inflow with `receivedIn = CASH` / outflow with `paidFrom = CASH` moves the `Cash` source; `ACCOUNT` moves the source named `accountName`.

**Nothing is typed for balances.** The only stored input is one **opening balance** (section 3.4): the amount in each source at the **start** of a go-live date `asOfDate`. For every calendar day `d >= asOfDate` (including days with no entries):

```
closing(d, source) = opening(d, source) + Σ net inflow(d, source) − Σ actual outflow(d, source)
opening(asOfDate, source) = the stored amount
opening(d + 1, source)    = closing(d, source)        // carried forward
```

Balances are **computed on read** (not stored), so editing or deleting an old entry automatically corrects every later day. Closing balances may be negative; do not clamp them.

### Reference implementation (the frontend tests use exactly this)

```js
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// opening: { Cash: 10000, "Monica": 0, ... }  asOfDate: "YYYY-MM-DD"
// inflows:  [{ receivedDate, receivedIn, accountName, netAmountReceived }]
// outflows: [{ paidDate, paidFrom, accountName, actualAmountPaid }]
function computeDays({ asOfDate, opening, startDate, endDate, inflows, outflows, sources }) {
  const sourceOf = (mode, accountName) => (mode === "CASH" ? "Cash" : accountName);
  const days = [];
  let carry = { ...opening };
  for (let d = asOfDate; d <= endDate; d = nextDay(d)) {           // iterate from asOfDate so carry is right
    const row = {};
    sources.forEach((s) => (row[s] = { opening: carry[s] || 0, inflow: 0, outflow: 0 }));
    inflows.filter((i) => i.receivedDate === d).forEach((i) => {
      row[sourceOf(i.receivedIn, i.accountName)].inflow += i.netAmountReceived;
    });
    outflows.filter((o) => o.paidDate === d).forEach((o) => {
      row[sourceOf(o.paidFrom, o.accountName)].outflow += o.actualAmountPaid;
    });
    sources.forEach((s) => {
      row[s].closing = round2(row[s].opening + row[s].inflow - row[s].outflow);
      row[s].inflow = round2(row[s].inflow);
      row[s].outflow = round2(row[s].outflow);
      carry[s] = row[s].closing;
    });
    if (d >= startDate) days.push({ date: d, row });                // only return the requested window
  }
  return days;
}
```
(`nextDay` = add one calendar day to a `YYYY-MM-DD` string; do the arithmetic in plain dates, no time zones.)

---

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/daybook` | Range aggregate (inflow, outflow, surplus/deficit, day-wise balances) |
| `POST` / `PUT` / `DELETE` | `/daybook/inflows[/:id]` | Manual inflow CRUD |
| `POST` / `PUT` / `DELETE` | `/daybook/outflows[/:id]` | Manual outflow CRUD |
| `GET` / `PUT` | `/daybook/opening-balance` | The one-time starting balance |
| `GET` | `/vendor/all` | Existing endpoint, used for the vendor list (no change) |
| `GET` | `/events/minimal?search=` | Existing endpoint, used for the optional event reference (no change) |

Dates are `YYYY-MM-DD` strings everywhere in this module (no timestamps, no time-zone shifts).

### 3.1 `GET /daybook`

Query: `startDate`, `endDate` (inclusive, `YYYY-MM-DD`, `startDate <= endDate`, else `400`), `limit` (rows returned per list; default 200, max 1000). Totals always cover **all** matching rows, not just the returned ones.

```json
{
  "inflow": {
    "count": 2,
    "totals": { "gross": 150000, "gst": 9000, "tds": 1000, "net": 140000 },
    "data": [
      {
        "_id": "674a…",
        "clientName": "Asha Rao",
        "eventDate": "2026-12-05",
        "eventReference": "674b…",
        "receivedDate": "2026-11-17",
        "receivedIn": "ACCOUNT",
        "accountName": "Skyblue -HDFC-5540",
        "amountReceived": 100000,
        "gstAmount": 9000,
        "tdsAmount": 1000,
        "netAmountReceived": 90000,
        "note": ""
      }
    ]
  },
  "outflow": {
    "count": 1,
    "totals": { "amountPaid": 50000, "tds": 1000, "gst": 9000, "actual": 58000 },
    "data": [
      {
        "_id": "674c…",
        "vendor": { "_id": "6740…", "name": "Vendor X", "vendor_code": "V001" },
        "paidDate": "2026-11-17",
        "paidFrom": "CASH",
        "accountName": null,
        "amountPaid": 50000,
        "tdsAmount": 1000,
        "gstAmount": 9000,
        "actualAmountPaid": 58000,
        "note": ""
      }
    ]
  },
  "surplusDeficit": { "value": 32000, "type": "SURPLUS" },
  "openingBalanceSet": true,
  "balances": {
    "days": [
      {
        "date": "2026-11-17",
        "cash":     { "opening": 10000, "inflow": 0, "outflow": 58000, "closing": -48000 },
        "accounts": [
          { "accountName": "Skyblue -HDFC-5540", "opening": 0, "inflow": 90000, "outflow": 0, "closing": 90000 }
        ],
        "totals":   { "opening": 10000, "inflow": 90000, "outflow": 58000, "closing": 42000 }
      }
    ]
  }
}
```

- `balances.days` has **one entry per calendar day** in the range that is `>= asOfDate` (even days with no entries), oldest first. `accounts` lists **every** account in the fixed list on every day (zeros where unused).
- If no opening balance has been saved: `openingBalanceSet: false` and `balances.days: []`. Inflow/outflow still work.
- `inflow.data` / `outflow.data` sorted by date descending, then newest created first.
- `eventReference` may be an id string or a populated `{ _id, clientName, name }`. **The backend always returns the populated form** (`name` = the event name, e.g. "Wedding"), or `null`.

### 3.2 Inflow `POST /daybook/inflows`, `PUT /daybook/inflows/:id`

```json
{
  "clientName": "Asha Rao",
  "eventDate": "2026-12-05",
  "eventReference": "674b…",
  "receivedDate": "2026-11-17",
  "receivedIn": "ACCOUNT",
  "accountName": "Skyblue -HDFC-5540",
  "amountReceived": 100000,
  "gstAmount": 9000,
  "tdsAmount": 1000,
  "note": ""
}
```

| Field | Rule |
|---|---|
| `clientName` | required, trimmed, non-empty |
| `eventDate` | required `YYYY-MM-DD` (date of the client's event) |
| `eventReference` | optional event id (validate it exists), else `null` |
| `receivedDate` | required `YYYY-MM-DD`; the day the money reached the daybook; `>= asOfDate` |
| `receivedIn` | `CASH` or `ACCOUNT` |
| `accountName` | required and from the fixed list when `ACCOUNT`; `null` when `CASH` |
| `amountReceived` | number > 0 |
| `gstAmount`, `tdsAmount` | numbers ≥ 0, see section 1 |
| `note` | optional string |

Response `201/200`: the saved row including the server-computed `netAmountReceived`. Errors: `400` with `{ message }`.
`DELETE /daybook/inflows/:id` → `200`.

### 3.3 Outflow `POST /daybook/outflows`, `PUT /daybook/outflows/:id`

```json
{
  "vendorId": "6740…",
  "paidDate": "2026-11-17",
  "paidFrom": "CASH",
  "accountName": null,
  "amountPaid": 50000,
  "tdsAmount": 1000,
  "gstAmount": 9000,
  "note": ""
}
```

| Field | Rule |
|---|---|
| `vendorId` | required, must exist in vendors; store a snapshot `vendorName` + `vendorCode` too so old rows still read correctly if a vendor is renamed |
| `paidDate` | required `YYYY-MM-DD`, `>= asOfDate` |
| `paidFrom`, `accountName` | same rule as inflow `receivedIn` / `accountName` |
| `amountPaid` | number > 0 |
| `tdsAmount`, `gstAmount` | ≥ 0 (default 0), `tdsAmount <= amountPaid` |
| `note` | optional |

Response: saved row with the server-computed `actualAmountPaid`. `DELETE /daybook/outflows/:id` → `200`.

### 3.4 Opening balance — `GET` / `PUT /daybook/opening-balance`

One document only (upsert). Set once at go-live; editable later.

```json
{
  "asOfDate": "2026-11-18",
  "balances": [
    { "source": "Cash", "amount": 10000 },
    { "source": "Dhruva Kumar H P-HDFC bank-5540", "amount": 250000 },
    { "source": "Skyblue -HDFC-5540", "amount": 0 },
    { "source": "Skyblue -ICICI-1458", "amount": 0 },
    { "source": "Monica", "amount": 0 }
  ]
}
```

- `GET` returns the same shape, or `{ "asOfDate": null, "balances": [] }` if never set.
- `PUT` requires **every** source exactly once; amounts are numbers (may be 0; negative allowed).
- `asOfDate` is the first day of the new Daybook: those amounts are the **opening** balance of that day.
- If any inflow/outflow exists dated **before** the new `asOfDate`, reject with `409 { message }` (they would silently drop out of the balances). The backend also returns `inflowsBefore` and `outflowsBefore` counts.
- Moving `asOfDate` earlier or changing amounts is allowed; all balances recalculate on the next read.

---

## 4. Mongo schemas

```js
DaybookInflow {                       // collection: daybookinflows (new shape, see section 5)
  clientName: String (required, trim),
  eventDate: String (YYYY-MM-DD, required),
  eventReference: ObjectId | null,
  receivedDate: String (YYYY-MM-DD, required),   // index
  receivedIn: "CASH" | "ACCOUNT",
  accountName: String | null,
  amountReceived: Number, gstAmount: Number, tdsAmount: Number,
  netAmountReceived: Number,           // computed server-side
  note: String, createdBy, createdAt, updatedAt
}
DaybookOutflow {                       // collection: daybookoutflows
  vendorId: ObjectId, vendorName: String, vendorCode: String,
  paidDate: String (YYYY-MM-DD, required),        // index
  paidFrom: "CASH" | "ACCOUNT", accountName: String | null,
  amountPaid: Number, tdsAmount: Number, gstAmount: Number,
  actualAmountPaid: Number,            // computed server-side
  note: String, createdBy, createdAt, updatedAt
}
DaybookOpeningBalance {                // collection: daybookopeningbalances, max 1 document
  asOfDate: String (YYYY-MM-DD),
  balances: [{ source: String, amount: Number }],
  updatedBy, updatedAt
}
```

---

## 5. Cleaning up the old Daybook data (owner asked for this) — NOT run yet

Old data cannot be reused: the inflow shape changed (`name` / `receivedBy` instead of `clientName` / `eventDate` / GST / TDS) and the old open/close rows are obsolete. Run **only when the owner says go**, in this order. This must be run by someone with the connection string.

1. **Look first** (`mongosh`, read-only):
   ```js
   db.daybookinflows.countDocuments();
   db.daybookaccountopenclosebalances.countDocuments();
   db.spreadsheetworkbooks.aggregate([{ $match: { module: /^daybook/ } }, { $group: { _id: "$module", n: { $sum: 1 } } }]);
   ```
2. **Back up outside git** (names and amounts are client data): `mongoexport --collection=daybookinflows …` and the same for `daybookaccountopenclosebalances` (and any `spreadsheetworkbooks` `daybook-*` rows found above).
3. **Confirm the counts** with the owner.
4. **Delete:**
   ```js
   db.daybookinflows.deleteMany({});                      // old-shape rows; the collection is re-used with the new shape
   db.daybookaccountopenclosebalances.drop();             // obsolete
   db.spreadsheetworkbooks.deleteMany({ module: /^daybook/ });   // only if step 1 found legacy rows and the owner agrees
   ```
5. Do **not** touch `events`, `vendors`, requirement/expense collections or `spreadsheetworkbooks` for other modules (`budget-report`, `client-leads`, `daily-expenses`).

**Important:** run the cleanup **before** inflows are entered in V2. `deleteMany({})` on `daybookinflows` would also delete any new V2 rows.

---

## 6. Backend checklist

- [x] Remove the requirement and booking-advance merging from `GET /daybook`; remove `includeEventAdvances`.
- [x] Add `daybookoutflows` model and CRUD; replace the inflow model/CRUD with the new shape.
- [x] Add `daybookopeningbalances` + `GET/PUT /daybook/opening-balance`.
- [x] Implement section 1 rules in one shared function used by create, update and read (`utils/daybook.js`).
- [x] Remove the `open-close-balances` routes.
- [x] Implement `balances.days` with the reference algorithm. Verified against the reference implementation on 300 randomized cases, and the contract example (see notes). The frontend file `DAYBOOK_V2_WORKED_EXAMPLE.md` is not in this repo, so it was not checked.
- [ ] Run section 5 only on the owner's say-so.

---

## Backend implementation notes

- **The section 3.1 example is not self-consistent.** Its `inflow.totals` describe two rows (gross 150000, net 140000), but `surplusDeficit` (32000) and `balances` only count the one row shown. With two rows (the second a 50000 CASH inflow), the API returns surplus 82000 and cash closing 2000. The test suite uses that two-row case.
- **Data-visibility cutoff** (`utils/dataCutoff.js`) is **not** applied to Daybook V2. The ledger starts at `asOfDate`, and clamping rows would make totals disagree with balances.
- **Date-range cap:** `GET /daybook` returns `400` when the range, or the walk from `asOfDate` to `endDate`, is longer than 3660 days. This protects Lambda from huge loops.
- `date=YYYY-MM-DD` is still accepted as shorthand for `startDate=endDate=date`.
- `PUT` on inflows and outflows is a **full replace**: send the whole body, as for `POST`. A `PUT` on an outflow refreshes the vendor snapshot from the current vendor.
- `receivedDate`/`paidDate` must be `>= asOfDate` only once an opening balance exists.
- Unknown sources (e.g. legacy `accountName: "HDFC"`) are ignored in `balances.days`, but still count in the inflow/outflow totals.
- **Legacy inflow rows** (created before V2) stay readable until the cleanup: `clientName` falls back to `name`, and `netAmountReceived` falls back to `amountReceived`. Editing one with `PUT` converts it to the new shape and removes `name`, `receivedBy` and `event_reference`. Legacy rows dated before a new `asOfDate` cause the opening-balance `409`, so run the cleanup first.
- Delete responses: `{ success: true, message, id }`. Not found → `404`. Bad id → `400`. Wrong role → `401`.
