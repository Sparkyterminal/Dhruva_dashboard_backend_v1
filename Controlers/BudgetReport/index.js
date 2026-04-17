const STATUS = require('../../utils/statusCodes');
const BudgetReport = require('../../Modals/BudgetReport');
const Event = require('../../Modals/ClientsBookings');
const mongoose = require('mongoose');

/**
 * Extract unique vendor IDs from budgetData.groups
 * groups: { "Infrastructure": [{ vendorId, ... }], "Stationery": [...] }
 */
function extractVendorIds(budgetData) {
  const ids = new Set();
  const groups = budgetData?.groups || {};
  for (const key of Object.keys(groups)) {
    const items = Array.isArray(groups[key]) ? groups[key] : [];
    for (const item of items) {
      if (item?.vendorId && mongoose.Types.ObjectId.isValid(item.vendorId)) {
        ids.add(new mongoose.Types.ObjectId(item.vendorId));
      }
    }
  }
  return Array.from(ids);
}

/** Deep clone JSON-serializable Mixed fields (budgetData, exteriorDetails, metadata). */
function deepCloneJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Aggregation pipeline to populate event and vendor data
 * Use with BudgetReport.aggregate([...matchStage, ...populateEventAndVendorsPipeline()])
 */
function populateEventAndVendorsPipeline() {
  return [
    {
      $lookup: {
        from: 'events',
        localField: 'eventId',
        foreignField: '_id',
        as: 'eventData',
      },
    },
    {
      $unwind: {
        path: '$eventData',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'eventnames',
        localField: 'eventData.eventName',
        foreignField: '_id',
        as: 'eventNameData',
      },
    },
    {
      $addFields: {
        'eventData.eventName': { $arrayElemAt: ['$eventNameData', 0] },
      },
    },
    {
      $project: {
        eventNameData: 0,
      },
    },
    {
      $lookup: {
        from: 'vendors',
        let: { vids: '$vendorIds' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$vids'] },
            },
          },
          {
            $project: {
              name: 1,
              vendor_code: 1,
              email: 1,
              cont_person: 1,
              mobile_no: 1,
            },
          },
        ],
        as: 'vendorData',
      },
    },
    {
      $addFields: {
        eventId: '$eventData',
        vendorIds: '$vendorData',
      },
    },
    {
      $project: {
        eventData: 0,
        vendorData: 0,
      },
    },
  ];
}

/** Shared with event GET so the populated budget shape matches GET /api/budget-report/:id */
exports.populateEventAndVendorsPipeline = populateEventAndVendorsPipeline;

/**
 * POST /api/budget-report
 * Body: { eventId, budgetData, metadata?, exteriorDetails? }
 */
exports.createBudgetReport = async (req, res) => {
  try {
    const { eventId, budgetData, metadata, exteriorDetails } = req.body;

    if (!eventId) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'eventId is required',
      });
    }

    if (!budgetData) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'budgetData is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Invalid eventId',
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Event not found',
      });
    }

    const vendorIds = extractVendorIds(budgetData);

    const report = new BudgetReport({
      eventId,
      budgetData,
      metadata: metadata || {},
      exteriorDetails: exteriorDetails ?? null,
      vendorIds,
    });

    await report.save();

    const [populated] = await BudgetReport.aggregate([
      { $match: { _id: report._id } },
      ...populateEventAndVendorsPipeline(),
    ]);

    return res.status(STATUS.CREATED).json({
      message: 'Budget report created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('createBudgetReport error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * POST /api/budget-report/:id/clone
 * Creates a new budget report copied from the source. Optional body: { eventId?, metadata? }
 * - eventId: attach clone to another event (validated); omit to keep the same event as the source.
 * - metadata: shallow-merged into cloned metadata (after copying source metadata).
 * Sets metadata.clonedFromReportId and metadata.clonedAt on the new document.
 */
exports.cloneBudgetReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { eventId: targetEventId, metadata: metadataOverride } = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid budget report ID is required',
      });
    }

    const source = await BudgetReport.findById(id).lean();
    if (!source) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Budget report not found',
      });
    }

    let eventId = source.eventId;
    if (targetEventId !== undefined && targetEventId !== null && String(targetEventId).trim() !== '') {
      const tid = String(targetEventId).trim();
      if (!mongoose.Types.ObjectId.isValid(tid)) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: 'Invalid target eventId',
        });
      }
      const event = await Event.findById(tid).select('_id').lean();
      if (!event) {
        return res.status(STATUS.NOT_FOUND).json({
          message: 'Target event not found',
        });
      }
      eventId = tid;
    }

    const budgetData = deepCloneJson(source.budgetData);
    if (budgetData == null || typeof budgetData !== 'object' || Array.isArray(budgetData)) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'Source report has invalid or non-cloneable budgetData',
      });
    }

    let exteriorDetails = null;
    if (source.exteriorDetails != null) {
      exteriorDetails = deepCloneJson(source.exteriorDetails);
      if (exteriorDetails === null && source.exteriorDetails != null) {
        return res.status(STATUS.VALIDATION_FAILED).json({
          message: 'Source exteriorDetails could not be cloned',
        });
      }
    }

    const baseMeta =
      source.metadata &&
      typeof source.metadata === 'object' &&
      source.metadata !== null &&
      !Array.isArray(source.metadata)
        ? deepCloneJson(source.metadata)
        : {};
    if (baseMeta === null) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'Source metadata could not be cloned',
      });
    }

    const override =
      metadataOverride &&
      typeof metadataOverride === 'object' &&
      metadataOverride !== null &&
      !Array.isArray(metadataOverride)
        ? metadataOverride
        : {};

    const clonedMetadata = {
      ...baseMeta,
      ...override,
      clonedFromReportId: String(source._id),
      clonedAt: new Date().toISOString(),
    };

    const vendorIds = extractVendorIds(budgetData);

    const report = new BudgetReport({
      eventId,
      budgetData,
      metadata: clonedMetadata,
      exteriorDetails,
      vendorIds,
    });

    await report.save();

    const [populated] = await BudgetReport.aggregate([
      { $match: { _id: report._id } },
      ...populateEventAndVendorsPipeline(),
    ]);

    return res.status(STATUS.CREATED).json({
      message: 'Budget report cloned successfully',
      data: populated,
    });
  } catch (error) {
    console.error('cloneBudgetReport error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/budget-report
 * Get all budget reports (with event and vendors populated)
 */
exports.getAllBudgetReports = async (req, res) => {
  try {
    const reports = await BudgetReport.aggregate([
      ...populateEventAndVendorsPipeline(),
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json({
      message: 'Success',
      data: reports,
      count: reports.length,
    });
  } catch (error) {
    console.error('getAllBudgetReports error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/budget-report/:id
 * Get a single budget report by ID (for edit form, etc.)
 */
exports.getBudgetReportById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid budget report ID is required',
      });
    }

    const [report] = await BudgetReport.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      ...populateEventAndVendorsPipeline(),
    ]);

    if (!report) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Budget report not found',
      });
    }

    return res.status(200).json({
      message: 'Success',
      data: report,
    });
  } catch (error) {
    console.error('getBudgetReportById error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * PUT /api/budget-report/:id
 * Update budget report by ID
 * Body: { budgetData?, metadata?, exteriorDetails? } - partial update supported
 */
exports.updateBudgetReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { budgetData, metadata, exteriorDetails } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid budget report ID is required',
      });
    }

    const report = await BudgetReport.findById(id);
    if (!report) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Budget report not found',
      });
    }

    if (budgetData !== undefined) {
      report.budgetData = budgetData;
      report.vendorIds = extractVendorIds(budgetData);
    }
    if (metadata !== undefined) report.metadata = metadata;
    if (exteriorDetails !== undefined) report.exteriorDetails = exteriorDetails;

    await report.save();

    const [populated] = await BudgetReport.aggregate([
      { $match: { _id: report._id } },
      ...populateEventAndVendorsPipeline(),
    ]);

    return res.status(200).json({
      message: 'Budget report updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('updateBudgetReport error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/budget-report/vendor/:vendorId
 * Returns complete budget report data for all reports where this vendor is present.
 * Includes full budgetData (groups, grandTotals, summary), event (with eventName), and vendor details.
 */
exports.getBudgetReportsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid vendorId is required',
      });
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const reports = await BudgetReport.aggregate([
      { $match: { vendorIds: vendorObjectId } },
      ...populateEventAndVendorsPipeline(),
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          eventId: 1,
          budgetData: 1,
          exteriorDetails: 1,
          metadata: 1,
          vendorIds: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return res.status(200).json({
      message: 'Success',
      data: reports,
      count: reports.length,
    });
  } catch (error) {
    console.error('getBudgetReportsByVendor error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /api/budget-report/event/:eventId
 * Returns budget report for a specific event (if exists)
 */
exports.getBudgetReportByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'Valid eventId is required',
      });
    }

    const [report] = await BudgetReport.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
      ...populateEventAndVendorsPipeline(),
      { $sort: { createdAt: -1 } },
      { $limit: 1 },
    ]);

    if (!report) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Budget report not found for this event',
      });
    }

    return res.status(200).json({
      message: 'Success',
      data: report,
    });
  } catch (error) {
    console.error('getBudgetReportByEvent error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR || 500).json({
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};
