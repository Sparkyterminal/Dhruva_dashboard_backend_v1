const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const marketingTargetController = require('../../Controlers/MarketingTarget');

// Marketing monthly targets (team-wise)
router.post('/', isAuth, marketingTargetController.createMarketingTarget);
router.get('/', isAuth, marketingTargetController.getMarketingTargets);
router.delete('/:id', isAuth, marketingTargetController.deleteMarketingTarget);

module.exports = router;
