// models/Blog.js
const mongoose = require('mongoose');

// ✅ BlogCategory রেফারেন্স ব্যবহার করুন
const BlogCategory = require('./categoryModel');

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

const faqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 }
});

const blogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Blog title is required'],
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    content: {
        type: String,
        required: [true, 'Blog content is required']
    },
    excerpt: {
        type: String,
        maxlength: 200
    },
    // ✅ BlogCategory রেফারেন্স
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BlogCategory',  // ← এখানে BlogCategory ব্যবহার করুন
        default: null
    },
    categoryName: {
        type: String,
        default: 'uncategorized'
    },
    tags: [{
        type: String,
        trim: true
    }],
    coverImage: imageSchema,
    galleryImages: [imageSchema],
    
    status: {
        type: String,
        enum: ['draft', 'published', 'archived', 'scheduled'],
        default: 'draft'
    },
    faqs: [faqSchema],
    isFeatured: {
        type: Boolean,
        default: false
    },
    featuredPriority: {
        type: Number,
        default: 0
    },
    customDate: {
        type: Date,
        default: null
    },
    videoUrl: {
        type: String,
        default: ''
    },
    videoEmbedCode: {
        type: String,
        default: ''
    },
    audioUrl: {
        type: String,
        default: ''
    },
    audioTitle: {
        type: String,
        default: ''
    },
    attachments: [{
        fileName: { type: String },
        fileUrl: { type: String },
        fileSize: { type: Number },
        fileType: { type: String },
        publicId: { type: String }
    }],
    scheduledDate: {
        type: Date,
        default: null
    },
    isScheduled: {
        type: Boolean,
        default: false
    },
    metaTitle: {
        type: String,
        trim: true
    },
    metaDescription: {
        type: String,
        trim: true
    },
    author: {
        type: String,
        default: 'Admin',
        trim: true
    },
    readTime: {
        type: Number,
        default: 5
    },
    isPublished: {
        type: Boolean,
        default: false
    },
    publishedAt: {
        type: Date,
        default: null
    },
    views: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes
blogSchema.index({ title: 'text', content: 'text', excerpt: 'text', tags: 'text' });
blogSchema.index({ category: 1 });
blogSchema.index({ slug: 1 });
blogSchema.index({ status: 1, isPublished: 1 });
blogSchema.index({ isFeatured: -1, featuredPriority: -1 });

// Pre-save middleware
blogSchema.pre('save', function(next) {
    if (this.isScheduled && this.scheduledDate && this.scheduledDate <= new Date()) {
        this.status = 'published';
        this.isPublished = true;
        this.publishedAt = this.scheduledDate;
        this.isScheduled = false;
    }
    
    if (this.customDate && this.status === 'published') {
        this.publishedAt = this.customDate;
    }
    
    next();
});

// ✅ Post-save middleware (BlogCategory ব্যবহার করুন)
blogSchema.post('save', async function(doc) {
    if (doc.category) {
        try {
            const BlogCategory = require('./BlogCategory');
            const Blog = mongoose.model('Blog');
            const postCount = await Blog.countDocuments({ 
                category: doc.category, 
                status: 'published',
                isPublished: true 
            });
            await BlogCategory.findByIdAndUpdate(doc.category, { postCount });
        } catch (error) {
            console.error('Error updating category postCount:', error);
        }
    }
});

// ✅ Post-remove middleware
blogSchema.post('remove', async function(doc) {
    if (doc.category) {
        try {
            const BlogCategory = require('./BlogCategory');
            const Blog = mongoose.model('Blog');
            const postCount = await Blog.countDocuments({ 
                category: doc.category, 
                status: 'published',
                isPublished: true 
            });
            await BlogCategory.findByIdAndUpdate(doc.category, { postCount });
        } catch (error) {
            console.error('Error updating category postCount on remove:', error);
        }
    }
});

module.exports = mongoose.model('Blog', blogSchema);