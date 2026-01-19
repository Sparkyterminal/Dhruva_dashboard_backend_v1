
// const mongoose = require('mongoose');

// const emiStatusSchema = new mongoose.Schema({
//   month: { type: Number, required: true },  // 1-12
//   year: { type: Number, required: true },   // full year e.g. 2025
//   paid: { type: Boolean, default: false },
//   remarks: { type: String, default: '' },
//   paymentMode: { type: String, enum: ['Cash', 'Account'], default: 'Cash' }
// }, {_id:false});

// const billSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   belongs_to: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   emi_end_date: {
//     type: Date,
//     required: true,
//   },
//   emiType: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   emiDate: {  // The date of the EMI (day-of-month)
//     type: Date,
//     required: true,
//   },
//   amount: {
//     type: Number,
//     required: true,
//     min: 0,
//   },
//   emiStatus: [emiStatusSchema]  // Track status per month/year
// }, {
//   timestamps: true,
// });

// billSchema.set('toJSON', {
//   transform: (doc, ret) => {
//     ret.id = ret._id;
//     delete ret._id;
//     delete ret.__v;
//   }
// });

// const Bill = mongoose.model('Bill', billSchema);

// module.exports = Bill;
const mongoose = require('mongoose');

const emiStatusSchema = new mongoose.Schema({
  month: { type: Number, required: true },  // 1-12
  year: { type: Number, required: true },   // full year e.g. 2025
  emiAmount: { type: Number, required: true, min: 0 }, // EMI amount for this specific month
  paid: { type: Boolean, default: false },
  amountPaid: { type: Number, default: 0, min: 0 }, // Actual amount paid
  remarks: { type: String, default: '' },
  paymentMode: { type: String, enum: ['Cash', 'Account'], default: 'Cash' },
  paymentDate: { type: Date } // Actual date when payment was made
}, { _id: false });

const billSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  belongs_to: {
    type: String,
    required: true,
    trim: true,
  },
  emi_end_date: {
    type: Date,
    required: true,
  },
  emiType: {
    type: String,
    required: true,
    trim: true,
  },
  emiDate: {  // The starting date of EMI
    type: Date,
    required: true,
  },
  defaultAmount: {  // Default EMI amount (can be overridden per month)
    type: Number,
    required: true,
    min: 0,
  },
  emiStatus: [emiStatusSchema]  // Track status per month/year with specific amounts
}, {
  timestamps: true,
});

// Virtual field to calculate total EMI amount (sum of all monthly EMI amounts)
billSchema.virtual('totalEmiAmount').get(function() {
  return this.emiStatus.reduce((sum, status) => sum + (status.emiAmount || 0), 0);
});

// Virtual field to calculate total paid amount
billSchema.virtual('totalPaid').get(function() {
  return this.emiStatus.reduce((sum, status) => sum + (status.amountPaid || 0), 0);
});

// Virtual field to calculate remaining amount
billSchema.virtual('remainingAmount').get(function() {
  return this.totalEmiAmount - this.totalPaid;
});

billSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  }
});

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;