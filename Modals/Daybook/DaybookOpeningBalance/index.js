const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Daybook V2 one-time opening balance (collection: daybookopeningbalances).
 * At most one document: the unique `singleton` key is always "default".
 * asOfDate is the first day of the Daybook. The amounts are the opening balance of that day.
 */
const daybookOpeningBalanceSchema = new Schema(
  {
    singleton: { type: String, default: 'default', unique: true, immutable: true },
    asOfDate: { type: String, required: true, trim: true },
    balances: {
      type: [
        {
          _id: false,
          source: { type: String, required: true, trim: true },
          amount: { type: Number, required: true },
        },
      ],
      default: [],
    },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('daybookopeningbalances', daybookOpeningBalanceSchema);
