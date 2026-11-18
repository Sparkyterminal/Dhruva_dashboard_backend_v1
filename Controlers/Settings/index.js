const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const { getDataCutoffDate } = require('../../utils/dataCutoff');

exports.getDataCutoff = async (req, res) => {
  try {
    const cutoffDate = await getDataCutoffDate();
    return res.status(STATUS.SUCCESS).json({
      cutoffDate: cutoffDate || null,
    });
  } catch (error) {
    console.error('getDataCutoff:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};
