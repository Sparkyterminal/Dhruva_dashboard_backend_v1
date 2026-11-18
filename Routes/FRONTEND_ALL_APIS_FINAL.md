# Frontend API Implementation — Final Consolidated Doc

This file contains all required API contracts in one place for frontend implementation.

Base API root: `${API_BASE_URL}`

---

## 1) Requirements / Requests

Base URL: `${API_BASE_URL}request`

### Create Request
`POST /request`

Body example:
```json
{
  "purpose": "Vendor advance",
  "required_date": "2026-04-26",
  "amount": 25000,
  "priority": "HIGH",
  "transation_in": "ACCOUNT",
  "note": "Urgent",
  "remarks": "Need owner approval",
  "vendor": "<vendorId>",
  "event_reference": "<eventId>",
  "groupBy": "<groupById>"
}
```

Notes:
- `remarks` = optional text area field.
- `groupBy` is optional (alias `groupby` also accepted).

### Update Request
`PATCH /request/:id`

You can update `remarks` and `groupBy` also.
To clear group:
```json
{ "groupBy": null }
```

### List Requests
- `GET /request`
- `GET /request/all`

Optional filter:
- `groupBy=<id>` or `groupby=<id>`

### Get Single Request
- `GET /request/:id`
- `GET /request/my-requests/:id`

Response may include:
```json
"groupBy": { "_id": "...", "name": "Catering" }
```

---

## 2) GroupBy Master (for Requests)

Base URL: `${API_BASE_URL}request`

### List Groups
`GET /request/group-by`

### Create Group
`POST /request/group-by`

Body:
```json
{ "name": "Catering" }
```

### Delete Group
`DELETE /request/group-by/:id`

Common statuses:
- `200` success
- `409` duplicate (create) / in-use by requests (delete)
- `404` not found

---

## 3) Daybook

Base URL: `${API_BASE_URL}daybook`

### GET Daybook
`GET /daybook?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=200`

Query params:
- `startDate` (required)
- `endDate` (required)
- `limit` (optional)
- `includeEventAdvances` (optional, default `true`)

Behavior:
- Inflow includes manual + optional event advances.
- Event advances are date-matched using IST business-day boundary converted to UTC.
- `inflow.data[].receivedDate` is ISO datetime string.

### Outflow row fields
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

Defaults when absent:
- `groupBy: null`
- `note: ""`
- `remarks: ""`

---

## 4) Events List + Dashboard Totals

Base URL: `${API_BASE_URL}events`

### List endpoint
`GET /events`

Common query params:
- `page`, `limit`
- `status` / `eventConfirmation`
- `eventName`
- `startDate`, `endDate`
- `venue` / `venueLocation`
- `subVenue` / `subVenueLocation`

### `totalsByStatus` object
Keys returned:
- `all`
- `confirmed`
- `pending`
- `inprogress` (same as pending)
- `cancelled`

#### all
- `totalExpectedAmount`
- `totalBookingsNumber`
- `confirmedTotalExpectedAmount`
- `confirmedTotalBookingsNumber`
- `pendingTotalExpectedAmount`
- `pendingTotalBookingsNumber`

#### confirmed
- `totalExpectedAmount`
- `totalBookingsNumber`
- `totalReceivedAmount`
- `bookingsWithAnyReceiptCount`
- `totalBalanceAmount`
- `bookingsWithOutstandingBalanceCount`

#### pending / inprogress
- `totalBookingsNumber`
- `totalExpectedAmount`

#### cancelled
- `totalBookingsNumber`
- `totalExpectedAmount`

---

## 5) Confirmed Events Balance Sheet

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

## 6) Marketing Team Monthly Targets

Base URL: `${API_BASE_URL}marketing-targets`

Fields:
- `teamName`
- `month` (`YYYY-MM`)
- `targetAmount`
- `note`

Unique: `(teamName, month)`

Endpoints:
- `POST /marketing-targets`
- `GET /marketing-targets` (optional: `month`, `teamName`)
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
- `GET /personal-calendar` (optional: `category`, `from`, `to`)
- `DELETE /personal-calendar/:id`

Create body sample:
```json
{
  "title": "Follow up",
  "category": "TODO_LIST",
  "startAt": "2026-04-22T09:30:00.000Z",
  "endAt": "2026-04-22T10:00:00.000Z",
  "description": "Call client"
}
```

---

## Optional split docs (if frontend wants module-wise)
- `Routes/request/REQUESTS_FRONTEND.md`
- `Routes/request/GROUP_BY_FRONTEND.md`
- `Routes/daybook/DAYBOOK_GET_FRONTEND.md`
- `Routes/daybook/DAYBOOK_OUTFLOW_FRONTEND.md`
- `Routes/ClientsBookings/EVENTS_LIST_FRONTEND.md`
- `Routes/ClientsBookings/BALANCE_SHEET_FRONTEND.md`
- `Routes/MarketingTarget/FRONTEND.md`
- `Routes/PersonalCalendar/FRONTEND.md`
