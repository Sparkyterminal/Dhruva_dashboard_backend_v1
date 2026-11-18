const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Everyday Expenses settings (collection: expensesettings). One document: unique singleton "default".
 * categoriesSeededAt records that the section 6 seed ran once (so renamed seeds are never re-added).
 */
const expenseSettingsSchema = new Schema(
  {
    singleton: { type: String, default: 'default', unique: true, immutable: true },
    claimWindowDays: { type: Number, default: 7 },
    maxBillFiles: { type: Number, default: 5 },
    maxBillSizeMB: { type: Number, default: 10 },
    categoriesSeededAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('expensesetting', expenseSettingsSchema);
