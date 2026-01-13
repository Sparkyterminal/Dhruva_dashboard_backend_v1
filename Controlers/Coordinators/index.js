const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const Coordinator = require("../../Modals/Coordinators");
const { validationResult } = require("express-validator");
const mongoose = require('mongoose');

// Create coordinator
module.exports.createCoordinator = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { name, contact_number, email } = req.body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Coordinator name is required',
                field: 'name'
            });
        }

        // Check if coordinator name already exists
        const existingCoordinator = await Coordinator.findOne({ 
            name: name.trim(),
            is_archived: false
        });
        if (existingCoordinator) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Coordinator name already exists',
                field: 'name'
            });
        }

        // Create coordinator
        const coordinator = new Coordinator({
            name: name.trim(),
            contact_number: contact_number ? contact_number.trim() : '',
            email: email ? email.trim() : ''
        });

        const savedCoordinator = await coordinator.save();

        return res.status(STATUS.CREATED).json({
            id: savedCoordinator.id,
            name: savedCoordinator.name,
            contact_number: savedCoordinator.contact_number,
            email: savedCoordinator.email,
            message: 'Coordinator created successfully'
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

// Get all coordinators
module.exports.getAllCoordinators = async (req, res) => {
    try {
        const { search, is_active } = req.query;
        let query = { is_archived: false };
        
        // Filter by active status if provided
        if (is_active !== undefined) {
            query.is_active = is_active === 'true';
        }

        // Search by name
        if (search && search.trim()) {
            query.name = { $regex: search.trim(), $options: 'i' };
        }

        const coordinators = await Coordinator.find(query)
            .sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            coordinators
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

// Get single coordinator by ID
module.exports.getCoordinatorById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid coordinator ID',
            });
        }

        const coordinator = await Coordinator.findOne({ 
            _id: id,
            is_archived: false
        });

        if (!coordinator) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Coordinator not found',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            data: coordinator,
            message: "Coordinator Found"
        });
    }
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Update coordinator
module.exports.updateCoordinator = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { id } = req.params;
        const { name, contact_number, email, is_active } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Coordinator name is required',
                field: 'name'
            });
        }

        // Check if coordinator exists
        const currentCoordinator = await Coordinator.findById(id);
        if (!currentCoordinator || currentCoordinator.is_archived) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Coordinator not found",
            });
        }

        // Check if name already exists (excluding current coordinator)
        const existingCoordinator = await Coordinator.findOne({ 
            name: name.trim(),
            is_archived: false,
            _id: { $ne: id }
        });
        if (existingCoordinator) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Coordinator name already exists',
                field: 'name'
            });
        }

        const updateData = {
            name: name.trim(),
            contact_number: contact_number !== undefined ? (contact_number ? contact_number.trim() : '') : currentCoordinator.contact_number,
            email: email !== undefined ? (email ? email.trim() : '') : currentCoordinator.email,
        };

        if (is_active !== undefined) {
            updateData.is_active = is_active;
        }

        const coordinator = await Coordinator.findByIdAndUpdate(id, updateData, {
            new: true
        });

        if (!coordinator) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Coordinator not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: coordinator.id,
                name: coordinator.name,
                contact_number: coordinator.contact_number,
                email: coordinator.email,
                is_active: coordinator.is_active,
                message: "Coordinator Updated"
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

// Delete coordinator (soft delete - archive)
module.exports.deleteCoordinator = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid coordinator ID',
            });
        }

        // Check if coordinator exists
        const coordinator = await Coordinator.findById(id);
        if (!coordinator) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Coordinator not found',
            });
        }

        // Soft delete by archiving
        coordinator.is_archived = true;
        await coordinator.save();

        return res.status(STATUS.SUCCESS).json({
            message: 'Coordinator deleted successfully',
            id: coordinator.id,
            name: coordinator.name
        });

    } catch (error) {
        console.error('Error deleting coordinator:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

