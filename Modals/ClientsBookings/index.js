
const mongoose = require("mongoose");
const EventName = require("../events");
const EventType = require("../eventTypes");

const advanceSchema = new mongoose.Schema({
  advanceNumber: { type: Number, required: true },
  expectedAmount: { type: Number, required: true },
  advanceDate: { type: Date, required: true },
  status: { type: String, default: "Pending" },

  receivedAmount: { type: Number, default: null },
  receivedDate: { type: Date, default: null },
  
  givenBy: { type: String, default: null },
  collectedBy: { type: String, default: null },
  modeOfPayment: { 
    type: String, 
    enum: ['cash', 'account'],
    default: null 
  },

  remarks: { type: String, default: "" },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const eventTypeSchema = new mongoose.Schema({
  eventType: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "EventType", 
    required: false,
    default: null
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  venueLocation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "venue", 
    required: false,
    default: null
  },
  subVenueLocation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "subVenueLocation", 
    required: false,
    default: null
  },
  coordinator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "coordinator", 
    required: false,
    default: null
  },
  agreedAmount: { type: Number },
  accountAmount: { type: Number, default: 0 },
  accountGst: { type: Number, default: 0 },
  accountAmountWithGst: { type: Number, default: 0 },
  cashAmount: { type: Number, default: 0 },
  totalPayable: { type: Number, default: 0 },
  advances: { type: [advanceSchema], default: [] }
});

const eventSchema = new mongoose.Schema({
  eventName: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "EventName", 
    required: true 
  },
  eventTypes: { type: [eventTypeSchema], default: [] },
  clientName: { type: String, required: true },
  brideName: { type: String },
  groomName: { type: String },
  lead1: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "coordinator", 
    required: false,
    default: null
  },
  lead2: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "coordinator", 
    required: false,
    default: null
  },
  contactNumber: { type: String, required: true },
  altContactNumber: { type: String },
  altContactName: { type: String },
  note: { type: String },
  eventConfirmation: { 
    type: String, 
    enum: ['Confirmed Event', 'InProgress'],
    required: false 
  },
  advancePaymentType: { 
    type: String, 
    enum: ['complete', 'separate'],
    required: false 
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" }
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
