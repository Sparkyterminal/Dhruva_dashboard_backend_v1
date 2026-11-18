const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Daybook V2 manual inflow (collection: daybookinflows).
 * netAmountReceived is always computed server-side (utils/daybook.js).
 * Dates are YYYY-MM-DD strings (no time zones).
 *
 * Note: rows created before V2 have the legacy shape (name / receivedBy / event_reference)
 * until the owner-approved cleanup (contract section 5) is run.
 */
const daybookInflowSchema = new Schema(
  {
    clientName: { type: String, required: true, trim: true },
    eventDate: { type: String, required: true, trim: true },
    eventReference: { type: Schema.Types.ObjectId, ref: 'Event', default: null },
    receivedDate: { type: String, required: true, trim: true, index: true },
    receivedIn: { type: String, required: true, enum: ['CASH', 'ACCOUNT'] },
    accountName: { type: String, default: null, trim: true },
    amountReceived: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    tdsAmount: { type: Number, default: 0, min: 0 },
    netAmountReceived: { type: Number, required: true },
    note: { type: String, default: '', trim: true },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
);

daybookInflowSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('daybookinflows', daybookInflowSchema);
