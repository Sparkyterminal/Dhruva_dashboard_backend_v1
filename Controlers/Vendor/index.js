// const Vendor = require('../../Modals/Vendor'); 
// const validations = require("../../utils/validations");
// const jwt = require('jsonwebtoken');
// const STATUS = require("../../utils/statusCodes");
// const MESSAGE = require("../../utils/messages");
// const { validationResult } = require("express-validator");
// const User = require('../../Modals/User');
// const mongoose = require('mongoose');

// // Create vendor
// exports.createVendor = async (req, res) => {
//     // Validate input errors from express-validator (if configured)
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//         return res.status(STATUS.BAD_REQUEST).json({
//             message: 'Bad request',
//             errors: errors.array()
//         });
//     }
//     const token = req.get('Authorization');
//     let decodedToken = await jwt.decode(token)
//     if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER' && decodedToken.role !== 'ACCOUNTS' && decodedToken.role !== 'MARKETING' && decodedToken.role !== 'APPROVER'&& decodedToken.role !== 'DEPARTMENT') {
//         return res.status(STATUS.UNAUTHORISED).json({
//             message: MESSAGE.unauthorized,
//         });
//     }
//     // console.log('decodedToken',decodedToken);
//         const userId = decodedToken.uid; // userId set by auth middleware
//     // console.log(userId);
//         const {
//             // vendor_id,
//             name,
//             email,
//             address,
//             city,
//             state,
//             zip,
//             country,
//             persone_name,
//             vendor_phone,
//             vendor_category,
//             vendor_type,
//             vendor_status,
//             gst_number,
//             pan_number,
//             msmed_number
//         } = req.body;

//         // ========== INPUT VALIDATIONS ==========
//         if (!name || typeof name !== 'string' || name.trim().length === 0) {
//             return res.status(STATUS.VALIDATION_FAILED).json({
//                 message: 'Vendor name is required',
//                 field: 'name'
//             });
//         }

//         // Add other required field validations as necessary, for example:
//         if (!email || typeof email !== 'string' || email.trim().length === 0) {
//             return res.status(STATUS.VALIDATION_FAILED).json({
//                 message: 'Email is required',
//                 field: 'email'
//             });
//         }
//         const isEmailValid = validations.validateEmailID ? await validations.validateEmailID(email) : true;
//         if (!isEmailValid) {
//             return res.status(STATUS.VALIDATION_FAILED).json({
//                 message: 'Invalid email format',
//                 field: 'email'
//             });
//         }

//         if (!vendor_category || !['INDIVIDUAL', 'HUF', 'COMPANY', 'FIRM'].includes(vendor_category)) {
//             return res.status(STATUS.VALIDATION_FAILED).json({
//                 message: 'Invalid vendor category',
//                 field: 'vendor_category'
//             });
//         }

//         if (!vendor_type || !['MATERIAL', 'LABOUR', 'COMPOSITE', 'EXPENSES'].includes(vendor_type)) {
//             return res.status(STATUS.VALIDATION_FAILED).json({
//                 message: 'Invalid vendor type',
//                 field: 'vendor_type'
//             });
//         }

//         // if (!vendor_status || !['ACTIVE', 'INACTIVE'].includes(vendor_status)) {
//         //     return res.status(STATUS.VALIDATION_FAILED).json({
//         //         message: 'Invalid vendor status',
//         //         field: 'vendor_status'
//         //     });
//         // }

//         // You can add further validations of other required fields as needed

//         // ========== Build vendor document ==========
//         const vendorData = {
//             // vendor_id: vendor_id || 0,
//             name: name.trim(),
//             email: email.trim(),
//             address: address ? address.trim() : '',
//             city: city ? city.trim() : '',
//             state: state ? state.trim() : '',
//             zip: zip ? zip.trim() : '',
//             country: country ? country.trim() : '',
//             persone_name: persone_name ? persone_name.trim() : '',
//             vendor_phone: vendor_phone ? vendor_phone.trim() : '',
//             vendor_belongs_to: userId,
//             vendor_category,
//             vendor_type,
//             vendor_status,
//             gst_number: gst_number ? gst_number.trim() : '',
//             pan_number: pan_number ? pan_number.trim() : '',
//             msmed_number: msmed_number ? msmed_number.trim() : ''
//         };

//         const vendor = new Vendor(vendorData);

//         const savedVendor = await vendor.save();

//         return res.status(STATUS.CREATED).json({
//             message: 'Vendor created successfully',
//             data: {
//                 id: savedVendor.id,
//                 name: savedVendor.name,
//                 email: savedVendor.email,
//                 vendor_category: savedVendor.vendor_category,
//                 vendor_type: savedVendor.vendor_type,
//                 vendor_status: savedVendor.vendor_status
//             }
//         });

    
// }

// // Get all vendors for logged-in user
// exports.getVendors = async (req, res) => {
//     try {
//         const userId = req.userId; // logged-in user ID from auth middleware
//         const { departmentId, search } = req.query; // <-- added search

//         let userFilter = { _id: userId };
//         if (departmentId) {
//             userFilter = {
//                 'department.department': departmentId,
//                 'department.has_department': true,
//                 is_active: true,
//                 is_archived: false
//             };
//         }

//         // Find users who belong to the department (or just the logged-in user if no departmentId)
//         const users = await User.find(userFilter).select('_id');
//         const userIds = users.map(u => u._id);

//         // Build vendor query
//         let vendorQuery = { vendor_belongs_to: { $in: userIds } };

//         // Add search
//         if (search && search.trim()) {
//             vendorQuery.name = { $regex: search.trim(), $options: 'i' }; // case-insensitive search
//         }

//         // Fetch vendors belonging to the filtered users
//         const vendors = await Vendor.find(vendorQuery).sort({ createdAt: -1 });

//         res.json({ success: true, vendors });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

// // Get single vendor
// exports.getVendorById = async (req, res) => {
//     try {
//         // const userId = req.user._id;
//         const vendor = await Vendor.findOne({ _id: req.params.id, });

//         if (!vendor) {
//             return res.status(404).json({ success: false, error: "Vendor not found" });
//         }

//         res.json({ success: true, vendor });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

// // Update vendor
// exports.updateVendor = async (req, res) => {
//     try {
//         // const userId = req.user._id;
//         const vendor = await Vendor.findOneAndUpdate(
//             { _id: req.params.id },
//             req.body,
//             { new: true, runValidators: true }
//         );

//         if (!vendor) {
//             return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
//         }

//         res.json({ success: true, vendor });
//     } catch (error) {
//         res.status(400).json({ success: false, error: error.message });
//     }
// };

// // Delete vendor
// exports.getVendorsByDepartmentId = async (req, res) => {
//     try {
//         const departmentId = req.params.id;

//         // Validate departmentId is a valid ObjectId
//         if (!mongoose.Types.ObjectId.isValid(departmentId)) {
//             return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid department ID" });
//         }

//         // Find users who belong to the given department, active and not archived
//         const users = await User.find({
//             'department.department': departmentId,
//             'department.has_department': true,
//             is_active: true,
//             is_archived: false
//         }).select('_id');

//         if (!users.length) {
//             return res.status(STATUS.NOT_FOUND).json({ message: "No users found for this department" });
//         }

//         const userIds = users.map(u => u._id);

//         // Find vendors linked to these users
//         const vendors = await Vendor.find({
//             vendor_belongs_to: { $in: userIds }
//         }).sort({ createdAt: -1 });

//         return res.status(STATUS.SUCCESS).json({ vendors });

//     } catch (error) {
//         console.error('Error fetching vendors by department:', error);
//         return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
//     }
// }

// exports.deleteVendor = async (req, res) => {
//     try {
//         // const userId = req.user._id;
//         const vendor = await Vendor.findOneAndDelete({ _id: req.params.id });

//         if (!vendor) {
//             return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
//         }

//         res.json({ success: true, message: "Vendor deleted successfully" });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

// exports.getAllVendors = async (req, res) => {
//   try {
//     const { search } = req.query;

//     let query = {};

//     // If search query is present, add regex filter on 'name'
//     if (search && search.trim()) {
//       query.name = { $regex: search.trim(), $options: 'i' };
//     }

//     const vendors = await Vendor.find(query).sort({ createdAt: -1 });

//     res.json({ success: true, vendors });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// };


const Vendor = require('../../Modals/Vendor'); 
const validations = require("../../utils/validations");
const jwt = require('jsonwebtoken');
const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const { validationResult } = require("express-validator");
const User = require('../../Modals/User');
const Department = require('../../Modals/Department');
const mongoose = require('mongoose');

const generateVendorCode = async () => {
  const lastVendor = await Vendor.findOne({ vendor_code: { $exists: true, $ne: null } })
    .sort({ createdAt: -1 })
    .select('vendor_code')
    .lean();

  let nextNumber = 1;
  if (lastVendor && lastVendor.vendor_code) {
    const match = lastVendor.vendor_code.match(/sbe-(\d+)/i);
    if (match && !Number.isNaN(parseInt(match[1], 10))) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  } else {
    const totalVendors = await Vendor.countDocuments();
    nextNumber = totalVendors + 1;
  }

  return `sbe-${nextNumber}`;
};

// Create vendor
exports.createVendor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(STATUS.BAD_REQUEST).json({
      message: 'Bad request',
      errors: errors.array()
    });
  }

  const token = req.get('Authorization');
  const decodedToken = await jwt.decode(token);
  if (
    !['ADMIN', 'OWNER', 'ACCOUNTS', 'MARKETING', 'APPROVER', 'DEPARTMENT'].includes(decodedToken.role)
  ) {
    return res.status(STATUS.UNAUTHORISED).json({
      message: MESSAGE.unauthorized,
    });
  }
  const userId = decodedToken.uid;

  const {
    name,
    person_category,
    company_name,
    referred_by,
    refered_by,
    department,
    temp_address_1,
    temp_city,
    temp_pin,
    temp_state,
    temp_country,
    perm_address_1,
    perm_address_2,
    perm_city,
    perm_pin,
    perm_state,
    perm_country,
    cont_person,
    designation,
    mobile_no,
    alt_mobile_no,
    email,
    vendor_type,
    gst_no,
    msmed_no,
    pan_no,
    adhar_no,
    specify_cat,
    bank_name,
    beneficiary_name,
    bank_address_1,
    bank_address_2,
    bank_pin,
    account_number,
    ifscode,
    branch,
    payment_terms,
    tds_details,
    vendor_status
  } = req.body;

  // Validations
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(STATUS.VALIDATION_FAILED).json({
      message: 'Vendor name is required',
      field: 'name'
    });
  }

//   if (!person_category .includes(person_category)) {
//     return res.status(STATUS.VALIDATION_FAILED).json({
//       message: 'Invalid person_category',
//       field: 'person_category'
//     });
//   }

//   if (person_category === 'COMPANY' && (!company_name || company_name.trim().length === 0)) {
//     return res.status(STATUS.VALIDATION_FAILED).json({
//       message: 'Company name is required for company category',
//       field: 'company_name'
//     });
//   }

  if (email && typeof email === 'string' && email.trim().length > 0) {
    const isEmailValid = validations.validateEmailID ? await validations.validateEmailID(email) : true;
    if (!isEmailValid) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'Invalid email format',
        field: 'email'
      });
    }
  }

  // Validate department if provided
  if (department) {
    if (!mongoose.Types.ObjectId.isValid(department)) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'Invalid department ID',
        field: 'department'
      });
    }
    // Verify department exists
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Department not found',
        field: 'department'
      });
    }
  }

  // Validate specify_cat if provided
  if (specify_cat && !['cash', 'account', 'cash_and_account'].includes(specify_cat)) {
    return res.status(STATUS.VALIDATION_FAILED).json({
      message: 'Invalid specify_cat. Must be: cash, account, or cash_and_account',
      field: 'specify_cat'
    });
  }

//   if (!vendor_type || !['MATERIAL', 'LABOUR', 'COMPOSITE', 'EXPENSES'].includes(vendor_type)) {
//     return res.status(STATUS.VALIDATION_FAILED).json({
//       message: 'Invalid vendor type',
//       field: 'vendor_type'
//     });
//   }

  const vendor_code = await generateVendorCode();

  // Construct vendor object
  const vendorData = {
    vendor_code,
    name: name.trim(),
    person_category,
    company_name: company_name ? company_name.trim() : '',
    refered_by: (referred_by || refered_by) ? (referred_by || refered_by).trim() : '',
    department: department || null,
    temp_address_1: temp_address_1 ? temp_address_1.trim() : '',
    temp_city: temp_city ? temp_city.trim() : '',
    temp_pin: temp_pin ? temp_pin.trim() : '',
    temp_state: temp_state ? temp_state.trim() : '',
    temp_country: temp_country ? temp_country.trim() : '',
    perm_address_1: perm_address_1 ? perm_address_1.trim() : '',
    perm_address_2: perm_address_2 ? perm_address_2.trim() : '',
    perm_city: perm_city ? perm_city.trim() : '',
    perm_pin: perm_pin ? perm_pin.trim() : '',
    perm_state: perm_state ? perm_state.trim() : '',
    perm_country: perm_country ? perm_country.trim() : '',
    cont_person: cont_person ? cont_person.trim() : '',
    designation: designation ? designation.trim() : '',
    mobile_no: mobile_no ? mobile_no.trim() : '',
    alt_mobile_no: alt_mobile_no ? alt_mobile_no.trim() : '',
    email: email ? email.trim() : '',
    vendor_type,
    gst_no: gst_no ? gst_no.trim() : '',
    msmed_no: msmed_no ? msmed_no.trim() : '',
    pan_no: pan_no ? pan_no.trim() : '',
    adhar_no: adhar_no ? adhar_no.trim() : '',
    specify_cat: specify_cat || null,
    bank_name: bank_name ? bank_name.trim() : '',
    beneficiary_name: beneficiary_name ? beneficiary_name.trim() : '',
    bank_address_1: bank_address_1 ? bank_address_1.trim() : '',
    bank_address_2: bank_address_2 ? bank_address_2.trim() : '',
    bank_pin: bank_pin ? bank_pin.trim() : '',
    account_number: account_number ? account_number.trim() : '',
    ifscode: ifscode ? ifscode.trim() : '',
    branch: branch ? branch.trim() : '',
    payment_terms: payment_terms ? payment_terms.trim() : '',
    tds_details: tds_details ? tds_details.trim() : '',
    vendor_status: vendor_status || 'ACTIVE',
    vendor_belongs_to: userId
  };

  try {
    const vendor = new Vendor(vendorData);
    const savedVendor = await vendor.save();

    return res.status(STATUS.CREATED).json({
      message: 'Vendor created successfully',
      data: {
        id: savedVendor.id,
        vendor_code: savedVendor.vendor_code,
        name: savedVendor.name,
        vendor_category: savedVendor.person_category,
        vendor_type: savedVendor.vendor_type,
        vendor_status: savedVendor.vendor_status
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating vendor', error: error.message });
  }
};

// Get all vendors for logged-in user
exports.getVendors = async (req, res) => {
  try {
    const userId = req.userId; // logged-in user ID from auth middleware
    const { departmentId, search } = req.query;

    let userFilter = { _id: userId };
    if (departmentId) {
      userFilter = {
        'department.department': departmentId,
        'department.has_department': true,
        is_active: true,
        is_archived: false
      };
    }

    const users = await User.find(userFilter).select('_id');
    const userIds = users.map(u => u._id);

    let vendorQuery = { vendor_belongs_to: { $in: userIds } };

    if (search && search.trim()) {
      vendorQuery.name = { $regex: search.trim(), $options: 'i' };
    }

    const vendors = await Vendor.find(vendorQuery)
      .populate('department', 'id name')
      .sort({ createdAt: -1 });

    res.json({ success: true, vendors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ _id: req.params.id })
      .populate('department', 'id name');

    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found" });
    }

    res.json({ success: true, vendor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update vendor
exports.updateVendor = async (req, res) => {
  try {
    const updatedData = { ...req.body };

    // Handle spelling difference: referred_by (from frontend) -> refered_by (in schema)
    if (updatedData.referred_by !== undefined) {
      updatedData.refered_by = typeof updatedData.referred_by === 'string' 
        ? updatedData.referred_by.trim() 
        : updatedData.referred_by;
      delete updatedData.referred_by;
    }

    // Trim refered_by field if it exists
    if (updatedData.refered_by && typeof updatedData.refered_by === 'string') {
      updatedData.refered_by = updatedData.refered_by.trim();
    }

    // Trim adhar_no if provided
    if (updatedData.adhar_no !== undefined) {
      updatedData.adhar_no = updatedData.adhar_no ? updatedData.adhar_no.trim() : '';
    }

    // Validate specify_cat if provided
    if (updatedData.specify_cat !== undefined) {
      if (updatedData.specify_cat && !['cash', 'account', 'cash_and_account'].includes(updatedData.specify_cat)) {
        return res.status(STATUS.VALIDATION_FAILED).json({
          message: 'Invalid specify_cat. Must be: cash, account, or cash_and_account',
          field: 'specify_cat'
        });
      }
    }

    // Validate department if provided
    if (updatedData.department !== undefined) {
      if (updatedData.department === null || updatedData.department === '') {
        updatedData.department = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(updatedData.department)) {
          return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Invalid department ID',
            field: 'department'
          });
        }
        // Verify department exists
        const departmentExists = await Department.findById(updatedData.department);
        if (!departmentExists) {
          return res.status(STATUS.NOT_FOUND).json({
            message: 'Department not found',
            field: 'department'
          });
        }
      }
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id },
      updatedData,
      { new: true, runValidators: true }
    ).populate('department', 'id name');

    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
    }

    res.json({ success: true, vendor });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findOneAndDelete({ _id: req.params.id });

    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
    }

    res.json({ success: true, message: "Vendor deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get vendors by department ID
exports.getVendorsByDepartmentId = async (req, res) => {
  try {
    const departmentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid department ID" });
    }

    const users = await User.find({
      'department.department': departmentId,
      'department.has_department': true,
      is_active: true,
      is_archived: false
    }).select('_id');

    if (!users.length) {
      return res.status(STATUS.NOT_FOUND).json({ message: "No users found for this department" });
    }

    const userIds = users.map(u => u._id);

    const vendors = await Vendor.find({
      vendor_belongs_to: { $in: userIds }
    })
      .populate('department', 'id name')
      .sort({ createdAt: -1 });

    return res.status(STATUS.SUCCESS).json({ vendors });
  } catch (error) {
    console.error('Error fetching vendors by department:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
  }
};

// Get all vendors without auth (public)
exports.getAllVendors = async (req, res) => {
  try {
    const { search } = req.query;

    let query = {};
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    const vendors = await Vendor.find(query)
      .populate('department', 'id name')
      .populate({
        path: 'vendor_belongs_to',
        populate: {
          path: 'department.department',
          select: 'name description' 
        }
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, vendors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all vendors list with pagination and filters (authenticated)
exports.getAllVendorsList = async (req, res) => {
  try {
    const { 
      search, 
      department, 
      vendor_type, 
      vendor_status,
      page = 1, 
      limit = 20 
    } = req.query;

    // Build query
    let query = {};

    // Search by name or vendor_code
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { vendor_code: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // Filter by department
    if (department && mongoose.Types.ObjectId.isValid(department)) {
      query.department = department;
    }

    // Filter by vendor_type
    if (vendor_type && vendor_type.trim()) {
      query.vendor_type = vendor_type.trim();
    }

    // Filter by vendor_status
    if (vendor_status && ['ACTIVE', 'INACTIVE'].includes(vendor_status)) {
      query.vendor_status = vendor_status;
    }

    // Pagination
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    // Get total count
    const totalVendors = await Vendor.countDocuments(query);

    // Get vendors with pagination
    const vendors = await Vendor.find(query)
      .populate('department', 'id name')
      .populate('vendor_belongs_to', 'id name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitInt);

    res.json({ 
      success: true, 
      vendors,
      pagination: {
        currentPage: pageInt,
        totalPages: Math.ceil(totalVendors / limitInt),
        totalVendors,
        limit: limitInt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


