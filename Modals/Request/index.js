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
        required_date: {
            type: Date,
            required: false
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
        entity_account: {
            type: String,
            default: '',
            required: false
        },
        amount_paid_to: {
            type: String,
            default: '',
            required: false
        },
        total_amount_paid: {
            type: Number,
            default: 0,
            min: 0
        },
        planned_amount:{
            type: Number,
            default: 0,
            min: 0
        },
        approver_amount: {
            type: Number,
            default: 0,
            min: 0
        },
        accounts_check: {
            type: String,
            enum: ['APPROVED', 'REJECTED', 'PENDING'],  
            default: 'PENDING'
        },
        owner_check: {
            type: String,
            enum: ['APPROVED', 'REJECTED', 'PENDING'],
            default: 'PENDING'
        },
        approver_check: {
            type: String,
            enum: ['APPROVED', 'REJECTED', 'PENDING'],
            default: 'PENDING'
        },
        ca_check: {
            type: String,
            enum: ['APPROVED', 'REJECTED', 'PENDING'],
            default: 'PENDING'
        },
        ca_approved: {
            type: Boolean,
            default: false
        },
        ca_approved_by: {
            type: ObjectId,
            ref: 'user',
            required: false
        },
        ca_approved_at: {
            type: Date,
            required: false
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
        event_reference: {
            type: ObjectId,
            ref: 'Event',
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

// Performance indexes to keep request listing APIs fast and avoid timeouts
requestSchema.index({ is_archived: 1, createdAt: -1 });
requestSchema.index({ is_archived: 1, department: 1, createdAt: -1 });
requestSchema.index({ is_archived: 1, status: 1, createdAt: -1 });
requestSchema.index({ is_archived: 1, event_reference: 1, createdAt: -1 });
requestSchema.index({ is_archived: 1, vendor: 1, createdAt: -1 });
requestSchema.index({ is_archived: 1, required_date: 1 });
requestSchema.index({ is_archived: 1, accounts_check: 1, ca_check: 1, owner_check: 1, approver_check: 1 });

requestSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('request', requestSchema);

