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
        // due_date: {
        //     type: Date,
        //     required: true
        // },
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
        amount_paid: {
            type: Boolean,
            default: false
        },
        transation_in: {
            type: String,
            enum: ['CASH','ACCOUNT'],
            required: false,
        },
        amount_paid: {
            type: Number,
            default: 0,
            min: 0
        },
        total_amount_paid: {
            type: Number,
            default: 0,
            min: 0
        },
        remarks: {
            type: String,
            required: false,
            trim: true
        },
        vendor: {
            type: ObjectId,
            ref: 'vendor',
            required: false
        },
        handled_by: {
            type: ObjectId,
            ref: 'user',
            required: false
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

requestSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('request', requestSchema);

