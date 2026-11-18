const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const spreadsheetWorkbookController = require('../../Controlers/SpreadsheetWorkbook');

/** Leads Tracker Excel is public (same as GET/POST /api/client-leads). */
function isAuthUnlessClientLeads(req, res, next) {
  const moduleName = String(
    req.query.module || req.body?.module || ''
  ).trim();
  if (moduleName === 'client-leads') return next();
  return isAuth(req, res, next);
}

// GET /spreadsheet-workbooks?module=client-leads&key=default
// GET /spreadsheet-workbooks?module=budget-report&key=<eventId>
// GET /spreadsheet-workbooks?module=budget-report&list=1
// GET /spreadsheet-workbooks?module=daybook-inflow|daybook-outflow&key=YYYY-MM-DD
// GET /spreadsheet-workbooks?module=daybook-inflow|daybook-outflow&list=1&date|from|to=
router.get('/', isAuthUnlessClientLeads, spreadsheetWorkbookController.getWorkbook);

// PUT /spreadsheet-workbooks  (create or upsert with version; wholesale workbookData replace)
router.put('/', isAuthUnlessClientLeads, spreadsheetWorkbookController.upsertWorkbook);

// POST /spreadsheet-workbooks/clone  (deep-copy budget-report onto another event)
router.post('/clone', isAuth, spreadsheetWorkbookController.cloneWorkbook);

// DELETE /spreadsheet-workbooks?module=...&key=...
router.delete('/', isAuthUnlessClientLeads, spreadsheetWorkbookController.deleteWorkbook);

module.exports = router;
