const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const mongoose = require('mongoose');
const PersonalCalendar = require('../../Modals/PersonalCalendar');
const { getDataCutoffDate, applyDateFieldCutoff } = require('../../utils/dataCutoff');

const ALLOWED_CATEGORIES = ['TODO_LIST', 'PROBLEM_RESOLVES', 'GENERAL_MEETING_NOTES'];

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

exports.createCalendarEntry = async (req, res) => {
  try {
    if (!req.userId || !mongoose.Types.ObjectId.isValid(req.userId)) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const title = String(req.body.title || '').trim();
    const category = String(req.body.category || '').trim().toUpperCase();
    const startAt = parseDate(req.body.startAt);
    const endAt = req.body.endAt ? parseDate(req.body.endAt) : null;
    const description = req.body.description != null ? String(req.body.description).trim() : '';

    if (!title) return res.status(STATUS.BAD_REQUEST).json({ message: 'title is required' });
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: `category must be one of ${ALLOWED_CATEGORIES.join(', ')}` });
    }
    if (!startAt) return res.status(STATUS.BAD_REQUEST).json({ message: 'startAt must be a valid datetime' });
    if (endAt && endAt < startAt) return res.status(STATUS.BAD_REQUEST).json({ message: 'endAt must be >= startAt' });

    const item = await PersonalCalendar.create({
      userId: new mongoose.Types.ObjectId(req.userId),
      title,
      category,
      startAt,
      endAt,
      description,
    });

    return res.status(STATUS.CREATED).json({ message: 'Calendar entry created', item });
  } catch (error) {
    console.error('createCalendarEntry:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};

exports.getMyCalendarEntries = async (req, res) => {
  try {
    if (!req.userId || !mongoose.Types.ObjectId.isValid(req.userId)) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const query = { userId: new mongoose.Types.ObjectId(req.userId) };
    const category = req.query.category ? String(req.query.category).trim().toUpperCase() : '';
    if (category) {
      if (!ALLOWED_CATEGORIES.includes(category)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: `category must be one of ${ALLOWED_CATEGORIES.join(', ')}` });
      }
      query.category = category;
    }

    const from = req.query.from ? parseDate(req.query.from) : null;
    const to = req.query.to ? parseDate(req.query.to) : null;
    if (from && to) query.startAt = { $gte: from, $lte: to };
    else if (from) query.startAt = { $gte: from };
    else if (to) query.startAt = { $lte: to };

    applyDateFieldCutoff(query, 'startAt', await getDataCutoffDate());

    const items = await PersonalCalendar.find(query).sort({ startAt: 1 }).lean();
    return res.status(STATUS.SUCCESS).json({ count: items.length, items });
  } catch (error) {
    console.error('getMyCalendarEntries:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};

exports.deleteCalendarEntry = async (req, res) => {
  try {
    if (!req.userId || !mongoose.Types.ObjectId.isValid(req.userId)) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid id is required' });
    }

    const deleted = await PersonalCalendar.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(req.userId),
    });

    if (!deleted) return res.status(404).json({ message: 'Calendar entry not found' });

    return res.status(STATUS.SUCCESS).json({ message: 'Calendar entry deleted', id: String(id) });
  } catch (error) {
    console.error('deleteCalendarEntry:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};
