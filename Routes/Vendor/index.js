const express = require('express');
const router = express.Router();
const vendorController = require('../../Controlers/Vendor');
const auth = require('../../authentication/is-auth'); 

router.post('/', auth, vendorController.createVendor);
router.get('/', auth, vendorController.getVendors);
router.get('/all', vendorController.getAllVendors);
router.get('/:id', auth, vendorController.getVendorById);
router.put('/:id', auth, vendorController.updateVendor);
router.get('/department/:id', auth, vendorController.getVendorsByDepartmentId);
router.delete('/:id', auth, vendorController.deleteVendor);

module.exports = router;
