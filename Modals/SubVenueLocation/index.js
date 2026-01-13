const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const subVenueLocationSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        venue: {
            type: ObjectId,
            ref: 'venue',
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

subVenueLocationSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('subVenueLocation', subVenueLocationSchema);

