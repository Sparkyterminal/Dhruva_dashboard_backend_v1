const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const SubVenueLocation = require("../../Modals/SubVenueLocation");
const Venue = require("../../Modals/Venue");
const { validationResult } = require("express-validator");
const mongoose = require('mongoose');

// Create sub venue location
module.exports.createSubVenueLocation = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { name, venue } = req.body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Sub venue location name is required',
                field: 'name'
            });
        }

        if (!venue || !mongoose.Types.ObjectId.isValid(venue)) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Valid venue ID is required',
                field: 'venue'
            });
        }

        // Verify venue exists
        const venueExists = await Venue.findById(venue);
        if (!venueExists || venueExists.is_archived) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Venue not found',
                field: 'venue'
            });
        }

        // Check if sub venue location name already exists for this venue
        const existingSubVenueLocation = await SubVenueLocation.findOne({ 
            name: name.trim(),
            venue: venue,
            is_archived: false
        });
        if (existingSubVenueLocation) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Sub venue location name already exists for this venue',
                field: 'name'
            });
        }

        // Create sub venue location
        const subVenueLocation = new SubVenueLocation({
            name: name.trim(),
            venue: venue
        });

        const savedSubVenueLocation = await subVenueLocation.save();
        await savedSubVenueLocation.populate('venue', 'id name');

        return res.status(STATUS.CREATED).json({
            id: savedSubVenueLocation.id,
            name: savedSubVenueLocation.name,
            venue: savedSubVenueLocation.venue,
            message: 'Sub venue location created successfully'
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

// Get all sub venue locations
module.exports.getAllSubVenueLocations = async (req, res) => {
    try {
        const { search, venue, is_active } = req.query;
        let query = { is_archived: false };
        
        // Filter by venue if provided
        if (venue && mongoose.Types.ObjectId.isValid(venue)) {
            query.venue = venue;
        }

        // Filter by active status if provided
        if (is_active !== undefined) {
            query.is_active = is_active === 'true';
        }

        // Search by name
        if (search && search.trim()) {
            query.name = { $regex: search.trim(), $options: 'i' };
        }

        const subVenueLocations = await SubVenueLocation.find(query)
            .populate('venue', 'id name')
            .sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            subVenueLocations
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

// Get sub venue locations by venue ID
module.exports.getSubVenueLocationsByVenueId = async (req, res) => {
    try {
        const { venueId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(venueId)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid venue ID',
            });
        }

        // Verify venue exists
        const venueExists = await Venue.findById(venueId);
        if (!venueExists) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Venue not found',
            });
        }

        // Get all sub venue locations for this venue
        const subVenueLocations = await SubVenueLocation.find({ 
            venue: venueId,
            is_archived: false
        })
            .populate('venue', 'id name')
            .sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            venue: {
                id: venueExists.id,
                name: venueExists.name
            },
            subVenueLocations,
            count: subVenueLocations.length
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

// Get single sub venue location by ID
module.exports.getSubVenueLocationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid sub venue location ID',
            });
        }

        const subVenueLocation = await SubVenueLocation.findOne({ 
            _id: id,
            is_archived: false
        }).populate('venue', 'id name');

        if (!subVenueLocation) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Sub venue location not found',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            data: subVenueLocation,
            message: "Sub venue location Found"
        });
    }
    catch (error) {
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

// Update sub venue location
module.exports.updateSubVenueLocation = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    try {
        const { id } = req.params;
        const { name, venue, is_active } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Sub venue location name is required',
                field: 'name'
            });
        }

        // Check if sub venue location exists
        const currentSubVenueLocation = await SubVenueLocation.findById(id);
        if (!currentSubVenueLocation || currentSubVenueLocation.is_archived) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Sub venue location not found",
            });
        }

        const updateData = { name: name.trim() };

        // Update venue if provided
        if (venue !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(venue)) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid venue ID',
                    field: 'venue'
                });
            }
            
            // Verify venue exists
            const venueExists = await Venue.findById(venue);
            if (!venueExists || venueExists.is_archived) {
                return res.status(STATUS.NOT_FOUND).json({
                    message: 'Venue not found',
                    field: 'venue'
                });
            }
            
            updateData.venue = venue;
        }

        const venueIdToCheck = updateData.venue || currentSubVenueLocation.venue;

        // Check if sub venue location name already exists for this venue (excluding current sub venue location)
        const existingSubVenueLocation = await SubVenueLocation.findOne({ 
            name: name.trim(),
            venue: venueIdToCheck,
            is_archived: false,
            _id: { $ne: id }
        });
        if (existingSubVenueLocation) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Sub venue location name already exists for this venue',
                field: 'name'
            });
        }

        if (is_active !== undefined) {
            updateData.is_active = is_active;
        }

        const subVenueLocation = await SubVenueLocation.findByIdAndUpdate(id, updateData, {
            new: true
        }).populate('venue', 'id name');

        if (!subVenueLocation) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Sub venue location not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: subVenueLocation.id,
                name: subVenueLocation.name,
                venue: subVenueLocation.venue,
                is_active: subVenueLocation.is_active,
                message: "Sub venue location Updated"
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

// Delete sub venue location (soft delete - archive)
module.exports.deleteSubVenueLocation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: 'Invalid sub venue location ID',
            });
        }

        // Check if sub venue location exists
        const subVenueLocation = await SubVenueLocation.findById(id);
        if (!subVenueLocation) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Sub venue location not found',
            });
        }

        // Soft delete by archiving
        subVenueLocation.is_archived = true;
        await subVenueLocation.save();

        return res.status(STATUS.SUCCESS).json({
            message: 'Sub venue location deleted successfully',
            id: subVenueLocation.id,
            name: subVenueLocation.name
        });

    } catch (error) {
        console.error('Error deleting sub venue location:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

