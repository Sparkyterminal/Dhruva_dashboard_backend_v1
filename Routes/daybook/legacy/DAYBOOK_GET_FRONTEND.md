> **LEGACY, superseded by `Routes/daybook/DAYBOOK_V2_CONTRACT.md`. Do not implement.**

# Daybook GET API — Frontend

> Prefer **`DAYBOOK_CLASSIC_API_CONTRACT.md`** as the full backend schema & API contract for classic Daybook.

Base URL: `${API_BASE_URL}daybook`

## Endpoint
`GET /daybook?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=200`

## Query params
- `startDate` (required)
- `endDate` (required)
- `limit` (optional, default 200)
- `includeEventAdvances` (optional, default true)

## Inflow behavior
- Includes manual inflows and (optionally) event advances by received date.
- Event advance date matching uses IST day boundaries converted to UTC.
- `receivedDate` is returned in ISO datetime format.

## Response blocks
- `inflow` (count, total, data)
- `outflow` (count, total, data)
- `profitAndLoss`
- `accounts.openCloseBalances`
