const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const coordinatorSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        contact_number: {
            type: String,
            required: false,
            trim: true
        },
        email: {
            type: String,
            required: false,
            trim: true
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

coordinatorSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('coordinator', coordinatorSchema);

