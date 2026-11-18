const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const daybookController = require('../../Controlers/daybook');

// Daybook V2 (manual ledger). Contract: Routes/daybook/DAYBOOK_V2_CONTRACT.md

// GET /api/daybook?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=200
router.get('/', isAuth, daybookController.getDaybook);

// One-time opening balance (balances are computed from it; never typed per day)
router.get('/opening-balance', isAuth, daybookController.getOpeningBalance);
router.put('/opening-balance', isAuth, daybookController.putOpeningBalance);

// Manual inflow CRUD
router.post('/inflows', isAuth, daybookController.createInflow);
router.put('/inflows/:id', isAuth, daybookController.updateInflow);
router.delete('/inflows/:id', isAuth, daybookController.deleteInflow);

// Manual outflow CRUD
router.post('/outflows', isAuth, daybookController.createOutflow);
router.put('/outflows/:id', isAuth, daybookController.updateOutflow);
router.delete('/outflows/:id', isAuth, daybookController.deleteOutflow);

module.exports = router;
