const jwt = require('jsonwebtoken');
const Event = require("../../Modals/ClientsBookings");
const EventName = require("../../Modals/events");
const EventTypeModel = require("../../Modals/eventTypes");
const Coordinator = require("../../Modals/Coordinators");
const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const mongoose = require("mongoose");
const BudgetReport = require("../../Modals/BudgetReport");
const { populateEventAndVendorsPipeline } = require("../BudgetReport");
const Request = require("../../Modals/Request");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aggregation $match uses raw BSON — unlike find(), it will not cast string user ids to ObjectId.
 */
function toObjectIdForMatch(id) {
  if (id == null) return id;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
  return id;
}

/**
 * Latest populated budget report per event + count of reports per event.
 * Populated shape matches GET /api/budget-report/:id (populateEventAndVendorsPipeline).
 */
async function fetchBudgetReportMapsForEventIds(eventIds) {
  const byEventId = new Map();
  const counts = new Map();

  const oidList = [];
  const seen = new Set();
  for (const id of eventIds || []) {
    if (id == null) continue;
    const oid = toObjectIdForMatch(id);
    if (!(oid instanceof mongoose.Types.ObjectId)) continue;
    const key = String(oid);
    if (seen.has(key)) continue;
    seen.add(key);
    oidList.push(oid);
  }

  if (!oidList.length) {
    return { byEventId, counts };
  }

  try {
    const [countRows, latestRows] = await Promise.all([
      BudgetReport.aggregate([
        { $match: { eventId: { $in: oidList } } },
        { $group: { _id: '$eventId', count: { $sum: 1 } } },
      ]).option({ maxTimeMS: 20000 }),
      BudgetReport.aggregate([
        { $match: { eventId: { $in: oidList } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$eventId', latestId: { $first: '$_id' } } },
      ]).option({ maxTimeMS: 20000 }),
    ]);

    for (const r of countRows) {
      if (r._id) counts.set(String(r._id), r.count);
    }

    const latestIds = latestRows.map((r) => r.latestId).filter(Boolean);
    if (!latestIds.length) {
      return { byEventId, counts };
    }

    const populated = await BudgetReport.aggregate([
      { $match: { _id: { $in: latestIds } } },
      ...populateEventAndVendorsPipeline(),
    ]).option({ maxTimeMS: 25000 });

    for (const doc of populated) {
      const ev = doc.eventId;
      const key = ev && ev._id != null ? String(ev._id) : null;
      if (key) byEventId.set(key, doc);
    }
  } catch (err) {
    console.error('fetchBudgetReportMapsForEventIds:', err);
  }

  return { byEventId, counts };
}

function mergeBudgetIntoEventRows(events) {
  if (!events || !events.length) return Promise.resolve(events);
  return fetchBudgetReportMapsForEventIds(events.map((e) => e._id)).then(
    ({ byEventId, counts }) =>
      events.map((ev) => ({
        ...ev,
        budgetReport: byEventId.get(String(ev._id)) || null,
        budgetReportsCount: counts.get(String(ev._id)) || 0,
      }))
  );
}

/** Maps frontend status query to Event.eventConfirmation enum */
function mapStatusToEventConfirmation(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  const map = {
    confirmed: 'Confirmed Event',
    inprogress: 'InProgress',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
  };
  return map[s] || null;
}

/** Sums expected/received across all eventTypes[].advances[] */
function computeAdvanceTotals(eventDoc) {
  let totalExpectedAdvance = 0;
  let totalReceivedAmount = 0;
  let advanceEntriesCount = 0;
  const types = eventDoc.eventTypes || [];
  for (const et of types) {
    const advs = et.advances || [];
    for (const a of advs) {
      advanceEntriesCount += 1;
      const exp = Number(a.expectedAmount);
      totalExpectedAdvance += Number.isFinite(exp) ? exp : 0;
      const rec = Number(a.receivedAmount);
      totalReceivedAmount += Number.isFinite(rec) ? rec : 0;
    }
  }
  return {
    totalExpectedAdvance,
    totalReceivedAmount,
    pendingAdvanceAmount: totalExpectedAdvance - totalReceivedAmount,
    advanceEntriesCount,
  };
}

/**
 * advancePaymentType === 'complete' → use first eventTypes[] row only for the field;
 * otherwise ('separate' or unset) → sum the field across all eventTypes[]
 */
function computeSumFromEventTypesByAdvanceRule(doc, fieldKey) {
  const types = doc.eventTypes || [];
  if (!types.length) return 0;
  const pick = (t) => {
    const x = Number(t?.[fieldKey]);
    return Number.isFinite(x) ? x : 0;
  };
  if (doc.advancePaymentType === 'complete') {
    return pick(types[0]);
  }
  return types.reduce((sum, t) => sum + pick(t), 0);
}

/** Sum of totalPayable (complete vs separate rule) — used by leaderboard */
function computeBookingAmountFromEventTypes(doc) {
  return computeSumFromEventTypesByAdvanceRule(doc, 'totalPayable');
}

const AGG_MAX_MS = 25000;

/** Summary money fields are whole rupees (no paise / float noise in JSON). */
function roundRupee(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

/** All advances on all events matching `match` (same filters as list API) */
async function aggregateEventsAdvanceSummary(match) {
  const rows = await Event.aggregate([
    { $match: match },
    { $unwind: { path: '$eventTypes', preserveNullAndEmptyArrays: false } },
    { $unwind: { path: '$eventTypes.advances', preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: null,
        totalExpectedAdvance: {
          $sum: {
            $round: [
              {
                $convert: {
                  input: '$eventTypes.advances.expectedAmount',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
        totalReceivedAmount: {
          $sum: {
            $round: [
              {
                $convert: {
                  input: '$eventTypes.advances.receivedAmount',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
        totalAdvanceEntries: { $sum: 1 },
      },
    },
  ])
    .option({ maxTimeMS: AGG_MAX_MS })
    .exec();
  const r = rows[0] || {};
  const exp = roundRupee(r.totalExpectedAdvance);
  const rec = roundRupee(r.totalReceivedAmount);
  return {
    totalExpectedAdvance: exp,
    totalReceivedAmount: rec,
    totalPendingAdvance: roundRupee(exp - rec),
    totalAdvanceEntries: Number(r.totalAdvanceEntries) || 0,
  };
}

/**
 * Sum of totalPayable across all matching events.
 * advancePaymentType === 'complete' → first eventTypes[] only; else sum all eventTypes[].totalPayable
 */
async function aggregateEventsTotalPayableSummary(match) {
  const num = (fieldPath) => ({
    $convert: { input: fieldPath, to: 'double', onError: 0, onNull: 0 },
  });
  const rows = await Event.aggregate([
    { $match: match },
    {
      $addFields: {
        _payableRaw: {
          $cond: [
            { $eq: ['$advancePaymentType', 'complete'] },
            num({
              $let: {
                vars: { ft: { $arrayElemAt: ['$eventTypes', 0] } },
                in: '$$ft.totalPayable',
              },
            }),
            {
              $reduce: {
                input: { $ifNull: ['$eventTypes', []] },
                initialValue: 0,
                in: {
                  $add: [
                    '$$value',
                    num('$$this.totalPayable'),
                  ],
                },
              },
            },
          ],
        },
      },
    },
    {
      $addFields: {
        _payable: { $round: ['$_payableRaw', 0] },
      },
    },
    {
      $group: {
        _id: null,
        totalPayableSum: { $sum: '$_payable' },
      },
    },
  ])
    .option({ maxTimeMS: AGG_MAX_MS })
    .exec();
  const r = rows[0] || {};
  return {
    totalPayableSum: roundRupee(r.totalPayableSum),
  };
}

/**
 * Summary for ALL / CONFIRMED / INPROGRESS in one pass.
 * pending = totalPayableSum - totalReceivedAmount
 */
async function aggregateEventsPayableReceivedBookingsByStatus(match) {
  const num = (fieldPath) => ({
    $convert: { input: fieldPath, to: 'double', onError: 0, onNull: 0 },
  });

  const rows = await Event.aggregate([
    { $match: match },
    {
      $addFields: {
        _payableRaw: {
          $cond: [
            { $eq: ['$advancePaymentType', 'complete'] },
            num({
              $let: {
                vars: { ft: { $arrayElemAt: ['$eventTypes', 0] } },
                in: '$$ft.totalPayable',
              },
            }),
            {
              $reduce: {
                input: { $ifNull: ['$eventTypes', []] },
                initialValue: 0,
                in: {
                  $add: ['$$value', num('$$this.totalPayable')],
                },
              },
            },
          ],
        },
        _receivedRaw: {
          $reduce: {
            input: { $ifNull: ['$eventTypes', []] },
            initialValue: 0,
            in: {
              $add: [
                '$$value',
                {
                  $reduce: {
                    input: { $ifNull: ['$$this.advances', []] },
                    initialValue: 0,
                    in: {
                      $add: ['$$value', num('$$this.receivedAmount')],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        _payable: { $round: ['$_payableRaw', 0] },
        _received: { $round: ['$_receivedRaw', 0] },
      },
    },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalPayableSum: { $sum: '$_payable' },
              totalReceivedAmount: { $sum: '$_received' },
            },
          },
        ],
        byStatus: [
          {
            $group: {
              _id: { $ifNull: ['$eventConfirmation', '_none'] },
              totalBookings: { $sum: 1 },
              totalPayableSum: { $sum: '$_payable' },
              totalReceivedAmount: { $sum: '$_received' },
            },
          },
        ],
      },
    },
  ])
    .option({ maxTimeMS: AGG_MAX_MS })
    .exec();

  const root = rows[0] || {};
  const overall = (root.overall && root.overall[0]) || {};
  const byStatus = Array.isArray(root.byStatus) ? root.byStatus : [];
  const lookup = new Map(byStatus.map((r) => [String(r._id), r]));

  const asPayload = (row) => {
    const payable = roundRupee(row?.totalPayableSum);
    const received = roundRupee(row?.totalReceivedAmount);
    return {
      totalBookings: Number(row?.totalBookings) || 0,
      totalPayableSum: payable,
      totalReceivedAmount: received,
      totalPending: roundRupee(payable - received),
    };
  };

  return {
    all: asPayload(overall),
    confirmed: asPayload(lookup.get('Confirmed Event')),
    inprogress: asPayload(lookup.get('InProgress')),
  };
}

/** @returns {{ start: Date, end: Date, label: string } | { error: string }} — end is exclusive (UTC) */
function parseMonthRange(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') {
    return { error: 'month must be a string YYYY-MM' };
  }
  const trimmed = monthStr.trim();
  const m = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (!m) {
    return { error: 'Invalid month. Use YYYY-MM (e.g. 2026-03).' };
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) {
    return { error: 'Month must be between 01 and 12.' };
  }
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return {
    start,
    end,
    label: `${y}-${String(mo).padStart(2, '0')}`,
  };
}

function resolveLeaderboardMode(query) {
  const q = query || {};
  const b =
    q.mostbooked === 'true' ||
    q.mostBooked === 'true' ||
    ['mostbooked', 'bookings', 'count'].includes(
      String(q.mode || q.leaderboard || q.view || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
    );
  const a =
    q.mostamount === 'true' ||
    q.mostAmount === 'true' ||
    ['mostamount', 'mostamountbooked', 'amount'].includes(
      String(q.mode || q.leaderboard || q.view || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
    );
  if (b && a) return { error: 'Use only one of mostBooked or mostAmount' };
  if (b) return { mode: 'bookings' };
  if (a) return { mode: 'amount' };
  return { mode: null };
}

/** Competition ranking (1,1,3) by numeric key descending */
function assignRanksDesc(rows, valueKey) {
  const sorted = [...rows].sort((x, y) => y[valueKey] - x[valueKey]);
  let rank = 1;
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i][valueKey] !== sorted[i - 1][valueKey]) {
      rank = i + 1;
    }
    sorted[i].rank = rank;
  }
  return sorted;
}

const findEventTypeByIdentifier = (eventDoc, identifier) => {
  if (!identifier || !eventDoc || !Array.isArray(eventDoc.eventTypes)) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return eventDoc.eventTypes.id(identifier);
  }
  return eventDoc.eventTypes.find(et => et.eventType === identifier);
};

// Create new event with event types & advances
exports.createEvent = async (req, res) => {
  try {
    const token = req.get('Authorization');
    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const {
      eventId,
      eventTypes,
      clientName,
      brideName,
      groomName,
      contactNumber,
      altContactNumber,
      altContactName,
      meetingDate,
      lead1,
      lead2,
      note,
      eventConfirmation,
      advancePaymentType
    } = req.body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Valid eventId is required" });
    }

    const eventNameDoc = await EventName.findById(eventId);
    if (!eventNameDoc) {
      return res.status(404).json({ message: "Event not found for given eventId" });
    }

    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return res.status(400).json({ message: "clientName is required" });
    }

    if (!contactNumber || typeof contactNumber !== "string" || !contactNumber.trim()) {
      return res.status(400).json({ message: "contactNumber is required" });
    }

    const eventTypesData = [];

    const hasEventTypes = Array.isArray(eventTypes) && eventTypes.length > 0;

    if (hasEventTypes) {
      for (let index = 0; index < eventTypes.length; index++) {
        const type = eventTypes[index];

        // Resolve or create EventType master for this event (optional)
        let eventTypeDoc = null;
        let eventTypeId = type.eventTypeId || null;

        // Handle null values - if explicitly null, allow it
        if (type.eventTypeId === null || type.eventType === null) {
          eventTypeId = null;
        } else if (eventTypeId) {
          // If eventTypeId is provided and not null, validate and use it
          if (!mongoose.Types.ObjectId.isValid(eventTypeId)) {
            throw new Error(`eventTypes[${index}].eventTypeId must be a valid ID`);
          }
          eventTypeDoc = await EventTypeModel.findById(eventTypeId);
          if (!eventTypeDoc) {
            throw new Error(`eventTypes[${index}].eventTypeId does not reference a valid event type`);
          }
        } else if (type.eventType && typeof type.eventType === "string" && type.eventType.trim()) {
          // Fallback: use name + eventId to find or create the EventType master
          eventTypeDoc = await EventTypeModel.findOne({
            name: type.eventType.trim(),
            event: eventId,
          });
          if (!eventTypeDoc) {
            eventTypeDoc = await EventTypeModel.create({
              name: type.eventType.trim(),
              event: eventId,
            });
          }
          eventTypeId = eventTypeDoc._id;
        }
        // If both are null/undefined, eventTypeId remains null (allowed)

        if (!type.startDate) {
          throw new Error(`eventTypes[${index}].startDate is required`);
        }
        if (!type.endDate) {
          throw new Error(`eventTypes[${index}].endDate is required`);
        }

        // Validate coordinator if provided
        let coordinatorId = null;
        if (type.coordinator) {
          if (!mongoose.Types.ObjectId.isValid(type.coordinator)) {
            throw new Error(`eventTypes[${index}].coordinator must be a valid coordinator ID`);
          }
          const coordinatorExists = await Coordinator.findById(type.coordinator);
          if (!coordinatorExists || coordinatorExists.is_archived) {
            throw new Error(`eventTypes[${index}].coordinator references a coordinator that does not exist`);
          }
          coordinatorId = type.coordinator;
        }

        const advancesArray = Array.isArray(type.advances) ? type.advances : [];

        const advancesData = advancesArray.map((adv, advIndex) => {
          if (adv.expectedAmount == null) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].expectedAmount is required`);
          }
          if (!adv.advanceDate) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].advanceDate is required`);
          }

          const advanceNumber = adv.advanceNumber != null ? adv.advanceNumber : advIndex + 1;

          // Validate modeOfPayment if provided
          if (adv.modeOfPayment && !['cash', 'account'].includes(adv.modeOfPayment.toLowerCase())) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].modeOfPayment must be 'cash' or 'account'`);
          }

          return {
            advanceNumber,
            expectedAmount: adv.expectedAmount,
            advanceDate: new Date(adv.advanceDate),
            status: adv.status || "Pending",
            receivedAmount: adv.receivedAmount || null,
            receivedDate: adv.receivedDate ? new Date(adv.receivedDate) : null,
            givenBy: adv.givenBy || null,
            collectedBy: adv.collectedBy || null,
            modeOfPayment: adv.modeOfPayment ? adv.modeOfPayment.toLowerCase() : null,
            remarks: adv.remarks || "",
            updatedBy: adv.updatedBy || null,
            updatedAt: adv.updatedAt ? new Date(adv.updatedAt) : null
          };
        });

        // Handle amount fields - all 6 fields should be stored
        const agreedAmount = type.agreedAmount != null ? type.agreedAmount : undefined;
        const accountAmount = type.accountAmount != null ? type.accountAmount : 0;
        const accountGst = type.accountGst != null ? type.accountGst : 0;
        const accountAmountWithGst = type.accountAmountWithGst != null ? type.accountAmountWithGst : 0;
        const cashAmount = type.cashAmount != null ? type.cashAmount : 0;
        const totalPayable = type.totalPayable != null ? type.totalPayable : 0;

        eventTypesData.push({
          eventType: eventTypeId,
          startDate: new Date(type.startDate),
          endDate: new Date(type.endDate),
          venueLocation: type.venueLocation || null,
          subVenueLocation: type.subVenueLocation || null,
          coordinator: coordinatorId,
          agreedAmount: agreedAmount,
          accountAmount: accountAmount,
          accountGst: accountGst,
          accountAmountWithGst: accountAmountWithGst,
          cashAmount: cashAmount,
          totalPayable: totalPayable,
          advances: advancesData
        });
      }
    }

    const event = new Event({
      eventName: eventId,
      eventTypes: eventTypesData,
      clientName: clientName.trim(),
      brideName: brideName ? brideName.trim() : undefined,
      groomName: groomName ? groomName.trim() : undefined,
      meetingDate: meetingDate ? new Date(meetingDate) : null,
      lead1: lead1 || null,
      lead2: lead2 || null,
      contactNumber: contactNumber.trim(),
      altContactNumber: altContactNumber ? altContactNumber.trim() : undefined,
      altContactName: altContactName ? altContactName.trim() : undefined,
      note: note ? note.trim() : undefined,
      eventConfirmation: eventConfirmation || undefined,
      advancePaymentType: advancePaymentType || undefined,
      createdBy: decodedToken.uid
    });

    await event.save();
    
    // Populate eventName, eventType, leads, and venue details before returning
    await event.populate('eventName', 'id name');
    await event.populate('eventTypes.eventType', 'id name event');
    await event.populate('eventTypes.venueLocation', 'id name address city state');
    await event.populate('eventTypes.subVenueLocation', 'id name venue');
    await event.populate('eventTypes.coordinator', 'id name contact_number email');
    await event.populate('lead1', 'id name contact_number email');
    await event.populate('lead2', 'id name contact_number email');
    await event.populate('createdBy', 'id first_name last_name');
    
    res.status(201).json({ message: "Event created", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Update advance details by advanceNumber and role (DEPARTMENT / OWNER / APPROVER)
exports.updateAdvance = async (req, res) => {
  try {
    const { eventId, advanceNumber } = req.params;
    const { receivedAmount, remarks, receivedDate, userId } = req.body;
    const selectedEventType = req.query.eventType || req.body.eventType;
    const token = req.get('Authorization');
    if (!token) return res.status(401).json({ message: "Authorization token required" });

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const role = decodedToken.role.toUpperCase();
    const validRoles = ["DEPARTMENT", "OWNER", "APPROVER", "CA"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (receivedAmount == null && remarks == null && !receivedDate) {
      return res.status(400).json({ message: "At least one of receivedAmount, remarks or receivedDate required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const eventTypeDoc = selectedEventType
      ? findEventTypeByIdentifier(event, selectedEventType)
      : event.eventTypes.find(et => et.advances.some(a => a.advanceNumber === parseInt(advanceNumber, 10)));

    let advance;
    if (eventTypeDoc) {
      advance = eventTypeDoc.advances.find(a => a.advanceNumber === parseInt(advanceNumber));
      if (!advance) return res.status(404).json({ message: "Advance not found" });
    } else {
      advance = event.advances.find(a => a.advanceNumber === parseInt(advanceNumber));
      if (!advance) {
        return res.status(404).json({ message: "Advance not found on event or event types" });
      }
    }

    if (typeof receivedAmount === "number") {
      advance.receivedAmount = receivedAmount;
    }
    if (receivedDate) {
      advance.receivedDate = new Date(receivedDate);
    }
    if (typeof remarks === "string") {
      advance.remarks = remarks;
    }

    
    // Update givenBy, collectedBy, modeOfPayment if provided
    if (req.body.givenBy !== undefined) {
      advance.givenBy = req.body.givenBy || null;
    }
    if (req.body.collectedBy !== undefined) {
      advance.collectedBy = req.body.collectedBy || null;
    }
    if (req.body.modeOfPayment !== undefined) {
      if (req.body.modeOfPayment && !['cash', 'account'].includes(req.body.modeOfPayment.toLowerCase())) {
        return res.status(400).json({ message: "modeOfPayment must be 'cash' or 'account'" });
      }
      advance.modeOfPayment = req.body.modeOfPayment ? req.body.modeOfPayment.toLowerCase() : null;
    }
    
    // Update tracking fields
    advance.updatedBy = userId || decodedToken.uid || null;
    advance.updatedAt = new Date();

    await event.save();

    // Populate eventName, eventType, leads, and venue details before returning
    await event.populate('eventName', 'id name');
    await event.populate('eventTypes.eventType', 'id name event');
    await event.populate('eventTypes.venueLocation', 'id name address city state');
    await event.populate('eventTypes.subVenueLocation', 'id name venue');
    await event.populate('eventTypes.coordinator', 'id name contact_number email');
    await event.populate('lead1', 'id name contact_number email');
    await event.populate('lead2', 'id name contact_number email');

    res.status(200).json({ message: "Advance updated", event, advance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update advance entry for a specific event type
exports.addAdvanceToEventType = async (req, res) => {
  try {
    const { eventId, eventTypeId, advanceNumber } = req.params;
    const { expectedAmount, receivedAmount, receivedDate, advanceDate, remarks, userId } = req.body;
    const token = req.get('Authorization');
    if (!token) return res.status(401).json({ message: "Authorization token required" });

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const role = decodedToken.role.toUpperCase();
    const validRoles = ["DEPARTMENT", "OWNER", "APPROVER", "CA"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!advanceNumber) {
      return res.status(400).json({ message: "advanceNumber param is required" });
    }

    if (expectedAmount == null && receivedAmount == null && !receivedDate && !advanceDate && !remarks) {
      return res.status(400).json({ message: "At least one field is required to update the advance" });
    }

    const parsedAdvanceNumber = parseInt(advanceNumber, 10);
    if (Number.isNaN(parsedAdvanceNumber)) {
      return res.status(400).json({ message: "advanceNumber must be a number" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const eventTypeDoc = findEventTypeByIdentifier(event, eventTypeId);
    if (!eventTypeDoc) {
      return res.status(404).json({ message: "Event type not found" });
    }

    const advance = eventTypeDoc.advances.find(a => a.advanceNumber === parsedAdvanceNumber);
    if (!advance) {
      return res.status(404).json({ message: "Advance not found for this event type" });
    }

    if (expectedAmount != null) {
      advance.expectedAmount = expectedAmount;
    }
    if (typeof receivedAmount === "number") {
      advance.receivedAmount = receivedAmount;
    }
    if (advanceDate) {
      advance.advanceDate = new Date(advanceDate);
    }
    if (receivedDate) {
      advance.receivedDate = new Date(receivedDate);
    }
    if (remarks !== undefined) {
      advance.remarks = typeof remarks === "string" ? remarks : (remarks || "");
    }
    
    // Update givenBy, collectedBy, modeOfPayment if provided
    if (req.body.givenBy !== undefined) {
      advance.givenBy = req.body.givenBy || null;
    }
    if (req.body.collectedBy !== undefined) {
      advance.collectedBy = req.body.collectedBy || null;
    }
    if (req.body.modeOfPayment !== undefined) {
      if (req.body.modeOfPayment && !['cash', 'account'].includes(req.body.modeOfPayment.toLowerCase())) {
        return res.status(400).json({ message: "modeOfPayment must be 'cash' or 'account'" });
      }
      advance.modeOfPayment = req.body.modeOfPayment ? req.body.modeOfPayment.toLowerCase() : null;
    }

    advance.updatedBy = userId || decodedToken.uid || null;
    advance.updatedAt = new Date();

    await event.save();

    // Populate eventName, eventType, leads, and venue details before returning
    await event.populate('eventName', 'id name');
    await event.populate('eventTypes.eventType', 'id name event');
    await event.populate('eventTypes.venueLocation', 'id name address city state');
    await event.populate('eventTypes.subVenueLocation', 'id name venue');
    await event.populate('eventTypes.coordinator', 'id name contact_number email');
    await event.populate('lead1', 'id name contact_number email');
    await event.populate('lead2', 'id name contact_number email');

    return res.status(200).json({
      message: "Advance updated successfully",
      event,
      eventType: eventTypeDoc.eventType,
      advance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get event by ID, including advances
exports.getEvent = async (req, res) => {
  try {
    const token = req.get('Authorization');
    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const event = await Event.findById(req.params.eventId)
      .populate('eventName', 'id name')
      .populate('eventTypes.eventType', 'id name event')
      .populate('eventTypes.venueLocation', 'id name address city state')
      .populate('eventTypes.subVenueLocation', 'id name venue')
      .populate('eventTypes.coordinator', 'id name contact_number email')
      .populate('lead1', 'id name contact_number email')
      .populate('lead2', 'id name contact_number email')
      .populate('createdBy', 'id first_name last_name');
    
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Check if user has access (owner or ADMIN/OWNER can see all)
    // if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER') {
    //   if (event.createdBy && event.createdBy.toString() !== decodedToken.uid) {
    //     return res.status(403).json({ message: "Access denied. You can only view your own events." });
    //   }
    // }

    const { byEventId, counts } = await fetchBudgetReportMapsForEventIds([event._id]);

    return res.status(200).json({
      event,
      budgetReport: byEventId.get(String(event._id)) || null,
      budgetReportsCount: counts.get(String(event._id)) || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE /api/events/:eventId
 * Deletes a booking/event and associated budget reports.
 * Also detaches `request.event_reference` to avoid dangling references.
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "Valid eventId is required" });
    }

    const token = req.get("Authorization");
    const decodedToken = token ? jwt.decode(token) : null;
    const uid = decodedToken?.uid || req.userId || null;
    const role = String(decodedToken?.role || "").toUpperCase();

    const event = await Event.findById(eventId).select("_id createdBy").lean();
    if (!event) {
      return res.status(STATUS.NOT_FOUND).json({ message: "Event not found" });
    }

    const isAdminOrOwner = role === "ADMIN" || role === "OWNER";
    const isOwner = uid && event.createdBy && String(event.createdBy) === String(uid);

    if (!isAdminOrOwner && !isOwner) {
      return res.status(STATUS.FORBIDDEN).json({ message: "Access denied. Cannot delete this event." });
    }

    const eventObjId = new mongoose.Types.ObjectId(eventId);

    // Detach references first (keeps request history readable)
    await Promise.all([
      Request.updateMany(
        { event_reference: eventObjId },
        { $set: { event_reference: null } }
      ),
      BudgetReport.deleteMany({ eventId: eventObjId }),
    ]);

    const deleted = await Event.findByIdAndDelete(eventObjId).lean();
    if (!deleted) {
      // Rare race condition: document disappeared after we checked.
      return res.status(STATUS.NOT_FOUND).json({ message: "Event not found" });
    }

    return res.status(STATUS.SUCCESS).json({
      message: "Event deleted successfully",
      id: String(deleted._id),
    });
  } catch (error) {
    console.error("deleteEvent error:", error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


/**
 * GET /api/events/leaderboard
 * Query: month=YYYY-MM (optional, filters createdAt). Mode via mode= / mostBooked / mostAmount flags.
 * Optional page & limit (same caps as list API).
 */
exports.getLeaderboard = async (req, res) => {
  try {
    const resolved = resolveLeaderboardMode(req.query);
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error });
    }
    if (!resolved.mode) {
      return res.status(400).json({
        message: 'Specify leaderboard type',
        options: {
          mostBooked: 'mode=mostBooked | mostbooked=true | mode=bookings',
          mostAmount:
            'mode=mostAmount | mostamount=true | mode=mostAmountBooked | mode=amount',
        },
        month: 'Optional month=YYYY-MM filters bookings by createdAt (UTC month). Omit for all-time.',
        example:
          '/api/events/leaderboard?mode=mostBooked&month=2026-03&page=1&limit=20',
      });
    }

    const { mode } = resolved;
    const monthRaw = req.query.month?.trim();
    const match = {};
    let monthLabel = null;

    if (monthRaw) {
      const parsed = parseMonthRange(monthRaw);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      match.createdAt = { $gte: parsed.start, $lt: parsed.end };
      monthLabel = parsed.label;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = req.query.limit != null && req.query.limit !== '' ? parseInt(req.query.limit, 10) : null;
    const limit =
      limitRaw != null && !Number.isNaN(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 500)
        : null;

    const docs = await Event.find(match)
      .select(
        '_id createdBy eventConfirmation advancePaymentType eventTypes clientName eventName createdAt'
      )
      .populate('createdBy', 'first_name last_name')
      .populate('eventName', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(30000);

    const userKey = (doc) => {
      if (doc.createdBy && doc.createdBy._id) return String(doc.createdBy._id);
      return '_unassigned';
    };

    const userPayload = (doc) => {
      if (doc.createdBy && doc.createdBy._id) {
        return {
          _id: doc.createdBy._id,
          first_name: doc.createdBy.first_name ?? null,
          last_name: doc.createdBy.last_name ?? null,
        };
      }
      return null;
    };

    if (mode === 'bookings') {
      const map = new Map();
      for (const doc of docs) {
        const key = userKey(doc);
        if (!map.has(key)) {
          map.set(key, {
            user: userPayload(doc),
            inProgress: 0,
            confirmed: 0,
            cancelled: 0,
            total: 0,
          });
        }
        const row = map.get(key);
        row.total += 1;
        if (doc.eventConfirmation === 'InProgress') row.inProgress += 1;
        else if (doc.eventConfirmation === 'Confirmed Event') row.confirmed += 1;
        else if (doc.eventConfirmation === 'Cancelled') row.cancelled += 1;
      }

      const rows = Array.from(map.values());
      const ranked = assignRanksDesc(rows, 'total');
      const totalUsers = ranked.length;
      const pageRows =
        limit != null
          ? ranked.slice((page - 1) * limit, page * limit)
          : ranked;

      return res.status(200).json({
        mode: 'mostBooked',
        month: monthLabel,
        scope: monthLabel ? 'month' : 'allTime',
        totalUsers,
        leaderboard: pageRows,
        ...(limit != null && {
          page,
          limit,
          totalPages: Math.ceil(totalUsers / limit) || 1,
        }),
      });
    }

    // mode === 'amount'
    const { byEventId: budgetByEventId, counts: budgetCounts } =
      await fetchBudgetReportMapsForEventIds(docs.map((d) => d._id));

    const map = new Map();
    for (const doc of docs) {
      const key = userKey(doc);
      const amountBooked = computeBookingAmountFromEventTypes(doc);
      if (!map.has(key)) {
        map.set(key, {
          user: userPayload(doc),
          totalAmountBooked: 0,
          eventsCount: 0,
          events: [],
        });
      }
      const row = map.get(key);
      row.totalAmountBooked += amountBooked;
      row.eventsCount += 1;
      const eid = String(doc._id);
      row.events.push({
        _id: doc._id,
        eventName: doc.eventName
          ? { _id: doc.eventName._id, name: doc.eventName.name }
          : null,
        clientName: doc.clientName ?? null,
        amountBooked,
        eventConfirmation: doc.eventConfirmation ?? null,
        budgetReport: budgetByEventId.get(eid) || null,
        budgetReportsCount: budgetCounts.get(eid) || 0,
      });
    }

    for (const row of map.values()) {
      row.events.sort((a, b) => b.amountBooked - a.amountBooked);
    }

    const rows = Array.from(map.values());
    const ranked = assignRanksDesc(rows, 'totalAmountBooked');
    const totalUsers = ranked.length;
    const pageRows =
      limit != null ? ranked.slice((page - 1) * limit, page * limit) : ranked;

    return res.status(200).json({
      mode: 'mostAmountBooked',
      month: monthLabel,
      scope: monthLabel ? 'month' : 'allTime',
      totalUsers,
      leaderboard: pageRows,
      ...(limit != null && {
        page,
        limit,
        totalPages: Math.ceil(totalUsers / limit) || 1,
      }),
    });
  } catch (error) {
    console.error('getLeaderboard:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/events/balance-sheet
 * Confirmed bookings only. Per row: payable (totalPayable rule) − received (sum of advances received) = balance.
 * Optional filters match GET /api/events: eventName, startDate, endDate, venue, subVenue; optional page & limit.
 */
exports.getConfirmedEventsBalanceSheet = async (req, res) => {
  try {
    const baseQuery = {};

    const eventNameFilter = req.query.eventName?.trim();
    const parseDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const venueIdRaw = (req.query.venue || req.query.venueLocation || '').toString().trim();
    const subVenueIdRaw = (req.query.subVenue || req.query.subVenueLocation || '').toString().trim();
    const venueId = venueIdRaw ? venueIdRaw : null;
    const subVenueId = subVenueIdRaw ? subVenueIdRaw : null;

    if (venueId && !mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid venue id' });
    }
    if (subVenueId && !mongoose.Types.ObjectId.isValid(subVenueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid subVenue id' });
    }

    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = !Number.isNaN(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const limit = !Number.isNaN(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 20;

    if (eventNameFilter) {
      if (mongoose.Types.ObjectId.isValid(eventNameFilter)) {
        baseQuery.eventName = toObjectIdForMatch(eventNameFilter);
      } else {
        const safePattern = escapeRegex(eventNameFilter);
        const matchingNames = await EventName.find(
          { name: { $regex: safePattern, $options: 'i' } },
          '_id'
        );
        const eventNameIds = matchingNames.map((item) => item._id);
        if (!eventNameIds.length) {
          return res.status(200).json({
            scope: 'confirmedEventsOnly',
            totalEvents: 0,
            summary: {
              totalPayableAmount: 0,
              totalReceivedAmount: 0,
              totalBalanceAmount: 0,
            },
            events: [],
            bookingsInResponse: 0,
            page,
            limit,
            totalPages: 1,
          });
        }
        baseQuery.eventName = { $in: eventNameIds };
      }
    }

    if (startDate || endDate || venueId || subVenueId) {
      baseQuery.eventTypes = { $elemMatch: {} };
      if (startDate) baseQuery.eventTypes.$elemMatch.startDate = { $gte: startDate };
      if (endDate) baseQuery.eventTypes.$elemMatch.endDate = { $lte: endDate };
      if (venueId) baseQuery.eventTypes.$elemMatch.venueLocation = new mongoose.Types.ObjectId(venueId);
      if (subVenueId) baseQuery.eventTypes.$elemMatch.subVenueLocation = new mongoose.Types.ObjectId(subVenueId);
    }

    const query = { ...baseQuery, eventConfirmation: 'Confirmed Event' };

    const baseFind = Event.find(query)
      .select('_id clientName eventName eventConfirmation advancePaymentType eventTypes')
      .populate('eventName', 'id name')
      .populate('eventTypes.eventType', 'id name event')
      .sort({ createdAt: -1 })
      .maxTimeMS(25000)
      .lean();

    const [totalEvents, events, advanceSummaryAll, payableSummaryAll] = await Promise.all([
      Event.countDocuments(query).maxTimeMS(25000),
      baseFind.skip((page - 1) * limit).limit(limit),
      aggregateEventsAdvanceSummary(query),
      aggregateEventsTotalPayableSummary(query),
    ]);

    const totalPayableAll = roundRupee(payableSummaryAll.totalPayableSum);
    const totalReceivedAll = roundRupee(advanceSummaryAll.totalReceivedAmount);
    const totalBalanceAll = roundRupee(totalPayableAll - totalReceivedAll);

    const eventsOut = events.map((ev) => {
      const payableAmount = roundRupee(computeBookingAmountFromEventTypes(ev));
      const receivedAmount = roundRupee(computeAdvanceTotals(ev).totalReceivedAmount);
      const balanceAmount = roundRupee(payableAmount - receivedAmount);
      const en = ev.eventName;
      return {
        _id: ev._id,
        clientName: ev.clientName ?? null,
        eventName: en ? { _id: en._id, name: en.name } : null,
        eventConfirmation: ev.eventConfirmation ?? null,
        advancePaymentType: ev.advancePaymentType ?? null,
        payableAmount,
        receivedAmount,
        balanceAmount,
      };
    });

    return res.status(200).json({
      scope: 'confirmedEventsOnly',
      totalEvents,
      summary: {
        totalPayableAmount: totalPayableAll,
        totalReceivedAmount: totalReceivedAll,
        totalBalanceAmount: totalBalanceAll,
      },
      events: eventsOut,
      bookingsInResponse: eventsOut.length,
      page,
      limit,
      totalPages: Math.ceil(totalEvents / limit) || 1,
    });
  } catch (error) {
    console.error('getConfirmedEventsBalanceSheet:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** GET /api/events/minimal — booking id, eventName { _id, name }, and client details */
exports.getAllEventsMinimal = async (req, res) => {
  try {
    const rows = await Event.find({})
      .select(
        '_id eventName clientName brideName groomName contactNumber altContactNumber altContactName note eventConfirmation'
      )
      .populate('eventName', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(20000);

    const events = rows.map((doc) => ({
      _id: doc._id,
      eventName: doc.eventName
        ? { _id: doc.eventName._id, name: doc.eventName.name }
        : null,
      client: {
        clientName: doc.clientName ?? null,
        brideName: doc.brideName ?? null,
        groomName: doc.groomName ?? null,
        contactNumber: doc.contactNumber ?? null,
        altContactNumber: doc.altContactNumber ?? null,
        altContactName: doc.altContactName ?? null,
        note: doc.note ?? null,
        eventConfirmation: doc.eventConfirmation ?? null,
      },
    }));

    const eventsWithBudget = await mergeBudgetIntoEventRows(events);

    res.status(200).json({
      totalEvents: eventsWithBudget.length,
      events: eventsWithBudget,
    });
  } catch (error) {
    console.error('getAllEventsMinimal:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const baseQuery = {};

    const statusRaw = req.query.status?.trim() || req.query.eventConfirmation?.trim();
    const mappedConfirmation = mapStatusToEventConfirmation(statusRaw || '');
    if (statusRaw && !mappedConfirmation) {
      return res.status(400).json({
        message: 'Invalid status filter',
        allowed: ['confirmed', 'inprogress', 'cancelled', 'canceled'],
        example: '?status=confirmed',
      });
    }

    const eventNameFilter = req.query.eventName?.trim();
    const parseDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const venueIdRaw = (req.query.venue || req.query.venueLocation || '').toString().trim();
    const subVenueIdRaw = (req.query.subVenue || req.query.subVenueLocation || '').toString().trim();
    const venueId = venueIdRaw ? venueIdRaw : null;
    const subVenueId = subVenueIdRaw ? subVenueIdRaw : null;

    if (venueId && !mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid venue id' });
    }
    if (subVenueId && !mongoose.Types.ObjectId.isValid(subVenueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid subVenue id' });
    }

    // Optional pagination (keeps Lambda/API responses bounded)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = req.query.limit != null && req.query.limit !== '' ? parseInt(req.query.limit, 10) : null;
    const limit = limitRaw != null && !Number.isNaN(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : null;

    // Filter by eventName (supports ObjectId or name search)
    if (eventNameFilter) {
      if (mongoose.Types.ObjectId.isValid(eventNameFilter)) {
        baseQuery.eventName = toObjectIdForMatch(eventNameFilter);
      } else {
        const safePattern = escapeRegex(eventNameFilter);
        const matchingNames = await EventName.find(
          { name: { $regex: safePattern, $options: 'i' } },
          '_id'
        );
        const eventNameIds = matchingNames.map((item) => item._id);
        if (!eventNameIds.length) {
          return res.status(200).json({
            totalEvents: 0,
            events: [],
            summary: {
              summaryScope: 'allBookingsMatchingFilter',
              totalBookings: 0,
              bookingsInResponse: 0,
              totalExpectedAdvance: 0,
              totalReceivedAmount: 0,
              totalPending: 0,
              totalAdvanceEntries: 0,
              totalPayableSum: 0,
            },
            totalsByStatus: {
              all: { totalBookings: 0, totalPayableSum: 0, totalReceivedAmount: 0, totalPending: 0 },
              confirmed: { totalBookings: 0, totalPayableSum: 0, totalReceivedAmount: 0, totalPending: 0 },
              inprogress: { totalBookings: 0, totalPayableSum: 0, totalReceivedAmount: 0, totalPending: 0 },
            },
            page,
            limit: limit || null,
          });
        }
        baseQuery.eventName = { $in: eventNameIds };
      }
    }

    // Filter by event type date range (startDate/endDate)
    if (startDate || endDate || venueId || subVenueId) {
      baseQuery.eventTypes = { $elemMatch: {} };
      if (startDate) baseQuery.eventTypes.$elemMatch.startDate = { $gte: startDate };
      if (endDate) baseQuery.eventTypes.$elemMatch.endDate = { $lte: endDate };
      if (venueId) baseQuery.eventTypes.$elemMatch.venueLocation = new mongoose.Types.ObjectId(venueId);
      if (subVenueId) baseQuery.eventTypes.$elemMatch.subVenueLocation = new mongoose.Types.ObjectId(subVenueId);
    }

    const query = mappedConfirmation
      ? { ...baseQuery, eventConfirmation: mappedConfirmation }
      : baseQuery;

    const baseFind = Event.find(query)
      .populate('eventName', 'id name')
      .populate('eventTypes.eventType', 'id name event')
      .populate('eventTypes.venueLocation', 'id name address city state')
      .populate('eventTypes.subVenueLocation', 'id name venue')
      .populate('eventTypes.coordinator', 'id name contact_number email')
      .populate('lead1', 'id name contact_number email')
      .populate('lead2', 'id name contact_number email')
      .populate('createdBy', 'id first_name last_name')
      .sort({ createdAt: -1 })
      .maxTimeMS(25000)
      .lean();

    const [totalEvents, events, advanceSummaryAll, payableSummaryAll, totalsByStatus] = await Promise.all([
      Event.countDocuments(query).maxTimeMS(25000),
      limit != null
        ? baseFind.skip((page - 1) * limit).limit(limit)
        : baseFind,
      aggregateEventsAdvanceSummary(query),
      aggregateEventsTotalPayableSummary(query),
      aggregateEventsPayableReceivedBookingsByStatus(baseQuery),
    ]);

    const eventsWithTotals = events.map((ev) => {
      const advanceTotals = computeAdvanceTotals(ev);
      return { ...ev, advanceTotals };
    });

    const eventsWithBudget = await mergeBudgetIntoEventRows(eventsWithTotals);
    const totalPending = roundRupee(
      roundRupee(payableSummaryAll.totalPayableSum) -
        roundRupee(advanceSummaryAll.totalReceivedAmount)
    );

    res.status(200).json({
      totalEvents,
      events: eventsWithBudget,
      summary: {
        summaryScope: 'allBookingsMatchingFilter',
        totalBookings: totalEvents,
        bookingsInResponse: eventsWithBudget.length,
        totalExpectedAdvance: advanceSummaryAll.totalExpectedAdvance,
        totalReceivedAmount: advanceSummaryAll.totalReceivedAmount,
        totalPending,
        totalAdvanceEntries: advanceSummaryAll.totalAdvanceEntries,
        totalPayableSum: payableSummaryAll.totalPayableSum,
      },
      totalsByStatus,
      ...(mappedConfirmation && { eventConfirmationFilter: mappedConfirmation }),
      ...(limit != null && {
        page,
        limit,
        totalPages: Math.ceil(totalEvents / limit) || 1,
      }),
    });
  } catch (error) {
    console.error('getAllEvents:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message,
    });
  }
};



exports.getMyEvents = async (req, res) => {
  try {
    const token = req.get('Authorization');
    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const query = { createdBy: toObjectIdForMatch(decodedToken.uid) };

    const statusRaw = req.query.status?.trim() || req.query.eventConfirmation?.trim();
    const mappedConfirmation = mapStatusToEventConfirmation(statusRaw || '');
    if (statusRaw && !mappedConfirmation) {
      return res.status(400).json({
        message: 'Invalid status filter',
        allowed: ['confirmed', 'inprogress', 'cancelled', 'canceled'],
        example: '?status=confirmed',
      });
    }
    if (mappedConfirmation) {
      query.eventConfirmation = mappedConfirmation;
    }

    const eventNameFilter = req.query.eventName?.trim();
    const parseDate = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const venueIdRaw = (req.query.venue || req.query.venueLocation || '').toString().trim();
    const subVenueIdRaw = (req.query.subVenue || req.query.subVenueLocation || '').toString().trim();
    const venueId = venueIdRaw ? venueIdRaw : null;
    const subVenueId = subVenueIdRaw ? subVenueIdRaw : null;

    if (venueId && !mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid venue id' });
    }
    if (subVenueId && !mongoose.Types.ObjectId.isValid(subVenueId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid subVenue id' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = req.query.limit != null && req.query.limit !== '' ? parseInt(req.query.limit, 10) : null;
    const limit = limitRaw != null && !Number.isNaN(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : null;

    if (eventNameFilter) {
      if (mongoose.Types.ObjectId.isValid(eventNameFilter)) {
        query.eventName = toObjectIdForMatch(eventNameFilter);
      } else {
        const safePattern = escapeRegex(eventNameFilter);
        const matchingNames = await EventName.find(
          { name: { $regex: safePattern, $options: 'i' } },
          '_id'
        );
        const eventNameIds = matchingNames.map((item) => item._id);
        if (!eventNameIds.length) {
          return res.status(STATUS.SUCCESS).json({
            success: true,
            message: 'Events fetched successfully',
            totalEvents: 0,
            events: [],
            summary: {
              summaryScope: 'allBookingsMatchingFilter',
              totalBookings: 0,
              bookingsInResponse: 0,
              totalExpectedAdvance: 0,
              totalReceivedAmount: 0,
              totalPendingAdvance: 0,
              totalAdvanceEntries: 0,
              totalPayableSum: 0,
            },
            page,
            limit: limit || null,
          });
        }
        query.eventName = { $in: eventNameIds };
      }
    }

    if (startDate || endDate || venueId || subVenueId) {
      query.eventTypes = { $elemMatch: {} };
      if (startDate) query.eventTypes.$elemMatch.startDate = { $gte: startDate };
      if (endDate) query.eventTypes.$elemMatch.endDate = { $lte: endDate };
      if (venueId) query.eventTypes.$elemMatch.venueLocation = new mongoose.Types.ObjectId(venueId);
      if (subVenueId) query.eventTypes.$elemMatch.subVenueLocation = new mongoose.Types.ObjectId(subVenueId);
    }

    const baseFind = Event.find(query)
      .populate('eventName', 'id name')
      .populate('eventTypes.eventType', 'id name event')
      .populate('eventTypes.venueLocation', 'id name address city state')
      .populate('eventTypes.subVenueLocation', 'id name venue')
      .populate('eventTypes.coordinator', 'id name contact_number email')
      .populate('lead1', 'id name contact_number email')
      .populate('lead2', 'id name contact_number email')
      .populate('createdBy', 'id first_name last_name')
      .sort({ createdAt: -1 })
      .maxTimeMS(25000)
      .lean();

    const [totalEvents, events, advanceSummaryAll, payableSummaryAll] = await Promise.all([
      Event.countDocuments(query).maxTimeMS(25000),
      limit != null
        ? baseFind.skip((page - 1) * limit).limit(limit)
        : baseFind,
      aggregateEventsAdvanceSummary(query),
      aggregateEventsTotalPayableSummary(query),
    ]);

    const eventsWithTotals = events.map((ev) => ({
      ...ev,
      advanceTotals: computeAdvanceTotals(ev),
    }));

    const eventsWithBudget = await mergeBudgetIntoEventRows(eventsWithTotals);

    return res.status(STATUS.SUCCESS).json({
      success: true,
      message: 'Events fetched successfully',
      totalEvents,
      events: eventsWithBudget,
      summary: {
        summaryScope: 'allBookingsMatchingFilter',
        totalBookings: totalEvents,
        bookingsInResponse: eventsWithTotals.length,
        totalExpectedAdvance: advanceSummaryAll.totalExpectedAdvance,
        totalReceivedAmount: advanceSummaryAll.totalReceivedAmount,
        totalPendingAdvance: advanceSummaryAll.totalPendingAdvance,
        totalAdvanceEntries: advanceSummaryAll.totalAdvanceEntries,
        totalPayableSum: payableSummaryAll.totalPayableSum,
      },
      ...(mappedConfirmation && { eventConfirmationFilter: mappedConfirmation }),
      ...(limit != null && {
        page,
        limit,
        totalPages: Math.ceil(totalEvents / limit) || 1,
      }),
    });
  } catch (error) {
    console.error('getMyEvents:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};




// Edit event details except receivedAmount in advances
exports.editEventExceptReceivedAmount = async (req, res) => {
  try {
    const token = req.get('Authorization');
    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const { eventId } = req.params;
    const {
      eventId: newEventId,
      eventTypes,
      clientName,
      brideName,
      groomName,
      contactNumber,
      altContactNumber,
      altContactName,
      lead1,
      lead2,
      note,
      meetingDate,
      eventConfirmation,
      advancePaymentType
    } = req.body;

    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return res.status(400).json({ message: "clientName is required" });
    }

    if (!contactNumber || typeof contactNumber !== "string" || !contactNumber.trim()) {
      return res.status(400).json({ message: "contactNumber is required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Check if user has access (owner or ADMIN/OWNER can edit all)
    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER') {
      if (event.createdBy && event.createdBy.toString() !== decodedToken.uid) {
        return res.status(403).json({ message: "Access denied. You can only edit your own events." });
      }
    }

    // Update eventId if provided
    if (newEventId) {
      if (!mongoose.Types.ObjectId.isValid(newEventId)) {
        return res.status(400).json({ message: "Valid eventId is required" });
      }
      const eventNameDoc = await EventName.findById(newEventId);
      if (!eventNameDoc) {
        return res.status(404).json({ message: "Event not found for given eventId" });
      }
      event.eventName = newEventId;
    }

    // Update basic fields
    event.clientName = clientName.trim();
    event.brideName = brideName ? brideName.trim() : undefined;
    event.groomName = groomName ? groomName.trim() : undefined;
    event.contactNumber = contactNumber.trim();
    event.altContactNumber = altContactNumber ? altContactNumber.trim() : undefined;
    event.altContactName = altContactName ? altContactName.trim() : undefined;
    event.lead1 = lead1 !== undefined ? (lead1 || null) : event.lead1;
    event.lead2 = lead2 !== undefined ? (lead2 || null) : event.lead2;
    event.note = note ? note.trim() : undefined;
    event.meetingDate = meetingDate ? new Date(meetingDate) : null;
    if (eventConfirmation !== undefined) {
      event.eventConfirmation = eventConfirmation || undefined;
    }
    if (advancePaymentType !== undefined) {
      event.advancePaymentType = advancePaymentType || undefined;
    }

    // Update eventTypes if provided
    const hasEventTypes = Array.isArray(eventTypes) && eventTypes.length > 0;
    if (hasEventTypes) {
      const eventTypesData = [];
      const currentEventId = newEventId || event.eventName;

      for (let index = 0; index < eventTypes.length; index++) {
        const type = eventTypes[index];

        // Resolve or create EventType master for this event (optional)
        let eventTypeDoc = null;
        let eventTypeId = type.eventTypeId || null;

        // Handle null values - if explicitly null, allow it
        if (type.eventTypeId === null || type.eventType === null) {
          eventTypeId = null;
        } else if (eventTypeId) {
          // If eventTypeId is provided and not null, validate and use it
          if (!mongoose.Types.ObjectId.isValid(eventTypeId)) {
            throw new Error(`eventTypes[${index}].eventTypeId must be a valid ID`);
          }
          eventTypeDoc = await EventTypeModel.findById(eventTypeId);
          if (!eventTypeDoc) {
            throw new Error(`eventTypes[${index}].eventTypeId does not reference a valid event type`);
          }
        } else if (type.eventType && typeof type.eventType === "string" && type.eventType.trim()) {
          // Fallback: use name + eventId to find or create the EventType master
          eventTypeDoc = await EventTypeModel.findOne({
            name: type.eventType.trim(),
            event: currentEventId,
          });
          if (!eventTypeDoc) {
            eventTypeDoc = await EventTypeModel.create({
              name: type.eventType.trim(),
              event: currentEventId,
            });
          }
          eventTypeId = eventTypeDoc._id;
        }
        // If both are null/undefined, eventTypeId remains null (allowed)

        // Find existing eventType to preserve receivedAmount in advances
        const existingType = eventTypeId 
          ? event.eventTypes.find(et => 
              et.eventType && et.eventType.toString() === eventTypeId.toString()
            )
          : null;

        if (!type.startDate) {
          throw new Error(`eventTypes[${index}].startDate is required`);
        }
        if (!type.endDate) {
          throw new Error(`eventTypes[${index}].endDate is required`);
        }

        // Validate coordinator if provided
        let coordinatorId = null;
        if (type.coordinator) {
          if (!mongoose.Types.ObjectId.isValid(type.coordinator)) {
            throw new Error(`eventTypes[${index}].coordinator must be a valid coordinator ID`);
          }
          const coordinatorExists = await Coordinator.findById(type.coordinator);
          if (!coordinatorExists || coordinatorExists.is_archived) {
            throw new Error(`eventTypes[${index}].coordinator references a coordinator that does not exist`);
          }
          coordinatorId = type.coordinator;
        } else if (existingType && existingType.coordinator) {
          // Preserve existing coordinator if not provided
          coordinatorId = existingType.coordinator;
        }

        const advancesArray = Array.isArray(type.advances) ? type.advances : [];

        const advancesData = advancesArray.map((adv, advIndex) => {
          if (adv.expectedAmount == null) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].expectedAmount is required`);
          }
          if (!adv.advanceDate) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].advanceDate is required`);
          }

          const advanceNumber = adv.advanceNumber != null ? adv.advanceNumber : advIndex + 1;
          
          // Find existing advance to preserve receivedAmount and related fields
          const existingAdvance = existingType
            ? existingType.advances.find(a => a.advanceNumber === advanceNumber)
            : null;

          // Validate modeOfPayment if provided
          if (adv.modeOfPayment && !['cash', 'account'].includes(adv.modeOfPayment.toLowerCase())) {
            throw new Error(`eventTypes[${index}].advances[${advIndex}].modeOfPayment must be 'cash' or 'account'`);
          }

          return {
            advanceNumber,
            expectedAmount: adv.expectedAmount,
            advanceDate: new Date(adv.advanceDate),
            status: existingAdvance ? existingAdvance.status : (adv.status || "Pending"),
            receivedAmount: existingAdvance ? existingAdvance.receivedAmount : (adv.receivedAmount || null),
            receivedDate: existingAdvance ? existingAdvance.receivedDate : (adv.receivedDate ? new Date(adv.receivedDate) : null),
            givenBy: existingAdvance ? existingAdvance.givenBy : (adv.givenBy || null),
            collectedBy: existingAdvance ? existingAdvance.collectedBy : (adv.collectedBy || null),
            modeOfPayment: existingAdvance ? existingAdvance.modeOfPayment : (adv.modeOfPayment ? adv.modeOfPayment.toLowerCase() : null),
            remarks: existingAdvance ? existingAdvance.remarks : (adv.remarks || ""),
            updatedBy: existingAdvance ? existingAdvance.updatedBy : (adv.updatedBy || null),
            updatedAt: existingAdvance ? existingAdvance.updatedAt : (adv.updatedAt ? new Date(adv.updatedAt) : null)
          };
        });

        // Handle amount fields - preserve existing values if not provided
        const existingAmounts = existingType || {};
        const agreedAmount = type.agreedAmount != null ? type.agreedAmount : existingAmounts.agreedAmount;
        const accountAmount = type.accountAmount != null ? type.accountAmount : (existingAmounts.accountAmount ?? 0);
        const accountGst = type.accountGst != null ? type.accountGst : (existingAmounts.accountGst ?? 0);
        const accountAmountWithGst = type.accountAmountWithGst != null ? type.accountAmountWithGst : (existingAmounts.accountAmountWithGst ?? 0);
        const cashAmount = type.cashAmount != null ? type.cashAmount : (existingAmounts.cashAmount ?? 0);
        const totalPayable = type.totalPayable != null ? type.totalPayable : (existingAmounts.totalPayable ?? 0);

        eventTypesData.push({
          eventType: eventTypeId,
          startDate: new Date(type.startDate),
          endDate: new Date(type.endDate),
          venueLocation: type.venueLocation || null,
          subVenueLocation: type.subVenueLocation || null,
          coordinator: coordinatorId,
          agreedAmount: agreedAmount,
          accountAmount: accountAmount,
          accountGst: accountGst,
          accountAmountWithGst: accountAmountWithGst,
          cashAmount: cashAmount,
          totalPayable: totalPayable,
          advances: advancesData
        });
      }

      event.eventTypes = eventTypesData;
    }

    await event.save();

    // Populate eventName, eventType, leads, and venue details before returning
    await event.populate('eventName', 'id name');
    await event.populate('eventTypes.eventType', 'id name event');
    await event.populate('eventTypes.venueLocation', 'id name address city state');
    await event.populate('eventTypes.subVenueLocation', 'id name venue');
    await event.populate('eventTypes.coordinator', 'id name contact_number email');
    await event.populate('lead1', 'id name contact_number email');
    await event.populate('lead2', 'id name contact_number email');
    await event.populate('createdBy', 'id first_name last_name');

    res.status(200).json({ message: "Event updated (received fields preserved)", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};
