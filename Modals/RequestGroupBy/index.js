const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const requestGroupBySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

requestGroupBySchema.index({ name: 1 }, { unique: true });

requestGroupBySchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

module.exports = mongoose.model('RequestGroupBy', requestGroupBySchema, 'request_group_bys');
