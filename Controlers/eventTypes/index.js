const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const EventType = require("../../Modals/eventTypes");
const EventName = require("../../Modals/events");
const { validationResult } = require("express-validator");
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Create event type
module.exports.createEventType = async (req, res) => {
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
        const { name, event } = req.body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event type name is required',
                field: 'name'
            });
        }

        if (!event || !mongoose.Types.ObjectId.isValid(event)) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Valid event ID is required',
                field: 'event'
            });
        }

        // Verify event exists
        const eventExists = await EventName.findById(event);
        if (!eventExists) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Event not found',
                field: 'event'
            });
        }

        // Check if event type name already exists for this event
        const existingEventType = await EventType.findOne({ 
            name: name.trim(),
            event: event
        });
        if (existingEventType) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event type name already exists for this event',
                field: 'name'
            });
        }

        // Create event type
        const eventType = new EventType({
            name: name.trim(),
            event: event
        });

        const savedEventType = await eventType.save();
        await savedEventType.populate('event', 'id name');

        return res.status(STATUS.CREATED).json({
            id: savedEventType.id,
            name: savedEventType.name,
            event: savedEventType.event,
            message: 'Event type created successfully'
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

// Get all event types
module.exports.getAllEventTypes = async (req, res) => {
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
        const { event } = req.query;
        let query = {};
        
        // Filter by event if provided
        if (event && mongoose.Types.ObjectId.isValid(event)) {
            query.event = event;
        }

        const eventTypes = await EventType.find(query)
            .populate('event', 'id name')
            .sort({ name: 1 });

        return res.status(STATUS.SUCCESS).json({
            success: true,
            eventTypes
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

// Get single event type by ID
module.exports.getEventTypeById = async (req, res) => {
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
        let eventType = await EventType.findOne({ 
            _id: req.params.id
        }).populate('event', 'id name');

        if(eventType != null){
            return res.status(STATUS.SUCCESS).json({
                data: eventType,
                message: "Event type Found"
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

// Update event type
module.exports.updateEventType = async (req, res) => {
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
        const { name, event } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event type name is required',
                field: 'name'
            });
        }

        const updateData = { name: name.trim() };

        // Update event if provided
        if (event !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(event)) {
                return res.status(STATUS.VALIDATION_FAILED).json({
                    message: 'Invalid event ID',
                    field: 'event'
                });
            }
            
            // Verify event exists
            const eventExists = await EventName.findById(event);
            if (!eventExists) {
                return res.status(STATUS.NOT_FOUND).json({
                    message: 'Event not found',
                    field: 'event'
                });
            }
            
            updateData.event = event;
        }

        // Get current event type to check event
        const currentEventType = await EventType.findById(id);
        if (!currentEventType) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Event type not found",
            });
        }

        const eventIdToCheck = updateData.event || currentEventType.event;

        // Check if event type name already exists for this event (excluding current event type)
        const existingEventType = await EventType.findOne({ 
            name: name.trim(),
            event: eventIdToCheck,
            _id: { $ne: id }
        });
        if (existingEventType) {
            return res.status(STATUS.VALIDATION_FAILED).json({
                message: 'Event type name already exists for this event',
                field: 'name'
            });
        }

        let eventType = await EventType.findByIdAndUpdate(id, updateData, {
            new: true
        }).populate('event', 'id name');

        if (!eventType) {
            return res.status(STATUS.NOT_FOUND).json({
                message: "Event type not found",
            });
        } 
        else {
            return res.status(STATUS.SUCCESS).json({
                id: eventType.id,
                name: eventType.name,
                event: eventType.event,
                message: "Event type Updated"
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

// Delete event type
module.exports.deleteEventType = async (req, res) => {
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

        // Check if event type exists
        const eventType = await EventType.findById(id);
        if (!eventType) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Event type not found',
            });
        }

        // TODO: Optional - Check if event type is being used in ClientsBookings
        // const ClientsBooking = require("../../Modals/ClientsBookings");
        // const bookingsWithEventType = await ClientsBooking.find({ 
        //     'eventTypes.eventType': id 
        // }).count();
        // 
        // if (bookingsWithEventType > 0) {
        //     return res.status(STATUS.FORBIDDEN).json({
        //         message: 'Cannot delete event type. It is being used in one or more client bookings.',
        //     });
        // }

        // Delete the event type
        const deletedEventType = await EventType.findByIdAndDelete(id);

        if (!deletedEventType) {
            return res.status(STATUS.NOT_FOUND).json({
                message: 'Event type not found or could not be deleted',
            });
        }

        return res.status(STATUS.SUCCESS).json({
            message: 'Event type deleted successfully',
            id: deletedEventType.id,
            name: deletedEventType.name
        });

    } catch (error) {
        console.error('Error deleting event type:', error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: MESSAGE.internalServerError,
            error: error.message,
        });
    }
}

