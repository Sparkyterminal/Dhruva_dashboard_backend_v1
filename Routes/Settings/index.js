const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const settingsController = require('../../Controlers/Settings');

router.get('/data-cutoff', isAuth, settingsController.getDataCutoff);

module.exports = router;
