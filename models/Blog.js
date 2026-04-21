// models/Blog.js
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
    category: {
        type: String,
        default: 'uncategorized',
        trim: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    coverImage: imageSchema,
    galleryImages: [imageSchema],
    
    // Status option
    status: {
        type: String,
        enum: ['draft', 'published', 'archived', 'scheduled'],
        default: 'draft'
    },
    
    // FAQ
    faqs: [faqSchema],
    
    // Featured option
    isFeatured: {
        type: Boolean,
        default: false
    },
    
    // Date edit option (custom date)
    customDate: {
        type: Date,
        default: null
    },
    
    // Video option
    videoUrl: {
        type: String,
        default: ''
    },
    videoEmbedCode: {
        type: String,
        default: ''
    },
    
    // Audio option
    audioUrl: {
        type: String,
        default: ''
    },
    audioTitle: {
        type: String,
        default: ''
    },
    
    // File upload option
    attachments: [{
        fileName: { type: String },
        fileUrl: { type: String },
        fileSize: { type: Number },
        fileType: { type: String }
    }],
    
    // Schedule option
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

// Index for search
blogSchema.index({ title: 'text', content: 'text', excerpt: 'text', tags: 'text' });

// Pre-save middleware for scheduling
blogSchema.pre('save', function(next) {
    // If scheduled date is reached, auto-publish
    if (this.isScheduled && this.scheduledDate && this.scheduledDate <= new Date()) {
        this.status = 'published';
        this.isPublished = true;
        this.publishedAt = this.scheduledDate;
        this.isScheduled = false;
    }
    
    // Use custom date if provided
    if (this.customDate && this.status === 'published') {
        this.publishedAt = this.customDate;
    }
    
    next();
});

module.exports = mongoose.model('Blog', blogSchema);