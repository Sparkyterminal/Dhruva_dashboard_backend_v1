const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const daybookController = require('../../Controlers/daybook');

// GET /api/daybook?date=YYYY-MM-DD
router.get('/', isAuth, daybookController.getDaybook);

// Manual inflow CRUD
router.post('/inflows', isAuth, daybookController.createInflow);
router.put('/inflows/:id', isAuth, daybookController.updateInflow);
router.delete('/inflows/:id', isAuth, daybookController.deleteInflow);

// Accounts open/close balances CRUD
router.post('/accounts/open-close-balances', isAuth, daybookController.createOpenCloseBalance);
router.put('/accounts/open-close-balances/:id', isAuth, daybookController.updateOpenCloseBalance);
router.delete('/accounts/open-close-balances/:id', isAuth, daybookController.deleteOpenCloseBalance);

module.exports = router;

