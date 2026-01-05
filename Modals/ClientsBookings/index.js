
const mongoose = require("mongoose");
const EventName = require("../events");

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
  eventType: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  venueLocation: { type: String, required: true },
  agreedAmount: { type: Number },
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
  agreedAmount: { type: Number },
  advances: { type: [advanceSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
