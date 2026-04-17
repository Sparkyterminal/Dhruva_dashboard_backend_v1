const express = require('express');
const router = express.Router();
const isAuth = require('../../authentication/is-auth');
const clientLeadController = require('../../Controlers/ClientLead');

// POST - Create client lead
router.post('/', isAuth, clientLeadController.createClientLead);

// GET all client leads
router.get('/', isAuth, clientLeadController.getAllClientLeads);

// GET by ID
router.get('/:id', isAuth, clientLeadController.getClientLeadById);

// PUT - Update client lead
router.put('/:id', isAuth, clientLeadController.updateClientLead);

// DELETE - Delete client lead
router.delete('/:id', isAuth, clientLeadController.deleteClientLead);

module.exports = router;
