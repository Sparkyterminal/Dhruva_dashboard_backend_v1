const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const c = require('../../Controlers/EverydayExpenses');

// Everyday Expenses. Contract: Routes/EverydayExpenses/EVERYDAY_EXPENSES_CONTRACT.md
// Every route: JWT + caller loaded from DB; ADMIN gets 403 (loadExpenseUser).
router.use(isAuth, c.loadExpenseUser);

// Static paths first (Express 5: before /:id)
router.get('/me', c.getMe);
router.put('/settings', c.requireReviewer, c.putSettings);

router.get('/categories', c.getCategories);
router.post('/categories', c.requireReviewer, c.createCategory);
router.put('/categories/:id', c.requireReviewer, c.updateCategory);

router.get('/people', c.requireReviewer, c.getPeople);
router.put('/grades', c.requireReviewer, c.putGrades);

router.get('/mine', c.getMine);
router.post('/reject', c.requireReviewer, c.rejectExpenses);
router.post('/repay', c.requireReviewer, c.repayExpenses);

router.post('/uploads/presign', c.presignUpload);
router.get('/uploads/url', c.getBillUrl);

router.get('/', c.requireReviewer, c.getOverview);
router.post('/', c.createExpense);
router.put('/:id', c.updateExpense);
router.delete('/:id', c.deleteExpense);

module.exports = router;
