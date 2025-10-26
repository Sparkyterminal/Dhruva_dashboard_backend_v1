const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const requestSchema = new Schema(
    {
        purpose: {
            type: String,
            required: true,
            trim: true
        },
        due_date: {
            type: Date,
            required: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        priority: {
            type: String,
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            default: 'MEDIUM'
        },
        note: {
            type: String,
            required: false,
            trim: true
        },
        requested_by: {
            type: ObjectId,
            ref: 'user',
            required: true
        },
        department: {
            type: ObjectId,
            ref: 'department',
            required: false
        },
        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
            default: 'PENDING'
        },
        amount_received: {
            type: Boolean,
            default: false
        },
        received_amount: {
            type: Number,
            default: 0,
            min: 0
        },
        total_received_amount: {
            type: Number,
            default: 0,
            min: 0
        },
        // amount_given: {
        //     type: Boolean,
        //     default: false
        // },
        // given_amount: {
        //     type: Number,
        //     default: 0,
        //     min: 0
        // },
        // given_to_specific_work: {
        //     type: String,
        //     required: false,
        //     trim: true
        // },
        // remarks: {
        //     type: String,
        //     required: false,
        //     trim: true
        // },
        // handled_by: {
        //     type: ObjectId,
        //     ref: 'user',
        //     required: false
        // },
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

requestSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('request', requestSchema);

