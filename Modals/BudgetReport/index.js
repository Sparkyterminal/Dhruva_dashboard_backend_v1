const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const budgetReportSchema = new Schema(
  {
    eventId: {
      type: ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    budgetData: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    exteriorDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Denormalized: all vendor IDs from budgetData.groups for efficient querying
    vendorIds: [{
      type: ObjectId,
      ref: 'vendor',
    }],
  },
  { timestamps: true }
);

budgetReportSchema.index({ vendorIds: 1 });
budgetReportSchema.index({ eventId: 1 });

const BudgetReport = mongoose.model('budgetreport', budgetReportSchema);

module.exports = BudgetReport;
