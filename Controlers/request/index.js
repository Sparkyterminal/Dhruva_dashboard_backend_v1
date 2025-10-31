const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");

const Request = require("../../Modals/Request");
const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports.createRequest = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only DEPARTMENT or ADMIN users can create requests
    if (!['DEPARTMENT', 'ADMIN'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const {
            purpose,
            // due_date,
            amount,
            priority,
            note,
            transation_in,
            vendor
        } = req.body;

        // Validate amount
        if (isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Invalid amount',
                field: 'amount'
            });
        }

        // Validate due date
        // const dueDateObj = new Date(due_date);
        // if (isNaN(dueDateObj.getTime())) {
        //     return res.status(STATUS.VALIDATION_FAILED).json({
        //         message: 'Invalid due date format',
        //         field: 'due_date'
        //     });
        // }

        // Get user to fetch their department
        const User = require("../../Modals/User");
        const user = await User.findById(decodedToken.uid);
        
        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'User not found',
            });
        }

        // Extract department from user
        let departmentId = null;
        if (user.department && user.department.department && user.department.department.length > 0) {
            departmentId = user.department.department[0];
        }

        const request = new Request({
            purpose: purpose.trim(),
            // due_date: dueDateObj,
            amount: parseFloat(amount),
            priority: priority || 'MEDIUM',
            note: note ? note.trim() : '',
            requested_by: decodedToken.uid,
            department: departmentId,
            status: 'PENDING',
            transation_in: transation_in || 'CASH',
            vendor: vendor || null
        });

        const savedRequest = await request.save();

        return res.status(STATUS.CREATED).json({
            message: 'Request created successfully',
            data: {
                id: savedRequest.id,
                purpose: savedRequest.purpose,
                amount: savedRequest.amount,
                //  due_date: savedRequest.due_date,
                priority: savedRequest.priority,
                status: savedRequest.status,
                transation_in: savedRequest.transation_in,
                vendor: savedRequest.vendor
            }
        });
    } catch (error) {
        console.error('Error creating request:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

module.exports.getMyRequests = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const status = req.query.status;

        let query = { 
            requested_by: decodedToken.uid,
            is_archived: false 
        };

        if (status) {
            query.status = status;
        }

        const documentCount = await Request.countDocuments(query);
        const requests = await Request.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * size)
            .limit(size)
            .populate('department', 'id name')
            .populate('vendor', 'id name')
            .exec();

        return res.status(STATUS.SUCCESS).json({
            currentPage: page,
            items: requests,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount / size)
        });
    } catch (error) {
        console.error('Error fetching requests:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

module.exports.getMyRequestById = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    try {
        const { id } = req.params;

        const request = await Request.findOne({
            _id: id,
            requested_by: decodedToken.uid,
            is_archived: false
        })
            .populate('requested_by', 'id first_name last_name')
            .populate('department', 'id name')
            .populate('vendor', 'id name')
            .exec();

        if (!request) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Request not found',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            data: request,
            message: "Request Found"
        });
    } catch (error) {
        console.error('Error fetching request:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

module.exports.getAllRequests = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only OWNER and ADMIN can view all requests
    if (!['OWNER', 'ADMIN','DEPARTMENT','APPROVER'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const status = req.query.status;
        const priority = req.query.priority;
        const department = req.query.department;

        let query = { is_archived: false };

        if (status) {
            query.status = status;
        }

        if (priority) {
            query.priority = priority;
        }

        if (department) {
            query.department = department;
        }

        const documentCount = await Request.countDocuments(query);
        const requests = await Request.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * size)
            .limit(size)
            .populate('requested_by', 'id first_name last_name email_data designation')
            .populate('department', 'id name')
            // .populate('handled_by', 'id first_name last_name')
            .populate('vendor', 'id name')
            .exec();

        return res.status(STATUS.SUCCESS).json({
            currentPage: page,
            items: requests,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount / size)
        });
    } catch (error) {
        console.error('Error fetching requests:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

module.exports.getRequestById = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only OWNER and ADMIN can view specific request details
    if (!['OWNER', 'ADMIN'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const { id } = req.params;

        const request = await Request.findOne({
            _id: id,
            is_archived: false
        })
            .populate('requested_by', 'id first_name last_name email_data designation')
            .populate('department', 'id name')
            // .populate('handled_by', 'id first_name last_name')
            .populate('vendor', 'id name')
            .exec();

        if (!request) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Request not found',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            data: request,
            message: "Request Found"
        });
    } catch (error) {
        console.error('Error fetching request:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

module.exports.updateRequest = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if (!['OWNER', 'DEPARTMENT', 'APPROVER'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const { id } = req.params;
        const {
            status,
            amount_paid,
            planned_amount,
            remarks,
            is_active
        } = req.body;

        const request = await Request.findById(id);
        if (!request) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Request not found',
            });
        }

        const updateData = {};

        if (status !== undefined) {
            if (!['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid status. Must be: PENDING, APPROVED, REJECTED, COMPLETED',
                    field: 'status'
                });
            }
            updateData.status = status;

            // Set approval status strings based on user role and status
            if (status === 'COMPLETED' || status === 'APPROVED') {
                if (decodedToken.role === 'DEPARTMENT') {
                    updateData.accounts_check = 'APPROVED';
                } else if (decodedToken.role === 'OWNER') {
                    updateData.owner_check = 'APPROVED';
                } else if (decodedToken.role === 'APPROVER') {
                    updateData.approver_check = 'APPROVED';
                }
            } else if (status === 'REJECTED') {
                if (decodedToken.role === 'DEPARTMENT') {
                    updateData.accounts_check = 'REJECTED';
                } else if (decodedToken.role === 'OWNER') {
                    updateData.owner_check = 'REJECTED';
                } else if (decodedToken.role === 'APPROVER') {
                    updateData.approver_check = 'REJECTED';
                }
            }
        }

        if (amount_paid !== undefined) {
            const amount = parseFloat(amount_paid);
            if (isNaN(amount) || amount < 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid amount paid',
                    field: 'amount_paid'
                });
            }
            updateData.amount_paid = amount;
            updateData.total_amount_paid = (request.total_amount_paid || 0) + amount;
        }

        if (planned_amount !== undefined) {
            const plannedAmt = parseFloat(planned_amount);
            if (isNaN(plannedAmt) || plannedAmt < 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid planned amount',
                    field: 'planned_amount'
                });
            }
            updateData.planned_amount = plannedAmt;
        }

        if (remarks !== undefined) {
            updateData.remarks = remarks.trim();
        }

        if (is_active !== undefined) {
            updateData.is_active = is_active;
        }

        updateData.handled_by = decodedToken.uid;

        if (Object.keys(updateData).length === 0) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'No fields provided to update',
            });
        }

        const updatedRequest = await Request.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        )
            .populate('requested_by', 'id first_name last_name email_data designation')
            .populate('department', 'id name')
            .populate('vendor', 'id name')
            .exec();

        return res.status(STATUS.SUCCESS).json({
            data: updatedRequest,
            message: "Request Updated Successfully"
        });

    } catch (error) {
        console.error('Error updating request:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};

// module.exports.updateRequest = async (req, res) => {
//     const token = req.get('Authorization');
//     let decodedToken = await jwt.decode(token);

//     // Only OWNER and ADMIN can update requests
//     if (!['OWNER', 'DEPARTMENT','APPROVER'].includes(decodedToken.role)) {
//         return res.status(STATUS.UNAUTHORISED).json({
//             message: MESSAGE.unauthorized,
//         });
//     }

//     try {
//         const { id } = req.params;
//         const {
//             status,
//             amount_paid,
//             remarks,
//             is_active
//         } = req.body;

//         const request = await Request.findById(id);

//         if (!request) {
//             return res.status(STATUS.NOT_FOUND).json({
//                 message: 'Request not found',
//             });
//         }

//         // Build update data object with only provided fields
//         const updateData = {};

//         // Update status if provided
//         if (status !== undefined) {
//             if (!['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
//                 return res.status(STATUS.VALIDATION_FAILED).json({
//                     message: 'Invalid status. Must be: PENDING, APPROVED, REJECTED, COMPLETED',
//                     field: 'status'
//                 });
//             }
//             updateData.status = status;
//         }

//         // Update amount received status
//         if (amount_paid !== undefined) {
//             updateData.amount_paid = amount_paid;
//         }

//         // Update amount paid (adds to total)
//         if (amount_paid !== undefined) {
//             const amount = parseFloat(amount_paid);
//             if (isNaN(amount) || amount < 0) {
//                 return res.status(STATUS.VALIDATION_FAILED).json({
//                     message: 'Invalid amount paid',
//                     field: 'amount_paid'
//                 });
//             }
//             updateData.amount_paid = amount;
//             // Add to total amount paid
//             updateData.total_amount_paid = (request.total_amount_paid || 0) + amount;
//         }

//         // Update remarks
//         if (remarks !== undefined) {
//             updateData.remarks = remarks.trim();
//         }

//         // Update is_active status
//         if (is_active !== undefined) {
//             updateData.is_active = is_active;
//         }

//         // Track who made the update
//         updateData.handled_by = decodedToken.uid;

//         // If no fields to update, return early
//         if (Object.keys(updateData).length === 0) {
//             return res.status(STATUS.BAD_REQUEST).json({
//                 message: 'No fields provided to update',
//             });
//         }

//         const updatedRequest = await Request.findByIdAndUpdate(
//             id,
//             updateData,
//             { new: true }
//         )
//             .populate('requested_by', 'id first_name last_name email_data designation')
//             .populate('department', 'id name')
//             // .populate('handled_by', 'id first_name last_name')
//             .populate('vendor', 'id name')
//             .exec();

//         return res.status(STATUS.SUCCESS).json({
//             data: updatedRequest,
//             message: "Request Updated Successfully"
//         });
//     } catch (error) {
//         console.error('Error updating request:', error);
//         return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
//             message: MESSAGE.internalServerError,
//             error: error.message,
//         });
//     }
// };

module.exports.archiveRequest = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only OWNER and ADMIN can archive requests
    if (!['OWNER', 'ADMIN'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const { id } = req.params;

        const request = await Request.findById(id);

        if (!request) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Request not found',
            });
        }

        const updatedRequest = await Request.findByIdAndUpdate(
            id,
            { is_archived: !request.is_archived },
            { new: true }
        )
            .populate('requested_by', 'id first_name last_name email_data designation')
            .populate('department', 'id name')
            // .populate('handled_by', 'id first_name last_name')
            .populate('vendor', 'id name')
            .exec();

        return res.status(STATUS.SUCCESS).json({
            id: updatedRequest.id,
            is_archived: updatedRequest.is_archived,
            message: updatedRequest.is_archived 
                ? "Request Archived Successfully" 
                : "Request Restored Successfully"
        });
    } catch (error) {
        console.error('Error archiving request:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};



module.exports.getRequests = async (req, res) => {
    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // Only OWNER and ADMIN can view all requests
    if (!['OWNER', 'ADMIN', 'DEPARTMENT', 'APPROVER'].includes(decodedToken.role)) {
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        const status = req.query.status;
        const priority = req.query.priority;
        const department = req.query.department;

        let query = { is_archived: false };

        if (status) {
            query.status = status;
        }

        if (priority) {
            query.priority = priority;
        }

        if (department) {
            query.department = department;
        }

        const documentCount = await Request.countDocuments(query);
        const requests = await Request.find(query)
            .sort({ createdAt: -1 })
            // Removed skip() and limit()
            .populate('requested_by', 'id first_name last_name email_data designation')
            .populate('department', 'id name')
            //.populate('handled_by', 'id first_name last_name')
            .populate('vendor', 'id name')
            .exec();

        return res.status(STATUS.SUCCESS).json({
            items: requests,
            totalItems: documentCount,
        });
    } catch (error) {
        console.error('Error fetching requests:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
};


exports.getRequestsByDepartmentId = async (req, res) => {
    try {
        const departmentId = req.params.id;

        // Validate departmentId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid department ID" });
        }

        // Find all requests with the specified department, active and not archived
        const requests = await Request.find({
            department: departmentId,
            is_active: true,
            is_archived: false
        })
        .sort({ createdAt: -1 })
        .populate('requested_by', 'id first_name last_name email_data designation')
        .populate('department', 'id name')
        .populate('vendor', 'id name')
        .exec();

        if (!requests.length) {
            return res.status(STATUS.NOT_FOUND).json({ message: "No requests found for this department" });
        }

        return res.status(STATUS.SUCCESS).json({ requests });

    } catch (error) {
        console.error('Error fetching requests by department:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
}
