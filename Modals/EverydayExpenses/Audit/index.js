const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Immutable audit log for Everyday Expenses (collection: everydayexpenseaudits).
 * Insert-only: every update/delete path is blocked at the model level.
 * action: CREATE | EDIT | DELETE | REJECT | REPAY | CATEGORY_CREATE | CATEGORY_EDIT | GRADES | SETTINGS
 */
const auditSchema = new Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true }, // expense | category | grade | settings
    entityId: { type: String, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    actorName: { type: String, default: '' },
    at: { type: Date, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: false, versionKey: false }
);

auditSchema.index({ entity: 1, entityId: 1, at: 1 });

const blocked = function () {
  throw new Error('everydayexpenseaudits is immutable (insert-only)');
};
[
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
].forEach((op) => auditSchema.pre(op, blocked));
auditSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('everydayexpenseaudits is immutable (insert-only)'));
  return next();
});

module.exports = mongoose.model('everydayexpenseaudit', auditSchema);
