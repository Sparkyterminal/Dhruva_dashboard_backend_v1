const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const personalCalendarController = require('../../Controlers/PersonalCalendar');

// Personal calendar categories: TODO_LIST, PROBLEM_RESOLVES, GENERAL_MEETING_NOTES
router.post('/', isAuth, personalCalendarController.createCalendarEntry);
router.get('/', isAuth, personalCalendarController.getMyCalendarEntries);
router.delete('/:id', isAuth, personalCalendarController.deleteCalendarEntry);

module.exports = router;
