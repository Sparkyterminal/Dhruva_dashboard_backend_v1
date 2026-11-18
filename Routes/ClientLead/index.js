const express = require('express');
const router = express.Router();
const clientLeadController = require('../../Controlers/ClientLead');
const spreadsheetWorkbookController = require('../../Controlers/SpreadsheetWorkbook');

// All /api/client-leads routes are public (no JWT).
router.post('/', clientLeadController.createClientLead);
router.get('/', clientLeadController.getAllClientLeads);

// Leads Tracker Excel (org-shared workbook: module=client-leads, key=default)
// Must be registered before /:id so "excel" is not treated as an id.
router.get('/excel', spreadsheetWorkbookController.getClientLeadsExcel);
router.put('/excel', spreadsheetWorkbookController.putClientLeadsExcel);

// GET by ID
router.get('/:id', clientLeadController.getClientLeadById);

// PUT - Update client lead
router.put('/:id', clientLeadController.updateClientLead);

// DELETE - Delete client lead
router.delete('/:id', clientLeadController.deleteClientLead);

module.exports = router;
