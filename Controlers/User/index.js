const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const FUNCTION = require("../../utils/functions");
const validations = require("../../utils/validations");

const User = require("../../Modals/User");
const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// AES encryption function
const encryptAES = (text) => {
    const JWT_SECRET = process.env.TNO_V1_JWT_SECRET || "default-secret-key-for-testing";
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(JWT_SECRET).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

module.exports.createUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only ADMIN can create users
    if (decodedToken.role !== 'ADMIN') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    const {
        first_name,
        last_name,
        email_data,
        password,
        phone_data,
        role,
        designation,
        department
    } = req.body;

    // Input Validations
    const isFirstNameValid = await validations.validateName(first_name);
    const isLastNameValid = await validations.validateName(last_name);
    const isPasswordValid = await validations.validatePassword(password);
    const isPhoneNumberValid = await validations.validatePhoneNumber(phone_data.phone_number);
    const isEmailValid = email_data && email_data.email_id ? await validations.validateEmailID(email_data.email_id) : { status: true };

    if (
        !isFirstNameValid.status ||
        !isLastNameValid.status ||
        !email_data ||
        !email_data.email_id ||
        !role ||
        !isPasswordValid.status ||
        !isPhoneNumberValid.status
    ) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Invalid Inputs',
            fields: {
                firstName: !isFirstNameValid.status ? 'Invalid' : 'Valid',
                lastName: !isLastNameValid.status ? 'Invalid' : 'Valid',
                email: !isEmailValid.status ? 'Invalid' : 'Valid',
                password: !isPasswordValid.status ? 'Invalid' : 'Valid',
                phone: !isPhoneNumberValid.status ? 'Invalid' : 'Valid'
            }
        });
    }

    try {
        // Check for duplicate email
        const existingUserByEmail = await User.findOne({ 'email_data.email_id': email_data.email_id });
        if (existingUserByEmail) {
            return res.status(STATUS.FORBIDDEN).json({
                message: 'Email already exists',
            });
        }

        // Check for duplicate phone number
        const existingUserByPhone = await User.findOne({ 'phone_data.phone_number': phone_data.phone_number });
        if (existingUserByPhone) {
            return res.status(STATUS.FORBIDDEN).json({
                message: 'Phone number already exists',
            });
        }

        // Encrypt email
        let encryptedEmail;
        try {
            encryptedEmail = encryptAES(email_data.email_id.toLowerCase());
        } catch (error) {
            console.error('Email encryption failed:', error);
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Failed to encrypt email',
                error,
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Prepare departments array
        let departments = [];
        if (department && Array.isArray(department)) {
            departments = department;
        } else if (department && typeof department === 'string') {
            departments = department.split(',');
        }

        // Build the user document
        const user = new User({
            first_name: first_name.toLowerCase(),
            last_name: last_name.toLowerCase(),
            email_data: {
                email_id: email_data.email_id.toLowerCase(),
                temp_email_id: encryptedEmail,
                is_validated: true,
            },
            phone_data: {
                phone_number: phone_data.phone_number,
                is_validated: true,
            },
            password: hashedPassword,
            role: role,
            designation: designation || '',
            department: {
                has_department: departments.length > 0,
                department: departments.length > 0 ? departments : []
            }
        });

        // Save and respond
        try {
            const savedUser = await user.save();
            return res.status(STATUS.CREATED).json({
                message: 'User Created Successfully',
                id: savedUser.id
            });
        } catch (error) {
            console.error('Failed to save user:', error);
            return res.status(STATUS.BAD_REQUEST).json({
                message: MESSAGE.badRequest,
                error,
            });
        }
    } catch (error) {
        console.error('Error creating user:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
};

module.exports.getUsers = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    // Set Status From Request Query
    let status = true;

    if (req.query.status === undefined || req.query.status === "") {
        status = null;
    } else {
        if (req.query.status !== "false" && req.query.status !== "true") {
            status = true;
        } else {
            let query_status = JSON.parse(req.query.status);
            status = query_status;
        }
    }

    // Set Pagination Configurations
    let pageInt;
    let sizeInt;
    const page = req.query.page;
    const size = req.query.size;

    if (size !== undefined) {
        sizeInt = parseInt(size);
    } else {
        sizeInt = 10;
    }

    if (page !== undefined) {
        pageInt = parseInt(page);
    } else {
        pageInt = 1;
    }

    // Set Sorting Configurations
    let sort;

    if (req.query.sort === undefined || req.query.sort === "") {
        sort = -1;
    } else {
        if (req.query.sort !== "-1" && req.query.sort !== "1") {
            sort = -1;
        } else {
            sort = parseInt(req.query.sort);
        }
    }

    try {
        let documentCount = 0;
        let users = [];

        if (status === null) {
            documentCount = await User.countDocuments({ is_archived: false });
            users = await User.find({ is_archived: false }, {
                id: 1,
                first_name: 1,
                last_name: 1,
                'email_data.email_id': 1,
                'phone_data.phone_number': 1,
                role: 1,
                designation: 1,
                is_active: 1
            })
                .skip((pageInt - 1) * sizeInt)
                .limit(sizeInt)
                .sort({ createdAt: sort })
                .exec();
        } else {
            documentCount = await User.find({ is_active: status, is_archived: false }).count();
            users = await User.find({ is_active: status, is_archived: false }, {
                id: 1,
                first_name: 1,
                last_name: 1,
                'email_data.email_id': 1,
                'phone_data.phone_number': 1,
                role: 1,
                designation: 1,
                is_active: 1
            })
                .skip((pageInt - 1) * sizeInt)
                .limit(sizeInt)
                .sort({ createdAt: sort })
                .exec();
        }

        return res.status(STATUS.SUCCESS).json({
            currentPage: pageInt,
            items: users,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount / sizeInt)
        });
    } catch (error) {
        console.error(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
};

module.exports.getThisUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let user = await User.findOne({ _id: req.params.id, is_archived: false })
            .populate('department.department');
        
        if (user !== null) {
            return res.status(STATUS.SUCCESS).json({
                data: user,
                message: "User Found"
            });
        } else {
            return res.status(STATUS.NOT_FOUND).json({
                message: MESSAGE.notFound,
            });
        }
    } catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
        });
    }
};

module.exports.updateUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;
        let { first_name, last_name, email_data, phone_data, role, designation, department } = req.body;

        // Build update data
        const updateData = {};

        if (first_name) updateData.first_name = first_name.toLowerCase();
        if (last_name) updateData.last_name = last_name.toLowerCase();
        if (role) updateData.role = role;
        if (designation) updateData.designation = designation;

        if (email_data && email_data.email_id) {
            updateData['email_data.email_id'] = email_data.email_id.toLowerCase();
            let encryptedEmail = encryptAES(email_data.email_id.toLowerCase());
            updateData['email_data.temp_email_id'] = encryptedEmail;
        }

        if (phone_data && phone_data.phone_number) {
            updateData['phone_data.phone_number'] = phone_data.phone_number;
        }

        if (department !== undefined) {
            let departments = [];
            if (Array.isArray(department)) {
                departments = department;
            } else if (typeof department === 'string') {
                departments = department.split(',');
            }
            updateData['department.has_department'] = departments.length > 0;
            updateData['department.department'] = departments;
        }

        let user = await User.findByIdAndUpdate(id, updateData, { new: true });

        if (!user) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: "User not updated",
            });
        } else {
            return res.status(STATUS.SUCCESS).json({
                id: user.id,
                message: "User Updated"
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
        });
    }
};

module.exports.updateUserStatus = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;
        let { is_active } = req.body;

        let user = await User.findByIdAndUpdate(id, { is_active }, { new: true });

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "User status not updated",
            });
        } else {
            return res.status(STATUS.SUCCESS).json({
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                is_active: user.is_active
            });
        }
    } catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
};

module.exports.archiveOrActiveUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;
        let { is_archived } = req.body;

        let user = await User.findByIdAndUpdate(id, { is_archived }, { new: true });

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "User archive status not updated",
            });
        } else {
            return res.status(STATUS.SUCCESS).json({
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                is_archived: user.is_archived
            });
        }
    } catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
};

module.exports.deleteUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (decodedToken.role !== 'ADMIN') {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;

        let user = await User.findByIdAndDelete(id);

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "User not found",
            });
        } else {
            return res.status(STATUS.SUCCESS).json({
                message: "User deleted successfully"
            });
        }
    } catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
};

