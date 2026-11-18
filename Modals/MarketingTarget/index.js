const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const marketingTargetSchema = new Schema(
  {
    teamName: { type: String, required: true, trim: true },
    month: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    targetAmount: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'user', default: null },
  },
  { timestamps: true }
);

marketingTargetSchema.index({ teamName: 1, month: 1 }, { unique: true });

marketingTargetSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('MarketingTarget', marketingTargetSchema, 'marketing_targets');
