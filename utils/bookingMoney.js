/**
 * Booking (client event) money rules, shared by the Bookings screens (Controlers/ClientsBookings)
 * and Employee Statistics (Controlers/EmployeeStats). Pure functions: never query the DB here.
 *
 * Moved unchanged out of Controlers/ClientsBookings on 2026-11-21 so every screen uses one copy.
 *
 * - Complete-package wedding (eventName "Wedding" + advancePaymentType "complete"): advances are
 *   de-duplicated by advanceNumber across ceremonies (max per key); agreed = eventTypes[0] only.
 * - Payable (totalPayable): advancePaymentType "complete" → eventTypes[0] only; else sum of all.
 * - receivedAmount is the source of truth; the saved advance `status` text is ignored.
 */

/** Event name label whether populated object or plain string. */
function getEventNameLabel(eventDoc) {
  const en = eventDoc?.eventName;
  if (typeof en === 'string') return en;
  if (en && typeof en === 'object' && en.name != null) return String(en.name);
  return null;
}

/** Wedding + advancePaymentType === "complete" (package counted once). */
function isCompletePaymentWedding(eventDoc) {
  return (
    getEventNameLabel(eventDoc) === 'Wedding' &&
    eventDoc?.advancePaymentType === 'complete'
  );
}

function advanceDedupeKey(adv, idx) {
  if (adv?.advanceNumber != null && adv.advanceNumber !== '') {
    return `n:${adv.advanceNumber}`;
  }
  return `i:${idx}`;
}

/**
 * Sum an advance money field across event types.
 * Complete wedding: dedupe by advanceNumber (fallback index), take max per key, then sum.
 * Else: flat sum of every nested advance.
 */
function sumAdvanceField(eventDoc, fieldName, { dedupe } = {}) {
  if (dedupe) {
    const byKey = new Map();
    for (const et of eventDoc?.eventTypes || []) {
      (et?.advances || []).forEach((adv, idx) => {
        const key = advanceDedupeKey(adv, idx);
        const amt = Number(adv?.[fieldName]);
        const value = Number.isFinite(amt) ? amt : 0;
        const prev = byKey.get(key) ?? 0;
        if (value > prev) byKey.set(key, value);
      });
    }
    let total = 0;
    for (const v of byKey.values()) total += v;
    return { total: roundRupee(total), count: byKey.size };
  }

  let total = 0;
  let count = 0;
  for (const et of eventDoc?.eventTypes || []) {
    for (const adv of et?.advances || []) {
      count += 1;
      const n = Number(adv?.[fieldName]);
      total += Number.isFinite(n) ? n : 0;
    }
  }
  return { total: roundRupee(total), count };
}

/**
 * Dashboard agreed amount (_agreed):
 * - Wedding + advancePaymentType === "complete" → eventTypes[0].agreedAmount only
 * - Otherwise → sum of all eventTypes[].agreedAmount
 */
function getBookingAgreedAmount(eventDoc) {
  if (isCompletePaymentWedding(eventDoc)) {
    return roundRupee(eventDoc?.eventTypes?.[0]?.agreedAmount);
  }

  let total = 0;
  for (const et of eventDoc?.eventTypes || []) {
    const n = Number(et?.agreedAmount);
    total += Number.isFinite(n) ? n : 0;
  }
  return roundRupee(total);
}

/** Received amount — complete wedding dedupes by advanceNumber (max per key). */
function getBookingReceivedAmount(eventDoc) {
  return sumAdvanceField(eventDoc, 'receivedAmount', {
    dedupe: isCompletePaymentWedding(eventDoc),
  }).total;
}

/** Expected advance schedule total — same complete-wedding dedupe as received. */
function getBookingExpectedAdvance(eventDoc) {
  return sumAdvanceField(eventDoc, 'expectedAmount', {
    dedupe: isCompletePaymentWedding(eventDoc),
  }).total;
}

function computeAdvanceTotals(eventDoc) {
  const dedupe = isCompletePaymentWedding(eventDoc);
  const receivedInfo = sumAdvanceField(eventDoc, 'receivedAmount', { dedupe });
  const expectedInfo = sumAdvanceField(eventDoc, 'expectedAmount', { dedupe });
  const agreedAmount = getBookingAgreedAmount(eventDoc);
  const received = receivedInfo.total;
  const expected = expectedInfo.total;
  return {
    totalExpectedAdvance: expected,
    totalReceivedAmount: received,
    pendingAdvanceAmount: Math.max(0, expected - received),
    advanceEntriesCount: expectedInfo.count,
    agreedAmount,
    pendingAmount: Math.max(0, agreedAmount - received),
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

/** Summary money fields are whole rupees (no paise / float noise in JSON). */
function roundRupee(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}


/**
 * Derived state of one advance (the saved `status` text can be stale):
 *   received = receivedAmount > 0 and >= expectedAmount (or no expectedAmount)
 *   partial  = receivedAmount > 0 but below expectedAmount
 *   pending  = nothing received
 */
function advanceState(adv) {
  const received = Number(adv?.receivedAmount);
  if (!Number.isFinite(received) || received <= 0) return 'pending';
  const expected = Number(adv?.expectedAmount);
  if (!Number.isFinite(expected) || received >= expected) return 'received';
  return 'partial';
}

/** Copy of an event (plain object) with `state` added to every eventTypes[].advances[] entry. */
function withAdvanceStates(eventObj) {
  if (!eventObj || !Array.isArray(eventObj.eventTypes)) return eventObj;
  return {
    ...eventObj,
    eventTypes: eventObj.eventTypes.map((t) => ({
      ...t,
      advances: Array.isArray(t?.advances) ? t.advances.map((a) => ({ ...a, state: advanceState(a) })) : t?.advances,
    })),
  };
}

module.exports = {
  getEventNameLabel,
  isCompletePaymentWedding,
  advanceDedupeKey,
  sumAdvanceField,
  getBookingAgreedAmount,
  getBookingReceivedAmount,
  getBookingExpectedAdvance,
  computeAdvanceTotals,
  computeSumFromEventTypesByAdvanceRule,
  computeBookingAmountFromEventTypes,
  roundRupee,
  advanceState,
  withAdvanceStates,
};
