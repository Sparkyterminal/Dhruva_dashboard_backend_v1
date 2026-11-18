# Events List API — Frontend

Base URL: `${API_BASE_URL}events`

## Endpoint
`GET /events`

## Query params
- `page`, `limit`
- `status` / `eventConfirmation`
- `eventName`
- `startDate`, `endDate`
- `venue` / `venueLocation`
- `subVenue` / `subVenueLocation`

## totalsByStatus
Returned as:
- `all`
- `confirmed`
- `pending`
- `inprogress` (same as pending)
- `cancelled`

### all
- `totalExpectedAmount`
- `totalBookingsNumber`
- `confirmedTotalExpectedAmount`
- `confirmedTotalBookingsNumber`
- `pendingTotalExpectedAmount`
- `pendingTotalBookingsNumber`

### confirmed
- `totalExpectedAmount`
- `totalBookingsNumber`
- `totalReceivedAmount`
- `bookingsWithAnyReceiptCount`
- `totalBalanceAmount`
- `bookingsWithOutstandingBalanceCount`

### pending / inprogress
- `totalBookingsNumber`
- `totalExpectedAmount`

### cancelled
- `totalBookingsNumber`
- `totalExpectedAmount`
