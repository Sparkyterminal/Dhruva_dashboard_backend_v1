const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const requestController = require('../../Controlers/request');

// Department users can create requests
router.post(
    "/",
    isAuth,
    [
        body('purpose').trim().not().isEmpty(),
        body('due_date').not().isEmpty(),
        body('amount').isNumeric().not().isEmpty(),
        body('priority').isIn(['HIGH', 'MEDIUM', 'LOW'])
    ],
    requestController.createRequest
);

// Department users can view their own requests
router.get(
    "/my-requests",
    isAuth,
    requestController.getMyRequests
);

router.get(
    "/my-requests/:id",
    isAuth,
    requestController.getMyRequestById
);

// Owner can view all requests
router.get(
    "/",
    isAuth,
    requestController.getAllRequests
);

// Owner can get specific request details
router.get(
    "/:id",
    isAuth,
    requestController.getRequestById
);

// Owner can update request status
router.patch(
    "/:id/status",
    isAuth,
    [
        body('status').isIn(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'])
    ],
    requestController.updateRequestStatus
);

// Owner can mark amount as received
router.patch(
    "/:id/received-amount",
    isAuth,
    [
        body('amount_received').isBoolean(),
        body('received_amount').isNumeric().optional()
    ],
    requestController.updateReceivedAmount
);

// Owner can mark amount given to specific work
router.patch(
    "/:id/given-amount",
    isAuth,
    [
        body('amount_given').isBoolean(),
        body('given_amount').isNumeric(),
        body('given_to_specific_work').trim().not().isEmpty()
    ],
    requestController.updateGivenAmount
);

// Archive request
router.patch(
    "/:id/archive",
    isAuth,
    requestController.archiveRequest
);

module.exports = router;

