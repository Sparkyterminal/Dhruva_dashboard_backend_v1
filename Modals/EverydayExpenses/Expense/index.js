const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const clock = require('../../../utils/clock');

/**
 * Everyday expense entry (collection: everydayexpenses).
 * reimbursable/cappedBy are computed server-side (utils/everydayExpenses.js calculateExpense).
 * categorySnapshot + gradeAtSubmit freeze the rules used, so later category edits never change it.
 * Employee fields are immutable once now >= editableUntil (00:00 IST of the day after addedDay).
 */
const billSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, default: '' },
    size: { type: Number, required: true },
    contentType: { type: String, required: true },
  },
  { _id: false }
);

const everydayExpenseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    userName: { type: String, default: '' },
    departments: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: 'expensecategory', required: true },
    categorySnapshot: { type: Schema.Types.Mixed, required: true },
    gradeAtSubmit: { type: String, required: true },
    expenseDate: { type: String, required: true },
    addedDay: { type: String, required: true },
    amount: { type: Number, default: null },
    units: { type: Number, default: null },
    dutyEndTime: { type: String, default: null },
    companyProvided: { type: Boolean, default: false },
    priorApproval: { type: Schema.Types.Mixed, default: null },
    note: { type: String, default: '' },
    bills: { type: [billSchema], default: [] },
    reimbursable: { type: Number, required: true },
    cappedBy: { type: String, default: null },
    status: { type: String, enum: ['SUBMITTED', 'REJECTED', 'REPAID'], default: 'SUBMITTED' },
    rejection: { type: Schema.Types.Mixed, default: null },
    repayment: { type: Schema.Types.Mixed, default: null },
    editableUntil: { type: Date, required: true },
  },
  // Timestamps follow the server clock (utils/clock.js) so createdAt matches addedDay/editableUntil.
  { timestamps: { currentTime: () => clock.now() } }
);

everydayExpenseSchema.index({ userId: 1, expenseDate: -1 });
everydayExpenseSchema.index({ expenseDate: -1, status: 1 });
everydayExpenseSchema.index({ userId: 1, categoryId: 1, expenseDate: 1 });
everydayExpenseSchema.index({ 'bills.key': 1 });

module.exports = mongoose.model('everydayexpense', everydayExpenseSchema);
