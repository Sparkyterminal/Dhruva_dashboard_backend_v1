# Frontend Handoff — All APIs (Single File)

This is a single consolidated API contract for frontend implementation.

Base API root: `${API_BASE_URL}`

---

## 1) Requirements (Requests)

Base URL: `${API_BASE_URL}request`

### 1.1 Create request
`POST /request`

Sample body:
```json
{
  "purpose": "Vendor advance",
  "required_date": "2026-04-26",
  "amount": 25000,
  "priority": "HIGH",
  "transation_in": "ACCOUNT",
  "note": "Urgent payment",
  "remarks": "Need owner approval",
  "vendor": "<vendorId>",
  "event_reference": "<eventId>",
  "groupBy": "<groupById>"
}
```

Notes:
- `remarks` is optional text area field.
- `groupBy` optional (`groupby` alias also accepted).

### 1.2 Update request
`PATCH /request/:id`

Can update:
- workflow fields
- `remarks`
- `groupBy` / `groupby`

Clear group:
```json
{ "groupBy": null }
```

### 1.3 List requests
- `GET /request`
- `GET /request/all`

Optional filter:
- `groupBy=<id>` or `groupby=<id>`

Request item may include:
```json
"groupBy": { "_id": "...", "name": "Catering" }
```

### 1.4 Get single request
- `GET /request/:id`
- `GET /request/my-requests/:id`

---

## 2) Request GroupBy Master

Base URL: `${API_BASE_URL}request`

### 2.1 List
`GET /request/group-by`

### 2.2 Create
`POST /request/group-by`

Body:
```json
{ "name": "Catering" }
```

### 2.3 Delete
`DELETE /request/group-by/:id`

Expected statuses:
- `200` deleted
- `409` duplicate (create) / referenced by request (delete)
- `404` not found

---

## 3) Daybook GET (Inflow/Outflow)

Base URL: `${API_BASE_URL}daybook`

### 3.1 Endpoint
`GET /daybook?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=200`

Query params:
- `startDate` (required)
- `endDate` (required)
- `limit` optional
- `includeEventAdvances` optional (default `true`)

Behavior:
- Inflow includes manual + optional event advances.
- Event advances use IST day boundaries converted to UTC.
- `inflow.data[].receivedDate` is returned as ISO datetime string.

### 3.2 Outflow columns
`outflow.data[]` includes:
```json
{
  "_id": "string",
  "requestId": "string",
  "purpose": "string",
  "amountPaid": 0,
  "amountPaidTo": "string",
  "entityAccount": "string",
  "status": "string",
  "requiredDate": "ISO datetime|null",
  "paidAt": "ISO datetime",
  "groupBy": { "_id": "string", "name": "string" },
  "note": "string",
  "remarks": "string",
  "vendor": "object|null",
  "eventReference": "object|string|null"
}
```

Defaults when missing:
- `groupBy: null`
- `note: ""`
- `remarks: ""`

---

## 4) Events List + Totals

Base URL: `${API_BASE_URL}events`

### 4.1 Endpoint
`GET /events`

Query params:
- `page`, `limit`
- `status` / `eventConfirmation`
- `eventName`
- `startDate`, `endDate`
- `venue` / `venueLocation`
- `subVenue` / `subVenueLocation`

### 4.2 `totalsByStatus`
Returned keys:
- `all`
- `confirmed`
- `pending`
- `inprogress` (same as pending)
- `cancelled`

Fields:
- `all`: `totalExpectedAmount`, `totalBookingsNumber`, `confirmedTotalExpectedAmount`, `confirmedTotalBookingsNumber`, `pendingTotalExpectedAmount`, `pendingTotalBookingsNumber`
- `confirmed`: `totalExpectedAmount`, `totalBookingsNumber`, `totalReceivedAmount`, `bookingsWithAnyReceiptCount`, `totalBalanceAmount`, `bookingsWithOutstandingBalanceCount`
- `pending`/`inprogress`: `totalBookingsNumber`, `totalExpectedAmount`
- `cancelled`: `totalBookingsNumber`, `totalExpectedAmount`

---

## 5) Events Balance Sheet (Confirmed only)

Base URL: `${API_BASE_URL}events`

### Endpoint
`GET /events/balance-sheet`

Query params:
- `page`, `limit`
- `startDate`, `endDate`
- `search`
- `eventName`
- `venue` / `venueLocation`
- `subVenue` / `subVenueLocation`

Formula:
- `payableAmount`
- `receivedAmount`
- `balanceAmount = payableAmount - receivedAmount`

Summary fields:
- `summary.totalPayableAmount`
- `summary.totalReceivedAmount`
- `summary.totalBalanceAmount`

---

## 6) Marketing Targets (Team Monthly)

Base URL: `${API_BASE_URL}marketing-targets`

Data:
- `teamName`
- `month` (`YYYY-MM`)
- `targetAmount`
- `note`

Unique: `(teamName, month)`

Endpoints:
- `POST /marketing-targets`
- `GET /marketing-targets` (optional `month`, `teamName`)
- `DELETE /marketing-targets/:id`

---

## 7) Personal Calendar (Per User)

Base URL: `${API_BASE_URL}personal-calendar`

Categories:
- `TODO_LIST`
- `PROBLEM_RESOLVES`
- `GENERAL_MEETING_NOTES`

Endpoints:
- `POST /personal-calendar`
- `GET /personal-calendar` (optional `category`, `from`, `to`)
- `DELETE /personal-calendar/:id`

Entry fields:
- `title` (required)
- `category` (required)
- `startAt` (required)
- `endAt` (optional)
- `description` (optional)

---

## Existing split docs (if needed)
- `Routes/request/REQUESTS_FRONTEND.md`
- `Routes/request/GROUP_BY_FRONTEND.md`
- `Routes/daybook/DAYBOOK_GET_FRONTEND.md`
- `Routes/daybook/DAYBOOK_OUTFLOW_FRONTEND.md`
- `Routes/ClientsBookings/EVENTS_LIST_FRONTEND.md`
- `Routes/ClientsBookings/BALANCE_SHEET_FRONTEND.md`
- `Routes/MarketingTarget/FRONTEND.md`
- `Routes/PersonalCalendar/FRONTEND.md`
- `Routes/API_DOCS_INDEX.md`
