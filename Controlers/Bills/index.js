const Bill = require('../../Modals/Bills');

// Create a new bill
exports.createBill = async (req, res) => {
  try {
    const { name, emiDate, amount } = req.body;

    // Validation handled by Mongoose schema, but you can add extra validation here

    const bill = new Bill({ name, emiDate, amount });
    await bill.save();
    res.status(201).json({ message: 'Bill created successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create bill', error: error.message });
  }
};

// Get all bills
exports.getBills = async (req, res) => {
  try {
    const bills = await Bill.find().sort({ emiDate: 1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get bills', error: error.message });
  }
};

// Get a single bill by ID
exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get bill', error: error.message });
  }
};

// Update a bill by ID
exports.updateBill = async (req, res) => {
  try {
    const { name, emiDate, amount } = req.body;
    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      { name, emiDate, amount },
      { new: true, runValidators: true }
    );
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    res.json({ message: 'Bill updated successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update bill', error: error.message });
  }
};

// Delete a bill by ID
exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete bill', error: error.message });
  }
};
