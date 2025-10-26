const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const userController = require('../../Controlers/User');

router.patch(
    "/status/:id",
    isAuth,
    [
        body('is_active').trim().not().isEmpty()
    ],
    userController.updateUserStatus
);

router.patch(
    "/archive/:id",
    isAuth,
    userController.archiveOrActiveUser
);

router.patch(
    "/:id",
    isAuth,
    [
        body('first_name').trim().not().isEmpty(),
        body('last_name').trim().not().isEmpty(),
        body('phone_data.phone_number').trim().not().isEmpty()
    ],
    userController.updateUser
);

router.post(
    "/",
    isAuth,
    [
        body('first_name').not().isEmpty(),
        body('last_name').not().isEmpty(),
        body('email_data.email_id').not().isEmpty(),
        body('password').not().isEmpty(),
        body('phone_data.phone_number').not().isEmpty(),
        body('role').not().isEmpty()
    ],
    userController.createUser
);

router.get(
    "/:id",
    isAuth,
    userController.getThisUser
);

router.get(
    "/",
    isAuth,
    userController.getUsers
);

router.delete(
    "/:id",
    isAuth,
    userController.deleteUser
);

module.exports = router;

