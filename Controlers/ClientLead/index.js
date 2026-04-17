const STATUS = require('../../utils/statusCodes');
const ClientLead = require('../../Modals/ClientLead');
const Coordinator = require('../../Modals/Coordinators');
const mongoose = require('mongoose');

/**
 * POST /api/client-leads
 * Create a new client lead
 */
exports.createClientLead = async (req, res) => {
  try {
    const { status, clientDetails, eventTypeDetails, notes, assignedTo, startDate, endDate } = req.body;

    if (assignedTo !== undefined && assignedTo !== null && assignedTo !== '') {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: 'Valid assignedTo coordinator ID is required',
        });
      }
      const coordinator = await Coordinator.findById(assignedTo).select('_id');
      if (!coordinator) {
        return res.status(404).json({
          message: 'Assigned coordinator not found',
        });
      }
    }

    const lead = new ClientLead({
      status: status || 'Inprogress',
      clientDetails: clientDetails || '',
      eventTypeDetails: eventTypeDetails || '',
      assignedTo: assignedTo || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || '',
      createdBy: req.userId || null,
    });

    await lead.save();

    const populated = await ClientLead.findById(lead._id)
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .lean();

    // Explicit 201 with body so API Gateway does not return 204 No Content
    const body = {
      message: 'Client lead created successfully',
      data: populated,
    };
    res.set('Content-Type', 'application/json');
    return res.status(201).send(JSON.stringify(body));
  } catch (error) {
    console.error('createClientLead error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/client-leads
 * Get all client leads
 */
exports.getAllClientLeads = async (req, res) => {
  try {
    const leads = await ClientLead.find()
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: 'Success',
      data: leads,
      count: leads.length,
    });
  } catch (error) {
    console.error('getAllClientLeads error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/client-leads/:id
 * Get a single client lead by ID
 */
exports.getClientLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid client lead ID is required',
      });
    }

    const lead = await ClientLead.findById(id)
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .lean();

    if (!lead) {
      return res.status(404).json({
        message: 'Client lead not found',
      });
    }

    return res.status(200).json({
      message: 'Success',
      data: lead,
    });
  } catch (error) {
    console.error('getClientLeadById error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * PUT /api/client-leads/:id
 * Update a client lead
 */
exports.updateClientLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, clientDetails, eventTypeDetails, notes, assignedTo, startDate, endDate } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid client lead ID is required',
      });
    }

    const lead = await ClientLead.findById(id);
    if (!lead) {
      return res.status(404).json({
        message: 'Client lead not found',
      });
    }

    if (assignedTo !== undefined && assignedTo !== null && assignedTo !== '') {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: 'Valid assignedTo coordinator ID is required',
        });
      }
      const coordinator = await Coordinator.findById(assignedTo).select('_id');
      if (!coordinator) {
        return res.status(404).json({
          message: 'Assigned coordinator not found',
        });
      }
    }

    if (status !== undefined) lead.status = status;
    if (clientDetails !== undefined) lead.clientDetails = clientDetails;
    if (eventTypeDetails !== undefined) lead.eventTypeDetails = eventTypeDetails;
    if (assignedTo !== undefined) lead.assignedTo = assignedTo || null;
    if (startDate !== undefined) lead.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) lead.endDate = endDate ? new Date(endDate) : null;
    if (notes !== undefined) lead.notes = notes;

    await lead.save();

    const updated = await ClientLead.findById(lead._id)
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .lean();

    return res.status(200).json({
      message: 'Client lead updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('updateClientLead error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/client-leads/:id
 * Delete a client lead
 */
exports.deleteClientLead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid client lead ID is required',
      });
    }

    const lead = await ClientLead.findByIdAndDelete(id);

    if (!lead) {
      return res.status(404).json({
        message: 'Client lead not found',
      });
    }

    return res.status(200).json({
      message: 'Client lead deleted successfully',
    });
  } catch (error) {
    console.error('deleteClientLead error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};
