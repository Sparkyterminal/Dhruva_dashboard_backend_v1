# Event Booking Payload Examples

These are example payloads for the event booking API. Share these with your backend developer to redesign the schema accordingly.

## Flow & Calculation Logic:

```
USER INPUT (UI)
├─ agreedAmount: 20,000 (user enters)
├─ accountAmount: 10,000 (user enters)
├─ venueLocation: venue_001 (user selects)
├─ subVenueLocation: sub_venue_005 or null (optional, user selects)
└─ advances with: givenBy, collectedBy, modeOfPayment (cash/account)

FRONTEND AUTO-CALCULATION
├─ accountGst = accountAmount × 0.18 = 10,000 × 0.18 = 1,800
├─ accountAmountWithGst = accountAmount + accountGst = 10,000 + 1,800 = 11,800
├─ cashAmount = agreedAmount - accountAmount = 20,000 - 10,000 = 10,000
└─ totalPayable = accountAmountWithGst + cashAmount = 11,800 + 10,000 = 21,800

STORE IN DATABASE
├─ agreedAmount: 20,000
├─ accountAmount: 10,000
├─ accountGst: 1,800
├─ accountAmountWithGst: 11,800
├─ cashAmount: 10,000
├─ totalPayable: 21,800
├─ venueLocation: venue_001
├─ subVenueLocation: sub_venue_005 or null
└─ advances: [{ amount, date, givenBy, collectedBy, modeOfPayment, ... }]
```

**KEY POINTS:**

- All 6 amount fields should be stored in database
- `subVenueLocation` is optional - send `null` if not selected
- Each advance needs: `givenBy`, `collectedBy`, and `modeOfPayment` (cash or account)

---

## 1. Wedding - Common Package Mode (Single Advance for All Events)

**Scenario:** Wedding event with multiple event types (Mehendi, Sangeet, Shaadi, Reception) but using a **Complete Package** advance payment approach - one shared advance payment schedule for all event types.

```json
{
  "eventId": "evt_001",
  "eventName": "Sharma Wedding 2024",
  "clientName": "Rajesh Sharma",
  "contactNumber": "9876543210",
  "altContactNumber": "9876543211",
  "altContactName": "Priya Sharma",
  "lead1": "coord_001",
  "lead2": "coord_002",
  "brideName": "Neha Sharma",
  "groomName": "Vikram Patel",
  "note": "Bride prefers pink theme, groom wants Bollywood music, budget constraint on flowers",
  "eventTypes": [
    {
      "eventTypeId": "et_001",
      "eventType": "Mehendi",
      "startDate": "2025-03-15T18:00:00.000Z",
      "endDate": "2025-03-15T22:30:00.000Z",
      "venueLocation": "venue_001",
      "subVenueLocation": "sub_venue_001",
      "agreedAmount": 200000,
      "accountAmount": 100000,
      "accountGst": 18000,
      "accountAmountWithGst": 118000,
      "cashAmount": 100000,
      "totalPayable": 218000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Initial booking confirmation",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-20T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Second installment",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 3,
          "expectedAmount": 100000,
          "advanceDate": "2025-03-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before event",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_002",
      "eventType": "Sangeet",
      "startDate": "2025-03-16T18:00:00.000Z",
      "endDate": "2025-03-16T23:00:00.000Z",
      "venueLocation": "venue_001",
      "subVenueLocation": null,
      "agreedAmount": 200000,
      "accountAmount": 100000,
      "accountGst": 18000,
      "accountAmountWithGst": 118000,
      "cashAmount": 100000,
      "totalPayable": 218000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Initial booking confirmation",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-20T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Second installment",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 3,
          "expectedAmount": 100000,
          "advanceDate": "2025-03-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before event",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_003",
      "eventType": "Shaadi",
      "startDate": "2025-03-17T16:00:00.000Z",
      "endDate": "2025-03-18T02:00:00.000Z",
      "venueLocation": "venue_002",
      "subVenueLocation": "sub_venue_002",
      "agreedAmount": 400000,
      "accountAmount": 200000,
      "accountGst": 36000,
      "accountAmountWithGst": 236000,
      "cashAmount": 200000,
      "totalPayable": 436000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Initial booking confirmation",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-20T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Second installment",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 3,
          "expectedAmount": 100000,
          "advanceDate": "2025-03-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before event",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_004",
      "eventType": "Reception",
      "startDate": "2025-03-18T19:00:00.000Z",
      "endDate": "2025-03-19T01:00:00.000Z",
      "venueLocation": "venue_003",
      "subVenueLocation": null,
      "agreedAmount": 300000,
      "accountAmount": 150000,
      "accountGst": 27000,
      "accountAmountWithGst": 177000,
      "cashAmount": 150000,
      "totalPayable": 327000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Initial booking confirmation",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 100000,
          "advanceDate": "2025-02-20T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Second installment",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 3,
          "expectedAmount": 100000,
          "advanceDate": "2025-03-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before event",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    }
  ]
}
```

---

## 2. Wedding - Event-Specific Package Mode (Separate Advances per Event Type)

**Scenario:** Wedding event with multiple event types, but each event type has its **own separate advance payment schedule**.

```json
{
  "eventId": "evt_002",
  "eventName": "Gupta Wedding 2024",
  "clientName": "Amit Gupta",
  "contactNumber": "9123456789",
  "altContactNumber": "9123456788",
  "altContactName": "Sneha Gupta",
  "lead1": "coord_002",
  "lead2": "coord_003",
  "brideName": "Anjali Verma",
  "groomName": "Rohit Gupta",
  "note": "Premium wedding with gold theme, live band required for reception",
  "eventTypes": [
    {
      "eventTypeId": "et_001",
      "eventType": "Mehendi",
      "startDate": "2025-04-10T18:00:00.000Z",
      "endDate": "2025-04-10T23:00:00.000Z",
      "venueLocation": "venue_004",
      "subVenueLocation": null,
      "agreedAmount": 200000,
      "accountAmount": 100000,
      "accountGst": 18000,
      "accountAmountWithGst": 118000,
      "cashAmount": 100000,
      "totalPayable": 218000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 125000,
          "advanceDate": "2025-03-10T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Mehendi event booking",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 125000,
          "advanceDate": "2025-04-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before Mehendi",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_002",
      "eventType": "Sangeet",
      "startDate": "2025-04-11T19:00:00.000Z",
      "endDate": "2025-04-12T02:00:00.000Z",
      "venueLocation": "venue_004",
      "subVenueLocation": "sub_venue_003",
      "agreedAmount": 300000,
      "accountAmount": 150000,
      "accountGst": 27000,
      "accountAmountWithGst": 177000,
      "cashAmount": 150000,
      "totalPayable": 327000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 175000,
          "advanceDate": "2025-03-10T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Sangeet event booking",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 175000,
          "advanceDate": "2025-04-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before Sangeet",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_003",
      "eventType": "Shaadi",
      "startDate": "2025-04-12T15:00:00.000Z",
      "endDate": "2025-04-13T03:00:00.000Z",
      "venueLocation": "venue_005",
      "subVenueLocation": "sub_venue_004",
      "agreedAmount": 500000,
      "accountAmount": 250000,
      "accountGst": 45000,
      "accountAmountWithGst": 295000,
      "cashAmount": 250000,
      "totalPayable": 545000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 200000,
          "advanceDate": "2025-03-10T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Shaadi event booking",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 200000,
          "advanceDate": "2025-03-25T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Mid-payment",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 3,
          "expectedAmount": 200000,
          "advanceDate": "2025-04-05T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before Shaadi",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    },
    {
      "eventTypeId": "et_004",
      "eventType": "Reception",
      "startDate": "2025-04-13T18:00:00.000Z",
      "endDate": "2025-04-14T00:00:00.000Z",
      "venueLocation": "venue_006",
      "subVenueLocation": null,
      "agreedAmount": 350000,
      "accountAmount": 180000,
      "accountGst": 32400,
      "accountAmountWithGst": 212400,
      "cashAmount": 170000,
      "totalPayable": 382400,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 225000,
          "advanceDate": "2025-03-10T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Reception event booking",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 225000,
          "advanceDate": "2025-04-01T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment before Reception",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    }
  ]
}
```

---

## 3. Other Event - Single Event Type (No Event Type Structure)

**Scenario:** Corporate event (Conference/Product Launch) with a single event, no multiple event types.

```json
{
  "eventId": "evt_003",
  "eventName": "TechStart India Conference 2025",
  "clientName": "Priya Innovations Ltd",
  "contactNumber": "9988776655",
  "lead1": "coord_004",
  "lead2": null,
  "eventTypes": [
    {
      "eventTypeId": null,
      "eventType": null,
      "startDate": "2025-05-20T09:00:00.000Z",
      "endDate": "2025-05-20T17:30:00.000Z",
      "venueLocation": "venue_007",
      "subVenueLocation": null,
      "agreedAmount": 400000,
      "accountAmount": 300000,
      "accountGst": 54000,
      "accountAmountWithGst": 354000,
      "cashAmount": 100000,
      "totalPayable": 454000,
      "advances": [
        {
          "advanceNumber": 1,
          "expectedAmount": 250000,
          "advanceDate": "2025-04-20T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Booking confirmation - 50%",
          "updatedBy": null,
          "updatedAt": null
        },
        {
          "advanceNumber": 2,
          "expectedAmount": 250000,
          "advanceDate": "2025-05-10T10:00:00.000Z",
          "receivedAmount": null,
          "receivedDate": null,
          "givenBy": null,
          "collectedBy": null,
          "modeOfPayment": null,
          "remarks": "Final payment - 50%",
          "updatedBy": null,
          "updatedAt": null
        }
      ]
    }
  ]
}
```

---

## 4. Calculation Example: Step-by-Step Breakdown

**User Input on Frontend:**

- `agreedAmount = 20,000` (Client & Company agree on this total)
- `accountAmount = 10,000` (Amount to be paid via bank)

**Frontend Auto-Calculates:**

- `accountGst = 10,000 × 0.18 = 1,800`
- `accountAmountWithGst = 10,000 + 1,800 = 11,800`
- `cashAmount = 20,000 - 10,000 = 10,000`
- `totalPayable = 11,800 + 10,000 = 21,800`

**Send to Backend (and Store All):**

```json
{
  "agreedAmount": 20000,
  "accountAmount": 10000,
  "accountGst": 1800,
  "accountAmountWithGst": 11800,
  "cashAmount": 10000,
  "totalPayable": 21800,
  "venueLocation": "venue_001",
  "subVenueLocation": "sub_venue_001",
  "advances": [
    {
      "advanceNumber": 1,
      "expectedAmount": 10000,
      "advanceDate": "2025-02-01T10:00:00.000Z",
      "receivedAmount": null,
      "receivedDate": null,
      "givenBy": "Rajesh Sharma",
      "collectedBy": "Priya Sharma",
      "modeOfPayment": "cash",
      "remarks": "Initial payment",
      "updatedBy": null,
      "updatedAt": null
    },
    {
      "advanceNumber": 2,
      "expectedAmount": 11800,
      "advanceDate": "2025-02-15T10:00:00.000Z",
      "receivedAmount": null,
      "receivedDate": null,
      "givenBy": "Rajesh Sharma",
      "collectedBy": "Project Lead",
      "modeOfPayment": "account",
      "remarks": "Final payment",
      "updatedBy": null,
      "updatedAt": null
    }
  ]
}
```

**What Each Field Means:**

- `agreedAmount`: Total amount agreed between client & company
- `accountAmount`: Portion to be received via bank transfer
- `accountGst`: 18% GST on the bank transfer portion
- `accountAmountWithGst`: What company actually receives from bank (account + GST)
- `cashAmount`: Portion to be received in cash (auto-calculated: agreed - account)
- `totalPayable`: Total client needs to pay (accountWithGst + cash)

---

## Schema Design Recommendations

### Key Fields to Store:

1. **Root Level:**

   - `eventId` - Reference to event master
   - `eventName` - Name of the event
   - `clientName` - Client details
   - `contactNumber` - Primary contact
   - `altContactNumber` / `altContactName` - Alternative contact
   - `lead1` / `lead2` - Assigned coordinators
   - `brideName` / `groomName` / `note` - Wedding-specific (conditional)

2. **Event Types Array:**

   - Each event can have multiple event types (for weddings) or just one (for other events)
   - `eventTypeId` - Reference to event type master (null for single-event bookings)
   - `eventType` - Name of the event type (null for single-event bookings)
   - `startDate` / `endDate` - ISO 8601 format
   - `venueLocation` - Reference to venue
   - `subVenueLocation` - Reference to sub-venue OR null if not applicable

3. **Agreed Amount & Breakup (All 6 Fields to Store):**

   - `agreedAmount` - Total amount client will pay (user input)
   - `accountAmount` - Amount via bank transfer (user input)
   - `accountGst` - Calculated 18% GST on account amount (18% of accountAmount)
   - `accountAmountWithGst` - Account amount + GST (accountAmount + accountGst)
   - `cashAmount` - Amount in cash (auto-calculated: agreedAmount - accountAmount)
   - `totalPayable` - Total client must pay (accountAmountWithGst + cashAmount)

4. **Advances Array (Per Event Type or Shared):**
   - `advanceNumber` - Sequence number
   - `expectedAmount` - Amount expected to be paid
   - `advanceDate` - Expected payment date (ISO 8601)
   - `receivedAmount` - Amount actually received (null until payment received)
   - `receivedDate` - Actual payment date (null until payment received)
   - `givenBy` - Name/ID of person giving the payment (client/representative)
   - `collectedBy` - Name/ID of person collecting the payment (your staff)
   - `modeOfPayment` - Payment method: "cash" or "account"
   - `remarks` - Notes/description
   - `updatedBy` - Last updated by user ID (null initially)
   - `updatedAt` - Last updated timestamp (null initially)

### Database Indexes to Consider:

- `eventId` + `eventName` (for searching events)
- `clientName` + `contactNumber` (for client lookup)
- `lead1` / `lead2` (for coordinator workload tracking)
- `startDate` (for event scheduling queries)
- `advances.advanceDate` (for payment tracking dashboard)

---

## Notes for Backend:

1. **Wedding Detection:** Client uses string matching on `eventName` containing "wedding" (case-insensitive)

2. **Amount Fields - Store All 6 in Database:**

   - `agreedAmount` - Total agreed between client & company (user input)
   - `accountAmount` - Amount via bank transfer (user input)
   - `accountGst` - Calculated as: accountAmount × 0.18
   - `accountAmountWithGst` - Calculated as: accountAmount + accountGst
   - `cashAmount` - Calculated as: agreedAmount - accountAmount
   - `totalPayable` - Calculated as: accountAmountWithGst + cashAmount

3. **Validation Rules:**

   - `agreedAmount` must be > 0
   - `accountAmount` must be > 0 and ≤ agreedAmount
   - `accountGst` will always be 18% of accountAmount
   - `cashAmount` must equal (agreedAmount - accountAmount)
   - `totalPayable` must equal (accountAmountWithGst + cashAmount)

4. **Advance Mode:**

   - **Complete Package Mode:** All event types in a wedding share identical advance schedules
   - **Separate Mode:** Each event type has its own unique advance schedule

5. **Null Handling:**

   - `lead2`, `altContactNumber`, `altContactName`, `brideName`, `groomName`, `note` can be null
   - `eventTypeId` and `eventType` are null only for single-event bookings
   - `subVenueLocation` is null when no sub-venue is selected
   - `receivedAmount`, `receivedDate`, `updatedBy`, `updatedAt` are null until payment is received
   - `givenBy`, `collectedBy`, `modeOfPayment` can be null until payment is actually received

6. **Advance Payment Tracking:**

   - `givenBy`: Name or ID of who gave the payment (e.g., "Rajesh Sharma" or "client_123")
   - `collectedBy`: Name or ID of who collected it (e.g., "Project Manager" or "staff_456")
   - `modeOfPayment`: Either "cash" or "account" (string)
   - These three fields help track who paid what, how, and who received it

7. **Data Types:**

   - All amounts: integers (in rupees, no decimals)
   - Timestamps: ISO 8601 format (UTC timezone)
   - String fields: UTF-8 encoded
   - `modeOfPayment`: Enum - "cash" or "account" (lowercase)
   - `givenBy` / `collectedBy`: String (name or ID)

8. **Backend Calculation Flow:**

   - Accept `agreedAmount` and `accountAmount` from frontend
   - Calculate the other 4 amount fields using the formulas above
   - Validate all calculations
   - Store all 6 amount fields in database
   - Store venue and sub-venue location references
   - Store all advance records with payment tracking fields (givenBy, collectedBy, modeOfPayment)

9. **Validation for Advances:**
   - `modeOfPayment` must be either "cash" or "account" (case-insensitive, convert to lowercase)
   - `expectedAmount` must be > 0
   - `givenBy` and `collectedBy` should not be empty strings (null is OK)
   - If `modeOfPayment` is "account", `expectedAmount` should not exceed accountAmountWithGst
   - If `modeOfPayment` is "cash", `expectedAmount` should not exceed cashAmount
