# Personal Calendar API (per individual)

Base URL: `${API_BASE_URL}personal-calendar`

This API is user-specific. Each logged-in user sees and manages only their own entries.

Categories (exact values):
- `TODO_LIST`
- `PROBLEM_RESOLVES`
- `GENERAL_MEETING_NOTES`

---

## 1) Create entry

`POST /personal-calendar`

Auth: required

Body:
```json
{
  "title": "Follow up with client",
  "category": "TODO_LIST",
  "startAt": "2026-04-22T09:30:00.000Z",
  "endAt": "2026-04-22T10:00:00.000Z",
  "description": "Call and confirm agenda"
}
```

Required:
- `title`
- `category`
- `startAt`

Optional:
- `endAt` (must be >= startAt when sent)
- `description`

Response `201`:
```json
{
  "message": "Calendar entry created",
  "item": {
    "id": "...",
    "title": "Follow up with client",
    "category": "TODO_LIST",
    "startAt": "2026-04-22T09:30:00.000Z",
    "endAt": "2026-04-22T10:00:00.000Z",
    "description": "Call and confirm agenda"
  }
}
```

---

## 2) List my entries

`GET /personal-calendar`

Auth: required

Optional query:
- `category=TODO_LIST|PROBLEM_RESOLVES|GENERAL_MEETING_NOTES`
- `from=<datetime ISO>`
- `to=<datetime ISO>`

Response `200`:
```json
{
  "count": 3,
  "items": [
    {
      "id": "...",
      "title": "General sync",
      "category": "GENERAL_MEETING_NOTES",
      "startAt": "2026-04-22T12:00:00.000Z",
      "endAt": null,
      "description": "Team notes"
    }
  ]
}
```

---

## 3) Delete my entry

`DELETE /personal-calendar/:id`

Auth: required

Deletes only if the entry belongs to current user.

Response `200`:
```json
{
  "message": "Calendar entry deleted",
  "id": "..."
}
```

Errors:
- `400` invalid id
- `404` not found / not owned by user
