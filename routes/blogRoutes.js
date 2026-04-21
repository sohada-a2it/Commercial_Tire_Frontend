// In your blog routes file (e.g., routes/blogRoutes.js)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    createBlog,
    getBlogs,
    getSingleBlog,
    updateBlog,
    deleteBlog,
    getBlogById,
    togglePublishStatus,
    getBlogStats,
    toggleFeatured,
    getScheduledBlogs,
    getFeaturedBlogs
} = require('../controllers/blogController');

// Configure multer for multiple files and types
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit per file (for videos/audio)
        files: 20 // Maximum 20 files total
    },
    fileFilter: (req, file, cb) => {
        // Allow images, videos, audio, documents
        const allowedTypes = {
            'image': /jpeg|jpg|png|gif|webp|svg/,
            'video': /mp4|mov|avi|mkv|webm/,
            'audio': /mp3|wav|ogg|m4a/,
            'document': /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/
        };
        
        let isAllowed = false;
        for (const type in allowedTypes) {
            if (allowedTypes[type].test(file.mimetype)) {
                isAllowed = true;
                break;
            }
        }
        
        if (isAllowed) {
            return cb(null, true);
        }
        cb(new Error('File type not allowed. Please upload images, videos, audio or documents.'));
    }
});

// Middleware for handling multiple file types
const uploadFiles = upload.fields([
    { name: 'coverImage', maxCount: 1 },      // Single cover image
    { name: 'galleryImages', maxCount: 6 },   // Up to 6 gallery images
    { name: 'attachments', maxCount: 10 },    // Up to 10 file attachments
    { name: 'videoFile', maxCount: 1 },       // Single video file
    { name: 'audioFile', maxCount: 1 }        // Single audio file
]);

// Blog Routes
router.post('/', uploadFiles, createBlog);
router.get('/', getBlogs);
router.get('/stats', getBlogStats);
router.get('/scheduled', getScheduledBlogs);
router.get('/featured', getFeaturedBlogs);
router.get('/:slug', getSingleBlog);
router.get('/id/:id', getBlogById);
router.put('/:id', uploadFiles, updateBlog);
router.delete('/:id', deleteBlog);
router.patch('/:id/toggle-publish', togglePublishStatus);
router.patch('/:id/toggle-featured', toggleFeatured);

// Optional: Add route for bulk operations
router.patch('/bulk/update-status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        const Blog = require('../models/Blog');
        
        await Blog.updateMany(
            { _id: { $in: ids } },
            { status: status }
        );
        
        res.status(200).json({ success: true, message: 'Bulk update successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Optional: Add route for bulk delete
router.delete('/bulk/delete', async (req, res) => {
    try {
        const { ids } = req.body;
        const Blog = require('../models/Blog');
        
        // Delete all blogs and their associated files
        for (const id of ids) {
            const blog = await Blog.findById(id);
            if (blog) {
                // Delete Cloudinary files if needed
                if (blog.coverImage?.publicId) {
                    const { cloudinary } = require('../config/cloudinary');
                    await cloudinary.uploader.destroy(blog.coverImage.publicId);
                }
                await blog.deleteOne();
            }
        }
        
        res.status(200).json({ success: true, message: 'Bulk delete successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;