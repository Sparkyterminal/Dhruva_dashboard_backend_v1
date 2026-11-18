const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Daybook V2 manual outflow (collection: daybookoutflows).
 * actualAmountPaid is always computed server-side (utils/daybook.js).
 * vendorName / vendorCode are a snapshot taken at save time, so old rows still read
 * correctly if the vendor is renamed.
 */
const daybookOutflowSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'vendor', required: true },
    vendorName: { type: String, default: '', trim: true },
    vendorCode: { type: String, default: '', trim: true },
    paidDate: { type: String, required: true, trim: true, index: true },
    paidFrom: { type: String, required: true, enum: ['CASH', 'ACCOUNT'] },
    accountName: { type: String, default: null, trim: true },
    amountPaid: { type: Number, required: true, min: 0 },
    tdsAmount: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    actualAmountPaid: { type: Number, required: true },
    note: { type: String, default: '', trim: true },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
);

daybookOutflowSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('daybookoutflows', daybookOutflowSchema);
