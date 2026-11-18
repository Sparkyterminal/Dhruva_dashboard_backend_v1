const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

/**
 * Shared collection for Univer Sheets workbook snapshots.
 *
 * Examples:
 * - Leads Tracker:   module=client-leads,    key=default
 * - Budget Report:   module=budget-report,   key=<confirmed event _id>
 * - Daily Expenses:  module=daily-expenses,  key=YYYY-MM-DD
 * - Daybook Inflow:  module=daybook-inflow,  key=YYYY-MM-DD
 * - Daybook Outflow: module=daybook-outflow, key=YYYY-MM-DD
 *
 * workbookData is opaque IWorkbookData — always replaced wholesale on save.
 * meta holds denormalized list fields (never load workbookData for list UI).
 */
const spreadsheetWorkbookSchema = new Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    workbookData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    createdBy: {
      type: ObjectId,
      ref: 'user',
      required: false,
      default: null,
    },
    updatedBy: {
      type: ObjectId,
      ref: 'user',
      required: false,
      default: null,
    },
  },
  { timestamps: true }
);

spreadsheetWorkbookSchema.index({ module: 1, key: 1 }, { unique: true });
spreadsheetWorkbookSchema.index({ module: 1, 'meta.date': 1, updatedAt: -1 });
spreadsheetWorkbookSchema.index({ module: 1, key: 1, updatedAt: -1 });

spreadsheetWorkbookSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('spreadsheetworkbook', spreadsheetWorkbookSchema);
