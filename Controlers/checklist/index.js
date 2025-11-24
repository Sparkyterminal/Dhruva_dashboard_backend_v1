const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const FUNCTION = require("../../utils/functions");

const Checklist = require("../../Modals/Checklist");
const Department = require("../../Modals/Department");
const { validationResult } = require("express-validator");

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Create checklist
module.exports.createChecklist = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        const { heading, eventReference, subHeadings, department } = req.body;

        // Validate required fields
        if (!heading || typeof heading !== 'string' || heading.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Heading is required',
                field: 'heading'
            });
        }

        if (!subHeadings || !Array.isArray(subHeadings) || subHeadings.length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'SubHeadings array is required and must not be empty',
                field: 'subHeadings'
            });
        }

        // Validate each subHeading object
        for (let i = 0; i < subHeadings.length; i++) {
            const subHeading = subHeadings[i];
            if (!subHeading.subHeadingName || typeof subHeading.subHeadingName !== 'string' || subHeading.subHeadingName.trim().length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: `SubHeading ${i + 1}: subHeadingName is required`,
                    field: `subHeadings[${i}].subHeadingName`
                });
            }

            if (!subHeading.checklists || !Array.isArray(subHeading.checklists) || subHeading.checklists.length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: `SubHeading ${i + 1}: checklists array is required and must not be empty`,
                    field: `subHeadings[${i}].checklists`
                });
            }

            // Validate each checklist item
            for (let j = 0; j < subHeading.checklists.length; j++) {
                const checklist = subHeading.checklists[j];
                if (!checklist.checklistName || typeof checklist.checklistName !== 'string' || checklist.checklistName.trim().length === 0) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: `SubHeading ${i + 1}, Checklist ${j + 1}: checklistName is required`,
                        field: `subHeadings[${i}].checklists[${j}].checklistName`
                    });
                }
            }
        }

        if (!department || !mongoose.Types.ObjectId.isValid(department)) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Valid department ID is required',
                field: 'department'
            });
        }

        // Verify department exists
        const departmentExists = await Department.findById(department);
        if (!departmentExists) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Department not found',
            });
        }

        // Process subHeadings - ensure all fields are properly formatted
        const processedSubHeadings = subHeadings.map(subHeading => ({
            subHeadingName: subHeading.subHeadingName.trim(),
            checklists: subHeading.checklists.map(checklist => ({
                checklistName: checklist.checklistName.trim(),
                units: checklist.units ? String(checklist.units).trim() : '',
                length: checklist.length ? String(checklist.length).trim() : '',
                breadth: checklist.breadth ? String(checklist.breadth).trim() : '',
                depth: checklist.depth ? String(checklist.depth).trim() : '',
                quantity: checklist.quantity ? String(checklist.quantity).trim() : '',
                rate: checklist.rate ? String(checklist.rate).trim() : ''
            }))
        }));

        // Create checklist
        const checklist = new Checklist({
            heading: heading.trim(),
            eventReference: eventReference ? eventReference.trim() : '',
            subHeadings: processedSubHeadings,
            department: department
        });

        const savedChecklist = await checklist.save();

        return res.status(STATUS.CREATED).json({
            id: savedChecklist.id,
            heading: savedChecklist.heading,
            eventReference: savedChecklist.eventReference,
            subHeadings: savedChecklist.subHeadings,
            department: savedChecklist.department
        });
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Get all checklists
module.exports.getChecklists = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    // Set Status From Request Query
    let status = true;

    if(req.query.status === undefined || req.query.status === ""){
        status = null;
    }
    else{
        if(req.query.status != "false" && req.query.status != "true"){
            status = true;
        }
        else{
            let query_status = JSON.parse(req.query.status);
            status = query_status;
        }        
    }

    // Set Pagination Configurations
    let pageInt;
    let sizeInt;
    const page = req.query.page;
    const size = req.query.size;

    if(size != undefined){
        sizeInt = parseInt(size);
    }
    else{
        sizeInt = 10;
    }

    if(page != undefined){
        pageInt = parseInt(page);
    }
    else{
        pageInt = 1;
    }

    // Set Sorting Configurations
    let sort;

    if(req.query.sort === undefined || req.query.sort === ""){
        sort = -1;
    }
    else{
        if(req.query.sort != "-1" && req.query.sort != "1"){
            sort = -1;
        }
        else{
            sort = parseInt(req.query.sort);
        }
    }

    // Department filter
    const departmentId = req.query.departmentId;

    try {
        let documentCount = 0;
        let checklists = [];
        
        let query = { is_archived: false };
        
        if (status !== null) {
            query.is_active = status;
        }

        if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
            query.department = departmentId;
        }
        
        if(status === null){
            documentCount = await Checklist.countDocuments(query);
            checklists = await Checklist.find(query)
                .populate('department', 'id name')
                .skip((pageInt - 1) * sizeInt)
                .limit(sizeInt)
                .sort({ createdAt: sort })
                .exec();
        }
        else{
            documentCount = await Checklist.countDocuments(query);
            checklists = await Checklist.find(query)
                .populate('department', 'id name')
                .skip((pageInt - 1) * sizeInt)
                .limit(sizeInt)
                .sort({ createdAt: sort })
                .exec();
        }

        return res.status(STATUS.SUCCESS).json({
            currentPage: pageInt,
            items: checklists,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount/sizeInt)
        });
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Get checklists by department ID
module.exports.getChecklistsByDepartmentId = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    try {
        const departmentId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(STATUS.BAD_REQUEST).json({ 
                message: "Invalid department ID" 
            });
        }

        // Verify department exists
        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(STATUS.NOT_FOUND).json({ 
                message: "Department not found" 
            });
        }

        const checklists = await Checklist.find({
            department: departmentId,
            is_active: true,
            is_archived: false
        })
        .populate('department', 'id name')
        .sort({ createdAt: -1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            checklists
        });
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Get single checklist by ID
module.exports.getChecklistById = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try{
        let checklist = await Checklist.findOne({ 
            _id: req.params.id, 
            is_archived: false 
        }).populate('department', 'id name');

        if(checklist != null){
            return res.status(STATUS.SUCCESS).json({
                data: checklist,
                message: "Checklist Found"
            });
        }
        else{
            return res.status(STATUS.NOT_FOUND).json({
                message: MESSAGE.notFound,
            });
        }
    }
    catch(error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Update checklist
module.exports.updateChecklist = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try{
        let { id } = req.params;
        const { heading, eventReference, subHeadings, department } = req.body;

        const updateData = {};

        if (heading !== undefined) {
            if (typeof heading !== 'string' || heading.trim().length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Heading must be a non-empty string',
                    field: 'heading'
                });
            }
            updateData.heading = heading.trim();
        }

        if (eventReference !== undefined) {
            updateData.eventReference = typeof eventReference === 'string' ? eventReference.trim() : '';
        }

        if (subHeadings !== undefined) {
            if (!Array.isArray(subHeadings) || subHeadings.length === 0) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'SubHeadings must be a non-empty array',
                    field: 'subHeadings'
                });
            }

            // Validate each subHeading object
            for (let i = 0; i < subHeadings.length; i++) {
                const subHeading = subHeadings[i];
                if (!subHeading.subHeadingName || typeof subHeading.subHeadingName !== 'string' || subHeading.subHeadingName.trim().length === 0) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: `SubHeading ${i + 1}: subHeadingName is required`,
                        field: `subHeadings[${i}].subHeadingName`
                    });
                }

                if (!subHeading.checklists || !Array.isArray(subHeading.checklists) || subHeading.checklists.length === 0) {
                    return res.status(STATUS.VALIDATION_FAILED).json({
                        message: `SubHeading ${i + 1}: checklists array is required and must not be empty`,
                        field: `subHeadings[${i}].checklists`
                    });
                }

                // Validate each checklist item
                for (let j = 0; j < subHeading.checklists.length; j++) {
                    const checklist = subHeading.checklists[j];
                    if (!checklist.checklistName || typeof checklist.checklistName !== 'string' || checklist.checklistName.trim().length === 0) {
                        return res.status(STATUS.VALIDATION_FAILED).json({
                            message: `SubHeading ${i + 1}, Checklist ${j + 1}: checklistName is required`,
                            field: `subHeadings[${i}].checklists[${j}].checklistName`
                        });
                    }
                }
            }

            // Process subHeadings - ensure all fields are properly formatted
            updateData.subHeadings = subHeadings.map(subHeading => ({
                subHeadingName: subHeading.subHeadingName.trim(),
                checklists: subHeading.checklists.map(checklist => ({
                    checklistName: checklist.checklistName.trim(),
                    units: checklist.units ? String(checklist.units).trim() : '',
                    length: checklist.length ? String(checklist.length).trim() : '',
                    breadth: checklist.breadth ? String(checklist.breadth).trim() : '',
                    depth: checklist.depth ? String(checklist.depth).trim() : '',
                    quantity: checklist.quantity ? String(checklist.quantity).trim() : '',
                    rate: checklist.rate ? String(checklist.rate).trim() : ''
                }))
            }));
        }

        if (department !== undefined) {
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
                });
            }
            
            updateData.department = department;
        }

        let checklist = await Checklist.findByIdAndUpdate(id, updateData, {
            new: true
        }).populate('department', 'id name');

        if (!checklist) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Checklist not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: checklist.id,
                heading: checklist.heading,
                eventReference: checklist.eventReference,
                subHeadings: checklist.subHeadings,
                department: checklist.department,
                message: "Checklist Updated"
            });
        }
    }
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Update checklist status
module.exports.updateChecklistStatus = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        let { id } = req.params;
        let { is_active } = req.body;

        let checklist = await Checklist.findByIdAndUpdate(id, { is_active }, {
            new: true,
        }).populate('department', 'id name');
        
        if (!checklist) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Checklist not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: checklist.id,
                heading: checklist.heading,
                is_active: checklist.is_active
            });
        }
    } 
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Archive or activate checklist
module.exports.archiveOrActiveChecklist = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        let { id } = req.params;
        let { is_archived } = req.body;

        let checklist = await Checklist.findByIdAndUpdate(id, { is_archived }, {
            new: true,
        }).populate('department', 'id name');
        
        if (!checklist) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Checklist not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: checklist.id,
                heading: checklist.heading,
                is_archived: checklist.is_archived
            });
        }
    } 
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Delete checklist
module.exports.deleteChecklist = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    //  if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        let { id } = req.params;

        // Check if checklist exists
        const checklist = await Checklist.findById(id);
        if (!checklist) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Checklist not found',
            });
        }

        // Delete the checklist
        const deletedChecklist = await Checklist.findByIdAndDelete(id);

        if (!deletedChecklist) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Checklist not found or could not be deleted',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            message: 'Checklist deleted successfully',
            id: deletedChecklist.id,
            heading: deletedChecklist.heading
        });

    } catch (error) {
        console.error('Error deleting checklist:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Get all active checklists
module.exports.getAllActiveChecklists = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    try {
        let checklists = await Checklist.find({ 
            is_active: true, 
            is_archived: false 
        })
        .populate('department', 'id name')
        .sort({ createdAt: -1 });
        
        return res.status(STATUS.SUCCESS).json(checklists);
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

