const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const vendorSchema = new Schema(
    {
        vendor_id: {
            type: Number,
            required: true,
            default: 0
        },
        name: {
            type: String,
            required: true
        },
        
        email: {
            type: String,
            required: false
        },
        
        address: {
            type: String,
            required: true
        },
        
        city: {
            type: String,
            required: true
        },
        
        state: {
            type: String,
            required: true
        },
        
        zip: {
            type: String,
            required: true
        },
        persone_name: {
            type: String,
            required: true
        },
        
        country: {
            type: String,
            required: true
        },
        vendor_belongs_to: {
            type: ObjectId,
            ref: 'user',
            required: true
        },
        vendor_category: {
            type: String,
            enum: ['INDIVIDUAL', 'HUF','COMPANY','FIRM'],
            required: true
        },
        vendor_type: {
            type: String,
            enum: ['MATERIAL', 'LABOUR','COMPOSITE',"EXPENSES"],
            required: true
        },
        vendor_status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE'],
            required: true
        },
       gst_number: {
            type: String,
            required: false
        },
        pan_number: {
            type: String,
            required: false
        },
        msmed_number: {
            type: String,
            required: false
        },
    
    },
    {
        timestamps: true
    }
);

vendorSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('vendor', vendorSchema);