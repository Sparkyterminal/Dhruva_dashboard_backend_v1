# Marketing Targets API (team-wise monthly target)

Base URL: `${API_BASE_URL}marketing-targets`

Collection stores one record per **team + month**.

- `teamName` (string)
- `month` (`YYYY-MM`)
- `targetAmount` (number >= 0)
- `note` (optional text)

Unique key: `(teamName, month)`.

---

## 1) Create target

`POST /marketing-targets`

Auth: required

Body:
```json
{
  "teamName": "Digital Marketing",
  "month": "2026-04",
  "targetAmount": 250,
  "note": "Monthly qualified-leads target"
}
```

Response `201`:
```json
{
  "message": "Target created",
  "item": {
    "id": "...",
    "teamName": "Digital Marketing",
    "month": "2026-04",
    "targetAmount": 250,
    "note": "Monthly qualified-leads target"
  }
}
```

Errors:
- `400` invalid body (`teamName`, `month`, `targetAmount`)
- `409` duplicate team+month

---

## 2) List targets

`GET /marketing-targets`

Auth: required

Optional query:
- `month=YYYY-MM`
- `teamName=<text>` (case-insensitive contains)

Response `200`:
```json
{
  "count": 2,
  "monthlyTotalTargetAmount": 500,
  "items": [
    {
      "id": "...",
      "teamName": "Digital Marketing",
      "month": "2026-04",
      "targetAmount": 250,
      "note": "..."
    }
  ]
}
```

---

## 3) Delete target

`DELETE /marketing-targets/:id`

Auth: required

Response `200`:
```json
{
  "message": "Target deleted",
  "id": "..."
}
```

Errors:
- `400` invalid id
- `404` not found
