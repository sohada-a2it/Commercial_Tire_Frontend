// models/BlogCategory.js
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    alt: { type: String, default: '' },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    format: { type: String, default: '' },
    order: { type: Number, default: 0 }
});

const blogCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    image: imageSchema,
    metaTitle: {
        type: String,
        default: ''
    },
    metaDescription: {
        type: String,
        default: ''
    },
    parentCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BlogCategory',
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    postCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes
blogCategorySchema.index({ name: 1 });
blogCategorySchema.index({ slug: 1 });
blogCategorySchema.index({ parentCategory: 1 });
blogCategorySchema.index({ isActive: 1, order: 1 });

// ✅ নাম পরিবর্তন করে BlogCategory করুন
const BlogCategory = mongoose.models.BlogCategory || mongoose.model('BlogCategory', blogCategorySchema);

module.exports = BlogCategory;