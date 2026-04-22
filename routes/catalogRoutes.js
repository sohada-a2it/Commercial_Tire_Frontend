const express = require("express");
const {
  uploadMiddleware,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listMedia,
  uploadMedia,
  uploadMediaFromUrl,
  deleteMedia,
  importCatalogFromJson,
  findTiresByCriteria,
  compareTires,
  createB2BInquiry,
  findNearbyDealers,
  getProductDetails,
  getProductQuickView,
  getProductSpecsTable,
  getProductReviews,
  getProductPricing,
  getProductSEO,
  submitProductReview
} = require("../controllers/catalogController");
const { authenticate, requireAdmin, requireStaff } = require("../middleware/auth");

const router = express.Router();

// ==================== CATEGORY ROUTES ====================
router.get("/categories", listCategories);
router.post("/categories", authenticate, requireStaff, createCategory);
router.put("/categories/:categoryId", authenticate, requireStaff, updateCategory);
router.delete("/categories/:categoryId", authenticate, requireAdmin, deleteCategory);
router.post("/categories/import", authenticate, requireAdmin, importCatalogFromJson);

// ==================== PRODUCT ROUTES ====================
// আপনার রাউটার ফাইলে এই রুটগুলো যোগ করুন

// ==================== PRODUCT DETAILS ROUTES ====================

// Public routes (no authentication required)
router.get('/products/:productId/details', getProductDetails);
router.get('/products/:productId/quick-view', getProductQuickView);
router.get('/products/:productId/specs', getProductSpecsTable);
router.get('/products/:productId/reviews', getProductReviews);
router.get('/products/:productId/pricing', getProductPricing);
router.get('/products/:productId/seo', getProductSEO);

// Protected routes (authentication required)
router.post('/products/:productId/reviews', authenticate, requireAdmin, submitProductReview);
// Admin/Staff routes
router.get("/products", listProducts);
router.post("/products", authenticate, requireStaff, createProduct);
router.get("/products/:productId", authenticate, requireStaff, getProduct);
router.put("/products/:productId", authenticate, requireStaff, updateProduct);
router.delete("/products/:productId", authenticate, requireAdmin, deleteProduct);

// ========== PUBLIC ROUTE ==========
router.get("/public/products/:productId", getProduct);

// ==================== TIRE FINDER & COMPARISON (Public Routes) ====================
router.get("/tires/finder", findTiresByCriteria);
router.post("/tires/compare", compareTires);

// ==================== B2B INQUIRY (Public - No Auth Required) ====================
router.post("/inquiries/b2b", createB2BInquiry);

// ==================== DEALER LOCATOR (Public Routes) ====================
router.get("/dealers/nearby", findNearbyDealers);

// ==================== MEDIA ROUTES (Admin/Staff Only) ====================
router.get("/media", authenticate, requireStaff, listMedia);
router.post("/media/upload", authenticate, requireStaff, uploadMiddleware, uploadMedia);
router.post("/media/upload-from-url", authenticate, requireStaff, uploadMediaFromUrl);
router.delete("/media/:publicId", authenticate, requireStaff, deleteMedia);

module.exports = router;