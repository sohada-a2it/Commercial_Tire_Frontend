const Blog = require("../models/Blog");
const slugify = require("slugify");
const fs = require("fs/promises");
const path = require("path");
const { cloudinary, buildOptimizedUrl } = require("../config/cloudinary");
const multer = require("multer");
const Category = require("../models/categoryModel");
// Multer configuration for multiple files
const upload = multer({ storage: multer.memoryStorage() });
// Add this helper function in your blogController.js (if not already present)
const uploadBlogAsset = async (asset, fallbackName = "") => {
    const normalized = normalizeAsset(asset);
    const sourcePath = typeof asset === "string" ? asset : normalized.url;

    if (!sourcePath || normalized.publicId || !sourcePath.startsWith("/assets/")) {
        return normalized;
    }

    const localPath = path.resolve(
        __dirname,
        "..",
        "..",
        "Asian.Import.Export.Co.Frontend",
        "public",
        String(sourcePath).replace(/^\//, "")
    );

    try {
        await fs.access(localPath);
        const uploaded = await cloudinary.uploader.upload(localPath, {
            folder: process.env.CLOUDINARY_BLOG_FOLDER || "asian-import-export/blogs",
            resource_type: "auto",
            overwrite: false,
            quality: "auto:good",
            fetch_format: "auto",
        });

        return {
            url: buildOptimizedUrl(uploaded.public_id, uploaded.resource_type || "image"),
            publicId: uploaded.public_id,
            alt: fallbackName,
            width: uploaded.width || 0,
            height: uploaded.height || 0,
            bytes: uploaded.bytes || 0,
            format: uploaded.format || "",
        };
    } catch (_error) {
        return normalized;
    }
};
// Helper function to upload buffer to Cloudinary
const uploadBufferToCloudinary = (buffer, filename, folder = "blogs") =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: process.env.CLOUDINARY_BLOG_FOLDER || `asian-import-export/${folder}`,
                resource_type: "auto",
                overwrite: false,
                quality: "auto:good",
                fetch_format: "auto",
            },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    ...result,
                    optimizedUrl: buildOptimizedUrl(result.public_id, result.resource_type || "image"),
                    originalFilename: filename,
                });
            }
        );
        stream.end(buffer);
    });

// Helper function to download URL to buffer
const downloadUrlToBuffer = (urlString) =>
    new Promise((resolve, reject) => {
        const https = require("https");
        const http = require("http");
        const url = require("url");

        try {
            const parsedUrl = url.parse(urlString);
            const protocol = parsedUrl.protocol === "https:" ? https : http;
            const basename = path.basename(parsedUrl.pathname || "file");

            protocol.get(urlString, { timeout: 10000 }, (response) => {
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download URL: HTTP ${response.statusCode}`));
                }
                const chunks = [];
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("end", () => resolve({ buffer: Buffer.concat(chunks), filename: basename }));
                response.on("error", reject);
            }).on("timeout", () => {
                reject(new Error("Download request timed out"));
            });
        } catch (error) {
            reject(error);
        }
    });

const normalizeAsset = (asset = {}) => {
    if (typeof asset === "string") {
        return { url: asset, publicId: "", alt: "", width: 0, height: 0, bytes: 0, format: "" };
    }
    return {
        url: asset?.url ? String(asset.url) : "",
        publicId: asset?.publicId ? String(asset.publicId) : "",
        alt: asset?.alt ? String(asset.alt) : "",
        width: normalizeNumber(asset?.width ?? 0),
        height: normalizeNumber(asset?.height ?? 0),
        bytes: normalizeNumber(asset?.bytes ?? 0),
        format: asset?.format ? String(asset.format) : "",
    };
};

const normalizeNumber = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
};
// ✅ ক্যাটাগরি প্রসেস করার হেল্পার ফাংশন
const processCategory = async (categoryInput) => {
    if (!categoryInput || categoryInput === 'uncategorized') {
        return { categoryId: null, categoryName: 'uncategorized' };
    }
    
    // চেক করুন এটি valid ObjectId কিনা
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(categoryInput);
    
    if (isValidObjectId) {
        const category = await Category.findById(categoryInput);
        if (category) {
            return { categoryId: category._id, categoryName: category.displayName };
        }
    }
    
    // নাম দিয়ে খুঁজুন
    const category = await Category.findOne({ 
        $or: [
            { name: categoryInput.toLowerCase() },
            { displayName: categoryInput }
        ]
    });
    
    if (category) {
        return { categoryId: category._id, categoryName: category.displayName };
    }
    
    // না পেলে স্ট্রিং হিসেবে রিটার্ন করুন (ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য)
    return { categoryId: null, categoryName: categoryInput };
};
// ✅ CREATE BLOG with all new features
exports.createBlog = async (req, res) => {
    try {
        const {
            title, content, excerpt, category, tags, metaTitle, metaDescription,
            author, readTime, isPublished, publishedAt, galleryImages,
            // New fields
            status, faqs, isFeatured, customDate, videoUrl, videoEmbedCode,
            audioUrl, audioTitle, attachments, scheduledDate, isScheduled
        } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: "Blog title is required" });
        }
       const { categoryId, categoryName } = await processCategory(category);
        // Process cover image
        let coverImage = null;
        if (req.files?.coverImage && req.files.coverImage[0]) {
            const uploaded = await uploadBufferToCloudinary(
                req.files.coverImage[0].buffer,
                req.files.coverImage[0].originalname,
                "blogs/covers"
            );
            coverImage = {
                url: uploaded.optimizedUrl,
                publicId: uploaded.public_id,
                alt: title,
                width: uploaded.width || 0,
                height: uploaded.height || 0,
                bytes: uploaded.bytes || 0,
                format: uploaded.format || "",
            };
        } else if (req.body.coverImageUrl) {
            coverImage = await uploadBlogAsset(req.body.coverImageUrl, title);
        }

        // Process gallery images (max 6)
        let galleryImagesList = [];
        if (req.files?.galleryImages && req.files.galleryImages.length > 0) {
            const filesToProcess = req.files.galleryImages.slice(0, 6);
            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                const uploaded = await uploadBufferToCloudinary(
                    file.buffer,
                    file.originalname,
                    "blogs/gallery"
                );
                galleryImagesList.push({
                    url: uploaded.optimizedUrl,
                    publicId: uploaded.public_id,
                    alt: `${title} - Image ${i + 1}`,
                    width: uploaded.width || 0,
                    height: uploaded.height || 0,
                    bytes: uploaded.bytes || 0,
                    format: uploaded.format || "",
                    order: i,
                });
            }
        }

        if (galleryImages && Array.isArray(galleryImages)) {
            const remainingSlots = 6 - galleryImagesList.length;
            const urlImagesToProcess = galleryImages.slice(0, remainingSlots);
            for (let i = 0; i < urlImagesToProcess.length; i++) {
                const imgUrl = urlImagesToProcess[i];
                if (imgUrl && typeof imgUrl === 'string') {
                    const uploaded = await uploadBlogAsset(imgUrl, `${title} - Gallery`);
                    galleryImagesList.push({ ...uploaded, order: galleryImagesList.length });
                }
            }
        }

        // Process attachments (file uploads)
        let attachmentsList = [];
        if (req.files?.attachments && req.files.attachments.length > 0) {
            for (let i = 0; i < req.files.attachments.length; i++) {
                const file = req.files.attachments[i];
                const uploaded = await uploadBufferToCloudinary(
                    file.buffer,
                    file.originalname,
                    "blogs/attachments"
                );
                attachmentsList.push({
                    fileName: file.originalname,
                    fileUrl: uploaded.optimizedUrl || uploaded.secure_url,
                    fileSize: file.size,
                    fileType: file.mimetype,
                    publicId: uploaded.public_id
                });
            }
        }

        // Process FAQs
        let parsedFaqs = [];
        if (faqs) {
            try {
                parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
            } catch (e) {
                parsedFaqs = [];
            }
        }

        // Parse tags
        let parsedTags = tags;
        if (typeof tags === 'string') {
            try {
                parsedTags = JSON.parse(tags);
            } catch {
                parsedTags = tags.split(',').map(t => t.trim());
            }
        }

        // Generate unique slug
        let slug = slugify(title, { lower: true, strict: true });
        let existingBlog = await Blog.findOne({ slug });
        let counter = 1;
        while (existingBlog) {
            slug = `${slugify(title, { lower: true, strict: true })}-${counter}`;
            existingBlog = await Blog.findOne({ slug });
            counter++;
        }

        // Handle scheduled date
        let finalStatus = status || 'draft';
        let finalIsPublished = isPublished === true || isPublished === 'true';
        let finalPublishedAt = null;
        let finalScheduledDate = null;

        if (isScheduled === true || isScheduled === 'true') {
            finalStatus = 'scheduled';
            finalIsPublished = false;
            finalScheduledDate = scheduledDate ? new Date(scheduledDate) : null;
        } else if (finalIsPublished) {
            finalStatus = 'published';
            finalPublishedAt = customDate ? new Date(customDate) : (publishedAt || new Date());
        }

        const blog = await Blog.create({
            title, slug, content,
            excerpt: excerpt || content.substring(0, 200),
            category: categoryId,        // ✅ ObjectId হিসেবে সংরক্ষণ
            categoryName: categoryName,  // ✅ ডিসপ্লে নাম
            tags: parsedTags || [],
            coverImage,
            galleryImages: galleryImagesList,
            metaTitle: metaTitle || title,
            metaDescription: metaDescription || excerpt || content.substring(0, 160),
            author: author || 'Admin',
            readTime: readTime || Math.ceil(content?.split(/\s+/).length / 200) || 5,
            isPublished: finalIsPublished,
            publishedAt: finalPublishedAt,
            views: 0,
            // New fields
            status: finalStatus,
            faqs: parsedFaqs,
            isFeatured: isFeatured === true || isFeatured === 'true',
            customDate: customDate ? new Date(customDate) : null,
            videoUrl: videoUrl || '',
            videoEmbedCode: videoEmbedCode || '',
            audioUrl: audioUrl || '',
            audioTitle: audioTitle || '',
            attachments: attachmentsList,
            scheduledDate: finalScheduledDate,
            isScheduled: isScheduled === true || isScheduled === 'true'
        });

        res.status(201).json({ success: true, data: blog });
    } catch (error) {
        console.error("Create blog error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET ALL BLOGS (with new filters)
exports.getBlogs = async (req, res) => {
    try {
        const {
            page = 1, limit = 10, category, tag, isPublished, search,
            status, isFeatured, showScheduled
        } = req.query;

        const filter = {};

         if (category && category !== 'all') {
            const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(category);
            
            if (isValidObjectId) {
                filter.category = category;
            } else {
                const categoryDoc = await Category.findOne({ 
                    $or: [
                        { name: category.toLowerCase() },
                        { displayName: category }
                    ]
                });
                if (categoryDoc) {
                    filter.category = categoryDoc._id;
                } else {
                    filter.categoryName = category;
                }
            }
        }
        if (tag) filter.tags = tag;
        if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
        if (status) filter.status = status;
        if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';

        // Show scheduled posts
        if (showScheduled === 'true') {
            filter.isScheduled = true;
            filter.scheduledDate = { $gt: new Date() };
        }

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } },
                { excerpt: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [blogs, total] = await Promise.all([
            Blog.find(filter)
             .populate('category', 'name displayName slug')
                .sort({ isFeatured: -1, featuredPriority: -1, publishedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Blog.countDocuments(filter)
        ]);

        const allCategories = await Category.find({ isActive: true })
            .select('name displayName slug parentCategory order')
            .sort({ order: 1, name: 1 });
        const allTags = await Blog.distinct('tags');
        const flatTags = [...new Set(allTags.flat())];

        res.status(200).json({
            success: true,
            count: blogs.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            data: blogs,
            filters: { categories: allCategories, tags: flatTags }
        });
    } catch (error) {
        console.error("Get blogs error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET SINGLE BLOG
exports.getSingleBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id)
            .populate('category', 'name displayName slug');
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        // Check if blog is scheduled and not published yet
        if (blog.isScheduled && blog.scheduledDate && blog.scheduledDate > new Date()) {
            return res.status(403).json({ success: false, message: "Blog is scheduled for future" });
        }

        blog.views += 1;
        await blog.save();

        const relatedBlogs = await Blog.find({
            _id: { $ne: blog._id },
            isPublished: true,
            $or: [{ category: blog.category }, { tags: { $in: blog.tags } }]
        })
            .limit(3)
            .select('title slug coverImage excerpt publishedAt');

        res.status(200).json({ success: true, data: blog, related: relatedBlogs });
    } catch (error) {
        console.error("Get single blog error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ UPDATE BLOG (with new features)
exports.updateBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        const updateData = { ...req.body };
 if (req.body.category !== undefined) {
            const { categoryId, categoryName } = await processCategory(req.body.category);
            updateData.category = categoryId;
            updateData.categoryName = categoryName;
        }
        // Update slug if title changed
        if (req.body.title && req.body.title !== blog.title) {
            let newSlug = slugify(req.body.title, { lower: true, strict: true });
            let existingBlog = await Blog.findOne({ slug: newSlug, _id: { $ne: blog._id } });
            let counter = 1;
            while (existingBlog) {
                newSlug = `${slugify(req.body.title, { lower: true, strict: true })}-${counter}`;
                existingBlog = await Blog.findOne({ slug: newSlug, _id: { $ne: blog._id } });
                counter++;
            }
            updateData.slug = newSlug;
        }

        // Update cover image
        if (req.files?.coverImage && req.files.coverImage[0]) {
            if (blog.coverImage?.publicId) {
                try { await cloudinary.uploader.destroy(blog.coverImage.publicId); } catch (err) { }
            }
            const uploaded = await uploadBufferToCloudinary(
                req.files.coverImage[0].buffer,
                req.files.coverImage[0].originalname,
                "blogs/covers"
            );
            updateData.coverImage = {
                url: uploaded.optimizedUrl,
                publicId: uploaded.public_id,
                alt: req.body.title || blog.title,
                width: uploaded.width || 0,
                height: uploaded.height || 0,
                bytes: uploaded.bytes || 0,
                format: uploaded.format || "",
            };
        }

        // Update FAQs
        if (req.body.faqs) {
            try {
                updateData.faqs = typeof req.body.faqs === 'string' ? JSON.parse(req.body.faqs) : req.body.faqs;
            } catch (e) { }
        }

        // Update attachments
        if (req.files?.attachments && req.files.attachments.length > 0) {
            const newAttachments = [...(blog.attachments || [])];
            for (const file of req.files.attachments) {
                const uploaded = await uploadBufferToCloudinary(
                    file.buffer,
                    file.originalname,
                    "blogs/attachments"
                );
                newAttachments.push({
                    fileName: file.originalname,
                    fileUrl: uploaded.optimizedUrl || uploaded.secure_url,
                    fileSize: file.size,
                    fileType: file.mimetype,
                    publicId: uploaded.public_id
                });
            }
            updateData.attachments = newAttachments;
        }

        // Handle scheduling
        if (req.body.isScheduled === 'true' || req.body.isScheduled === true) {
            updateData.status = 'scheduled';
            updateData.isPublished = false;
            updateData.scheduledDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : blog.scheduledDate;
            updateData.isScheduled = true;
        } else if (req.body.isPublished === 'true' || req.body.isPublished === true) {
            updateData.status = 'published';
            updateData.isPublished = true;
            updateData.publishedAt = req.body.customDate ? new Date(req.body.customDate) : new Date();
            updateData.isScheduled = false;
            updateData.scheduledDate = null;
        } else if (req.body.status === 'draft') {
            updateData.status = 'draft';
            updateData.isPublished = false;
            updateData.isScheduled = false;
        }

        // Featured priority
        if (req.body.isFeatured === 'true' || req.body.isFeatured === true) {
            updateData.isFeatured = true;
            updateData.featuredPriority = req.body.featuredPriority || 0;
        }

        // Custom date
        if (req.body.customDate) {
            updateData.customDate = new Date(req.body.customDate);
            if (updateData.status === 'published' && !req.body.publishedAt) {
                updateData.publishedAt = updateData.customDate;
            }
        }

        // Parse tags
        if (typeof updateData.tags === 'string') {
            try {
                updateData.tags = JSON.parse(updateData.tags);
            } catch {
                updateData.tags = updateData.tags.split(',').map(t => t.trim());
            }
        }

        const updatedBlog = await Blog.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updatedBlog });
    } catch (error) {
        console.error("Update blog error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ DELETE BLOG (with attachments cleanup)
exports.deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        // Delete cover image
        if (blog.coverImage?.publicId) {
            try { await cloudinary.uploader.destroy(blog.coverImage.publicId); } catch (err) { }
        }

        // Delete gallery images
        if (blog.galleryImages && blog.galleryImages.length) {
            for (const img of blog.galleryImages) {
                if (img.publicId) {
                    try { await cloudinary.uploader.destroy(img.publicId); } catch (err) { }
                }
            }
        }

        // Delete attachments
        if (blog.attachments && blog.attachments.length) {
            for (const file of blog.attachments) {
                if (file.publicId) {
                    try { await cloudinary.uploader.destroy(file.publicId); } catch (err) { }
                }
            }
        }

        await blog.deleteOne();

        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        console.error("Delete blog error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ TOGGLE FEATURED STATUS
exports.toggleFeatured = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        blog.isFeatured = !blog.isFeatured;
        await blog.save();

        res.status(200).json({
            success: true,
            data: blog,
            message: `Blog ${blog.isFeatured ? 'featured' : 'unfeatured'} successfully`
        });
    } catch (error) {
        console.error("Toggle featured error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET SCHEDULED BLOGS
exports.getScheduledBlogs = async (req, res) => {
    try {
        const scheduledBlogs = await Blog.find({
            isScheduled: true,
            scheduledDate: { $gt: new Date() },
            status: 'scheduled'
        }).sort({ scheduledDate: 1 });

        res.status(200).json({ success: true, data: scheduledBlogs });
    } catch (error) {
        console.error("Get scheduled blogs error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET FEATURED BLOGS
exports.getFeaturedBlogs = async (req, res) => {
    try {
        const { limit = 6 } = req.query;
        const featuredBlogs = await Blog.find({
            isFeatured: true,
            isPublished: true,
            status: 'published'
        })
            .sort({ featuredPriority: -1, publishedAt: -1 })
            .limit(parseInt(limit));

        res.status(200).json({ success: true, data: featuredBlogs });
    } catch (error) {
        console.error("Get featured blogs error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET BLOG BY ID
exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        console.error("Get blog by ID error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ TOGGLE PUBLISH STATUS
exports.togglePublishStatus = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        blog.isPublished = !blog.isPublished;
        blog.status = blog.isPublished ? 'published' : 'draft';
        if (blog.isPublished && !blog.publishedAt) {
            blog.publishedAt = new Date();
        }

        await blog.save();

        res.status(200).json({
            success: true,
            message: `Blog ${blog.isPublished ? 'published' : 'unpublished'}`,
            data: blog
        });
    } catch (error) {
        console.error("Toggle publish status error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ GET BLOG STATS
exports.getBlogStats = async (req, res) => {
    try {
        const totalBlogs = await Blog.countDocuments();
        const publishedBlogs = await Blog.countDocuments({ isPublished: true, status: 'published' });
        const draftBlogs = await Blog.countDocuments({ status: 'draft' });
        const scheduledBlogs = await Blog.countDocuments({ isScheduled: true });
        const featuredBlogs = await Blog.countDocuments({ isFeatured: true });

        const totalViews = await Blog.aggregate([
            { $group: { _id: null, totalViews: { $sum: '$views' } } }
        ]);

        const stats = {
            totalBlogs,
            publishedBlogs,
            draftBlogs,
            scheduledBlogs,
            featuredBlogs,
            totalViews: totalViews[0]?.totalViews || 0
        };

        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        console.error("Get blog stats error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getCategories = async (req, res) => {
    try {
        const { includeInactive = false, parent = null, limit = 50 } = req.query;
        
        const filter = {};
        if (includeInactive !== 'true') filter.isActive = true;
        if (parent === 'null' || parent === '') filter.parentCategory = null;
        else if (parent) filter.parentCategory = parent;
        
        const categories = await Category.find(filter)
            .sort({ order: 1, name: 1 })
            .limit(parseInt(limit))
            .populate('parentCategory', 'name displayName slug');
        
        // Get post count for each category
        const categoriesWithCount = await Promise.all(
            categories.map(async (category) => {
                const postCount = await Blog.countDocuments({ 
                    category: category._id,
                    status: 'published',
                    isPublished: true 
                });
                return { ...category.toObject(), postCount };
            })
        );
        
        res.status(200).json({
            success: true,
            count: categoriesWithCount.length,
            categories: categoriesWithCount
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single category by ID
// @route   GET /api/categories/:id
// @access  Public
exports.getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id)
            .populate('parentCategory', 'name displayName slug');
        
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        const postCount = await Blog.countDocuments({ 
            category: category._id,
            status: 'published',
            isPublished: true 
        });
        
        res.status(200).json({
            success: true,
            category: { ...category.toObject(), postCount }
        });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get category by slug with blogs
// @route   GET /api/categories/slug/:slug/blogs
// @access  Public
exports.getCategoryBySlug = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const category = await Category.findOne({ slug: req.params.slug, isActive: true });
        
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        const blogs = await Blog.find({ 
            category: category._id,
            status: 'published',
            isPublished: true 
        })
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('title slug excerpt coverImage publishedAt views readTime author');
        
        const totalBlogs = await Blog.countDocuments({ 
            category: category._id,
            status: 'published',
            isPublished: true 
        });
        
        res.status(200).json({
            success: true,
            category,
            blogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalBlogs,
                totalPages: Math.ceil(totalBlogs / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get category by slug error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private (Admin only)
exports.createCategory = async (req, res) => {
    try {
        const { name, displayName, description, parentCategory, order, isActive } = req.body;
        
        if (!name || !displayName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name and display name are required' 
            });
        }
        
        // Check if category already exists
        const existingCategory = await Category.findOne({ name: name.toLowerCase() });
        if (existingCategory) {
            return res.status(400).json({ 
                success: false, 
                message: 'Category with this name already exists' 
            });
        }
        
        // Generate slug
        let slug = slugify(name, { lower: true, strict: true });
        let existingSlug = await Category.findOne({ slug });
        let counter = 1;
        while (existingSlug) {
            slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
            existingSlug = await Category.findOne({ slug });
            counter++;
        }
        
        const category = await Category.create({
            name: name.toLowerCase(),
            displayName,
            slug,
            description: description || '',
            parentCategory: parentCategory || null,
            order: order || 0,
            isActive: isActive !== undefined ? isActive : true
        });
        
        res.status(201).json({
            success: true,
            category,
            message: 'Category created successfully'
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private (Admin only)
exports.updateCategory = async (req, res) => {
    try {
        const { name, displayName, description, parentCategory, order, isActive } = req.body;
        
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        // Update slug if name changed
        if (name && name !== category.name) {
            const existingCategory = await Category.findOne({ 
                name: name.toLowerCase(), 
                _id: { $ne: category._id } 
            });
            if (existingCategory) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Category with this name already exists' 
                });
            }
            
            let newSlug = slugify(name, { lower: true, strict: true });
            let existingSlug = await Category.findOne({ slug: newSlug, _id: { $ne: category._id } });
            let counter = 1;
            while (existingSlug) {
                newSlug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
                existingSlug = await Category.findOne({ slug: newSlug, _id: { $ne: category._id } });
                counter++;
            }
            category.slug = newSlug;
            category.name = name.toLowerCase();
        }
        
        if (displayName) category.displayName = displayName;
        if (description !== undefined) category.description = description;
        if (parentCategory !== undefined) category.parentCategory = parentCategory;
        if (order !== undefined) category.order = order;
        if (isActive !== undefined) category.isActive = isActive;
        
        await category.save();
        
        res.status(200).json({
            success: true,
            category,
            message: 'Category updated successfully'
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private (Admin only)
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        // Check if any blogs use this category
        const blogsCount = await Blog.countDocuments({ category: category._id });
        if (blogsCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete category. ${blogsCount} blog(s) are using this category.` 
            });
        }
        
        await category.deleteOne();
        
        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get category tree (hierarchical)
// @route   GET /api/categories/tree
// @access  Public
exports.getCategoryTree = async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .sort({ order: 1, name: 1 });
        
        const buildTree = (parentId = null, level = 0) => {
            return categories
                .filter(cat => {
                    const catParentId = cat.parentCategory ? cat.parentCategory.toString() : null;
                    return catParentId === parentId;
                })
                .map(cat => ({
                    ...cat.toObject(),
                    level,
                    children: buildTree(cat._id.toString(), level + 1)
                }));
        };
        
        const tree = buildTree();
        
        res.status(200).json({
            success: true,
            categories: tree
        });
    } catch (error) {
        console.error('Get category tree error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get category statistics
// @route   GET /api/categories/stats
// @access  Public
exports.getCategoryStats = async (req, res) => {
    try {
        const totalCategories = await Category.countDocuments();
        const activeCategories = await Category.countDocuments({ isActive: true });
        const parentCategories = await Category.countDocuments({ parentCategory: null });
        const subCategories = await Category.countDocuments({ parentCategory: { $ne: null } });
        
        res.status(200).json({
            success: true,
            stats: {
                totalCategories,
                activeCategories,
                parentCategories,
                subCategories
            }
        });
    } catch (error) {
        console.error('Get category stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
// Export multer for file upload handling
exports.upload = upload;