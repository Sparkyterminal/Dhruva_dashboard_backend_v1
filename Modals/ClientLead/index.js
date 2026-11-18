const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const clientLeadSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['Inprogress', 'Confirmed', 'Cancelled'],
      default: 'Inprogress',
    },
    clientDetails: { type: String, default: '' },
    eventTypeDetails: { type: String, default: '' },
    assignedTo: { type: ObjectId, ref: 'coordinator', default: null },
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    /** Whole rupees preferred; kept after marketing conversion (do not zero). */
    estimatedBudget: { type: Number, min: 0, default: 0 },
    /**
     * When true, estimatedBudget counts toward Successfully Converted card only
     * (independent of status Inprogress/Confirmed/Cancelled).
     */
    convertedByMarketing: { type: Boolean, default: false },
    /** Audit timestamp when convertedByMarketing becomes true; null when unchecked. */
    convertedAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: 'user', default: null },
  },
  { timestamps: true }
);

clientLeadSchema.index({ convertedByMarketing: 1, startDate: 1 });

const ClientLead = mongoose.model('clientlead', clientLeadSchema);

module.exports = ClientLead;
