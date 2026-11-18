const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const personalCalendarSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['TODO_LIST', 'PROBLEM_RESOLVES', 'GENERAL_MEETING_NOTES'],
      required: true,
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

personalCalendarSchema.index({ userId: 1, startAt: -1, category: 1 });

personalCalendarSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('PersonalCalendar', personalCalendarSchema, 'personal_calendars');
