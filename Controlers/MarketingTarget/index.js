const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const MarketingTarget = require('../../Modals/MarketingTarget');

const WRITE_ROLES = ['OWNER', 'ADMIN', 'DEPARTMENT'];

function parseMonth(month) {
  const m = String(month || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
}

function parseTargetAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

exports.createMarketingTarget = async (req, res) => {
  try {
    const decoded = jwt.decode(req.get('Authorization'));
    if (!decoded?.role || !WRITE_ROLES.includes(decoded.role)) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const teamName = String(req.body.teamName || '').trim();
    const month = parseMonth(req.body.month);
    const targetAmount = parseTargetAmount(req.body.targetAmount);
    const note = req.body.note != null ? String(req.body.note).trim() : '';

    if (!teamName) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'teamName is required' });
    }
    if (!month) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'month must be YYYY-MM' });
    }
    if (targetAmount == null) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'targetAmount must be a number >= 0' });
    }

    const created = await MarketingTarget.create({
      teamName,
      month,
      targetAmount,
      note,
      createdBy: req.userId && mongoose.Types.ObjectId.isValid(req.userId)
        ? new mongoose.Types.ObjectId(req.userId)
        : null,
    });

    const item = await MarketingTarget.findById(created._id)
      .populate('createdBy', 'id first_name last_name')
      .lean();

    return res.status(STATUS.CREATED).json({ message: 'Target created', item });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'Target already exists for this team and month' });
    }
    console.error('createMarketingTarget:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};

exports.getMarketingTargets = async (req, res) => {
  try {
    const decoded = jwt.decode(req.get('Authorization'));
    if (!decoded?.role) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const query = {};
    const month = parseMonth(req.query.month);
    const teamName = req.query.teamName ? String(req.query.teamName).trim() : '';
    if (month) query.month = month;
    if (teamName) query.teamName = { $regex: teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const items = await MarketingTarget.find(query)
      .populate('createdBy', 'id first_name last_name')
      .sort({ month: -1, teamName: 1 })
      .lean();

    const monthlyTotal = items.reduce((sum, x) => sum + (Number(x.targetAmount) || 0), 0);

    return res.status(STATUS.SUCCESS).json({
      count: items.length,
      monthlyTotalTargetAmount: Math.round(monthlyTotal),
      items,
    });
  } catch (error) {
    console.error('getMarketingTargets:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};

exports.deleteMarketingTarget = async (req, res) => {
  try {
    const decoded = jwt.decode(req.get('Authorization'));
    if (!decoded?.role || !WRITE_ROLES.includes(decoded.role)) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid id is required' });
    }

    const deleted = await MarketingTarget.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Target not found' });
    }

    return res.status(STATUS.SUCCESS).json({ message: 'Target deleted', id: String(id) });
  } catch (error) {
    console.error('deleteMarketingTarget:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
  }
};
