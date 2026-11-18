# Client Leads — Estimated Budget & Marketing Conversion

Base URL: `${API_BASE_URL}client-leads`

Used by Marketing Track Leads (`ClientLeadsTrack`):
- **Estimated Budget** card = sum of `estimatedBudget` where `convertedByMarketing !== true`
- **Successfully Converted** card = sum of `estimatedBudget` where `convertedByMarketing === true`

Conversion is **independent of** `status` (`Inprogress` / `Confirmed` / `Cancelled`).

---

## Fields

| Field | Type | Notes |
|---|---|---|
| `estimatedBudget` | number ≥ 0 | Whole rupees. Kept after conversion (never zeroed by conversion). Omit on create → `0`. |
| `convertedByMarketing` | boolean | Default `false`. When `true`, amount counts only in Converted card. |
| `convertedAt` | ISO datetime \| null | Set when flag becomes `true`; cleared to `null` when unchecked. Audit only. |

Existing fields unchanged: `status`, `clientDetails`, `eventTypeDetails`, `notes`, `assignedTo`, `startDate`, `endDate`.

---

## GET `/client-leads`

### Query params
| Name | Type | Notes |
|---|---|---|
| `status` | string | `Inprogress` \| `Confirmed` \| `Cancelled` |
| `assignedTo` | string | Coordinator ObjectId |
| `startDate` | `YYYY-MM-DD` | Inclusive lower bound on lead `startDate` |
| `endDate` | `YYYY-MM-DD` | Inclusive upper bound on lead `startDate` |
| `month` | `YYYY-MM` | Shorthand for month range. If both `month` and explicit dates are sent, **explicit range wins**. |

When a date filter (`month` or `startDate`/`endDate`) is active, leads **without** `startDate` are excluded from `data` and `summary`.

### Examples
```
GET /client-leads?month=2026-08&status=Inprogress
GET /client-leads?startDate=2026-08-01&endDate=2026-08-31
Authorization: <jwt>
```

### Response
```json
{
  "message": "Success",
  "data": [
    {
      "_id": "...",
      "status": "Inprogress",
      "estimatedBudget": 500000,
      "convertedByMarketing": false,
      "convertedAt": null,
      "startDate": "2026-08-15T00:00:00.000Z",
      "assignedTo": { "_id": "...", "name": "..." }
    }
  ],
  "count": 1,
  "summary": {
    "totalEstimatedBudget": 1200000,
    "totalConvertedBudget": 800000,
    "estimatedLeadsCount": 3,
    "convertedLeadsCount": 2
  }
}
```

`summary` uses the **same filters** as `data`.

---

## POST `/client-leads`

```json
{
  "status": "Inprogress",
  "clientDetails": "...",
  "eventTypeDetails": "...",
  "notes": "...",
  "assignedTo": "696f832492c5abff543b25bc",
  "startDate": "2026-08-15",
  "endDate": "2026-08-17",
  "estimatedBudget": 500000,
  "convertedByMarketing": false,
  "convertedAt": null
}
```

---

## PUT `/client-leads/:id`

Mark converted (do **not** clear budget):
```json
{
  "estimatedBudget": 500000,
  "convertedByMarketing": true,
  "convertedAt": "2026-08-10T09:30:00.000Z"
}
```

If `convertedByMarketing: true` and `convertedAt` omitted → server sets `convertedAt` to now.

Uncheck conversion:
```json
{
  "convertedByMarketing": false,
  "convertedAt": null
}
```

---

## Validation
- `estimatedBudget` number ≥ 0 when provided
- `convertedByMarketing` must be boolean when provided
- `convertedByMarketing: false` always forces `convertedAt: null`
