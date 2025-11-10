const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const checklistSchema = new Schema(
    {
        heading: {
            type: String,
            required: true
        },
        points: {
            type: [String],
            required: true,
            default: []
        },
        department: {
            type: ObjectId,
            ref: 'department',
            required: true
        },
        is_active: {
            type: Boolean,
            default: true
        },
        is_archived: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

checklistSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('checklist', checklistSchema);

