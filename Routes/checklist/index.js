const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const checklistController = require('../../Controlers/checklist');

// Create checklist
router.post(
    "/",
    isAuth,
    [
        body('heading').trim().not().isEmpty().withMessage('Heading is required'),
        body('eventReference').optional().trim(),
        body('points').isArray({ min: 1 }).withMessage('Points must be a non-empty array'),
        body('points.*.checklistPoint').not().isEmpty().withMessage('Each point must have a checklistPoint'),
        body('department').not().isEmpty().withMessage('Department ID is required')
    ],
    checklistController.createChecklist
);

// Get all checklists (with pagination and filters)
router.get(
    "/",
    isAuth,
    checklistController.getChecklists
);

// Get checklists by department ID
router.get(
    "/department/:id",
    isAuth,
    checklistController.getChecklistsByDepartmentId
);

// Get single checklist by ID
router.get(
    "/:id",
    isAuth,
    checklistController.getChecklistById
);

// Update checklist
router.patch(
    "/:id",
    isAuth,
    checklistController.updateChecklist
);

// Update checklist status
router.patch(
    "/status/:id",
    isAuth,
    [
        body('is_active').trim().not().isEmpty()
    ],
    checklistController.updateChecklistStatus
);

// Archive or activate checklist
router.patch(
    "/archive/:id",
    isAuth,
    checklistController.archiveOrActiveChecklist
);

// Delete checklist
router.delete(
    "/:id",
    isAuth,
    checklistController.deleteChecklist
);

// Get all active checklists
router.get(
    "/active/all",
    isAuth,
    checklistController.getAllActiveChecklists
);

module.exports = router;

