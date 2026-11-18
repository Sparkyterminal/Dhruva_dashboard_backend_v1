# Daybook Outflow Columns — Frontend

Endpoint source: `GET /daybook`

`outflow.data[]` includes:
```json
{
  "_id": "string",
  "requestId": "string",
  "purpose": "string",
  "amountPaid": 0,
  "amountPaidTo": "string",
  "entityAccount": "string",
  "status": "string",
  "requiredDate": "ISO datetime|null",
  "paidAt": "ISO datetime",
  "groupBy": { "_id": "string", "name": "string" },
  "note": "string",
  "remarks": "string",
  "vendor": "object|null",
  "eventReference": "object|string|null"
}
```

Defaults when missing:
- `groupBy: null`
- `note: ""`
- `remarks: ""`
