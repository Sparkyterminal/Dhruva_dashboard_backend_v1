// const Bill = require('../../Modals/Bills');

// // Create a new bill
// exports.createBill = async (req, res) => {
//   try {
//     const { name, emiDate, amount } = req.body;

//     // Validation handled by Mongoose schema, but you can add extra validation here

//     const bill = new Bill({ name, emiDate, amount });
//     await bill.save();
//     res.status(201).json({ message: 'Bill created successfully', bill });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to create bill', error: error.message });
//   }
// };

// // Get all bills
// exports.getBills = async (req, res) => {
//   try {
//     const bills = await Bill.find().sort({ emiDate: 1 });
//     res.json(bills);
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to get bills', error: error.message });
//   }
// };

// // Get a single bill by ID
// exports.getBillById = async (req, res) => {
//   try {
//     const bill = await Bill.findById(req.params.id);
//     if (!bill) {
//       return res.status(404).json({ message: 'Bill not found' });
//     }
//     res.json(bill);
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to get bill', error: error.message });
//   }
// };

// // Update a bill by ID
// exports.updateBill = async (req, res) => {
//   try {
//     const { name, emiDate, amount } = req.body;
//     const bill = await Bill.findByIdAndUpdate(
//       req.params.id,
//       { name, emiDate, amount },
//       { new: true, runValidators: true }
//     );
//     if (!bill) {
//       return res.status(404).json({ message: 'Bill not found' });
//     }
//     res.json({ message: 'Bill updated successfully', bill });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to update bill', error: error.message });
//   }
// };

// // Delete a bill by ID
// exports.deleteBill = async (req, res) => {
//   try {
//     const bill = await Bill.findByIdAndDelete(req.params.id);
//     if (!bill) {
//       return res.status(404).json({ message: 'Bill not found' });
//     }
//     res.json({ message: 'Bill deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to delete bill', error: error.message });
//   }
// };



const Bill = require('../../Modals/Bills');

// Helper to get month and year from a Date object
const getMonthYear = (date) => ({
  month: date.getMonth() + 1,
  year: date.getFullYear()
});

// Create a new bill
exports.createBill = async (req, res) => {
  try {
    const { name, emiType, emiDate, amount } = req.body;
    const bill = new Bill({ name, emiType, emiDate, amount, emiStatus: [] });
    await bill.save();
    res.status(201).json({ message: 'Bill created successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create bill', error: error.message });
  }
};

// Get all bills with emmStatus array containing month-wise payment status and amount
exports.getBills = async (req, res) => {
  try {
    const bills = await Bill.find().sort({ emiDate: 1 });

    // Optionally you can generate missing months (e.g., for the current year) if needed
    // Here we just return saved emiStatus records with amount added

    const enhancedBills = bills.map(bill => {
      const emiStatusWithAmount = bill.emiStatus.map(s => ({
        month: s.month,
        year: s.year,
        paid: s.paid,
        amount: bill.amount
      }));

      return {
        ...bill.toObject(),
        emiStatus: emiStatusWithAmount
      };
    });

    res.json(enhancedBills);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get bills', error: error.message });
  }
};

// Get a single bill by ID
exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get bill', error: error.message });
  }
};

// Update bill info and/or EMI payment status for specified month/year
exports.updateBill = async (req, res) => {
  try {
    const { name, emiType, emiDate, amount, paid, month, year, remarks, paymentMode } = req.body;

    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    // Update basic bill fields
    if (name !== undefined) bill.name = name;
    if (emiType !== undefined) bill.emiType = emiType;
    if (emiDate !== undefined) bill.emiDate = emiDate;
    if (amount !== undefined) bill.amount = amount;

    // Update EMI status if paid is provided
    if (paid !== undefined) {
      // Use provided month/year or default to current date
      let targetMonth, targetYear;
      if (month !== undefined && year !== undefined) {
        targetMonth = parseInt(month, 10);
        targetYear = parseInt(year, 10);
        
        // Validate month and year
        if (targetMonth < 1 || targetMonth > 12) {
          return res.status(400).json({ message: 'Month must be between 1 and 12' });
        }
        if (targetYear < 2000 || targetYear > 2100) {
          return res.status(400).json({ message: 'Year must be a valid year' });
        }
      } else {
        const current = getMonthYear(new Date());
        targetMonth = current.month;
        targetYear = current.year;
      }

      const index = bill.emiStatus.findIndex(s => s.month === targetMonth && s.year === targetYear);

      if (index >= 0) {
        // Update existing status
        bill.emiStatus[index].paid = paid;
        if (remarks !== undefined) {
          bill.emiStatus[index].remarks = remarks || '';
        }
        if (paymentMode !== undefined) {
          if (paymentMode !== 'Cash' && paymentMode !== 'Account') {
            return res.status(400).json({ message: 'paymentMode must be either "Cash" or "Account"' });
          }
          bill.emiStatus[index].paymentMode = paymentMode;
        }
      } else {
        // Create new status entry
        const newStatus = {
          month: targetMonth,
          year: targetYear,
          paid: paid,
          remarks: remarks || '',
          paymentMode: paymentMode && (paymentMode === 'Cash' || paymentMode === 'Account') ? paymentMode : 'Cash'
        };
        bill.emiStatus.push(newStatus);
      }
    }

    await bill.save();
    res.json({ message: 'Bill updated successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update bill', error: error.message });
  }
};

// Delete a bill by ID
exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete bill', error: error.message });
  }
};
