const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const FUNCTION = require("../../utils/functions");
const validations = require("../../utils/validations");

const User = require("../../Modals/User");
const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Department = require("../../Modals/Department");

// AES encryption function
const encryptAES = (text) => {
    const JWT_SECRET = process.env.JWT_SECRET 
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(JWT_SECRET).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_VALIDITY = process.env.TOKEN_VALIDITY;
const TOKEN_MAX_VALIDITY = process.env.TOKEN_MAX_VALIDITY;

module.exports.registerUserWithoutToken = async (req, res) => {
    const errors = validationResult(req);
  
    if (!errors.isEmpty()) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: "Bad request",
      });
    }
  
    const { first_name, last_name, email_id, password, phone_number, role } = req.body;
  
    const isFirstNameValid = await validations.validateName(first_name);
    const isLastNameValid = await validations.validateName(last_name);
    const isPasswordValid = await validations.validatePassword(password);
    const isPhoneNumberValid = await validations.validatePhoneNumber(phone_number);
  
    if (
      isFirstNameValid.status === false ||
      isLastNameValid.status === false ||
      email_id === "" ||
      isPasswordValid.status === false ||
      isPhoneNumberValid.status === false
    ) {
      const inputs_errors = [];
      if (isFirstNameValid.status === false) inputs_errors.push("FIRST_NAME");
      if (isLastNameValid.status === false) inputs_errors.push("LAST_NAME");
      if (email_id === "") inputs_errors.push("EMAIL_ID");
      if (isPasswordValid.status === false) inputs_errors.push("PASSWORD");
      if (isPhoneNumberValid.status === false) inputs_errors.push("PHONE_NUMBER");
  
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: "Invalid Inputs",
        fields: inputs_errors,
      });
    }
  
    const hashedPassword = await bcrypt.hash(password, 12);
  
    // Only use schema fields
    let user = new User({
      first_name: first_name.toLowerCase().replaceAll(/\s/g, ""),
      last_name: last_name.toLowerCase().replaceAll(/\s/g, ""),
      email_data: {
        temp_email_id: email_id.toLowerCase(),
        is_validated: true, // Mark as validated if this is your flow
      },
      password: hashedPassword,
      phone_data: {
        phone_number: phone_number,
        is_validated: true, // Only if you are not doing OTP verification
      },
      role: role,
    });
  
    try {
      const savedUser = await user.save();
  
      return res.status(STATUS.CREATED).json({
        message: "User Created Successfully",
        data: savedUser.id,
      });
    } catch (error) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: MESSAGE.badRequest,
        error,
      });
    }
  };    

module.exports.loginUsingEmail = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const email_id = req.body.email_id.toLowerCase();
    const password = req.body.password;

    try {
        // Check user by email_id (actual email address stored in the database)
        let user = await User.findOne({ 'email_data.email_id': email_id });
        if (!user) {
            user = await User.findOne({ 'email_data.temp_email_id': email_id });
        }
        
        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "User not found",
            });
        }

        // Check if user is active and not archived
        if (!user.is_active) {
            return res.status(STATUS.UNAUTHORISED).json({
                message: "Your account has been deactivated",
            });
        }

        if (user.is_archived) {
            return res.status(STATUS.UNAUTHORISED).json({
                message: "Your account has been archived",
            });
        }
        let departments = [];
        if (user.department?.has_department && Array.isArray(user.department.department) && user.department.department.length > 0) {
            departments = await Department.find({
                _id: { $in: user.department.department },
                is_archived: false,
                is_active: true
            }).select('_id name description'); // Select relevant fields
        }

        let isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(STATUS.UNAUTHORISED).json({
                message: "Invalid password",
            });
        }
        const accessToken = jwt.sign(
            {
                uid: user.id,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: TOKEN_VALIDITY }
        );

        const refreshToken = jwt.sign(
            {
                uid: user.id,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: TOKEN_MAX_VALIDITY }
        );

        const response_data = {
            access_token: accessToken,
            refresh_token: refreshToken,
            user_id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            email_id: user.email_data.email_id,
            role: user.role,
            designation: user.designation,
            is_active: user.is_active,
            departments:departments
        };

        return res.status(STATUS.SUCCESS).json({
            message: "Login Successful",
            data: response_data,
        });

    } catch (error) {
        console.log('Login error:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

// module.exports.loginUsingEmail = async (req,res) => {
//     const errors = validationResult(req);
  
//     if (!errors.isEmpty()) {
//       return res.status(STATUS.BAD_REQUEST).json({
//         message: `Bad request`,
//       });
//     }
  
//     const email_id = req.body.email_id.toLowerCase();
//     const password = req.body.password;
  
//     try {
//       let user = await User.findOne({ "email_data.temp_email_id": email_id }) || User.findOne({ 'email_data.email_id': email_id });


  
//       if (!user) {
//         return res.status(STATUS.NOT_FOUND).json({
//           message: "User not found",
//         });
//       } else {
//         let loadedUser = user;

//         // if(loadedUser.role === "TNO"){
//         //   return res.status(STATUS.BAD_REQUEST).json({
//         //     message: "Login using KGID",
//         //   });
//         // }
  
//         let isValidPassword = await bcrypt.compare(password, user.password);
  
//         if (!isValidPassword) {
//           res.status(STATUS.UNAUTHORISED).json({
//             message: "Invalid password",
//           });
//         } else {
//           const accessToken = jwt.sign(
//             {
//               uid: loadedUser.id,
//               role: loadedUser.role,
//             },
//             JWT_SECRET,
//             { expiresIn: TOKEN_VALIDITY }
//           );
  
//           const refreshToken = jwt.sign(
//             {
//               uid: loadedUser.id,
//               role: loadedUser.role,
//             },
//             JWT_SECRET,
//             { expiresIn: TOKEN_MAX_VALIDITY }
//           );
  
//           const response_data = {
//             access_token: accessToken,
//             refresh_token: refreshToken,
//             user_id: loadedUser.id,
//             name: `${loadedUser.first_name} ${loadedUser.last_name}`,
//             // k_name: `${loadedUser.first_k_name} ${loadedUser.last_k_name}`,
//             email_id: loadedUser.email_data.temp_email_id,
//             role: loadedUser.role,
//             // is_dis: loadedUser.is_dis,
//           };
  
//           return res.status(STATUS.SUCCESS).json({
//             message: "Login Successfull",
//             data: response_data,
//           });
//         }
//       }
//     } catch (error) {
//       //console.log(error);
//       return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
//         message: MESSAGE.internalServerError,
//         error,
//       });
//     }
// };

module.exports.createUser = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
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

    // ========== INPUT VALIDATION ==========
    
    // Validate first name
    if (!first_name || typeof first_name !== 'string' || first_name.trim().length === 0) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'First name is required',
            field: 'first_name'
        });
    }

    // Validate last name
    if (!last_name || typeof last_name !== 'string' || last_name.trim().length === 0) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Last name is required',
            field: 'last_name'
        });
    }

    // Validate email
    if (!email_data || !email_data.email_id) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Email is required',
            field: 'email_data.email_id'
        });
    }

    const isEmailValid = await validations.validateEmailID(email_data.email_id);
    if (!isEmailValid.status) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Invalid email format',
            field: 'email_data.email_id'
        });
    }

    // Validate password
    if (!password || typeof password !== 'string') {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Password is required',
            field: 'password'
        });
    }

    const isPasswordValid = await validations.validatePassword(password);
    if (!isPasswordValid.status) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Password does not meet requirements',
            field: 'password',
            requirements: {
                minLength: 'At least 8 characters',
                uppercase: 'At least one uppercase letter',
                lowercase: 'At least one lowercase letter',
                digit: 'At least one number',
                specialChar: 'At least one special character (#?!@$%^&*-)'
            }
        });
    }

    // Validate phone number
    if (!phone_data || !phone_data.phone_number) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Phone number is required',
            field: 'phone_data.phone_number'
        });
    }

    const isPhoneNumberValid = await validations.validatePhoneNumber(phone_data.phone_number);
    if (!isPhoneNumberValid.status) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Invalid phone number format (must be 10 digits starting with 6-9)',
            field: 'phone_data.phone_number'
        });
    }

    // Validate role
    if (!role || !['ADMIN', 'DEPARTMENT', 'OWNER','ACCOUNTS',"MARKETING",'APPROVER'].includes(role)) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Invalid role. Must be one of: ADMIN, DEPARTMENT, OWNER, ACCOUNTS, MARKETING, APPROVER',
            field: 'role'
        });
    }

    // Validate name format
    const isFirstNameValid = await validations.validateName(first_name);
    if (!isFirstNameValid.status) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'First name should contain only letters and spaces',
            field: 'first_name'
        });
    }

    const isLastNameValid = await validations.validateName(last_name);
    if (!isLastNameValid.status) {
        return res.status(STATUS.VALIDATION_FAILED).json({
            message: 'Last name should contain only letters and spaces',
            field: 'last_name'
        });
    }

    // ========== ROLE-SPECIFIC VALIDATION ==========
    
    // For DEPARTMENT role, department is required
    if (role === 'DEPARTMENT') {
        if (!department) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Department is required for DEPARTMENT role',
                field: 'department'
            });
        }
    }

    try {
        // Check for duplicate email
        const existingUserByEmail = await User.findOne({ 'email_data.email_id': email_data.email_id.toLowerCase() });
        if (existingUserByEmail) {
            return res.status(STATUS.FORBIDDEN).json({
                message: 'Email already exists in the system',
            });
        }

        // Check for duplicate phone number
        const existingUserByPhone = await User.findOne({ 'phone_data.phone_number': phone_data.phone_number });
        if (existingUserByPhone) {
            return res.status(STATUS.FORBIDDEN).json({
                message: 'Phone number already exists in the system',
            });
        }

        // ========== VALIDATE DEPARTMENTS ==========
        const Department = require("../../Modals/Department");
        let departments = [];
        
        if (department) {
            if (Array.isArray(department)) {
                departments = department;
            } else if (typeof department === 'string') {
                departments = department.split(',').map(d => d.trim()).filter(d => d);
            }

            // Validate that all department IDs exist
            if (departments.length > 0) {
                try {
                    const existingDepartments = await Department.find({
                        _id: { $in: departments },
                        is_archived: false,
                        is_active: true
                    });

                    if (existingDepartments.length !== departments.length) {
                        return res.status(STATUS.VALIDATION_FAILED).json({
                            message: 'One or more department IDs are invalid or inactive',
                            field: 'department'
                        });
                    }
                } catch (error) {
                    console.error('Error validating departments:', error);
                    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                        message: 'Error validating departments',
                    });
                }
            }
        }

        // ========== ENCRYPT SENSITIVE DATA ==========
        
        let encryptedEmail;
        try {
            encryptedEmail = encryptAES(email_data.email_id.toLowerCase());
        } catch (error) {
            console.error('Email encryption failed:', error);
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Failed to encrypt email',
            });
        }

        // ========== HASH PASSWORD ==========
        
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(password, 12);
        } catch (error) {
            console.error('Password hashing failed:', error);
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                message: 'Failed to hash password',
            });
        }

        // ========== BUILD USER DOCUMENT ==========
        
        const userData = {
            first_name: first_name.toLowerCase().trim(),
            last_name: last_name.toLowerCase().trim(),
            email_data: {
                email_id: email_data.email_id.toLowerCase().trim(),
                temp_email_id: encryptedEmail,
                is_validated: true,
            },
            phone_data: {
                phone_number: phone_data.phone_number.trim(),
                is_validated: true,
            },
            password: hashedPassword,
            role: role,
            designation: designation ? designation.trim() : '',
            department: {
                has_department: departments.length > 0,
                department: departments
            }
        };

        // ========== SAVE USER ==========
        
        const user = new User(userData);

        try {
            const savedUser = await user.save();
            
            return res.status(STATUS.CREATED).json({
                message: 'User created successfully',
                data: {
                    id: savedUser.id,
                    first_name: savedUser.first_name,
                    last_name: savedUser.last_name,
                    role: savedUser.role
                }
            });
        } catch (error) {
            console.error('Failed to save user:', error);
            
            // Handle duplicate key errors
            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                return res.status(STATUS.FORBIDDEN).json({
                    message: `${field} already exists in the system`,
                });
            }
            
            return res.status(STATUS.BAD_REQUEST).json({
                message: MESSAGE.badRequest,
                error: error.message,
            });
        }
    } catch (error) {
        console.error('Error in createUser controller:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

// module.exports.getUsers = async (req, res) => {
//     const errors = validationResult(req);

//     if (!errors.isEmpty()) {
//         return res.status(STATUS.BAD_REQUEST).json({
//             message: 'Bad request',
//         });
//     }

//     const token = req.get('Authorization');
//     let decodedToken = await jwt.decode(token);

//     if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'OWNER') {
//         return res.status(STATUS.UNAUTHORISED).json({
//             message: MESSAGE.unauthorized,
//         });
//     }

//     // Set Status From Request Query
//     let status = true;

//     if (req.query.status === undefined || req.query.status === "") {
//         status = null;
//     } else {
//         if (req.query.status !== "false" && req.query.status !== "true") {
//             status = true;
//         } else {
//             let query_status = JSON.parse(req.query.status);
//             status = query_status;
//         }
//     }

//     // Set Pagination Configurations
//     let pageInt;
//     let sizeInt;
//     const page = req.query.page;
//     const size = req.query.size;

//     if (size !== undefined) {
//         sizeInt = parseInt(size);
//     } else {
//         sizeInt = 10;
//     }

//     if (page !== undefined) {
//         pageInt = parseInt(page);
//     } else {
//         pageInt = 1;
//     }

//     // Set Sorting Configurations
//     let sort;

//     if (req.query.sort === undefined || req.query.sort === "") {
//         sort = -1;
//     } else {
//         if (req.query.sort !== "-1" && req.query.sort !== "1") {
//             sort = -1;
//         } else {
//             sort = parseInt(req.query.sort);
//         }
//     }

//     try {
//         let documentCount = 0;
//         let users = [];

//         if (status === null) {
//             documentCount = await User.countDocuments({ is_archived: false });
//             users = await User.find({ is_active: status, is_archived: false }, {
//                 id: 1,
//                 first_name: 1,
//                 last_name: 1,
//                 'email_data.email_id': 1,
//                 'phone_data.phone_number': 1,
//                 role: 1,
//                 designation: 1,
//                 is_active: 1,
//                 department: 1
//             })
//             .skip((pageInt - 1) * sizeInt)
//             .limit(sizeInt)
//             .sort({ createdAt: sort })
//             .populate('department.department', '_id name')
//             .exec();

          
//         } else {
//             documentCount = await User.find({ is_active: status, is_archived: false }).count();
//             users = await User.find({ is_active: status, is_archived: false }, {
//                 id: 1,
//                 first_name: 1,
//                 last_name: 1,
//                 'email_data.email_id': 1,
//                 'phone_data.phone_number': 1,
//                 role: 1,
//                 designation: 1,
//                 department: 1,
//                 is_active: 1
//             })
//                 .skip((pageInt - 1) * sizeInt)
//                 .limit(sizeInt)
//                 .sort({ createdAt: sort })
//                 .populate('department.department', '_id name')
//                 .exec();
//         }

//         return res.status(STATUS.SUCCESS).json({
//             currentPage: pageInt,
//             items: users,
//             totalItems: documentCount,
//             totalPages: Math.ceil(documentCount / sizeInt)
//         });
//     } catch (error) {
//         console.error(error);
//         return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
//             message: MESSAGE.internalServerError,
//             error,
//         });
//     }
// };

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

    // Status filter setup
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

    // Pagination setup
    const sizeInt = req.query.size ? parseInt(req.query.size) : 10;
    const pageInt = req.query.page ? parseInt(req.query.page) : 1;

    // Sorting setup
    let sort = -1;
    if (req.query.sort === "-1" || req.query.sort === "1") {
        sort = parseInt(req.query.sort);
    }

    try {
        let matchFilter = { is_archived: false };
        if (status !== null) {
            matchFilter.is_active = status;
        }

        // Aggregation pipeline to get users with populated departments
        const pipeline = [
            { $match: matchFilter },
            {
                $lookup: {
                    from: 'departments', // MongoDB collection name for departments (check exact name)
                    localField: 'department.department',
                    foreignField: '_id',
                    as: 'department_details'
                }
            },
            // Optional: filter only active and non-archived departments
            {
                $addFields: {
                    department_details: {
                        $filter: {
                            input: '$department_details',
                            as: 'dept',
                            cond: { $and: [{ $eq: ['$$dept.is_active', true] }, { $eq: ['$$dept.is_archived', false] }] }
                        }
                    }
                }
            },
            {
                $project: {
                    first_name: 1,
                    last_name: 1,
                    'email_data.email_id': 1,
                    'phone_data.phone_number': 1,
                    role: 1,
                    designation: 1,
                    is_active: 1,
                    department: 1,
                    department_details: 1,
                    createdAt: 1
                }
            },
            { $sort: { createdAt: sort } },
            { $skip: (pageInt - 1) * sizeInt },
            { $limit: sizeInt }
        ];

        // Count total documents matching filter
        const documentCount = await User.countDocuments(matchFilter);

        const users = await User.aggregate(pipeline);

        return res.status(STATUS.SUCCESS).json({
            currentPage: pageInt,
            items: users,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount / sizeInt)
        });

    } catch (error) {
        console.error('getUsers error:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

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

        // Check if user exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'User not found',
            });
        }

        // Build update data
        const updateData = {};

        // Validate and update first name
        if (first_name !== undefined) {
            if (!first_name || typeof first_name !== 'string' || first_name.trim().length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'First name cannot be empty',
                    field: 'first_name'
                });
            }

            const isNameValid = await validations.validateName(first_name);
            if (!isNameValid.status) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'First name should contain only letters and spaces',
                    field: 'first_name'
                });
            }
            updateData.first_name = first_name.toLowerCase().trim();
        }

        // Validate and update last name
        if (last_name !== undefined) {
            if (!last_name || typeof last_name !== 'string' || last_name.trim().length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Last name cannot be empty',
                    field: 'last_name'
                });
            }

            const isNameValid = await validations.validateName(last_name);
            if (!isNameValid.status) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Last name should contain only letters and spaces',
                    field: 'last_name'
                });
            }
            updateData.last_name = last_name.toLowerCase().trim();
        }

        // Validate and update role
        if (role !== undefined) {
            if (!['ADMIN', 'DEPARTMENT', 'OWNER','ACCOUNTS',"MARKETING",'APPROVER'].includes(role)) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid role. Must be one of: ADMIN, DEPARTMENT, OWNER, ACCOUNTS, MARKETING, APPROVER ',
                    field: 'role'
                });
            }
            updateData.role = role;
        }

        // Update designation
        if (designation !== undefined) {
            updateData.designation = designation ? designation.trim() : '';
        }

        // Validate and update email
        if (email_data) {
            if (email_data.email_id) {
                const isEmailValid = await validations.validateEmailID(email_data.email_id);
                if (!isEmailValid.status) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: 'Invalid email format',
                        field: 'email_data.email_id'
                    });
                }

                // Check if email is already taken by another user
                const userWithEmail = await User.findOne({ 
                    'email_data.email_id': email_data.email_id.toLowerCase(),
                    _id: { $ne: id }
                });
                
                if (userWithEmail) {
                    return res.status(STATUS.FORBIDDEN).json({
                        message: 'Email already exists',
                    });
                }

                updateData['email_data.email_id'] = email_data.email_id.toLowerCase().trim();
                let encryptedEmail = encryptAES(email_data.email_id.toLowerCase());
                updateData['email_data.temp_email_id'] = encryptedEmail;
            }
        }

        // Validate and update phone
        if (phone_data) {
            if (phone_data.phone_number) {
                const isPhoneValid = await validations.validatePhoneNumber(phone_data.phone_number);
                if (!isPhoneValid.status) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: 'Invalid phone number format (must be 10 digits starting with 6-9)',
                        field: 'phone_data.phone_number'
                    });
                }

                // Check if phone is already taken by another user
                const userWithPhone = await User.findOne({ 
                    'phone_data.phone_number': phone_data.phone_number,
                    _id: { $ne: id }
                });
                
                if (userWithPhone) {
                    return res.status(STATUS.FORBIDDEN).json({
                        message: 'Phone number already exists',
                    });
                }

                updateData['phone_data.phone_number'] = phone_data.phone_number.trim();
            }
        }

        // Validate and update departments
        if (department !== undefined) {
            const Department = require("../../Modals/Department");
            let departments = [];
            
            if (Array.isArray(department)) {
                departments = department;
            } else if (typeof department === 'string' && department.trim() !== '') {
                departments = department.split(',').map(d => d.trim()).filter(d => d);
            }

            // Validate that all department IDs exist (if any provided)
            if (departments.length > 0) {
                const existingDepartments = await Department.find({
                    _id: { $in: departments },
                    is_archived: false,
                    is_active: true
                });

                if (existingDepartments.length !== departments.length) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: 'One or more department IDs are invalid or inactive',
                        field: 'department'
                    });
                }
            }

            updateData['department.has_department'] = departments.length > 0;
            updateData['department.department'] = departments;
        }

        // If no fields to update, return early
        if (Object.keys(updateData).length === 0) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'No fields provided to update',
            });
        }

        let user = await User.findByIdAndUpdate(id, updateData, { new: true });

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "User not found",
            });
        }

        return res.status(STATUS.SUCCESS).json({
            id: user.id,
            message: "User Updated Successfully"
        });
        
    } catch (error) {
        console.error('Error updating user:', error);
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(STATUS.FORBIDDEN).json({
                message: 'Duplicate key error',
            });
        }
        
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
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

module.exports.changeUserPassword = async (req, res) => {
    const errors = validationResult(req);
  
    if (!errors.isEmpty()) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `Bad request`,
      });
    }
  
    const token = req.get("Authorization");
    let decodedToken = await jwt.decode(token);
  
    let user = null;
  
    try {
      const getUserReq = await User.findOne({
        _id: decodedToken.uid,
        is_active: true,
        is_archived: false,
      });
      if (getUserReq) {
        user = getUserReq;
      } else {
        return res.status(STATUS.NOT_FOUND).json({
          message: "User not found",
        });
      }
    } catch (error) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: MESSAGE.internalServerError,
        error,
      });
    }
  
    const isPasswordValid = await validations.validatePassword(req.body.password);
  
    if (isPasswordValid.status === false) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: "Invalid password",
      });
    } else {
      const hashedPassword = await bcrypt.hash(req.body.password, 12);
      user.password = hashedPassword;
  
      try {
        const savedUser = await user.save();
  
        return res.status(STATUS.SUCCESS).json({
          message: "User Updated Successfully",
          data: savedUser.id,
        });
      } catch (error) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: MESSAGE.badRequest,
          error,
        });
      }
    }
  };