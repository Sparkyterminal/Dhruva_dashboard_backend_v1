const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/** Everyday Expenses rate card (collection: expensecategories). No delete: set active=false. */
const expenseCategorySchema = new Schema(
  {
    group: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    calcType: { type: String, required: true, enum: ['ACTUAL', 'PER_UNIT', 'CAPPED_PER_UNIT', 'FIXED_MAX'] },
    unitLabel: { type: String, default: null, trim: true },
    rate: { type: Number, default: null },
    cap: { type: Number, default: null },
    capByGrade: {
      type: new Schema(
        {
          JUNIOR_STAFF: Number,
          EXECUTIVE: Number,
          SENIOR_EXECUTIVE: Number,
          MANAGER: Number,
        },
        { _id: false }
      ),
      default: null,
    },
    requiresBill: { type: Boolean, default: true },
    maxClaimsPerDay: { type: Number, default: null },
    afterTime: { type: String, default: null },
    companyProvidedZero: { type: Boolean, default: false },
    approvalAbove: { type: Number, default: null },
    guidance: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ group: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('expensecategory', expenseCategorySchema);
