const STATUS = require('../../utils/statusCodes');
const ClientLead = require('../../Modals/ClientLead');
const Coordinator = require('../../Modals/Coordinators');
const mongoose = require('mongoose');
const { getDataCutoffDate, applyDateFieldCutoff } = require('../../utils/dataCutoff');

const ALLOWED_STATUSES = ['Inprogress', 'Confirmed', 'Cancelled'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseYmdToUtcStart(ymd) {
  if (!ymd || !YMD_RE.test(String(ymd).trim())) return null;
  const d = new Date(`${String(ymd).trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseYmdToUtcEnd(ymd) {
  if (!ymd || !YMD_RE.test(String(ymd).trim())) return null;
  const d = new Date(`${String(ymd).trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Expand YYYY-MM to inclusive UTC range for that calendar month. */
function monthToUtcRange(monthStr) {
  const m = MONTH_RE.exec(String(monthStr || '').trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
  return { start, end };
}

function parseEstimatedBudget(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: 'estimatedBudget is required' } : { value: 0 };
  }
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: 'estimatedBudget must be a number >= 0' };
  }
  return { value: Math.round(n) };
}

function parseConvertedFields(body, existing) {
  const out = {};
  const hasFlag = body.convertedByMarketing !== undefined;
  const hasAt = body.convertedAt !== undefined;

  let flag = existing?.convertedByMarketing === true;
  if (hasFlag) {
    if (typeof body.convertedByMarketing !== 'boolean') {
      return { error: 'convertedByMarketing must be a boolean' };
    }
    flag = body.convertedByMarketing;
    out.convertedByMarketing = flag;
  }

  if (hasFlag && flag === false) {
    out.convertedAt = null;
  } else if (hasFlag && flag === true) {
    if (hasAt && (body.convertedAt === null || body.convertedAt === '')) {
      out.convertedAt = new Date();
    } else if (hasAt) {
      const d = new Date(body.convertedAt);
      if (Number.isNaN(d.getTime())) {
        return { error: 'convertedAt must be a valid ISO datetime or null' };
      }
      out.convertedAt = d;
    } else {
      out.convertedAt = existing?.convertedAt || new Date();
    }
  } else if (hasAt) {
    if (body.convertedAt === null || body.convertedAt === '') {
      out.convertedAt = null;
    } else {
      const d = new Date(body.convertedAt);
      if (Number.isNaN(d.getTime())) {
        return { error: 'convertedAt must be a valid ISO datetime or null' };
      }
      out.convertedAt = d;
    }
  }

  return { fields: out };
}

/**
 * Build Mongo query for list. Prefer explicit startDate/endDate over month when both sent.
 * Date filters require startDate to exist (exclude null/missing from filtered totals/list).
 */
function buildListQuery(queryParams) {
  const query = {};
  const { status, assignedTo, startDate, endDate, month } = queryParams;

  if (status !== undefined && status !== null && String(status).trim() !== '') {
    const statusValue = String(status).trim();
    if (!ALLOWED_STATUSES.includes(statusValue)) {
      return {
        error: {
          status: STATUS.BAD_REQUEST,
          body: {
            message: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}`,
            field: 'status',
          },
        },
      };
    }
    query.status = statusValue;
  }

  if (assignedTo !== undefined && assignedTo !== null && String(assignedTo).trim() !== '') {
    const assignedToValue = String(assignedTo).trim();
    if (!mongoose.Types.ObjectId.isValid(assignedToValue)) {
      return {
        error: {
          status: STATUS.BAD_REQUEST,
          body: {
            message: 'Valid assignedTo coordinator ID is required',
            field: 'assignedTo',
          },
        },
      };
    }
    query.assignedTo = assignedToValue;
  }

  const hasExplicitRange =
    (startDate && String(startDate).trim()) || (endDate && String(endDate).trim());

  let rangeStart = null;
  let rangeEnd = null;

  if (hasExplicitRange) {
    if (startDate && String(startDate).trim()) {
      rangeStart = parseYmdToUtcStart(startDate);
      if (!rangeStart) {
        return {
          error: {
            status: STATUS.BAD_REQUEST,
            body: { message: 'startDate must be YYYY-MM-DD', field: 'startDate' },
          },
        };
      }
    }
    if (endDate && String(endDate).trim()) {
      rangeEnd = parseYmdToUtcEnd(endDate);
      if (!rangeEnd) {
        return {
          error: {
            status: STATUS.BAD_REQUEST,
            body: { message: 'endDate must be YYYY-MM-DD', field: 'endDate' },
          },
        };
      }
    }
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      return {
        error: {
          status: STATUS.BAD_REQUEST,
          body: { message: 'startDate must be <= endDate' },
        },
      };
    }
  } else if (month && String(month).trim()) {
    const range = monthToUtcRange(month);
    if (!range) {
      return {
        error: {
          status: STATUS.BAD_REQUEST,
          body: { message: 'month must be YYYY-MM', field: 'month' },
        },
      };
    }
    rangeStart = range.start;
    rangeEnd = range.end;
  }

  if (rangeStart || rangeEnd) {
    query.startDate = { $ne: null, $exists: true };
    if (rangeStart) query.startDate.$gte = rangeStart;
    if (rangeEnd) query.startDate.$lte = rangeEnd;
  }

  return { query };
}

function computeBudgetSummary(leads) {
  let totalEstimatedBudget = 0;
  let totalConvertedBudget = 0;
  let estimatedLeadsCount = 0;
  let convertedLeadsCount = 0;

  for (const lead of leads) {
    const budget = Number(lead.estimatedBudget);
    const amount = Number.isFinite(budget) && budget >= 0 ? Math.round(budget) : 0;
    const converted = lead.convertedByMarketing === true;

    if (converted) {
      totalConvertedBudget += amount;
      convertedLeadsCount += 1;
    } else {
      totalEstimatedBudget += amount;
      if (Number.isFinite(budget)) estimatedLeadsCount += 1;
    }
  }

  return {
    totalEstimatedBudget,
    totalConvertedBudget,
    estimatedLeadsCount,
    convertedLeadsCount,
  };
}

async function validateAssignedTo(assignedTo) {
  if (assignedTo === undefined || assignedTo === null || assignedTo === '') {
    return { value: null };
  }
  if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
    return { error: 'Valid assignedTo coordinator ID is required' };
  }
  const coordinator = await Coordinator.findById(assignedTo).select('_id');
  if (!coordinator) {
    return { error: 'Assigned coordinator not found', notFound: true };
  }
  return { value: assignedTo };
}

/**
 * POST /api/client-leads
 */
exports.createClientLead = async (req, res) => {
  try {
    const {
      status,
      clientDetails,
      eventTypeDetails,
      notes,
      assignedTo,
      startDate,
      endDate,
      estimatedBudget,
      convertedByMarketing,
      convertedAt,
    } = req.body;

    const assigned = await validateAssignedTo(assignedTo);
    if (assigned.error) {
      return res.status(assigned.notFound ? 404 : STATUS.BAD_REQUEST).json({
        message: assigned.error,
      });
    }

    const budgetParsed = parseEstimatedBudget(estimatedBudget);
    if (budgetParsed.error) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: budgetParsed.error,
        field: 'estimatedBudget',
      });
    }

    const conversion = parseConvertedFields(
      { convertedByMarketing, convertedAt },
      { convertedByMarketing: false, convertedAt: null }
    );
    if (conversion.error) {
      return res.status(STATUS.BAD_REQUEST).json({ message: conversion.error });
    }

    const lead = new ClientLead({
      status: status || 'Inprogress',
      clientDetails: clientDetails || '',
      eventTypeDetails: eventTypeDetails || '',
      assignedTo: assigned.value,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || '',
      estimatedBudget: budgetParsed.value,
      convertedByMarketing: conversion.fields.convertedByMarketing ?? false,
      convertedAt: conversion.fields.convertedAt !== undefined ? conversion.fields.convertedAt : null,
      createdBy: req.userId || null,
    });

    await lead.save();

    const populated = await ClientLead.findById(lead._id)
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .lean();

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
 * Query: status, assignedTo, startDate, endDate, month
 * Returns data[] + summary (estimated vs converted budgets for Marketing Track cards)
 */
exports.getAllClientLeads = async (req, res) => {
  try {
    const built = buildListQuery(req.query);
    if (built.error) {
      return res.status(built.error.status).json(built.error.body);
    }

    const cutoff = await getDataCutoffDate();
    applyDateFieldCutoff(built.query, 'startDate', cutoff);

    const leads = await ClientLead.find(built.query)
      .populate('createdBy', 'first_name last_name email_data')
      .populate('assignedTo', 'name contact_number email')
      .sort({ createdAt: -1 })
      .lean();

    const summary = computeBudgetSummary(leads);

    return res.status(200).json({
      message: 'Success',
      data: leads,
      count: leads.length,
      summary,
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
 * Supports estimatedBudget, convertedByMarketing, convertedAt.
 * Converting must not wipe estimatedBudget.
 */
exports.updateClientLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      clientDetails,
      eventTypeDetails,
      notes,
      assignedTo,
      startDate,
      endDate,
      estimatedBudget,
      convertedByMarketing,
      convertedAt,
    } = req.body;

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

    if (assignedTo !== undefined) {
      const assigned = await validateAssignedTo(assignedTo);
      if (assigned.error) {
        return res.status(assigned.notFound ? 404 : STATUS.BAD_REQUEST).json({
          message: assigned.error,
        });
      }
      lead.assignedTo = assigned.value;
    }

    if (status !== undefined) lead.status = status;
    if (clientDetails !== undefined) lead.clientDetails = clientDetails;
    if (eventTypeDetails !== undefined) lead.eventTypeDetails = eventTypeDetails;
    if (startDate !== undefined) lead.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) lead.endDate = endDate ? new Date(endDate) : null;
    if (notes !== undefined) lead.notes = notes;

    if (estimatedBudget !== undefined) {
      const budgetParsed = parseEstimatedBudget(estimatedBudget);
      if (budgetParsed.error) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: budgetParsed.error,
          field: 'estimatedBudget',
        });
      }
      lead.estimatedBudget = budgetParsed.value;
    }

    const conversion = parseConvertedFields(
      { convertedByMarketing, convertedAt },
      {
        convertedByMarketing: lead.convertedByMarketing,
        convertedAt: lead.convertedAt,
      }
    );
    if (conversion.error) {
      return res.status(STATUS.BAD_REQUEST).json({ message: conversion.error });
    }
    if (conversion.fields.convertedByMarketing !== undefined) {
      lead.convertedByMarketing = conversion.fields.convertedByMarketing;
    }
    if (conversion.fields.convertedAt !== undefined) {
      lead.convertedAt = conversion.fields.convertedAt;
    }

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
