// const mongoose = require('mongoose');

// const billSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   emiDate: {
//     type: Date,
//     required: true,
//   },
//   amount: {
//     type: Number,
//     required: true,
//     min: 0,
//   }
// }, {
//   timestamps: true, 
// });

// const Bill = mongoose.model('Bill', billSchema);

// module.exports = Bill;


const mongoose = require('mongoose');

const emiStatusSchema = new mongoose.Schema({
  month: { type: Number, required: true },  // 1-12
  year: { type: Number, required: true },   // full year e.g. 2025
  paid: { type: Boolean, default: false }
}, {_id:false});

const billSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  emiDate: {  // The date of the EMI (day-of-month)
    type: Date,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  emiStatus: [emiStatusSchema]  // Track status per month/year
}, {
  timestamps: true,
});

billSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  }
});

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;
