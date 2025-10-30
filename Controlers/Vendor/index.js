const Vendor = require('../../Modals/Vendor'); 
const validations = require("../../utils/validations");
const jwt = require('jsonwebtoken');
const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const { validationResult } = require("express-validator");
const User = require('../../Modals/User');
const mongoose = require('mongoose');

// Create vendor
exports.createVendor = async (req, res) => {
    // Validate input errors from express-validator (if configured)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token)
    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER' && decodedToken.role !== 'ACCOUNTS' && decodedToken.role !== 'MARKETING' && decodedToken.role !== 'APPROVER'&& decodedToken.role !== 'DEPARTMENT') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }
    // console.log('decodedToken',decodedToken);
        const userId = decodedToken.uid; // userId set by auth middleware
    // console.log(userId);
        const {
            // vendor_id,
            name,
            email,
            address,
            city,
            state,
            zip,
            country,
            persone_name,
            vendor_phone,
            vendor_category,
            vendor_type,
            vendor_status,
            gst_number,
            pan_number,
            msmed_number
        } = req.body;

        // ========== INPUT VALIDATIONS ==========
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Vendor name is required',
                field: 'name'
            });
        }

        // Add other required field validations as necessary, for example:
        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Email is required',
                field: 'email'
            });
        }
        const isEmailValid = validations.validateEmailID ? await validations.validateEmailID(email) : true;
        if (!isEmailValid) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Invalid email format',
                field: 'email'
            });
        }

        if (!vendor_category || !['INDIVIDUAL', 'HUF', 'COMPANY', 'FIRM'].includes(vendor_category)) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Invalid vendor category',
                field: 'vendor_category'
            });
        }

        if (!vendor_type || !['MATERIAL', 'LABOUR', 'COMPOSITE', 'EXPENSES'].includes(vendor_type)) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Invalid vendor type',
                field: 'vendor_type'
            });
        }

        // if (!vendor_status || !['ACTIVE', 'INACTIVE'].includes(vendor_status)) {
        //     return res.status(STATUS.VALIDATION_FAILED).json({
        //         message: 'Invalid vendor status',
        //         field: 'vendor_status'
        //     });
        // }

        // You can add further validations of other required fields as needed

        // ========== Build vendor document ==========
        const vendorData = {
            // vendor_id: vendor_id || 0,
            name: name.trim(),
            email: email.trim(),
            address: address ? address.trim() : '',
            city: city ? city.trim() : '',
            state: state ? state.trim() : '',
            zip: zip ? zip.trim() : '',
            country: country ? country.trim() : '',
            persone_name: persone_name ? persone_name.trim() : '',
            vendor_phone: vendor_phone ? vendor_phone.trim() : '',
            vendor_belongs_to: userId,
            vendor_category,
            vendor_type,
            vendor_status,
            gst_number: gst_number ? gst_number.trim() : '',
            pan_number: pan_number ? pan_number.trim() : '',
            msmed_number: msmed_number ? msmed_number.trim() : ''
        };

        const vendor = new Vendor(vendorData);

        const savedVendor = await vendor.save();

        return res.status(STATUS.CREATED).json({
            message: 'Vendor created successfully',
            data: {
                id: savedVendor.id,
                name: savedVendor.name,
                email: savedVendor.email,
                vendor_category: savedVendor.vendor_category,
                vendor_type: savedVendor.vendor_type,
                vendor_status: savedVendor.vendor_status
            }
        });

    
}

// Get all vendors for logged-in user
exports.getVendors = async (req, res) => {
    try {
        const userId = req.userId; // logged-in user ID from auth middleware
        const { departmentId } = req.query;

        let userFilter = { _id: userId };
        if (departmentId) {
            userFilter = {
                'department.department': departmentId,
                'department.has_department': true,
                is_active: true,
                is_archived: false
            };
        }

        // Find users who belong to the department (or just the logged-in user if no departmentId)
        const users = await User.find(userFilter).select('_id');
        const userIds = users.map(u => u._id);

        // Fetch vendors belonging to the filtered users
        const vendors = await Vendor.find({ vendor_belongs_to: { $in: userIds } }).sort({ createdAt: -1 });

        res.json({ success: true, vendors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get single vendor
exports.getVendorById = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendor = await Vendor.findOne({ _id: req.params.id, vendor_belongs_to: userId });

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
        const userId = req.user._id;
        const vendor = await Vendor.findOneAndUpdate(
            { _id: req.params.id, vendor_belongs_to: userId },
            req.body,
            { new: true, runValidators: true }
        );

        if (!vendor) {
            return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
        }

        res.json({ success: true, vendor });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Delete vendor
exports.getVendorsByDepartmentId = async (req, res) => {
    try {
        const departmentId = req.params.id;

        // Validate departmentId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid department ID" });
        }

        // Find users who belong to the given department, active and not archived
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

        // Find vendors linked to these users
        const vendors = await Vendor.find({
            vendor_belongs_to: { $in: userIds }
        }).sort({ createdAt: -1 });

        return res.status(STATUS.SUCCESS).json({ vendors });

    } catch (error) {
        console.error('Error fetching vendors by department:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
}

exports.deleteVendor = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendor = await Vendor.findOneAndDelete({ _id: req.params.id, vendor_belongs_to: userId });

        if (!vendor) {
            return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
        }

        res.json({ success: true, message: "Vendor deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
