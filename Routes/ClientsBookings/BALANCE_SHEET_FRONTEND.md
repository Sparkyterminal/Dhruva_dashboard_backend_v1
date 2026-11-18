# Events Balance Sheet API — Frontend

Base URL: `${API_BASE_URL}events`

## Endpoint
`GET /events/balance-sheet`

Scope: only confirmed bookings.

## Query params
- `page`, `limit`
- `startDate`, `endDate`
- `search`
- `eventName`
- `venue` / `venueLocation`
- `subVenue` / `subVenueLocation`

## Formula
- `payableAmount` = booking payable
- `receivedAmount` = sum of advances received
- `balanceAmount` = payable - received

## Response (key)
- `summary.totalPayableAmount`
- `summary.totalReceivedAmount`
- `summary.totalBalanceAmount`
- `events[]` rows with payable/received/balance
