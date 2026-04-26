// routes/blogCategory.js
const express = require('express');
const router = express.Router();

// টেম্পোরারি হ্যান্ডলার ফাংশন (পরীক্ষার জন্য)
const getAllCategories = (req, res) => {
  res.json({ success: true, categories: [] });
};

const getCategoryById = (req, res) => {
  res.json({ success: true, category: null });
};

const createCategory = (req, res) => {
  res.status(201).json({ success: true, message: 'Category created' });
};

const updateCategory = (req, res) => {
  res.json({ success: true, message: 'Category updated' });
};

const deleteCategory = (req, res) => {
  res.json({ success: true, message: 'Category deleted' });
};

// ==================== PUBLIC ROUTES ====================
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// ==================== ADMIN ONLY ROUTES ====================
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;