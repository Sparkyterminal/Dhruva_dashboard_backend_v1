

// const Bill = require('../../Modals/Bills');

// // Helper to get month and year from a Date object
// const getMonthYear = (date) => ({
//   month: date.getMonth() + 1,
//   year: date.getFullYear()
// });

// // Create a new bill
// exports.createBill = async (req, res) => {
//   try {
//     const { name, emiType, emiDate, amount } = req.body;
//     const bill = new Bill({ name, emiType, emiDate, amount, emiStatus: [] });
//     await bill.save();
//     res.status(201).json({ message: 'Bill created successfully', bill });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to create bill', error: error.message });
//   }
// };

// // Get all bills with emmStatus array containing month-wise payment status and amount
// exports.getBills = async (req, res) => {
//   try {
//     const bills = await Bill.find().sort({ emiDate: 1 });

//     // Optionally you can generate missing months (e.g., for the current year) if needed
//     // Here we just return saved emiStatus records with amount added

//     const enhancedBills = bills.map(bill => {
//       const emiStatusWithAmount = bill.emiStatus.map(s => ({
//         month: s.month,
//         year: s.year,
//         paid: s.paid,
//         amount: bill.amount,
//         remarks: s.remarks || '',
//         paymentMode: s.paymentMode || 'Cash'
//       }));

//       return {
//         ...bill.toObject(),
//         emiStatus: emiStatusWithAmount
//       };
//     });

//     res.json(enhancedBills);
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to get bills', error: error.message });
//   }
// };

// // Get a single bill by ID
// exports.getBillById = async (req, res) => {
//   try {
//     const bill = await Bill.findById(req.params.id);
//     if (!bill) return res.status(404).json({ message: 'Bill not found' });
//     res.json(bill);
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to get bill', error: error.message });
//   }
// };

// // Update bill info and/or EMI payment status for specified month/year
// exports.updateBill = async (req, res) => {
//   try {
//     const { name, emiType, emiDate, amount, paid, month, year, remarks, paymentMode } = req.body;

//     const bill = await Bill.findById(req.params.id);
//     if (!bill) return res.status(404).json({ message: 'Bill not found' });

//     // Update basic bill fields
//     if (name !== undefined) bill.name = name;
//     if (emiType !== undefined) bill.emiType = emiType;
//     if (emiDate !== undefined) bill.emiDate = emiDate;
//     if (amount !== undefined) bill.amount = amount;

//     // Update EMI status if paid is provided
//     if (paid !== undefined) {
//       // Use provided month/year or default to current date
//       let targetMonth, targetYear;
//       if (month !== undefined && year !== undefined) {
//         targetMonth = parseInt(month, 10);
//         targetYear = parseInt(year, 10);
        
//         // Validate month and year
//         if (targetMonth < 1 || targetMonth > 12) {
//           return res.status(400).json({ message: 'Month must be between 1 and 12' });
//         }
//         if (targetYear < 2000 || targetYear > 2100) {
//           return res.status(400).json({ message: 'Year must be a valid year' });
//         }
//       } else {
//         const current = getMonthYear(new Date());
//         targetMonth = current.month;
//         targetYear = current.year;
//       }

//       const index = bill.emiStatus.findIndex(s => s.month === targetMonth && s.year === targetYear);

//       if (index >= 0) {
//         // Update existing status
//         bill.emiStatus[index].paid = paid;
//         if (remarks !== undefined) {
//           bill.emiStatus[index].remarks = remarks || '';
//         }
//         if (paymentMode !== undefined) {
//           if (paymentMode !== 'Cash' && paymentMode !== 'Account') {
//             return res.status(400).json({ message: 'paymentMode must be either "Cash" or "Account"' });
//           }
//           bill.emiStatus[index].paymentMode = paymentMode;
//         }
//       } else {
//         // Create new status entry
//         const newStatus = {
//           month: targetMonth,
//           year: targetYear,
//           paid: paid,
//           remarks: remarks || '',
//           paymentMode: paymentMode && (paymentMode === 'Cash' || paymentMode === 'Account') ? paymentMode : 'Cash'
//         };
//         bill.emiStatus.push(newStatus);
//       }
//     }

//     await bill.save();
//     res.json({ message: 'Bill updated successfully', bill });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to update bill', error: error.message });
//   }
// };

// // Delete a bill by ID
// exports.deleteBill = async (req, res) => {
//   try {
//     const bill = await Bill.findByIdAndDelete(req.params.id);
//     if (!bill) return res.status(404).json({ message: 'Bill not found' });
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

// Helper to generate all months between start and end date
const generateMonthsBetween = (startDate, endDate) => {
  const months = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  
  while (current <= endMonth) {
    months.push({
      month: current.getMonth() + 1,
      year: current.getFullYear()
    });
    current.setMonth(current.getMonth() + 1);
  }
  
  return months;
};

// Create a new bill
exports.createBill = async (req, res) => {
  try {
    const { name, belongs_to, emi_end_date, emiType, emiDate, defaultAmount, emiStatus } = req.body;

    // Validation
    if (!name || !belongs_to || !emi_end_date || !emiType || !emiDate || !defaultAmount) {
      return res.status(400).json({ 
        message: 'All fields are required: name, belongs_to, emi_end_date, emiType, emiDate, defaultAmount' 
      });
    }

    // If emiStatus is provided, validate that each entry has emiAmount
    let validatedEmiStatus = [];
    if (emiStatus && Array.isArray(emiStatus)) {
      validatedEmiStatus = emiStatus.map(status => ({
        month: status.month,
        year: status.year,
        emiAmount: status.emiAmount || defaultAmount,
        paid: status.paid || false,
        amountPaid: status.amountPaid || 0,
        remarks: status.remarks || '',
        paymentMode: status.paymentMode || 'Cash',
        paymentDate: status.paymentDate || null
      }));
    }

    const bill = new Bill({ 
      name, 
      belongs_to, 
      emi_end_date, 
      emiType, 
      emiDate, 
      defaultAmount, 
      emiStatus: validatedEmiStatus 
    });
    
    await bill.save();
    res.status(201).json({ message: 'Bill created successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create bill', error: error.message });
  }
};

// Get all bills with enhanced emiStatus
exports.getBills = async (req, res) => {
  try {
    const bills = await Bill.find().sort({ emiDate: 1 });

    const enhancedBills = bills.map(bill => {
      // Generate all months between emiDate and emi_end_date
      const allMonths = generateMonthsBetween(bill.emiDate, bill.emi_end_date);
      
      // Merge with existing emiStatus
      const emiStatusMap = new Map();
      bill.emiStatus.forEach(s => {
        const key = `${s.year}-${s.month}`;
        emiStatusMap.set(key, s);
      });

      const completeEmiStatus = allMonths.map(({ month, year }) => {
        const key = `${year}-${month}`;
        const existing = emiStatusMap.get(key);
        
        if (existing) {
          return {
            month,
            year,
            emiAmount: existing.emiAmount,
            paid: existing.paid,
            amountPaid: existing.amountPaid || 0,
            pending: existing.emiAmount - (existing.amountPaid || 0),
            remarks: existing.remarks || '',
            paymentMode: existing.paymentMode || 'Cash',
            paymentDate: existing.paymentDate || null
          };
        } else {
          // Use default amount if no specific amount is set
          return {
            month,
            year,
            emiAmount: bill.defaultAmount,
            paid: false,
            amountPaid: 0,
            pending: bill.defaultAmount,
            remarks: '',
            paymentMode: 'Cash',
            paymentDate: null
          };
        }
      });

      const billObj = bill.toObject({ virtuals: true });
      return {
        ...billObj,
        emiStatus: completeEmiStatus
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

    // Generate all months between emiDate and emi_end_date
    const allMonths = generateMonthsBetween(bill.emiDate, bill.emi_end_date);
    
    // Merge with existing emiStatus
    const emiStatusMap = new Map();
    bill.emiStatus.forEach(s => {
      const key = `${s.year}-${s.month}`;
      emiStatusMap.set(key, s);
    });

    const completeEmiStatus = allMonths.map(({ month, year }) => {
      const key = `${year}-${month}`;
      const existing = emiStatusMap.get(key);
      
      if (existing) {
        return {
          month,
          year,
          emiAmount: existing.emiAmount,
          paid: existing.paid,
          amountPaid: existing.amountPaid || 0,
          pending: existing.emiAmount - (existing.amountPaid || 0),
          remarks: existing.remarks || '',
          paymentMode: existing.paymentMode || 'Cash',
          paymentDate: existing.paymentDate || null
        };
      } else {
        return {
          month,
          year,
          emiAmount: bill.defaultAmount,
          paid: false,
          amountPaid: 0,
          pending: bill.defaultAmount,
          remarks: '',
          paymentMode: 'Cash',
          paymentDate: null
        };
      }
    });

    const billObj = bill.toObject({ virtuals: true });
    res.json({
      ...billObj,
      emiStatus: completeEmiStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get bill', error: error.message });
  }
};

// Update bill info and/or EMI details for specified month/year
exports.updateBill = async (req, res) => {
  try {
    const { 
      name, 
      belongs_to, 
      emi_end_date, 
      emiType, 
      emiDate, 
      defaultAmount,
      emiAmount, // EMI amount for specific month
      paid, 
      amountPaid,
      month, 
      year, 
      remarks, 
      paymentMode,
      paymentDate 
    } = req.body;

    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    // Update basic bill fields
    if (name !== undefined) bill.name = name;
    if (belongs_to !== undefined) bill.belongs_to = belongs_to;
    if (emi_end_date !== undefined) bill.emi_end_date = emi_end_date;
    if (emiType !== undefined) bill.emiType = emiType;
    if (emiDate !== undefined) bill.emiDate = emiDate;
    if (defaultAmount !== undefined) bill.defaultAmount = defaultAmount;

    // Update EMI status if month/year is provided
    if (month !== undefined && year !== undefined) {
      let targetMonth = parseInt(month, 10);
      let targetYear = parseInt(year, 10);
      
      // Validate month and year
      if (targetMonth < 1 || targetMonth > 12) {
        return res.status(400).json({ message: 'Month must be between 1 and 12' });
      }
      if (targetYear < 2000 || targetYear > 2100) {
        return res.status(400).json({ message: 'Year must be a valid year' });
      }

      const index = bill.emiStatus.findIndex(s => s.month === targetMonth && s.year === targetYear);

      if (index >= 0) {
        // Update existing status
        if (emiAmount !== undefined) {
          bill.emiStatus[index].emiAmount = parseFloat(emiAmount);
        }
        if (paid !== undefined) {
          bill.emiStatus[index].paid = paid;
        }
        if (amountPaid !== undefined) {
          bill.emiStatus[index].amountPaid = parseFloat(amountPaid);
        }
        if (remarks !== undefined) {
          bill.emiStatus[index].remarks = remarks || '';
        }
        if (paymentMode !== undefined) {
          if (paymentMode !== 'Cash' && paymentMode !== 'Account') {
            return res.status(400).json({ message: 'paymentMode must be either "Cash" or "Account"' });
          }
          bill.emiStatus[index].paymentMode = paymentMode;
        }
        if (paymentDate !== undefined) {
          bill.emiStatus[index].paymentDate = paymentDate ? new Date(paymentDate) : null;
        }
      } else {
        // Create new status entry
        const newStatus = {
          month: targetMonth,
          year: targetYear,
          emiAmount: emiAmount !== undefined ? parseFloat(emiAmount) : bill.defaultAmount,
          paid: paid !== undefined ? paid : false,
          amountPaid: amountPaid !== undefined ? parseFloat(amountPaid) : 0,
          remarks: remarks || '',
          paymentMode: paymentMode && (paymentMode === 'Cash' || paymentMode === 'Account') ? paymentMode : 'Cash',
          paymentDate: paymentDate ? new Date(paymentDate) : null
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

// Get EMI payment status summary
exports.getEMIStatus = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const bills = await Bill.find();
    
    const summary = bills.map(bill => {
      let filteredStatus = bill.emiStatus;
      
      // Filter by month and year if provided
      if (month && year) {
        filteredStatus = bill.emiStatus.filter(s => 
          s.month === parseInt(month) && s.year === parseInt(year)
        );
      }
      
      const totalEmiAmount = filteredStatus.reduce((sum, s) => sum + (s.emiAmount || 0), 0);
      const totalPaid = filteredStatus.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
      
      return {
        billId: bill._id,
        billName: bill.name,
        belongs_to: bill.belongs_to,
        emiType: bill.emiType,
        defaultAmount: bill.defaultAmount,
        totalEmiAmount,
        totalPaid,
        remaining: totalEmiAmount - totalPaid,
        emiStatus: filteredStatus.map(s => ({
          month: s.month,
          year: s.year,
          emiAmount: s.emiAmount,
          paid: s.paid,
          amountPaid: s.amountPaid,
          pending: s.emiAmount - s.amountPaid,
          remarks: s.remarks,
          paymentMode: s.paymentMode,
          paymentDate: s.paymentDate
        }))
      };
    });
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get EMI status', error: error.message });
  }
};

// Update EMI amount and payment status for a specific month
exports.updateEMIPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, emiAmount, paid, amountPaid, remarks, paymentMode, paymentDate } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    if (targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({ message: 'Month must be between 1 and 12' });
    }

    const bill = await Bill.findById(id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    const index = bill.emiStatus.findIndex(s => s.month === targetMonth && s.year === targetYear);

    if (index >= 0) {
      // Update existing
      if (emiAmount !== undefined) bill.emiStatus[index].emiAmount = parseFloat(emiAmount);
      if (paid !== undefined) bill.emiStatus[index].paid = paid;
      if (amountPaid !== undefined) bill.emiStatus[index].amountPaid = parseFloat(amountPaid);
      if (remarks !== undefined) bill.emiStatus[index].remarks = remarks;
      if (paymentMode !== undefined) {
        if (paymentMode !== 'Cash' && paymentMode !== 'Account') {
          return res.status(400).json({ message: 'paymentMode must be either "Cash" or "Account"' });
        }
        bill.emiStatus[index].paymentMode = paymentMode;
      }
      if (paymentDate !== undefined) {
        bill.emiStatus[index].paymentDate = paymentDate ? new Date(paymentDate) : null;
      }
    } else {
      // Create new
      bill.emiStatus.push({
        month: targetMonth,
        year: targetYear,
        emiAmount: emiAmount !== undefined ? parseFloat(emiAmount) : bill.defaultAmount,
        paid: paid !== undefined ? paid : false,
        amountPaid: amountPaid !== undefined ? parseFloat(amountPaid) : 0,
        remarks: remarks || '',
        paymentMode: paymentMode || 'Cash',
        paymentDate: paymentDate ? new Date(paymentDate) : null
      });
    }

    await bill.save();
    res.json({ message: 'EMI payment status updated successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update EMI payment status', error: error.message });
  }
};

// Bulk update EMI amounts for multiple months
exports.bulkUpdateEMIAmounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { emiUpdates } = req.body; // Array of {month, year, emiAmount}

    if (!emiUpdates || !Array.isArray(emiUpdates)) {
      return res.status(400).json({ message: 'emiUpdates array is required' });
    }

    const bill = await Bill.findById(id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

    emiUpdates.forEach(update => {
      const { month, year, emiAmount } = update;
      const targetMonth = parseInt(month);
      const targetYear = parseInt(year);

      if (targetMonth < 1 || targetMonth > 12) return;

      const index = bill.emiStatus.findIndex(s => s.month === targetMonth && s.year === targetYear);

      if (index >= 0) {
        bill.emiStatus[index].emiAmount = parseFloat(emiAmount);
      } else {
        bill.emiStatus.push({
          month: targetMonth,
          year: targetYear,
          emiAmount: parseFloat(emiAmount),
          paid: false,
          amountPaid: 0,
          remarks: '',
          paymentMode: 'Cash',
          paymentDate: null
        });
      }
    });

    await bill.save();
    res.json({ message: 'EMI amounts updated successfully', bill });
  } catch (error) {
    res.status(500).json({ message: 'Failed to bulk update EMI amounts', error: error.message });
  }
};