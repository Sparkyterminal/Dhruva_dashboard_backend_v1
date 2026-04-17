const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const budgetReportController = require('../../Controlers/BudgetReport');

// POST - Create budget report (eventId, budgetData, metadata?, exteriorDetails?)
router.post('/', isAuth, budgetReportController.createBudgetReport);

// POST - Clone existing report; body optional: { eventId?, metadata? }
router.post('/:id/clone', isAuth, budgetReportController.cloneBudgetReport);

// GET all budget reports
router.get('/', isAuth, budgetReportController.getAllBudgetReports);

// GET by vendor - must be before /event/:eventId to avoid "vendor" being parsed as eventId
router.get('/vendor/:vendorId', isAuth, budgetReportController.getBudgetReportsByVendor);

// GET by event
router.get('/event/:eventId', isAuth, budgetReportController.getBudgetReportByEvent);

// GET by ID - fetch single report for edit
router.get('/:id', isAuth, budgetReportController.getBudgetReportById);

// PUT - Update budget report by ID
router.put('/:id', isAuth, budgetReportController.updateBudgetReport);

module.exports = router;
