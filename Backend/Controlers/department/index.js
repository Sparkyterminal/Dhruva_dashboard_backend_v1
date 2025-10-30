const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const FUNCTION = require("../../utils/functions");

const Department = require("../../Modals/Department");
const { validationResult } = require("express-validator");

const jwt = require('jsonwebtoken');

module.exports.createDepartment = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    // CHECK ENTITY COUNT

    const entity_count = await FUNCTION.getThisEntityCount("DEPARTMENT");
    if(entity_count === false){
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
        });
    }

    // CREATE NEW DEPARTMENT OBJECT

    const department = new Department({
        name: req.body.name,
        // k_name: req.body.k_name,
        department_id: entity_count + 1
    });

    try {

        // SAVE DEPARTMENT OBJECT TO COLLECTION

        const savedDepartment = await department.save();

        try {

            // UPDATE ENTITY COUNT

            const saveEntityCount = await FUNCTION.updateThisEntityCount("DEPARTMENT");
            if(saveEntityCount === false){
                return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                    message: MESSAGE.internalServerError,
                });
            }

            return res.status(STATUS.CREATED).json({
                id: savedDepartment.id
            });
        }
        catch(error) {
            console.log(error);
            return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
                message: MESSAGE.internalServerError,
            });
        }
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
        });
    }
}

module.exports.getDepartments = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    //Set Status From Request Query

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

    //Set Pagination Configurations

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

    //Set Sorting Configurations

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

    try {
        let documentCount = 0;
        let departments = [];
        
        if(status === null){
            documentCount = await Department.countDocuments({ is_archived: false });
            departments = await Department.find({is_archived: false}, { id: 1, department_id: 1, name: 1, is_active: 1 }).skip((pageInt - 1) * sizeInt).limit(sizeInt).sort({department_id: 1}).exec();
        }
        else{
            documentCount = await Department.find({ is_active: status, is_archived: false }).count();
            departments = await Department.find({ is_active: status, is_archived: false },{ id: 1, department_id: 1, name: 1, is_active: 1 }).skip((pageInt - 1) * sizeInt).limit(sizeInt).sort({department_id: 1}).exec();
        }

        return res.status(STATUS.SUCCESS).json({
            currentPage: pageInt,
            items: departments,
            totalItems: documentCount,
            totalPages: Math.ceil(documentCount/sizeInt)
        });
    } 
    catch (error) {
        //console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.updateDepartmentStatus = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;
        let { is_active } = req.body;

        let department = await Department.findByIdAndUpdate(id, req.body, {
            new: true,
        });
        if (!department) {
            return res.status(STATUS.NOTFOUND).json({
                message: "Department status updated",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: department.id,
                name: department.name,
                // k_name: department.k_name,
                is_active: department.is_active
            });
        }
    } 
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.archiveOrActiveDepartment = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;
        let { is_archived } = req.body;

        let department = await Department.findByIdAndUpdate(id, req.body, {
            new: true,
        });
        if (!department) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Department archive updated",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: department.id,
                name: department.name,
                // k_name: department.k_name,
                is_archived: department.is_archived
            });
        }
    } 
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.deleteDepartment = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try {
        let { id } = req.params;

        // Check if department exists
        const department = await Department.findById(id);
        if (!department) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Department not found',
            });
        }

        // TODO: Optional - Check if department is assigned to any users
        // const User = require("../../Modals/User");
        // const usersWithDepartment = await User.find({ 
        //     'department.department': id 
        // }).count();
        // 
        // if (usersWithDepartment > 0) {
        //     return res.status(STATUS.FORBIDDEN).json({
        //         message: 'Cannot delete department. It is assigned to one or more users.',
        //     });
        // }

        // Delete the department
        const deletedDepartment = await Department.findByIdAndDelete(id);

        if (!deletedDepartment) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Department not found or could not be deleted',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            message: 'Department deleted successfully',
            id: deletedDepartment.id,
            name: deletedDepartment.name
        });

    } catch (error) {
        console.error('Error deleting department:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

module.exports.getAllActiveDepartments = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    try {
        let departments = await Department.find({ is_active: true, is_archived: false },{ id: 1, department_id: 1, name: 1 });
        return res.status(STATUS.SUCCESS).json(departments);
    } 
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.getSimilarDepartmentsByName = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    try {
        let { name } = req.params;
        if (!name) {
                return res.status(STATUS.NOT_FOUND).json({
                message: "name is required",
            });
        } 
        else {
            let departments = await Department.find({name: {'$regex': name}, is_active: true, is_archived: false });
            if (departments) {
                return res.status(STATUS.SUCCESS).json(departments);
            }
            else {
                return res.status(STATUS.NOT_FOUND).json({
                    message: "No departments found with this name",
                });
            }
        }
    } catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.updateDepartment = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try{
        let { id } = req.params;
        // let k_name = req.body.k_name;
        let name = req.body.name;

        const data = {
            // k_name: k_name,
            name: name
        }

        let department = await Department.findByIdAndUpdate(id, data, {
            new: true
        });

        if (!department) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Department not updated",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: department.id,
                message: "Department Updated"
            });
        }
    }
    catch (error) {
        console.log(error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error,
        });
    }
}

module.exports.getThisDepartment = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    const token = req.get('Authorization');
    let decodedToken = await jwt.decode(token);

    if(decodedToken.role != "ADMIN"){
        return res.status(STATUS.UNAUTHORISED).json({
            message: MESSAGE.unauthorized,
        });
    }

    try{
        let departmentReq = await Department.findOne({ _id: req.params.id, is_archived: false });
        if(departmentReq != null){
            return res.status(STATUS.SUCCESS).json({
                data: departmentReq,
                message: "Department Found"
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
            error,
        });
    }
}