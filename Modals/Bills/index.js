const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  emiDate: {
    type: Date,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  }
}, {
  timestamps: true, // For createdAt and updatedAt fields
});

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;
