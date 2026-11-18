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
