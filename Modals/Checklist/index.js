const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const checklistItemSchema = new Schema({
    checklistName: {
        type: String,
        required: true
    },
    units: {
        type: String,
        required: false,
        default: ''
    },
    length: {
        type: String,
        required: false,
        default: ''
    },
    breadth: {
        type: String,
        required: false,
        default: ''
    },
    depth: {
        type: String,
        required: false,
        default: ''
    },
    quantity: {
        type: String,
        required: false,
        default: ''
    },
    rate: {
        type: String,
        required: false,
        default: ''
    }
}, { _id: false });

const subHeadingSchema = new Schema({
    subHeadingName: {
        type: String,
        required: true
    },
    checklists: {
        type: [checklistItemSchema],
        required: true,
        default: []
    }
}, { _id: false });

const checklistSchema = new Schema(
    {
        heading: {
            type: String,
            required: true
        },
        eventReference: {
            type: String,
            required: false,
            default: ''
        },
        subHeadings: {
            type: [subHeadingSchema],
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

