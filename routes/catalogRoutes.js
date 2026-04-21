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