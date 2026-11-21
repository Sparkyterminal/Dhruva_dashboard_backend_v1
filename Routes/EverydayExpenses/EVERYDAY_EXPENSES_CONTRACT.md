# Everyday Expenses — Backend Contract

**Status: implemented** in `Controlers/EverydayExpenses`, `Routes/EverydayExpenses`,
`utils/everydayExpenses.js` (rules engine), `utils/billStorage.js` (S3), `utils/clock.js`,
`Modals/EverydayExpenses/{Expense,Category,Grade,Settings,Audit}`. Mounted at `/api/everyday-expenses`.
See **Backend implementation notes** at the end for decisions this contract left open.

**Frontend:** `src/Dashboard/EverydayExpenses/` · **Route:** `/user/everyday-expenses` (one page, tabs)
**Auth:** `Authorization: <jwt>` on every call. **All amounts are rupees, max 2 decimals. All dates are `YYYY-MM-DD` strings. "Day", "today" and the lock use India time (IST, UTC+05:30).**

Everyday Expenses is **new**. It replaces the old Excel-style Daily Expenses, which is removed (section 9).

---

## 1. Who can do what

Every logged-in user **except ADMIN** (Admin has no access to Everyday Expenses: return `403` on every endpoint) can **add, see, edit (until the lock) and delete (until the lock) their own expenses**, and read the categories/rate card.

**Expense reviewers** are users whose **role is `CA`, `APPROVER` or `OWNER`, or any of whose departments is named `HR DEPARTMENT` or `HR`** (trim, collapse repeated spaces, case-insensitive; the user may have several departments, any one counts; only active, non-archived departments count). HR staff have role `DEPARTMENT`. The live HR department is `name: "HR DEPARTMENT"`, `department_id: 9`, `_id: 69007c4a3f65a8a483094d6e`. Implemented once in `utils/everydayExpenses.js` `isExpenseReviewer()`. Reviewers can additionally: see everyone's expenses, manage categories/grades/settings, reject, and mark repaid.

| Action | Everyone except Admin (own data) | Reviewer |
|---|:-:|:-:|
| Read categories, my settings (`/me`) | yes | yes |
| Create / edit / delete own expense (until the lock) | yes | yes |
| Read own expenses (`/mine`) | yes | yes |
| Read **everyone's** expenses, people list | – | yes |
| Create/edit categories, grades, settings | – | yes |
| Reject, mark repaid | – | yes, **but never on their own expenses** (`403` for that id) |
| Open a bill | own bills | any bill |

The screen hides what a user cannot use, but **the server must enforce this table**. Never decide "reviewer" from an email address.

---

## 2. Money rules (the server computes and stores the result; the frontend mirrors it for the live preview)

`round2(x) = Math.round((x + Number.EPSILON) * 100) / 100`.

Grades: `JUNIOR_STAFF`, `EXECUTIVE`, `SENIOR_EXECUTIVE`, `MANAGER`. A user with no grade is `JUNIOR_STAFF`. The grade **at the time of saving** is stored on the entry.

Calculation types:

| `calcType` | Input from the employee | Reimbursable |
|---|---|---|
| `ACTUAL` | `amount` | `min(amount, cap)` if `cap` is set, else `amount` |
| `PER_UNIT` | `units` (for example km) | `round2(units × rate)` — no `amount` is entered (store `amount: null`) |
| `CAPPED_PER_UNIT` | `amount`, `units` (nights or days, whole number ≥ 1) | `min(amount, limit × units)` where `limit = capByGrade[grade] ?? cap` |
| `FIXED_MAX` | `amount` | `min(amount, cap)` |

Switches on a category, applied **in this order**:
1. `companyProvidedZero` and the entry has `companyProvided: true` → reimbursable `0` (note: "Arranged by company/venue/client").
2. `afterTime` (e.g. `"21:00"`): the entry must have `dutyEndTime` (`HH:mm`). It qualifies when `dutyEndTime > afterTime` **or** `dutyEndTime < 06:00` (a duty ending after midnight still counts). If it does not qualify → `400` "Not eligible: duty must end after 9:00 PM".
3. `maxClaimsPerDay` (e.g. `1`): the number of the user's non-rejected entries with the same `categoryId` and `expenseDate` (excluding the entry being edited) must be below the maximum, else `400`.
4. `approvalAbove` (e.g. `2000`): when `amount > approvalAbove`, `priorApproval.approvedBy` (non-empty text) is required, else `400`.
5. `requiresBill`: at least one bill is required, else `400`.

`cappedBy` is a human sentence saved with the entry when the amount was reduced, e.g. `"Capped at ₹200 per day"`, `"₹5 per km × 17.4 km"`, `"Hotel limit ₹3,000 for 2 nights (Junior Staff)"`. The employee sees it under every entry ("Why this amount?").

**Snapshot rule:** each entry stores the `categorySnapshot` it was calculated with (`name`, `group`, `calcType`, `rate`, `cap`, `capByGrade`) plus `gradeAtSubmit`. Editing a category later **never** changes old entries.

---

## 3. The lock (hard rule)

- On create the server stores `addedDay` (IST date it was created) and `editableUntil` = **00:00:00.000 IST of the next day** (as an ISO timestamp).
- `PUT` and `DELETE` on an expense when `now >= editableUntil` → **`409 { "code": "LOCKED", "message": "This expense is locked." }`**. No role (including ADMIN) can override. Bills cannot be added or removed after the lock either.
- Use the **server's clock**. Every response that carries expenses includes `serverTime` (ISO) so the app can show a countdown without trusting the phone's clock.
- Reviewer decisions (`reject`, `repay`) are **not** blocked by the lock; they only write the `status`/`rejection`/`repayment` fields and never touch the employee's fields.
- The employee's fields (category, date, amount, units, times, flags, note, bills) are immutable after the lock.
- `expenseDate` must satisfy `today - claimWindowDays <= expenseDate <= today` (default `claimWindowDays = 7`); future dates are rejected with `400`.

---

## 4. Endpoints

All paths below are relative to the API root. Errors: `400 { message, fields? }`, `401`, `403 { message }`, `404`, `409 { code: "LOCKED" | "CONFLICT", message }`.

### 4.1 Settings and my profile
`GET /everyday-expenses/me`
```json
{
  "serverTime": "2026-11-18T09:30:00.000Z",
  "userId": "6740…",
  "isReviewer": true,
  "grade": "EXECUTIVE",
  "settings": { "claimWindowDays": 7, "maxBillFiles": 5, "maxBillSizeMB": 10,
                "billTypes": ["image/jpeg","image/png","image/webp","image/heic","application/pdf"] }
}
```
`PUT /everyday-expenses/settings` (reviewers) — body `{ "claimWindowDays": 7, "maxBillFiles": 5, "maxBillSizeMB": 10 }` (any subset).
Limits: `claimWindowDays` 0–365, `maxBillFiles` 1–20, `maxBillSizeMB` 1–25 (whole numbers). Response `{ serverTime, settings }`.

### 4.2 Categories
`GET /everyday-expenses/categories?includeInactive=true|false` → `{ "serverTime": "...", "categories": [Category] }` (everyone; `includeInactive` honoured for reviewers only)
`POST /everyday-expenses/categories` (reviewers) · `PUT /everyday-expenses/categories/:id` (reviewers). There is **no delete**: set `active: false`.
`PUT` merges the body onto the current category and validates the result. Duplicate `name` within a `group` → `409 { code: "CONFLICT" }`.

```json
{
  "_id": "6750…",
  "group": "Mileage",
  "name": "Two-wheeler",
  "calcType": "PER_UNIT",
  "unitLabel": "km",
  "rate": 5,
  "cap": null,
  "capByGrade": null,
  "requiresBill": false,
  "maxClaimsPerDay": null,
  "afterTime": null,
  "companyProvidedZero": false,
  "approvalAbove": null,
  "guidance": "Distance may be verified with Google Maps or approved route records.",
  "sortOrder": 10,
  "active": true
}
```
Validation: `name` unique per `group`; `calcType` one of the four; `PER_UNIT` needs `rate > 0`; `CAPPED_PER_UNIT` needs `cap > 0` or a full `capByGrade`; `FIXED_MAX` needs `cap > 0`; `unitLabel` required for `PER_UNIT` and `CAPPED_PER_UNIT`.

### 4.3 Grades and people (reviewers)
`GET /everyday-expenses/people` → `{ "people": [{ "userId": "…", "name": "Ravi K", "departments": ["MARKETING"], "role": "DEPARTMENT", "grade": "JUNIOR_STAFF" }] }` (all active users).
`PUT /everyday-expenses/grades` — `{ "grades": [{ "userId": "…", "grade": "EXECUTIVE" }] }` → `{ updated, grades }`. All entries are validated first (`400` bad grade/id, `404` unknown user); nothing is saved if any is invalid.

### 4.4 Expenses
`POST /everyday-expenses` and `PUT /everyday-expenses/:id` (own entry, before the lock):
```json
{
  "categoryId": "6750…",
  "expenseDate": "2026-11-18",
  "amount": 480,
  "units": null,
  "dutyEndTime": null,
  "companyProvided": false,
  "priorApproval": { "approvedBy": "Event Head Suresh" },
  "note": "Taxi from venue to office",
  "bills": [{ "key": "everyday-expenses/6740…/2026-11/9f3a…-bill.jpg", "name": "bill.jpg", "size": 182331, "contentType": "image/jpeg" }]
}
```
Response (`201`/`200`) — the saved expense (plus `serverTime`):
```json
{
  "_id": "6751…",
  "userId": "6740…", "userName": "Ravi K", "departments": ["MARKETING"],
  "categoryId": "6750…",
  "categorySnapshot": { "name": "Taxi/Cab", "group": "Local travel", "calcType": "ACTUAL", "rate": null, "cap": null, "capByGrade": null, "unitLabel": null },
  "gradeAtSubmit": "JUNIOR_STAFF",
  "expenseDate": "2026-11-18", "addedDay": "2026-11-18",
  "amount": 480, "units": null, "dutyEndTime": null, "companyProvided": false,
  "priorApproval": null, "note": "Taxi from venue to office",
  "bills": [ … ],
  "reimbursable": 480, "cappedBy": null,
  "status": "SUBMITTED",
  "rejection": null, "repayment": null,
  "createdAt": "2026-11-18T09:30:00.000Z", "editableUntil": "2026-11-18T18:30:00.000Z",
  "serverTime": "2026-11-18T09:30:00.000Z"
}
```
(`editableUntil` above is 00:00 IST on 19 Nov expressed in UTC.)

Bill rules on save: every `key` must start with the **caller's own prefix** `everyday-expenses/<userId>/` and must exist in S3 (HeadObject) with a matching size; at most `maxBillFiles`; each ≤ `maxBillSizeMB`; allowed `billTypes` only. Reject others with `400`.

`DELETE /everyday-expenses/:id` — own entry, before the lock (`409 LOCKED` after). Delete the entry; the S3 objects may be removed.

`GET /everyday-expenses/mine?month=YYYY-MM` (defaults to the current IST month) →
```json
{ "serverTime": "…", "expenses": [ … ],
  "totals": { "spent": 5200, "reimbursable": 4100, "repaid": 1500, "pending": 2600 } }
```
Totals: `spent` = sum of `amount` (entries with an amount) of non-rejected entries; `reimbursable` = sum of `reimbursable` of non-rejected; `repaid` = sum of `reimbursable` of `REPAID`; `pending` = `reimbursable` of `SUBMITTED`.

### 4.5 Reviewer overview
`GET /everyday-expenses?startDate=&endDate=&userId=&department=&categoryId=&status=&page=1&limit=100` (reviewers; `limit` max 500; filters on `expenseDate`; `department` is a department name)
```json
{
  "serverTime": "…", "page": 1, "totalPages": 1, "total": 42,
  "totals": { "spent": 0, "reimbursable": 0, "repaid": 0, "pending": 0, "rejected": 0 },
  "byPerson": [{ "userId": "…", "name": "Ravi K", "count": 6, "spent": 3100, "reimbursable": 2600, "repaid": 0, "pending": 2600 }],
  "expenses": [ … same shape as above … ]
}
```
`totals` and `byPerson` cover **all** matching entries, not just the returned page. Sort: `expenseDate` desc, then `createdAt` desc.

`POST /everyday-expenses/reject` (reviewers) — `{ "ids": ["…"], "reason": "Bill is unreadable" }` (`reason` required, ≥ 3 chars). Only `SUBMITTED` entries change to `REJECTED` with `rejection: { reason, by, at }`.
`POST /everyday-expenses/repay` (reviewers) — `{ "ids": ["…"], "date": "2026-11-20", "mode": "CASH" | "BANK" | "UPI", "reference": "UTR 1234" }`. Only `SUBMITTED` entries change to `REPAID` with `repayment: { date, mode, reference, amount: reimbursable, by, at }`.
Both return a per-id result and never fail everything because one id is bad:
```json
{ "updated": ["…"], "failed": [{ "id": "…", "message": "Cannot settle your own claim" }] }
```
Failure reasons: not found, not in `SUBMITTED`, or the caller created the entry.

### 4.6 Bills (S3, private bucket, direct upload)
API Gateway/Lambda cannot take large uploads, so the browser uploads straight to S3.

`POST /everyday-expenses/uploads/presign` — body `{ "fileName": "bill.jpg", "contentType": "image/jpeg", "size": 182331 }`
→ `{ "uploadUrl": "https://<bucket>.s3.<region>.amazonaws.com/…?X-Amz-…", "key": "everyday-expenses/<userId>/2026-11/<uuid>-bill.jpg", "expiresIn": 300 }`
Check `contentType` against `billTypes` and `size` against `maxBillSizeMB`; sign a **PUT** that pins `Content-Type` and `Content-Length`. The browser then does `PUT uploadUrl` with the file and the same `Content-Type`, **with no Authorization header**.

`GET /everyday-expenses/uploads/url?key=…` → `{ "url": "<short-lived signed GET>", "expiresIn": 300 }`. Allowed only for the owner of the entry holding that key, or a reviewer.

**Bucket setup:** private (block all public access), default encryption on, CORS allowing `PUT` (and `GET`) from the app origins with the `Content-Type` header, IAM for the API role limited to this prefix (`PutObject`, `GetObject`, `HeadObject`, `DeleteObject`). Keys are never guessable (random uuid) and are always served through signed URLs.

---

## 5. Collections and indexes

```
expensecategories  { group, name, calcType, unitLabel, rate, cap, capByGrade{…}, requiresBill, maxClaimsPerDay,
                     afterTime, companyProvidedZero, approvalAbove, guidance, sortOrder, active, createdAt, updatedAt }
expensegrades      { userId (unique), grade, updatedBy, updatedAt }
expensesettings    { claimWindowDays, maxBillFiles, maxBillSizeMB, updatedBy, updatedAt }        // one document
everydayexpenses   { userId, userName, departments[], categoryId, categorySnapshot, gradeAtSubmit,
                     expenseDate, addedDay, amount, units, dutyEndTime, companyProvided, priorApproval,
                     note, bills[], reimbursable, cappedBy, status, rejection, repayment,
                     createdAt, editableUntil, updatedAt }
```
Indexes: `everydayexpenses { userId: 1, expenseDate: -1 }`, `{ expenseDate: -1, status: 1 }`, `{ userId: 1, categoryId: 1, expenseDate: 1 }` (claims-per-day check). Keep an **immutable audit log** of every create / edit / delete / reject / repay (who, when, before/after).

---

## 6. Seed categories (insert once)

Group · name · calcType · values. All `requiresBill: true` unless noted. `sortOrder` in this order.

| Group | Name | calcType | Values |
|---|---|---|---|
| Food | Night shift food | `FIXED_MAX` | `cap 200`, `afterTime "21:00"`, `maxClaimsPerDay 1`, `companyProvidedZero true`, guidance "Only for approved assignments; original food bill required; not payable if food was arranged by the company, venue or client." |
| Local travel | Auto-rickshaw · Taxi/Cab · Metro · Bus · Parking · Toll | `ACTUAL` | no cap; guidance "Use economical modes; bill or digital receipt required." |
| Mileage | Two-wheeler | `PER_UNIT` | `unitLabel "km"`, `rate 5`, `requiresBill false` |
| Mileage | Four-wheeler | `PER_UNIT` | `unitLabel "km"`, `rate 12`, `requiresBill false` |
| Outstation | Train / Bus / Flight ticket | `ACTUAL` | guidance "Executives & Coordinators: Sleeper Train / Economy Bus. Senior Executives: AC Train / Economy Flight (if approved). Managers: AC Train / Economy Flight. Needs prior approval." |
| Accommodation | Hotel | `CAPPED_PER_UNIT` | `unitLabel "night"`, `capByGrade { JUNIOR_STAFF 1500, EXECUTIVE 2000, SENIOR_EXECUTIVE 2000, MANAGER 3000 }` (Senior Executive starts at the Executive limit; editable), guidance "No minibar, alcohol, laundry, spa, guest or entertainment charges." |
| Daily allowance | Meals | `CAPPED_PER_UNIT` | `unitLabel "day"`, `cap 600`, `companyProvidedZero true` |
| Daily allowance | Miscellaneous | `CAPPED_PER_UNIT` | `unitLabel "day"`, `cap 200` |
| Event purchases | Event purchase | `ACTUAL` | `approvalAbove 2000`, guidance "Materials, props, stationery, production supplies, emergency needs. GST invoice wherever possible." |

---

## 7. Worked examples (the backend must match exactly)

| # | Category (grade) | Input | Result |
|---|---|---|---|
| 1 | Night shift food | amount 350, `dutyEndTime 21:30` | reimbursable **200**, cappedBy "Capped at ₹200 per day" |
| 2 | Night shift food | amount 180, `dutyEndTime 22:00` | **180** |
| 3 | Night shift food | amount 200, `dutyEndTime 20:30` | `400` Not eligible |
| 4 | Night shift food | amount 200, `dutyEndTime 01:15` | **200** (after midnight counts) |
| 5 | Night shift food | `companyProvided true` | **0** |
| 6 | Night shift food | second claim same day | `400` (1 per day) |
| 7 | Two-wheeler | units 17.4 | **87** |
| 8 | Four-wheeler | units 10 | **120** |
| 9 | Hotel (Junior) | amount 5000, 2 nights | **3000** |
| 10 | Hotel (Executive) | amount 5000, 2 nights | **4000** |
| 11 | Hotel (Manager) | amount 5000, 2 nights | **5000** |
| 12 | Hotel (no grade) | amount 2800, 2 nights | **2800** (Junior limit 3000) |
| 13 | Meals | amount 2100, 3 days | **1800** |
| 14 | Miscellaneous | amount 500, 3 days | **500** |
| 15 | Taxi/Cab | amount 480 | **480** |
| 16 | Event purchase | amount 2600, no approval | `400` approval required |
| 17 | Event purchase | amount 2600, `approvedBy "Suresh"` | **2600** |
| 18 | Event purchase | amount 1999.99 | **1999.99** |
| 19 | Any | edit at 23:59:59 IST on the day it was added | allowed |
| 20 | Any | edit at 00:00:00 IST next day | `409 LOCKED` |

---

## 8. Backend checklist

- [x] Reviewer rule exactly as section 1 (role CA/APPROVER/OWNER or department `HR`), enforced on every endpoint.
- [x] Rules engine in one shared function used by create, edit and any recalculation; snapshot stored on each entry (`utils/everydayExpenses.js` `calculateExpense`).
- [x] Lock rule with the **server** clock and `409 LOCKED`; `serverTime` on every list/save response.
- [x] S3: private bucket, presign PUT/GET, key-prefix and HeadObject checks on save. (The bucket is defined in `serverless.yml` and is created on the next deploy.)
- [x] Reject/repay per-id results; reviewers cannot settle their own entries.
- [x] Seed categories (section 6) and default settings; indexes (section 5); audit log.
- [x] Verify all 20 worked examples (section 7). All pass on a local test database (114 checks in total).
- [x] Section 9 (removal of the old data) **only on the owner's go-ahead**. **Done 2026-11-18:** deleted the 6 `spreadsheetworkbooks` `module:"daily-expenses"` rows (keys 2026-07-20 to 2026-11-03). No older Expenses collection existed; all `/expense/i` collections are the new module and were kept. Backup: `~/Desktop/Projects/Dhruva/backups/daily-expenses-legacy-2026-11-18/` (outside git). Removed `daily-expenses` from the spreadsheet-workbooks API (it now returns `400 Unsupported module`).

---

## 9. Removing the old Daily Expenses (Excel) — DONE 2026-11-18

The two old Excel-style screens are removed from the frontend. Their data must go too. **Run only when the owner says go, in this order; nothing here is run from the frontend repo.**

1. **Look first (read-only, `mongosh`):**
   ```js
   db.spreadsheetworkbooks.aggregate([{ $match: { module: "daily-expenses" } }, { $group: { _id: "$module", n: { $sum: 1 } } }]);
   // the older "Expenses" screen (see `docs/api/expenses/legacy-removed/EXPENSES_BACKEND_SCHEMA.md`) — find its collection name there and count it:
   db.getCollectionNames().filter((n) => /expense/i.test(n));
   ```
2. **Back up outside git** (names and amounts are client data): `mongoexport` of each collection/filter found in step 1.
3. **Confirm the counts with the owner.**
4. **Delete** (only what step 1 found; do not touch `budget-report`, `client-leads`, `daybook-*` modules or any collection not listed):
   ```js
   db.spreadsheetworkbooks.deleteMany({ module: "daily-expenses" });
   // old Expenses collection(s) from step 1: db.<collection>.drop()
   ```
   **Careful:** the new module's collections also match `/expense/i` (`everydayexpenses`, `expensecategories`, `expensegrades`, `expensesettings`, `everydayexpenseaudits`). **Never drop those.**
5. **Code:** stop accepting the `daily-expenses` module in the spreadsheet-workbooks API; remove the old `/expenses` routes/models; remove the S3/other storage used only by them if any. (This backend has no old `/expenses` routes or models; only the `daily-expenses` spreadsheet module needs removing.)

---

## Backend implementation notes

- **Seeding:** the 14 section 6 categories are inserted on the first `GET`/`POST /categories` and recorded in `expensesettings.categoriesSeededAt`, so they are never re-added, even after one is renamed.
- **Reviewer rule:** `isExpenseReviewer()` in `utils/everydayExpenses.js` is the only implementation, and `loadExpenseUser` computes `req.expenseUser.isReviewer` with it once per request. To make Accounts staff reviewers later, add `'ACCOUNTS'` to `REVIEWER_ROLES` there (a one-line change). The 2026-11-21 fix accepted `HR DEPARTMENT`; before that only `HR` matched, so the 2 real HR users were not reviewers.
- **Reviewer and role come from the database** user, not from the token. A token that still says `ADMIN` or `OWNER` after a role change gets the current DB role. Departments only count when active and not archived (same as login).
- **Reviewed entries are frozen for the employee:** after a `REJECTED` or `REPAID` decision, `PUT`/`DELETE` returns `409 { code: "CONFLICT" }` even before the lock, so a repaid amount can never change.
- **`companyProvided: true`** on a `companyProvidedZero` category short-circuits: the reimbursable amount is `0`, and the other switches (time, per-day limit, approval, bill) are skipped. `amount` is optional in that case.
- **`cappedBy` text:** `ACTUAL` with a cap → "Capped at ₹X". `PER_UNIT` → always "₹rate per unit × N unit". `CAPPED_PER_UNIT` with `capByGrade` → "<name> limit ₹total for N units (Grade)"; with `cap` → "Capped at ₹cap per unit × N units". `FIXED_MAX` → "Capped at ₹cap per day" when `maxClaimsPerDay` is 1, otherwise "per claim". Otherwise `null`.
- **Rejected amounts in overview `totals.rejected`** are the sum of `reimbursable` of `REJECTED` entries. `byPerson.count` includes rejected entries.
- `rejection` is `{ reason, by, byName, at }` and `repayment` is `{ date, mode, reference, amount, by, byName, at }` (`by` is the reviewer's user id).
- **Bill URL access:** owners can open any key under their own prefix (including a just-uploaded file before saving). Reviewers can open keys that are attached to an entry (`404` otherwise). Keys containing `..` are rejected.
- **Bill storage not configured** (`BILLS_BUCKET` unset, e.g. local dev): presign and URL return `503`, and saving with bills returns `503`.
- **Audit log:** collection `everydayexpenseaudits`, insert-only (update and delete are blocked in the model). It records CREATE, EDIT, DELETE, REJECT, REPAY, CATEGORY_CREATE, CATEGORY_EDIT, GRADES and SETTINGS with actor, time, before and after.
- The global data-visibility cutoff (`utils/dataCutoff.js`) is **not** applied: this module is new and has its own claim window.
- Reject and repay accept at most 200 ids per call (`400` above).
