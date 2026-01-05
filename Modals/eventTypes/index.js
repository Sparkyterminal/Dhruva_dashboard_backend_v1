const mongoose = require("mongoose");
const EventName = require("../events");

const eventTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EventName",
    required: true
  }
}, {
  timestamps: true
});

// Compound unique index to ensure name is unique per event
eventTypeSchema.index({ name: 1, event: 1 }, { unique: true });

eventTypeSchema.set("toJSON", {
  transform: (doc, ret, options) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  }
});

const EventType = mongoose.model("EventType", eventTypeSchema);

module.exports = EventType;

