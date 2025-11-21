// const jwt = require('jsonwebtoken');
// const Event = require("../../Modals/ClientsBookings");
// const STATUS = require("../../utils/statusCodes");
// const MESSAGE = require("../../utils/messages");

// const Request = require("../../Modals/Request");
// const { validationResult } = require("express-validator");
// // Create new event with advances
// exports.createEvent = async (req, res) => {
//   try {
//     const { clientName, eventDate, venueLocation, agreedAmount, advances } = req.body;

//     if (!clientName || !eventDate || !venueLocation || !agreedAmount || !advances) {
//       return res.status(400).json({ message: "Required fields missing" });
//     }

//     // Validate advances: Array of { advanceNumber, expectedAmount, optional receivedAmount, receivedDate, remarks, updatedBy }
//     if (!Array.isArray(advances) || advances.length === 0) {
//       return res.status(400).json({ message: "Advances must be a non-empty array" });
//     }

//     // Prepare advances array ensuring defaults
//     const advancesData = advances.map(adv => ({
//       advanceNumber: adv.advanceNumber,
//       expectedAmount: adv.expectedAmount,
//       receivedAmount: adv.receivedAmount || 0,
//       receivedDate: adv.receivedDate ? new Date(adv.receivedDate) : null,
//       remarks: adv.remarks || { accounts: "", owner: "", approver: "" },
//       updatedBy: adv.updatedBy || { accounts: null, owner: null, approver: null },
//       updatedAt: adv.updatedAt || { accounts: null, owner: null, approver: null }
//     }));

//     const event = new Event({
//       clientName,
//       eventDate,
//       venueLocation,
//       agreedAmount,
//       advances: advancesData
//     });

//     await event.save();
//     res.status(201).json({ message: "Event created", event });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Update advance details by advanceNumber and role (DEPARTMENT / OWNER / APPROVER)
// exports.updateAdvance = async (req, res) => {
//   try {
//     const { eventId, advanceNumber } = req.params;
//     const {  receivedAmount, remarks, receivedDate, userId } = req.body;
//     const token = req.get('Authorization');
//     let decodedToken = await jwt.decode(token);
//     const role = decodedToken.role
//     // validate role
//     const validRoles = ["DEPARTMENT", "OWNER", "APPROVER"];
//     if (!validRoles.includes(role)) {
//       return res.status(400).json({ message: "Invalid role" });
//     }
//     if (receivedAmount == null && remarks == null && !receivedDate) {
//       return res.status(400).json({ message: "At least one of receivedAmount, remarks or receivedDate required" });
//     }

//     const event = await Event.findById(eventId);
//     if (!event) return res.status(404).json({ message: "Event not found" });

//     const advance = event.advances.find(a => a.advanceNumber === parseInt(advanceNumber));
//     if (!advance) return res.status(404).json({ message: "Advance not found" });

//     // Update fields as provided
//     if (typeof receivedAmount === "number") {
//       advance.receivedAmount = receivedAmount;
//     }
//     if (receivedDate) {
//       advance.receivedDate = new Date(receivedDate);
//     }
//     if (typeof remarks === "string") {
//       advance.remarks[role.toLowerCase()] = remarks;
//       advance.updatedBy[role.toLowerCase()] = userId;  // tracked user id
//       advance.updatedAt[role.toLowerCase()] = new Date();
//     }

//     await event.save();

//     res.status(200).json({ message: "Advance updated", advance });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get event by ID, including advances
// exports.getEvent = async (req, res) => {
//   try {
//     const event = await Event.findById(req.params.eventId);
//     if (!event) return res.status(404).json({ message: "Event not found" });

//     res.status(200).json({ event });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get all events with optional pagination
// exports.getAllEvents = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const skip = (page - 1) * limit;

//     const events = await Event.find()
//       .sort({ createdAt: -1 })  // latest events first
//       .skip(skip)
//       .limit(limit);

//     const totalEvents = await Event.countDocuments();

//     res.status(200).json({
//       page,
//       limit,
//       totalEvents,
//       totalPages: Math.ceil(totalEvents / limit),
//       events
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Edit event details except receivedAmount in advances
// exports.editEventExceptReceivedAmount = async (req, res) => {
//   try {
//     const { eventId } = req.params;
//     const { clientName, eventDate, venueLocation, agreedAmount, advances } = req.body;

//     // Validate basic fields
//     if (!clientName || !eventDate || !venueLocation || !agreedAmount || !Array.isArray(advances)) {
//       return res.status(400).json({ message: "Required fields missing or advances is not an array" });
//     }

//     const event = await Event.findById(eventId);
//     if (!event) return res.status(404).json({ message: "Event not found" });

//     // Update event base details
//     event.clientName = clientName;
//     event.eventDate = new Date(eventDate);
//     event.venueLocation = venueLocation;
//     event.agreedAmount = agreedAmount;

//     // Update advances without changing receivedAmount
//     event.advances = advances.map((adv) => {
//       // Find existing advance to retain receivedAmount and related fields
//       const existingAdvance = event.advances.find(a => a.advanceNumber === adv.advanceNumber);

//       return {
//         advanceNumber: adv.advanceNumber,
//         expectedAmount: adv.expectedAmount,
//         // Preserve existing receivedAmount, receivedDate, remarks, updatedBy, updatedAt
//         receivedAmount: existingAdvance ? existingAdvance.receivedAmount : 0,
//         receivedDate: existingAdvance ? existingAdvance.receivedDate : null,
//         remarks: existingAdvance ? existingAdvance.remarks : { accounts: "", owner: "", approver: "" },
//         updatedBy: existingAdvance ? existingAdvance.updatedBy : { accounts: null, owner: null, approver: null },
//         updatedAt: existingAdvance ? existingAdvance.updatedAt : { accounts: null, owner: null, approver: null },
//       };
//     });

//     await event.save();

//     res.status(200).json({ message: "Event updated (receivedAmount unchanged)", event });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };


const jwt = require('jsonwebtoken');
const Event = require("../../Modals/ClientsBookings");
const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");

// Create new event with event types & advances
exports.createEvent = async (req, res) => {
  try {
    const {
      eventName,
      eventTypes,
      clientName,
      brideName,
      groomName,
      contactNumber,
      altContactNumber
    } = req.body;

    if (!eventName || typeof eventName !== "string" || !eventName.trim()) {
      return res.status(400).json({ message: "eventName is required" });
    }

    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return res.status(400).json({ message: "clientName is required" });
    }

    if (!contactNumber || typeof contactNumber !== "string" || !contactNumber.trim()) {
      return res.status(400).json({ message: "contactNumber is required" });
    }

    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      return res.status(400).json({ message: "eventTypes must be a non-empty array" });
    }

    const eventTypesData = eventTypes.map((type, index) => {
      if (!type.eventType || !type.eventType.trim()) {
        throw new Error(`eventTypes[${index}].eventType is required`);
      }
      if (!type.startDate) {
        throw new Error(`eventTypes[${index}].startDate is required`);
      }
      if (!type.endDate) {
        throw new Error(`eventTypes[${index}].endDate is required`);
      }
      if (!type.venueLocation || !type.venueLocation.trim()) {
        throw new Error(`eventTypes[${index}].venueLocation is required`);
      }
      if (type.agreedAmount == null) {
        throw new Error(`eventTypes[${index}].agreedAmount is required`);
      }

      const advancesArray = Array.isArray(type.advances) ? type.advances : [];

      const advancesData = advancesArray.map((adv, advIndex) => {
        if (adv.advanceNumber == null) {
          throw new Error(`eventTypes[${index}].advances[${advIndex}].advanceNumber is required`);
        }
        if (adv.expectedAmount == null) {
          throw new Error(`eventTypes[${index}].advances[${advIndex}].expectedAmount is required`);
        }
        if (!adv.advanceDate) {
          throw new Error(`eventTypes[${index}].advances[${advIndex}].advanceDate is required`);
        }

        return {
          advanceNumber: adv.advanceNumber,
          expectedAmount: adv.expectedAmount,
          advanceDate: new Date(adv.advanceDate),
          receivedAmount: adv.receivedAmount || 0,
          receivedDate: adv.receivedDate ? new Date(adv.receivedDate) : null,
          remarks: adv.remarks || { accounts: "", owner: "", approver: "" },
          updatedBy: adv.updatedBy || { accounts: null, owner: null, approver: null },
          updatedAt: adv.updatedAt || { accounts: null, owner: null, approver: null }
        };
      });

      return {
        eventType: type.eventType.trim(),
        startDate: new Date(type.startDate),
        endDate: new Date(type.endDate),
        venueLocation: type.venueLocation.trim(),
        agreedAmount: type.agreedAmount,
        lead1: type.lead1 ? type.lead1.trim() : "",
        lead2: type.lead2 ? type.lead2.trim() : "",
        advances: advancesData
      };
    });

    const event = new Event({
      eventName: eventName.trim(),
      eventTypes: eventTypesData,
      clientName: clientName.trim(),
      brideName: brideName ? brideName.trim() : undefined,
      groomName: groomName ? groomName.trim() : undefined,
      contactNumber: contactNumber.trim(),
      altContactNumber: altContactNumber ? altContactNumber.trim() : undefined
    });

    await event.save();
    res.status(201).json({ message: "Event created", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Update advance details by advanceNumber and role (DEPARTMENT / OWNER / APPROVER)
exports.updateAdvance = async (req, res) => {
  try {
    const { eventId, advanceNumber } = req.params;
    const { receivedAmount, remarks, receivedDate, userId } = req.body;
    const selectedEventType = req.query.eventType || req.body.eventType;
    const token = req.get('Authorization');
    if (!token) return res.status(401).json({ message: "Authorization token required" });

    const decodedToken = jwt.decode(token);
    if (!decodedToken || !decodedToken.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const role = decodedToken.role.toUpperCase();
    const validRoles = ["DEPARTMENT", "OWNER", "APPROVER"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (receivedAmount == null && remarks == null && !receivedDate) {
      return res.status(400).json({ message: "At least one of receivedAmount, remarks or receivedDate required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const eventTypeDoc = selectedEventType
      ? event.eventTypes.find(et => et.eventType === selectedEventType)
      : event.eventTypes.find(et => et.advances.some(a => a.advanceNumber === parseInt(advanceNumber)));

    if (!eventTypeDoc) {
      return res.status(404).json({ message: "Event type not found for the specified advance" });
    }

    const advance = eventTypeDoc.advances.find(a => a.advanceNumber === parseInt(advanceNumber));
    if (!advance) return res.status(404).json({ message: "Advance not found" });

    if (typeof receivedAmount === "number") {
      advance.receivedAmount = receivedAmount;
    }
    if (receivedDate) {
      advance.receivedDate = new Date(receivedDate);
    }
    if (typeof remarks === "string") {
      advance.remarks[role.toLowerCase()] = remarks;
      advance.updatedBy[role.toLowerCase()] = userId || null;
      advance.updatedAt[role.toLowerCase()] = new Date();
    }

    await event.save();

    res.status(200).json({ message: "Advance updated", advance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get event by ID, including advances
exports.getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    res.status(200).json({ event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all events with optional pagination
// exports.getAllEvents = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const skip = (page - 1) * limit;

//     const events = await Event.find()
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const totalEvents = await Event.countDocuments();

//     res.status(200).json({
//       page,
//       limit,
//       totalEvents,
//       totalPages: Math.ceil(totalEvents / limit),
//       events
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find()
      .sort({ createdAt: -1 });  // latest events first

    const totalEvents = events.length;

    res.status(200).json({
      totalEvents,
      events
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


// Edit event details except receivedAmount in advances
exports.editEventExceptReceivedAmount = async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      eventName,
      eventTypes,
      clientName,
      brideName,
      groomName,
      contactNumber,
      altContactNumber
    } = req.body;

    if (!eventName || !clientName || !contactNumber || !Array.isArray(eventTypes)) {
      return res.status(400).json({ message: "eventName, clientName, contactNumber and eventTypes are required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    event.eventName = eventName.trim();
    event.clientName = clientName.trim();
    event.brideName = brideName ? brideName.trim() : undefined;
    event.groomName = groomName ? groomName.trim() : undefined;
    event.contactNumber = contactNumber.trim();
    event.altContactNumber = altContactNumber ? altContactNumber.trim() : undefined;

    event.eventTypes = eventTypes.map((type, index) => {
      if (!type.eventType || !type.eventType.trim()) {
        throw new Error(`eventTypes[${index}].eventType is required`);
      }
      const existingType = event.eventTypes.find(t => t.eventType === type.eventType);

      const advancesArray = Array.isArray(type.advances) ? type.advances : [];

      const advances = advancesArray.map((adv, advIndex) => {
        const existingAdvance = existingType
          ? existingType.advances.find(a => a.advanceNumber === adv.advanceNumber)
          : null;

        return {
          advanceNumber: adv.advanceNumber,
          expectedAmount: adv.expectedAmount,
          advanceDate: adv.advanceDate ? new Date(adv.advanceDate) : (existingAdvance ? existingAdvance.advanceDate : null),
          receivedAmount: existingAdvance ? existingAdvance.receivedAmount : 0,
          receivedDate: existingAdvance ? existingAdvance.receivedDate : null,
          remarks: existingAdvance ? existingAdvance.remarks : { accounts: "", owner: "", approver: "" },
          updatedBy: existingAdvance ? existingAdvance.updatedBy : { accounts: null, owner: null, approver: null },
          updatedAt: existingAdvance ? existingAdvance.updatedAt : { accounts: null, owner: null, approver: null },
        };
      });

      return {
        eventType: type.eventType.trim(),
        startDate: type.startDate ? new Date(type.startDate) : (existingType ? existingType.startDate : null),
        endDate: type.endDate ? new Date(type.endDate) : (existingType ? existingType.endDate : null),
        venueLocation: type.venueLocation ? type.venueLocation.trim() : (existingType ? existingType.venueLocation : ""),
        agreedAmount: type.agreedAmount != null ? type.agreedAmount : (existingType ? existingType.agreedAmount : 0),
        lead1: type.lead1 ? type.lead1.trim() : (existingType ? existingType.lead1 : ""),
        lead2: type.lead2 ? type.lead2.trim() : (existingType ? existingType.lead2 : ""),
        advances
      };
    });

    await event.save();

    res.status(200).json({ message: "Event updated (received fields preserved)", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};
