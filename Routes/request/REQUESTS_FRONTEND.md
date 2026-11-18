# Requirements (Requests) API — Frontend

Base URL: `${API_BASE_URL}request`

## Create request
`POST /request`

Body (key fields):
```json
{
  "purpose": "string",
  "required_date": "2026-04-26",
  "amount": 25000,
  "priority": "HIGH",
  "transation_in": "ACCOUNT",
  "note": "string",
  "remarks": "string",
  "groupBy": "<RequestGroupById>",
  "vendor": "<vendorId>",
  "event_reference": "<eventId>"
}
```

- `remarks`: optional text area field
- `groupBy`: optional ObjectId (alias also supported: `groupby`)

## Update request
`PATCH /request/:id`

You can update:
- workflow fields (status/amounts/etc)
- `remarks`
- `groupBy` / `groupby`

To clear group:
```json
{ "groupBy": null }
```

## List requests
- `GET /request`
- `GET /request/all`

Optional filter:
- `groupBy=<id>` or `groupby=<id>`

Response request items may include:
```json
"groupBy": { "_id": "...", "name": "Catering" }
```

## Get single request
- `GET /request/:id`
- `GET /request/my-requests/:id`

`groupBy` is populated when present.

## CA bulk approve / reject
`PATCH /request/ca-check/bulk` (JWT, **CA role only**; other roles get `401`)

```json
{ "ids": ["674a…", "674b…"], "ca_check": "APPROVED" }
```
`ca_check` is `APPROVED` or `REJECTED`. `ids` must be a non-empty array with **at most 200** entries, otherwise the API returns `400`. Duplicate ids are processed once.

Response `200` (always a per-id result; one bad id never fails the call):
```json
{ "updated": ["674a…"], "failed": [{ "id": "674b…", "message": "Not found" }] }
```
`failed[].message` is one of `Not found`, `Invalid id`, `Not pending (ca_check is APPROVED)`, `Update failed`. Both lists keep the order of `ids`.

Each id is updated exactly like `PATCH /request/:id` with `{ ca_approved: true|false }` from a CA: `ca_check`, `ca_approved`, `ca_approved_by` (the caller), `ca_approved_at`, `status` (`APPROVED` / `REJECTED`) and `handled_by`. **Only requests whose `ca_check` is currently `PENDING` change**; the rest are listed in `failed`. Each id is atomic on its own; the call as a whole is not all-or-nothing.
