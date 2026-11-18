const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/** Everyday Expenses grade per user (collection: expensegrades). No row = JUNIOR_STAFF. */
const expenseGradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true, unique: true },
    grade: { type: String, required: true, enum: ['JUNIOR_STAFF', 'EXECUTIVE', 'SENIOR_EXECUTIVE', 'MANAGER'] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('expensegrade', expenseGradeSchema);
