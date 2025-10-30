const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const isAuth = require('../../authentication/is-auth');
const departmentController = require('../../Controlers/department');

router.patch(
    "/status/:id",
    isAuth,
    [
        body('is_active').trim().not().isEmpty()
    ],
    departmentController.updateDepartmentStatus
);

router.patch(
    "/archive/:id",
    isAuth,
    departmentController.archiveOrActiveDepartment
);

router.delete(
    "/:id",
    isAuth,
    departmentController.deleteDepartment
);

router.patch(
    "/:id",
    isAuth,
    [
        body('name').trim().not().isEmpty(),
        // body('k_name').trim().not().isEmpty()
    ],
    departmentController.updateDepartment
);

router.post(
    "/",
    isAuth,
    [
        body('name').not().isEmpty(),
        // body('k_name').trim().not().isEmpty()
    ],
    departmentController.createDepartment
);

router.get(
    "/similar/:name",
    isAuth,
    departmentController.getSimilarDepartmentsByName
);

router.get(
    "/active",
    isAuth,
    departmentController.getAllActiveDepartments
);

router.get(
    "/:id",
    isAuth,
    departmentController.getThisDepartment
);

router.get(
    "/",
    isAuth,
    departmentController.getDepartments
);
router.get('/all', isAuth, departmentController.getAllDepartments);


module.exports = router;