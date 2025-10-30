const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const userSchema = new Schema(
    {
        first_name: {
            type: String,
            required: true
        },
        last_name: {
            type: String,
            required: true
        },
        email_data: {
            email_id: {
                type: String,
                required: false
            },
            temp_email_id: {
                type: String,
                required: false
            },
            is_validated: {
                type: Boolean,
                default: false
            },
            otp: {
                type: Number,
                default: 0
            },
            timestamp: {
                type: Date,
                required: false
            }
        },
        phone_data: {
            phone_number: {
                type: String,
                required: true
            },
            is_validated: {
                type: Boolean,
                default: false
            },
            otp: {
                type: Number,
                default: 0
            },
            timestamp: {
                type: Date,
                required: false
            }
        },
        designation: {
            type: String,
            required: false
        },
        role: {
            type: String,
            enum : ['ADMIN', 'DEPARTMENT','OWNER','ACCOUNTS',"MARKETING",'APPROVER'],
            default: 'ADMIN'
        },
     
        department: {
            has_department: {
                type: Boolean,
                default: false
            },
            department: [
                {
                    type: ObjectId,
                    ref: 'department',
                    required: false
                }
            ]
        },
        password: {
            type: String,
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

userSchema.index({
    first_name: 'text',
    last_name: 'text',
    'email_data.email_id': 'text',
    'phone_data.phone_number': 'text'
});


userSchema.set("toJSON", {
    transform: (doc, ret, options) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
    }
});

module.exports = mongoose.model('user', userSchema);