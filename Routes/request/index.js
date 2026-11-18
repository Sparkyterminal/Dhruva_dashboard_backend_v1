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
        body('amount').isNumeric().not().isEmpty(),
        body('transation_in').isIn(['CASH','ACCOUNT']),
        body('vendor').optional({ nullable: true }).isMongoId(),
        body('event_reference').optional({ nullable: true }).isMongoId(),
        body('groupBy').optional({ nullable: true }).isMongoId(),
        body('priority').isIn(['HIGH', 'MEDIUM', 'LOW']),
        body('required_date').optional({ nullable: true }).isISO8601().toDate(),
        body('remarks').optional({ nullable: true }).isString(),
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

// Request "group by" labels (must be before /:id)
router.get("/group-by", isAuth, requestController.listRequestGroupBy);
router.post(
    "/group-by",
    isAuth,
    [body("name").trim().notEmpty().isLength({ min: 1, max: 200 })],
    requestController.createRequestGroupBy
);
router.delete("/group-by/:id", isAuth, requestController.deleteRequestGroupBy);

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

// Hard delete request
router.delete(
    "/:id",
    isAuth,
    requestController.deleteRequest
);

router.get('/department/:id', isAuth, requestController.getRequestsByDepartmentId);

module.exports = router;

