const express = require("express");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategory,
} = require("../controllers/categoryController");
const { authenticate, requireAdmin, requireStaff } = require("../middleware/auth");

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/categories - List all categories with pagination
router.get("/",  listCategories);

// GET /api/categories/:categoryId - Get a single category
router.get("/:categoryId", authenticate, requireStaff, getCategory);

// POST /api/categories - Create a new category
router.post("/", authenticate, requireStaff, createCategory);

// PUT /api/categories/:categoryId - Update a category
router.put("/:categoryId", authenticate, requireStaff, updateCategory);

// DELETE /api/categories/:categoryId - Delete a category
router.delete("/:categoryId", authenticate, requireAdmin, deleteCategory);

module.exports = router;
