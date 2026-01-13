const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const coordinatorController = require('../../Controlers/Coordinators');

// Create coordinator
router.post(
    "/",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Coordinator name is required')
    ],
    coordinatorController.createCoordinator
);

// Get all coordinators
router.get(
    "/",
    // isAuth,
    coordinatorController.getAllCoordinators
);

// Get single coordinator by ID
router.get(
    "/:id",
    isAuth,
    coordinatorController.getCoordinatorById
);

// Update coordinator
router.patch(
    "/:id",
    // isAuth,
    [
        body('name').trim().not().isEmpty().withMessage('Coordinator name is required')
    ],
    coordinatorController.updateCoordinator
);

// Delete coordinator
router.delete(
    "/:id",
    // isAuth,
    coordinatorController.deleteCoordinator
);

module.exports = router;

