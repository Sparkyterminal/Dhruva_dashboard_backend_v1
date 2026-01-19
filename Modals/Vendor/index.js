// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;
// const ObjectId = Schema.Types.ObjectId;

// const vendorSchema = new Schema(
//     {
//         // vendor_id: {
//         //     type: Number,
//         //     required: true,
//         //     default: 0
//         // },
//         name: {
//             type: String,
//             required: true
//         },
        
//         email: {
//             type: String,
//             required: false
//         },
        
//         address: {
//             type: String,
//             required: true
//         },
        
//         city: {
//             type: String,
//             required: true
//         },
        
//         state: {
//             type: String,
//             required: true
//         },
        
//         zip: {
//             type: String,
//             required: true
//         },
//         persone_name: {
//             type: String,
//             required: true
//         },
        
//         country: {
//             type: String,
//             required: true
//         },
//         vendor_belongs_to: {
//             type: ObjectId,
//             ref: 'user',
//             required: true
//         },
//         vendor_category: {
//             type: String,
//             enum: ['INDIVIDUAL', 'HUF','COMPANY','FIRM'],
//             required: true
//         },
//         vendor_type: {
//             type: String,
//             enum: ['MATERIAL', 'LABOUR','COMPOSITE',"EXPENSES"],
//             required: true
//         },
//         vendor_phone: {
//             type: String,
//             required: true
//         },
//         vendor_status: {
//             type: String,
//             enum: ['ACTIVE', 'INACTIVE'],
//             default: 'ACTIVE',
//             required: false
//         },
//        gst_number: {
//             type: String,
//             required: false
//         },
//         pan_number: {
//             type: String,
//             required: false
//         },
//         msmed_number: {
//             type: String,
//             required: false
//         },
    
//     },
//     {
//         timestamps: true
//     }
// );

// vendorSchema.set("toJSON", {
//     transform: (doc, ret, options) => {
//         ret.id = ret._id;
//         delete ret._id;
//         delete ret.__v;
//     }
// });

// module.exports = mongoose.model('vendor', vendorSchema);

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.Types.ObjectId;

const vendorSchema = new Schema(
  {
    vendor_code: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    person_category: {
        type: String,
        required: true
      },
      company_name: {
        type: String,
        required: true
        // required: function () {
        //   return this.person_category === 'COMPANY';
        // }
      },
      refered_by: {
        type: String,
        required: false
      },

     department: {
      type: ObjectId,
      ref: 'department',
      required: false
     },
    temp_address_1: {
      type: String,
      required: false
    },
    temp_city: {
      type: String,
      required: false
    },
    temp_pin: {
      type: String,
      required: false
    },
    temp_state: {
      type: String,
      required: false
    },
    temp_country: {
      type: String,
      required: false
    },
    perm_address_1: {
      type: String,
      required: false
    },
    perm_address_2: {
      type: String,
      required: false
    },
    perm_city: {
      type: String,
      required: false
    },
    perm_pin: {
      type: String,
      required: false
    },
    perm_state: {
      type: String,
      required: false
    },
    perm_country: {
      type: String,
      required: false
    },
    cont_person: {
      type: String,
      required: false
    },
    designation: {
      type: String,
      required: false
    },
    mobile_no: {
      type: String,
      required: false
    },
    alt_mobile_no: {
      type: String,
      required: false
    },
    email: {
      type: String,
      required: false
    },
    vendor_type: {
      type: String,
    //   enum: ['MATERIAL', 'LABOUR', 'COMPOSITE', 'EXPENSES'],
      required: false
    },
    gst_no: {
      type: String,
      required: false
    },
    msmed_no: {
      type: String,
      required: false
    },
    pan_no: {
      type: String,
      required: false
    },
    adhar_no: {
      type: String,
      required: false
    },
    specify_cat: {
      type: String,
      enum: ['cash', 'account', 'cash_and_account'],
      required: false
    },
    bank_name: {
      type: String,
      required: false
    },
    beneficiary_name: {
      type: String,
      required: false
    },
    bank_address_1: {
      type: String,
      required: false
    },
    bank_address_2: {
      type: String,
      required: false
    },
    bank_pin: {
      type: String,
      required: false
    },
    account_number: {
      type: String,
      required: false
    },
    ifscode: {
      type: String,
      required: false
    },
    branch: {
      type: String,
      required: false
    },
    payment_terms: {
      type: String,
      required: false
    },
    tds_details: {
      type: String,
      required: false
    },
    vendor_status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      required: false
    },
    vendor_belongs_to: {
      type: ObjectId,
      ref: 'department',
      required: false
    }
  },
  {
    timestamps: true
  }
);

vendorSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('vendor', vendorSchema);
