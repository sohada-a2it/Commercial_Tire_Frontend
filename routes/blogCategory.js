const express = require('express');
const router = express.Router();
const {
    getCategories,
    getCategoryById,
    getCategoryBySlug,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryTree,
    getCategoryStats
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

// ==================== PUBLIC ROUTES ====================
router.get('/', getCategories);
router.get('/tree', getCategoryTree);
router.get('/stats', getCategoryStats);
router.get('/slug/:slug/blogs', getCategoryBySlug);
router.get('/:id', getCategoryById);

// ==================== ADMIN ONLY ROUTES ====================
router.post('/', protect, authorize('admin', 'superAdmin'), createCategory);
router.put('/:id', protect, authorize('admin', 'superAdmin'), updateCategory);
router.delete('/:id', protect, authorize('admin', 'superAdmin'), deleteCategory);

module.exports = router;