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


## Added 2026-11-21 (all optional; existing calls are unchanged)

These apply to `GET /events` and `GET /events/my-events`.

### Event-date order: `sort=eventDate`
- **Order:** upcoming or happening-now bookings first (nearest first), then completed ones (most recent first), then bookings with no date. Ties are broken by `clientName` A–Z, then `_id`. The order is stable across `page`/`limit`.
- **Primary event date:** the earliest ceremony whose end day (`endDate`, else `startDate`) is today or later; otherwise the latest ceremony. "Today" is the IST day.
- **Unchanged:** all filters, `totalsByStatus` and `summary` are the same as without `sort`. Without `sort` the order is still newest created first.
- **Invalid value:** `sort` other than `eventDate` → `400`.

### `primaryEventDate` on every row
ISO timestamp of the primary ceremony's `startDate` (the rule above), or `null`. Also on `GET /events/:eventId`.

### `advances[].state` on every advance
Derived from the amounts; the saved `status` text is ignored.
- `received`: `receivedAmount > 0` and `>= expectedAmount`
- `partial`: `receivedAmount > 0` but below `expectedAmount`
- `pending`: nothing received

Also on `GET /events/:eventId`.

### `advanceFrom` / `advanceTo`
`YYYY-MM-DD`, inclusive IST days. Keeps only bookings with at least one advance whose `advanceDate` is in the range (`advanceDate` itself is still the full ISO timestamp). Like the other filters it also applies to `totalsByStatus`. An invalid date or `from > to` → `400`.

### Filter aliases
`venueId` and `subVenueId` are accepted as aliases of `venue` and `subVenue`.
