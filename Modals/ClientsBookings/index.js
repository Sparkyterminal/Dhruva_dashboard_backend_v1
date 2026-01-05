
const mongoose = require("mongoose");
const EventName = require("../events");
const EventType = require("../eventTypes");

const advanceSchema = new mongoose.Schema({
  advanceNumber: { type: Number, required: true },
  expectedAmount: { type: Number, required: true },
  advanceDate: { type: Date, required: true },

  receivedAmount: { type: Number, default: 0 },
  receivedDate: { type: Date },

  remarks: {
    accounts: { type: String, default: "" },
    owner: { type: String, default: "" },
    approver: { type: String, default: "" }
  },

  updatedBy: {
    accounts: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },

  updatedAt: {
    accounts: { type: Date },
    owner: { type: Date },
    approver: { type: Date }
  }
}, { _id: false });

const eventTypeSchema = new mongoose.Schema({
  eventType: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "EventType", 
    required: true 
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  venueLocation: { type: String, required: true },
  agreedAmount: { type: Number },
  agreedAmountBreakup: {
    accountAmount: { type: Number, default: 0 },
    cashAmount: { type: Number, default: 0 },
    accountGstRate: { type: Number, default: 0 },
    accountGstAmount: { type: Number, default: 0 },
    accountTotalWithGst: { type: Number, default: 0 }
  },
  advances: { type: [advanceSchema], default: [] }
});

const eventSchema = new mongoose.Schema({
  eventName: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "EventName", 
    required: true 
  },
  eventTypes: { type: [eventTypeSchema], required: true, default: [] },
  clientName: { type: String, required: true },
  brideName: { type: String },
  groomName: { type: String },
  lead1: { type: String, default: "" },
  lead2: { type: String, default: "" },
  contactNumber: { type: String, required: true },
  altContactNumber: { type: String },
  altContactName: { type: String },
  note: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
