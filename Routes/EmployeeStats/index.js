const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const c = require('../../Controlers/EmployeeStats');

// Employee Statistics. Contract: Routes/EmployeeStats/EMPLOYEE_STATS_CONTRACT.md
// Reviewers only (same rule as Everyday Expenses); everyone else, including ADMIN, gets 403.
router.use(isAuth, c.requireStatsReviewer);

router.get('/filters', c.getFilters);
router.get('/', c.getStats);
router.get('/:userId/bookings', c.getEmployeeBookings);

module.exports = router;
