const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const pointSchema = new Schema({
    checklistPoint: {
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
        type: Number,
        required: false,
        default: 0
    },
    numbers: {
        type: Number,
        required: false,
        default: 0
    },
    rate: {
        type: Number,
        required: false,
        default: 0
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
        points: {
            type: [pointSchema],
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

