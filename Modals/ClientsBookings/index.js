const mongoose = require("mongoose");

const advanceSchema = new mongoose.Schema({
  advanceNumber: { type: Number, required: true },
  expectedAmount: { type: Number, required: true },
  receivedAmount: { type: Number, default: 0 },

  remarks: {
    accounts: { type: String, default: "" },
    owner: { type: String, default: "" },
    approver: { type: String, default: "" }
  },

  updatedBy: {
    accounts: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },

  updatedAt: {
    accounts: { type: Date },
    owner: { type: Date },
    approver: { type: Date }
  }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  eventDate: { type: Date, required: true },
  venueLocation: { type: String, required: true },
  agreedAmount: { type: Number, required: true },

  advances: [advanceSchema]

}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;     
