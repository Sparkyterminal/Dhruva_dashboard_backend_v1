const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const Venue = require("../../Modals/Venue");
const { validationResult } = require("express-validator");
const mongoose = require('mongoose');

// Create venue
module.exports.createVenue = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { name, address, city, state } = req.body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Venue name is required',
                field: 'name'
            });
        }

        // Check if venue name already exists
        const existingVenue = await Venue.findOne({ 
            name: name.trim(),
            is_archived: false
        });
        if (existingVenue) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Venue name already exists',
                field: 'name'
            });
        }

        // Create venue
        const venue = new Venue({
            name: name.trim(),
            address: address ? address.trim() : '',
            city: city ? city.trim() : '',
            state: state ? state.trim() : ''
        });

        const savedVenue = await venue.save();

        return res.status(STATUS.CREATED).json({
            id: savedVenue.id,
            name: savedVenue.name,
            address: savedVenue.address,
            city: savedVenue.city,
            state: savedVenue.state,
            message: 'Venue created successfully'
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

// Get all venues
module.exports.getAllVenues = async (req, res) => {
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

        const venues = await Venue.find(query)
            .sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            venues
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

// Get single venue by ID
module.exports.getVenueById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid venue ID',
            });
        }

        const venue = await Venue.findOne({ 
            _id: id,
            is_archived: false
        });

        if (!venue) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Venue not found',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            data: venue,
            message: "Venue Found"
        });
    }
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Update venue
module.exports.updateVenue = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { id } = req.params;
        const { name, address, city, state, is_active } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Venue name is required',
                field: 'name'
            });
        }

        // Check if venue exists
        const currentVenue = await Venue.findById(id);
        if (!currentVenue || currentVenue.is_archived) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Venue not found",
            });
        }

        // Check if name already exists (excluding current venue)
        const existingVenue = await Venue.findOne({ 
            name: name.trim(),
            is_archived: false,
            _id: { $ne: id }
        });
        if (existingVenue) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Venue name already exists',
                field: 'name'
            });
        }

        const updateData = {
            name: name.trim(),
            address: address !== undefined ? (address ? address.trim() : '') : currentVenue.address,
            city: city !== undefined ? (city ? city.trim() : '') : currentVenue.city,
            state: state !== undefined ? (state ? state.trim() : '') : currentVenue.state,
        };

        if (is_active !== undefined) {
            updateData.is_active = is_active;
        }

        const venue = await Venue.findByIdAndUpdate(id, updateData, {
            new: true
        });

        if (!venue) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Venue not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: venue.id,
                name: venue.name,
                address: venue.address,
                city: venue.city,
                state: venue.state,
                is_active: venue.is_active,
                message: "Venue Updated"
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

// Delete venue (soft delete - archive)
module.exports.deleteVenue = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid venue ID',
            });
        }

        // Check if venue exists
        const venue = await Venue.findById(id);
        if (!venue) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Venue not found',
            });
        }

        // Soft delete by archiving
        venue.is_archived = true;
        await venue.save();

        return res.status(STATUS.SUCCESS).json({
            message: 'Venue deleted successfully',
            id: venue.id,
            name: venue.name
        });

    } catch (error) {
        console.error('Error deleting venue:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

