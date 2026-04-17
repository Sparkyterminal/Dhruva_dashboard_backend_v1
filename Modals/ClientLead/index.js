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
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    createdBy: { type: ObjectId, ref: 'user', default: null },
  },
  { timestamps: true }
);

const ClientLead = mongoose.model('clientlead', clientLeadSchema);

module.exports = ClientLead;
