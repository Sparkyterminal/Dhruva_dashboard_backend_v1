// const express = require('express');
// const router = express.Router();
// const billController = require('../../Controlers/Bills');

// router.post('/', billController.createBill);
// router.get('/', billController.getBills);
// router.get('/:id', billController.getBillById);
// router.put('/:id', billController.updateBill);
// router.delete('/:id', billController.deleteBill);

// module.exports = router;

const express = require('express');
const router = express.Router();
const billController = require('../../Controlers/Bills');

router.post('/', billController.createBill);
router.get('/', billController.getBills);
router.get('/:id', billController.getBillById);
router.put('/:id', billController.updateBill);
router.delete('/:id', billController.deleteBill);

module.exports = router;


// New routes for EMI status
// router.get('/emi/status', billController.getEMIStatus);
// router.put('/emi/status/:id', billController.updateEMIPaymentStatus);

module.exports = router;
