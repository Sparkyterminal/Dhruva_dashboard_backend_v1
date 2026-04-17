const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const daybookInflowSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Stored as YYYY-MM-DD (UTC)
    receivedDate: {
      type: String,
      required: true,
      trim: true,
    },
    receivedIn: {
      type: String,
      required: true,
      enum: ['CASH', 'ACCOUNT'],
    },
    accountName: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    amountReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    receivedBy: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional: links this manual inflow to an Event (booking) advance/receipt flow.
    // Stored as ObjectId so it can be populated later if needed.
    event_reference: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: false,
      default: null,
    },
    note: {
      type: String,
      required: false,
      default: '',
      trim: true,
    },
    createdBy: {
      type: String,
      required: false,
      default: null,
    },
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

