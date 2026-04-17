const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const daybookAccountsOpenCloseBalanceSchema = new Schema(
  {
    // Stored as YYYY-MM-DD (UTC)
    balanceDate: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    cashOpeningBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    cashClosingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    accountOpeningBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    accountClosingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: String,
      required: false,
      default: null,
    },
  },
  { timestamps: true }
);

daybookAccountsOpenCloseBalanceSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model(
  'daybookaccountopenclosebalances',
  daybookAccountsOpenCloseBalanceSchema
);

