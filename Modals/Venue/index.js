const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const venueSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },
        address: {
            type: String,
            required: false,
            trim: true
        },
        city: {
            type: String,
            required: false,
            trim: true
        },
        state: {
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

venueSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('venue', venueSchema);

