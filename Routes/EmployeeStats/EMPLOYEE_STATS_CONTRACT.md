# Employee Statistics — Backend Contract

**Status: implemented** in `Controlers/EmployeeStats`, `Routes/EmployeeStats`, `utils/employeeStats.js` (definitions), `utils/bookingMoney.js` (money, shared with the Bookings screens), `utils/reviewerAccess.js` (access, shared with Everyday Expenses). Mounted at `/api/employee-stats`. See **Backend implementation notes** at the end.

**Frontend:** `src/Dashboard/EmployeeStats/` · **Route:** `/user/employee-stats` · **Menu:** "Employee activities" → "Employee Statistics"
**Auth:** `Authorization: <jwt>` on every call.

One page shows, for the booking team, **bookings and amounts per employee, month by month, and who was top in each month**. **Everything on the page comes from these endpoints. The frontend hardcodes no employees, months, departments or numbers**: months come from `months`, employees from `employees`, filter choices from `/employee-stats/filters`, comparisons from `previous`.

---

## 1. Who can call it

Same people as the Everyday Expenses reviewers:

- `role` is `CA`, `APPROVER` or `OWNER`, **or**
- any of the user's departments is named **`HR DEPARTMENT`** (also accept `HR`; compare trimmed, case-insensitive, repeated spaces collapsed). A user stores departments as ObjectId references (`department.department: [...]`) into the `departments` collection; resolve them to names. HR users keep `role: "DEPARTMENT"`. Never decide by e-mail address.

Everyone else, **including `ADMIN`, `ACCOUNTS` and `MARKETING`, gets `403`** on every endpoint below. Use one shared helper, the same one as Everyday Expenses (`docs/api/everyday-expenses/HR_REVIEWER_ACCESS_BACKEND_FIX.md`).

---

## 2. Definitions (every number must follow these exactly)

**Employee** = the person a booking is credited to: `bookedBy`, falling back to `createdBy`. A booking with neither is credited to the row `{ userId: null, name: "Unassigned" }` (only returned if such bookings exist), so the team total always equals the sum of the rows.

**Status** of a booking = `eventConfirmation`: `Confirmed Event`, `InProgress`, `Almost Booked`, `Cancelled`.

**Month a booking counts in** depends on `dateBasis`:
- `booked` (default): the month of the booking's **creation date**, in India time (IST, UTC+05:30).
- `event`: the month of the booking's **first event date** (earliest `eventTypes[].startDate`, in IST). Bookings with no event date are left out; return their number in `excluded.noEventDate`.

**Money per booking** (same rules as the Bookings screens, see `docs/api/client-bookings/COMPLETE_WEDDING_ADVANCE_TOTALS_BACKEND.md`):
- `total` = for a Wedding with `advancePaymentType: "complete"`, `eventTypes[0].totalPayable` **once**; otherwise the sum of `eventTypes[].totalPayable`. Never add all ceremonies of a complete package.
- `received` = for a complete package, the **max** `receivedAmount` per `advanceNumber` across ceremonies, summed once; otherwise the sum of all `receivedAmount`. The received amount is the truth even when an advance's saved `status` still says Pending.
- `pending` = `max(total - received, 0)` **per booking**, then summed (one over-paid booking never cancels another's balance).

**Fields of a "Totals" object** (used everywhere below):

| Field | Meaning |
|---|---|
| `bookings` | all bookings in any status |
| `confirmed`, `inProgress`, `almostBooked`, `cancelled` | counts by status (they add up to `bookings`) |
| `bookedAmount` | sum of `total` of **Confirmed** bookings only |
| `receivedAmount` | sum of `received` of **Confirmed** bookings only |
| `pendingAmount` | sum of `pending` of **Confirmed** bookings only |
| `pipelineAmount` | sum of `total` of **InProgress + Almost Booked** bookings (never added to `bookedAmount`) |
| `conversionRate` | `confirmed / bookings` as a number from `0` to `1`; `null` when `bookings` is `0` |
| `avgBookingValue` | `bookedAmount / confirmed`, rounded to 2 decimals; `null` when `confirmed` is `0` |

Cancelled bookings never add any money. Money is in rupees with at most 2 decimals; use `round2(x) = Math.round((x + Number.EPSILON) * 100) / 100`.

**The data floor.** The existing data-visibility floor (`dataVisibilityCutoffDate`) applies: clamp `from` up to it and return nothing before it. If the **previous period** (see below) would start before the floor, return `previous: null` (no comparison). Never mention the floor in any response text.

---

## 3. Endpoints

### 3.1 `GET /employee-stats/filters`

What the page needs to build its filter bar. No hardcoded lists on the frontend.

```json
{
  "serverTime": "2026-11-21T10:30:00.000Z",
  "today": "2026-11-21",
  "dataFrom": "2026-04-01",
  "departments": ["ACCOUNTS", "MARKETING", "HR DEPARTMENT"],
  "employees": [
    { "userId": "6740…", "name": "Asha Rao", "departments": ["MARKETING"] }
  ]
}
```
`today` is the current IST date. `dataFrom` is the earliest date that can be asked for. `employees` = every active user who has ever been credited with a booking.

### 3.2 `GET /employee-stats`

| Query | Required | Notes |
|---|:-:|---|
| `from`, `to` | yes | `YYYY-MM-DD`, inclusive, IST days. `to >= from`, at most 36 months apart, else `400`. `from` is clamped to the data floor. |
| `dateBasis` | no | `booked` (default) or `event` |
| `department` | no | a department name; keeps employees who belong to it |
| `userId` | no | one or more ids (repeat the parameter or comma-separate); `unassigned` selects the Unassigned row |

**`previous`** is the period of the **same length that ends the day before `from`** (for `from=2026-10-01, to=2026-11-30` it is `2026-08-01…2026-09-30`). It is returned for the totals and for every employee, with the same filters. `null` when it would start before the data floor.

```json
{
  "serverTime": "2026-11-21T10:30:00.000Z",
  "range": { "from": "2026-10-01", "to": "2026-11-30", "dateBasis": "booked" },
  "previousRange": { "from": "2026-08-01", "to": "2026-09-30" },
  "excluded": { "noEventDate": 0 },
  "months": ["2026-10", "2026-11"],
  "totals": { "…": "a Totals object" },
  "previous": { "…": "a Totals object, or null" },
  "monthly": [ { "month": "2026-10", "…": "a Totals object" } ],
  "employees": [
    {
      "userId": "6740…",
      "name": "Asha Rao",
      "departments": ["MARKETING"],
      "totals": { "…": "a Totals object" },
      "previous": { "…": "a Totals object, or null" },
      "byMonth": [ { "month": "2026-10", "…": "a Totals object" } ]
    }
  ],
  "monthlyTop": [
    {
      "month": "2026-10",
      "byAmount":   { "userId": "6740…", "name": "Asha Rao", "bookedAmount": 800000, "confirmed": 2 },
      "byBookings": { "userId": "6740…", "name": "Asha Rao", "confirmed": 2, "bookedAmount": 800000 }
    }
  ]
}
```

Rules:
- `months` lists **every calendar month that touches the range**, in order, **including months with no bookings**. `monthly` and every employee's `byMonth` have **exactly one entry per month in `months`**, in the same order, with zeros for empty months (so the grid never has gaps). For a partial first or last month, count only the days inside the range.
- `employees` has one row for every employee with **at least one booking in the range** (any status); employees with none are left out. Sort by `bookedAmount` descending, then `confirmed`, then `name`.
- `totals` = the sum of the `employees` rows. `monthly[i]` = the sum of every employee's `byMonth[i]`.
- `monthlyTop` has one entry per month in `months`.
  - `byAmount`: the employee with the highest `bookedAmount` that month; `null` when nobody has a confirmed booking that month. Ties: more `confirmed`, then name A–Z.
  - `byBookings`: the employee with the most **confirmed** bookings that month; `null` when nobody has one. Ties: higher `bookedAmount`, then name A–Z.
- Ratios (`conversionRate`) are numbers between `0` and `1`, never percentages and never `NaN`.

### 3.3 `GET /employee-stats/:userId/bookings`

The bookings behind one employee (side panel on the page). `:userId` may be `unassigned`.

| Query | Notes |
|---|---|
| `from`, `to`, `dateBasis` | same as above (and the same floor) |
| `month` | optional `YYYY-MM`, only that month |
| `status` | optional: `confirmed`, `inprogress`, `almostbooked`, `cancelled` |
| `page`, `limit` | default `1`, `20`; `limit` max `100` |

```json
{
  "page": 1, "totalPages": 1, "total": 4,
  "bookings": [
    {
      "_id": "674b…",
      "clientName": "Sharma wedding",
      "eventName": "Wedding",
      "eventConfirmation": "Confirmed Event",
      "bookedOn": "2026-11-04",
      "eventDate": "2026-12-20",
      "bookedAmount": 400000,
      "receivedAmount": 100000,
      "pendingAmount": 300000
    }
  ]
}
```
Sorted by `bookedOn` descending. For non-confirmed bookings `bookedAmount`, `receivedAmount` and `pendingAmount` are `0` and the figure the booking is expected to bring is returned as `expectedAmount`. `eventDate` is the first event date or `null`.

---

## 4. Worked example (the backend must reproduce these numbers exactly)

Request: `GET /employee-stats?from=2026-10-01&to=2026-11-30` (`dateBasis=booked`). Bookings in the range, credited to **Asha Rao** and **Ravi K**:

| # | Employee | Booked in | Status | Total | Received | Notes |
|---|---|---|---|---:|---:|---|
| 1 | Asha | Oct | Confirmed | 500,000 | 200,000 | |
| 2 | Asha | Oct | Confirmed | 300,000 | 300,000 | |
| 3 | Asha | Oct | InProgress | 100,000 | – | pipeline |
| 4 | Asha | Nov | Confirmed | 400,000 | 100,000 | |
| 5 | Ravi | Oct | Confirmed | 450,000 | 450,000 | |
| 6 | Ravi | Nov | Confirmed | 600,000 | 150,000 | complete-package wedding with 3 ceremonies, each saved with `totalPayable 600,000` and the same advances copied onto every ceremony → count `total` **once** (600,000) and `received` once (150,000) |
| 7 | Ravi | Nov | Confirmed | 250,000 | 250,000 | |
| 8 | Ravi | Nov | Cancelled | 200,000 | – | adds no money |
| 9 | Ravi | Nov | Almost Booked | 120,000 | – | pipeline |

**Expected `employees`** (Ravi first: higher `bookedAmount`):

| | Ravi K | Asha Rao |
|---|---:|---:|
| `bookings` | 5 | 4 |
| `confirmed` / `inProgress` / `almostBooked` / `cancelled` | 3 / 0 / 1 / 1 | 3 / 1 / 0 / 0 |
| `bookedAmount` | **1,300,000** | **1,200,000** |
| `receivedAmount` | 850,000 | 600,000 |
| `pendingAmount` | 450,000 | 600,000 |
| `pipelineAmount` | 120,000 | 100,000 |
| `conversionRate` | 0.6 | 0.75 |
| `avgBookingValue` | 433,333.33 | 400,000 |

`byMonth` — **2026-10**: Asha `bookings 3, confirmed 2, inProgress 1, booked 800,000, received 500,000, pending 300,000, pipeline 100,000, conversion 0.6667 (0.666666…), avg 400,000`; Ravi `bookings 1, confirmed 1, booked 450,000, received 450,000, pending 0, pipeline 0, conversion 1, avg 450,000`.
**2026-11**: Asha `bookings 1, confirmed 1, booked 400,000, received 100,000, pending 300,000, conversion 1, avg 400,000`; Ravi `bookings 4, confirmed 2, almostBooked 1, cancelled 1, booked 850,000, received 400,000, pending 450,000, pipeline 120,000, conversion 0.5, avg 425,000`.

**Expected `totals`:** `bookings 9, confirmed 6, inProgress 1, almostBooked 1, cancelled 1, bookedAmount 2,500,000, receivedAmount 1,450,000, pendingAmount 1,050,000, pipelineAmount 220,000, conversionRate 0.6667, avgBookingValue 416,666.67`.

**Expected `monthly`:** Oct `bookings 4, confirmed 3, booked 1,250,000, received 950,000, pending 300,000, pipeline 100,000`; Nov `bookings 5, confirmed 3, booked 1,250,000, received 500,000, pending 750,000, pipeline 120,000`.

**Expected `monthlyTop`:** Oct → `byAmount` Asha (800,000), `byBookings` Asha (2 confirmed); Nov → `byAmount` Ravi (850,000), `byBookings` Ravi (2 confirmed).

**Cross-checks:** `totals` = Ravi + Asha for every field; `monthly[Oct] + monthly[Nov]` = `totals` for the money fields; `confirmed + inProgress + almostBooked + cancelled = bookings` on every object.

Edge cases the backend must also pass: a month in the range with **no bookings** (zeros, `monthlyTop` entries `null`); a range with **no bookings at all** (`employees: []`, all totals `0`, `conversionRate` and `avgBookingValue` `null`); two employees **tied** on a month's amount (more confirmed wins, then name A–Z); `dateBasis=event` with a booking that has no event date (left out and counted in `excluded.noEventDate`); a department filter that matches nobody; `previous: null` when the previous period starts before the data floor.

---

## 5. Performance and indexes

The page makes **one** call to `/employee-stats` per filter change plus one to `/filters` on open, so the answer must be an aggregation, not a list of bookings. Suggested indexes on the bookings (events) collection: `{ bookedBy: 1, createdAt: -1 }`, `{ eventConfirmation: 1, createdAt: -1 }`, and for `dateBasis=event` an index on `eventTypes.startDate`. A short server-side cache (for example 60 seconds per user and query) is welcome. Return `serverTime` in every response.

---

## 6. Backend checklist

- [x] Access rule in section 1 on all three endpoints (CA/APPROVER/OWNER or HR DEPARTMENT/HR; `403` for everyone else including ADMIN).
- [x] Definitions in section 2 (employee, month, money rules, statuses, the floor) implemented once and shared.
- [x] `/employee-stats/filters`, `/employee-stats` and `/employee-stats/:userId/bookings` with the exact field names above.
- [x] Every month of the range present in `months`, `monthly` and each `byMonth` (zeros included).
- [x] `monthlyTop` rules and tie-breaks; `previous` and `previousRange` rules.
- [x] The worked example (section 4) reproduces exactly, plus the edge cases listed after it.

---

## Backend implementation notes

- **Verified:** the section 4 worked example reproduces exactly, and so does every listed edge case (68 checks on a local test database). On a copy of the live data (2026-11-21, Apr–Nov 2026) the totals matched an independent database calculation exactly: 186 bookings, 162 confirmed, ₹228,096,631.20 booked, 13 employees. Response time was ~50 ms (~6 ms cached).
- **Access** uses `utils/reviewerAccess.js` `loadUserAccess()`, the same rule and code as Everyday Expenses (role and departments from the DB). Non-reviewers, including ADMIN, get `403`. A missing, inactive or archived user gets `401`.
- **Money** uses the Bookings-screen functions unchanged: `total` = `eventTypes[0].totalPayable` when `advancePaymentType` is `complete`, else the sum. `received` de-duplicates by `advanceNumber` (max) for complete-package Weddings. In the live data `complete` only occurs on Weddings, so this equals the section 2 wording. `received` is in whole rupees (as on the Bookings screens).
- **`conversionRate`** is rounded to 4 decimals (0.666666… → `0.6667`). `avgBookingValue` is rounded to 2 decimals.
- **`bookedBy`** is not a field on bookings today, so every booking is credited to `createdBy`. The code already prefers `bookedBy` when it exists.
- **`Almost Booked`** is counted when present, but no booking has it and the booking model's `eventConfirmation` enum does not allow it yet (only `Confirmed Event`, `InProgress`, `Cancelled`).
- **Unknown status:** a booking with a missing or unknown `eventConfirmation` is left out (so the four counts always add up to `bookings`) and reported in `excluded.unknownStatus`.
- **Floor:** `from` is clamped up to the floor. A range wholly before it returns `months: []` and empty totals. `previous`/`previousRange` are `null` when the previous period would start before the floor.
- **`previous`** uses the same filters and covers all filtered bookings in that period. Each employee's `previous` is their own totals there (zeros if none).
- **Unassigned** (no `bookedBy`/`createdBy`) is never a `monthlyTop` winner. It is excluded by any `department` filter and selected with `userId=unassigned`.
- **`dateBasis=event`:** the month comes from the earliest ceremony `startDate` in IST. `excluded.noEventDate` counts the filtered bookings that have no event date at all.
- **`/:userId/bookings`:** `expectedAmount` is the booking total for InProgress/Almost Booked, `0` for Cancelled and `null` for Confirmed (whose amounts are in `bookedAmount`/`receivedAmount`/`pendingAmount`).
- **`/filters`:** `dataFrom` is the floor (or the first booking's IST day when no floor is set). `employees` are active users credited with at least one booking at any time. `departments` are active, non-archived departments.
- **Indexes** were added on bookings: `{ createdBy: 1, createdAt: -1 }`, `{ eventConfirmation: 1, createdAt: -1 }`, `{ "eventTypes.startDate": 1 }`. Add `{ bookedBy: 1, createdAt: -1 }` if `bookedBy` is introduced.
- **Cache:** 60 s per caller and query string, in memory per Lambda container (max 200 entries). `serverTime` is always fresh.
