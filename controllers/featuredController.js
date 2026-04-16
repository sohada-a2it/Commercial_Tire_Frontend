// controllers/featuredProductController.js
const FeaturedProduct = require("../models/FeaturedProduct");
const Product = require("../models/Product");

// ফিচার্ড প্রোডাক্ট লিস্ট (পাবলিক)
// ফিচার্ড প্রোডাক্ট লিস্ট (পাবলিক)
const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const filter = { isActive: true };
    
    // Expiry date check
    filter.$or = [
      { expiryDate: null },
      { expiryDate: { $gt: new Date() } }
    ];
    
    const featuredProducts = await FeaturedProduct.find(filter)
      .populate("productId")
      .sort({ order: 1, addedAt: -1 })
      .limit(parseInt(limit));
    
    // Transform to match frontend expected format
    const products = featuredProducts
      .filter(fp => fp.productId) // Only keep if product exists
      .map(fp => ({
        _id: fp.productId._id,
        id: fp.productId._id,
        name: fp.productId.name,
        slug: fp.productId.slug,
        price: fp.productId.price,
        offerPrice: fp.productId.offerPrice,
        image: fp.productId.image,
        categoryName: fp.productId.categoryName,
        subcategoryName: fp.productId.subcategoryName,
        brand: fp.productId.brand || "N/A",  // ✅ Brand যোগ করা হয়েছে
        pattern: fp.productId.pattern,
        isActive: fp.productId.isActive,
        isFeatured: true,  // ✅ Featured flag যোগ করা হয়েছে
        featuredData: {
          order: fp.order,
          addedAt: fp.addedAt,
          expiryDate: fp.expiryDate
        }
      }));
    
    // Return in format frontend expects
    res.json({
      success: true,
      products: products,
      count: products.length
    });
  } catch (error) {
    console.error("Error in getFeaturedProducts:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      products: []
    });
  }
};

// একটি প্রোডাক্টকে ফিচার্ড এ add করুন
const addToFeatured = async (req, res) => {
  try {
    const { productId } = req.params;
    const { order, expiryDate, addedBy } = req.body;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    
    // Check if already featured
    const existing = await FeaturedProduct.findOne({ productId });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: "Product is already featured",
        featuredProduct: existing
      });
    }
    
    // Get max order if not provided
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const maxOrder = await FeaturedProduct.findOne().sort({ order: -1 });
      finalOrder = (maxOrder?.order || 0) + 1;
    }
    
    const featuredProduct = await FeaturedProduct.create({
      productId,
      order: finalOrder,
      addedBy: addedBy || req.authUser?.email || "system",
      addedAt: new Date(),
      expiryDate: expiryDate || null,
      isActive: true
    });
    
    // Also update the product's isFeatured flag
    await Product.findByIdAndUpdate(productId, { isFeatured: true });
    
    const populated = await featuredProduct.populate("productId");
    
    res.status(201).json({
      success: true,
      message: "Product added to featured",
      featuredProduct: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ফিচার্ড থেকে remove করুন
const removeFromFeatured = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const featuredProduct = await FeaturedProduct.findOne({ productId });
    if (!featuredProduct) {
      return res.status(404).json({ success: false, message: "Product is not featured" });
    }
    
    await featuredProduct.deleteOne();
    
    // Update product's isFeatured flag
    await Product.findByIdAndUpdate(productId, { isFeatured: false });
    
    res.json({
      success: true,
      message: "Product removed from featured"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ফিচার্ড প্রোডাক্টের order পরিবর্তন করুন
const updateFeaturedOrder = async (req, res) => {
  try {
    const { productId } = req.params;
    const { order } = req.body;
    
    if (order === undefined || typeof order !== "number") {
      return res.status(400).json({ success: false, message: "Valid order number is required" });
    }
    
    const featuredProduct = await FeaturedProduct.findOne({ productId });
    if (!featuredProduct) {
      return res.status(404).json({ success: false, message: "Product is not featured" });
    }
    
    featuredProduct.order = order;
    await featuredProduct.save();
    
    res.json({
      success: true,
      message: "Featured order updated",
      featuredProduct
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ফিচার্ড প্রোডাক্ট toggle active/inactive
const toggleFeaturedStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    const { isActive } = req.body;
    
    const featuredProduct = await FeaturedProduct.findOne({ productId });
    if (!featuredProduct) {
      return res.status(404).json({ success: false, message: "Product is not featured" });
    }
    
    featuredProduct.isActive = isActive !== undefined ? isActive : !featuredProduct.isActive;
    await featuredProduct.save();
    
    res.json({
      success: true,
      message: `Featured product ${featuredProduct.isActive ? "activated" : "deactivated"}`,
      featuredProduct
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// সব ফিচার্ড প্রোডাক্ট লিস্ট (এডমিন)
const listAllFeatured = async (req, res) => {
  try {
    const { page = 1, limit = 20, includeExpired = false } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const filter = {};
    if (!includeExpired || includeExpired === "false") {
      filter.$or = [
        { expiryDate: null },
        { expiryDate: { $gt: new Date() } }
      ];
    }
    
    const [featuredProducts, total] = await Promise.all([
      FeaturedProduct.find(filter)
        .populate("productId")
        .sort({ order: 1, addedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FeaturedProduct.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      featuredProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// এক্সপায়ার্ড ফিচার্ড প্রোডাক্ট auto cleanup (cron job এর জন্য)
const cleanupExpiredFeatured = async (req, res) => {
  try {
    const result = await FeaturedProduct.updateMany(
      { expiryDate: { $lt: new Date(), $ne: null }, isActive: true },
      { $set: { isActive: false } }
    );
    
    // Also update product flags
    const expiredFeatured = await FeaturedProduct.find({ 
      expiryDate: { $lt: new Date(), $ne: null }, 
      isActive: false 
    });
    
    for (const fp of expiredFeatured) {
      await Product.findByIdAndUpdate(fp.productId, { isFeatured: false });
    }
    
    res.json({
      success: true,
      message: "Expired featured products cleaned up",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getFeaturedProducts,
  addToFeatured,
  removeFromFeatured,
  updateFeaturedOrder,
  toggleFeaturedStatus,
  listAllFeatured,
  cleanupExpiredFeatured
};