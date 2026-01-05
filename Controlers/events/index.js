const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const EventName = require("../../Modals/events");
const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Create event
module.exports.createEvent = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: 'Bad request',
            errors: errors.array()
        });
    }

    // const token = req.get('Authorization');
    // let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        const { name } = req.body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event name is required',
                field: 'name'
            });
        }

        // Check if event name already exists
        const existingEvent = await EventName.findOne({ name: name.trim() });
        if (existingEvent) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event name already exists',
                field: 'name'
            });
        }

        // Create event
        const event = new EventName({
            name: name.trim()
        });

        const savedEvent = await event.save();

        return res.status(STATUS.CREATED).json({
            id: savedEvent.id,
            name: savedEvent.name,
            message: 'Event created successfully'
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

// Get all events
module.exports.getAllEvents = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    // const token = req.get('Authorization');
    // let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        const events = await EventName.find().sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            events
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

// Get single event by ID
module.exports.getEventById = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    // const token = req.get('Authorization');
    // let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try{
        let event = await EventName.findOne({ 
            _id: req.params.id
        });

        if(event != null){
            return res.status(STATUS.SUCCESS).json({
                data: event,
                message: "Event Found"
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

// Update event
module.exports.updateEvent = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    // const token = req.get('Authorization');
    // let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try{
        let { id } = req.params;
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event name is required',
                field: 'name'
            });
        }

        // Check if event name already exists (excluding current event)
        const existingEvent = await EventName.findOne({ 
            name: name.trim(),
            _id: { $ne: id }
        });
        if (existingEvent) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event name already exists',
                field: 'name'
            });
        }

        let event = await EventName.findByIdAndUpdate(id, { name: name.trim() }, {
            new: true
        });

        if (!event) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Event not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: event.id,
                name: event.name,
                message: "Event Updated"
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

// Delete event
module.exports.deleteEvent = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(STATUS.BAD_REQUEST).json({
            message: `Bad request`,
        });
    }

    // const token = req.get('Authorization');
    // let decodedToken = await jwt.decode(token);

    // if(decodedToken.role != "ADMIN"){
    //     return res.status(STATUS.UNAUTHORISED).json({
    //         message: MESSAGE.unauthorized,
    //     });
    // }

    try {
        let { id } = req.params;

        // Check if event exists
        const event = await EventName.findById(id);
        if (!event) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Event not found',
            });
        }

        // TODO: Optional - Check if event is being used in ClientsBookings
        // const ClientsBooking = require("../../Modals/ClientsBookings");
        // const bookingsWithEvent = await ClientsBooking.find({ 
        //     eventName: id 
        // }).count();
        // 
        // if (bookingsWithEvent > 0) {
        //     return res.status(STATUS.FORBIDDEN).json({
        //         message: 'Cannot delete event. It is being used in one or more client bookings.',
        //     });
        // }

        // Delete the event
        const deletedEvent = await EventName.findByIdAndDelete(id);

        if (!deletedEvent) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Event not found or could not be deleted',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            message: 'Event deleted successfully',
            id: deletedEvent.id,
            name: deletedEvent.name
        });

    } catch (error) {
        console.error('Error deleting event:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

