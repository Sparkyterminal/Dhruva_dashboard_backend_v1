const Vendor = require('../../Modals/Vendor'); 

// Create vendor
exports.createVendor = async (req, res) => {
    try {
        const userId = req.user._id; 
        const vendorData = { ...req.body, vendor_belongs_to: userId };
        const vendor = new Vendor(vendorData);

        await vendor.save();
        res.status(201).json({ success: true, vendor });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Get all vendors for logged-in user
exports.getVendors = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendors = await Vendor.find({ vendor_belongs_to: userId }).sort({ createdAt: -1 });

        res.json({ success: true, vendors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get single vendor
exports.getVendorById = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendor = await Vendor.findOne({ _id: req.params.id, vendor_belongs_to: userId });

        if (!vendor) {
            return res.status(404).json({ success: false, error: "Vendor not found" });
        }

        res.json({ success: true, vendor });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update vendor
exports.updateVendor = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendor = await Vendor.findOneAndUpdate(
            { _id: req.params.id, vendor_belongs_to: userId },
            req.body,
            { new: true, runValidators: true }
        );

        if (!vendor) {
            return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
        }

        res.json({ success: true, vendor });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
    try {
        const userId = req.user._id;
        const vendor = await Vendor.findOneAndDelete({ _id: req.params.id, vendor_belongs_to: userId });

        if (!vendor) {
            return res.status(404).json({ success: false, error: "Vendor not found or unauthorized" });
        }

        res.json({ success: true, message: "Vendor deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
