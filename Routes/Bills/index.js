

// const express = require('express');
// const router = express.Router();
// const billController = require('../../Controlers/Bills');

// router.post('/', billController.createBill);
// router.get('/', billController.getBills);
// router.get('/:id', billController.getBillById);
// router.put('/:id', billController.updateBill);
// router.delete('/:id', billController.deleteBill);

// module.exports = router;




// module.exports = router;
const express = require('express');
const router = express.Router();
const billController = require('../../Controlers/Bills');

// Basic CRUD routes
router.post('/', billController.createBill);
router.get('/', billController.getBills);
router.get('/:id', billController.getBillById);
router.put('/:id', billController.updateBill);
router.delete('/:id', billController.deleteBill);

// EMI Status routes
router.get('/emi/status', billController.getEMIStatus);
router.put('/emi/status/:id', billController.updateEMIPaymentStatus);
router.put('/emi/bulk/:id', billController.bulkUpdateEMIAmounts);

module.exports = router;