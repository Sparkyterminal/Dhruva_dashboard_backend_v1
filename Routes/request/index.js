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
        // body('due_date').not().isEmpty(),
        body('amount').isNumeric().not().isEmpty(),
        body('transation_in').isIn(['CASH','ACCOUNT']),
        body('vendor').isMongoId(),
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

router.get(
    "/all",
    isAuth,
    requestController.getRequests
);


// Owner can get specific request details
router.get(
    "/:id",
    isAuth,
    requestController.getRequestById
);

// Owner can update request (status, received amount, etc.)
router.patch(
    "/:id",
    isAuth,
    requestController.updateRequest
);

// Archive request
router.patch(
    "/:id/archive",
    isAuth,
    requestController.archiveRequest
);

module.exports = router;

