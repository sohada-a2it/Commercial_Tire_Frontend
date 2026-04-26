const express = require("express");
const router = express.Router();
const Inquiry = require("../models/Inquiry");

// GET সব inquiries (প্যাজিনেশন সহ)
router.get("/", async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20, search } = req.query;
    
    let query = {};
    if (type && type !== "all") query.type = type;
    if (status && status !== "all") query.status = status;
    
    if (search) {
      query.$or = [
        { "customerInfo.name": { $regex: search, $options: "i" } },
        { "customerInfo.email": { $regex: search, $options: "i" } },
        { "customerInfo.phone": { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const inquiries = await Inquiry.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Inquiry.countDocuments(query);
    const pending = await Inquiry.countDocuments({ status: "pending" });
    const unread = await Inquiry.countDocuments({ readAt: null });

    res.json({
      success: true,
      data: inquiries,
      stats: { total, pending, unread },
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total,
        totalPages: Math.ceil(total / limit)
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET একক inquiry
router.get("/:id", async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, error: "Inquiry not found" });
    }
    
    // রিড স্ট্যাটাস আপডেট
    if (!inquiry.readAt) {
      inquiry.readAt = new Date();
      inquiry.status = "read";
      await inquiry.save();
    }
    
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE স্ট্যাটাস
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const updateData = { status };
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (status === "replied") updateData.repliedAt = new Date();

    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE inquiry
router.delete("/:id", async (req, res) => {
  try {
    await Inquiry.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Inquiry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// বাল্ক ডিলিট
router.post("/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    await Inquiry.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${ids.length} inquiries deleted` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// পরিসংখ্যান
router.get("/stats/summary", async (req, res) => {
  try {
    const totalGeneral = await Inquiry.countDocuments({ type: "general" });
    const totalProduct = await Inquiry.countDocuments({ type: "product" });
    const pendingGeneral = await Inquiry.countDocuments({ type: "general", status: "pending" });
    const pendingProduct = await Inquiry.countDocuments({ type: "product", status: "pending" });
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const newThisWeek = await Inquiry.countDocuments({ createdAt: { $gte: lastWeek } });

    res.json({
      success: true,
      data: {
        total: { general: totalGeneral, product: totalProduct },
        pending: { general: pendingGeneral, product: pendingProduct },
        newThisWeek,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;