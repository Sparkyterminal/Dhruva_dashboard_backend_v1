# Request GroupBy Master API — Frontend

Base URL: `${API_BASE_URL}request`

`groupBy` is a separate master collection with only `name`.

## 1) List groups
`GET /request/group-by`

Response:
```json
{
  "items": [
    { "_id": "...", "id": "...", "name": "Catering", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

## 2) Create group
`POST /request/group-by`

Body:
```json
{ "name": "Catering" }
```

Responses:
- `201` created
- `409` duplicate name

## 3) Delete group
`DELETE /request/group-by/:id`

Responses:
- `200` deleted
- `409` if requests still reference that group
- `404` if group not found
