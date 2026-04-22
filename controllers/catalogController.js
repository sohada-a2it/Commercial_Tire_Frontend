const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const https = require("https");
const http = require("http");
const url = require("url");
const Category = require("../models/Category");
const Product = require("../models/Product");
const MediaAsset = require("../models/MediaAsset");
const { cloudinary, buildOptimizedUrl } = require("../config/cloudinary");

const upload = multer({ storage: multer.memoryStorage() });

const slugifyText = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const getFrontendCatalogPath = () =>
  path.resolve(__dirname, "..", "..", "Asian.Import.Export.Co.Frontend", "public", "categories.json");

const getFrontendAssetPath = (assetPath = "") =>
  path.resolve(
    __dirname,
    "..",
    "..",
    "Asian.Import.Export.Co.Frontend",
    "public",
    String(assetPath).replace(/^\//, "")
  );

const normalizeNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildPaging = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = toPositiveInt(query.page, 1);
  const requestedLimit = toPositiveInt(query.limit, defaultLimit);
  const limit = Math.max(1, Math.min(maxLimit, requestedLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const normalizeSourceId = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizePricingTiers = (tiers = []) =>
  Array.isArray(tiers)
    ? tiers.map((tier) => ({
      minQuantity: tier?.minQuantity === null ? null : normalizeNumber(tier?.minQuantity ?? tier?.min ?? 0),
      maxQuantity:
        tier?.maxQuantity === null || tier?.max === null
          ? null
          : normalizeNumber(tier?.maxQuantity ?? tier?.max ?? 0),
      pricePerTire: tier?.pricePerTire ? String(tier.pricePerTire) : tier?.price ? String(tier.price) : "",
      note: tier?.note ? String(tier.note) : "",
    }))
    : [];

const normalizeReviews = (reviews = []) =>
  Array.isArray(reviews)
    ? reviews.map((review) => ({
      username: review?.username ? String(review.username) : review?.author ? String(review.author) : "",
      location: review?.location ? String(review.location) : "",
      rating: normalizeNumber(review?.rating ?? 0),
      date: review?.date ? String(review.date) : "",
      title: review?.title ? String(review.title) : "",
      text: review?.text ? String(review.text) : review?.comment ? String(review.comment) : "",
      verified: review?.verified === undefined ? false : Boolean(review.verified),
    }))
    : [];

const normalizeAsset = (asset = {}) => {
  if (typeof asset === "string") {
    return {
      url: asset,
      publicId: "",
      alt: "",
      width: 0,
      height: 0,
      bytes: 0,
      format: "",
    };
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

const uploadCatalogAsset = async (asset, fallbackName = "") => {
  const normalized = normalizeAsset(asset);
  const sourcePath = typeof asset === "string" ? asset : normalized.url;

  if (!sourcePath || normalized.publicId || !sourcePath.startsWith("/assets/")) {
    return normalized;
  }

  const localPath = getFrontendAssetPath(sourcePath);

  try {
    await fs.access(localPath);
    const uploaded = await cloudinary.uploader.upload(localPath, {
      folder: process.env.CLOUDINARY_CATALOG_FOLDER || "Commercial_Tire/catalog",
      resource_type: "image",
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

const upsertImportedMediaAsset = async ({
  asset,
  originalFilename = "",
  relatedType = "",
  relatedId = "",
  metadata = {},
}) => {
  if (!asset?.publicId) return;

  await MediaAsset.findOneAndUpdate(
    { publicId: asset.publicId },
    {
      $set: {
        assetType: "image",
        format: asset.format || "",
        originalFilename: originalFilename || asset.alt || asset.publicId,
        url: asset.url || "",
        optimizedUrl: asset.url || "",
        bytes: asset.bytes || 0,
        width: asset.width || 0,
        height: asset.height || 0,
        folder: process.env.CLOUDINARY_CATALOG_FOLDER || "asian-import-export/catalog",
        relatedType,
        relatedId: String(relatedId || ""),
        metadata,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const normalizeProductPayload = (payload = {}) => {
  const resolvedSourceId = normalizeSourceId(payload.sourceId ?? payload.id);

  // Helper functions
  const getPrimaryValue = (value, defaultValue) => {
    if (Array.isArray(value) && value.length > 0) {
      return String(value[0]).trim();
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return defaultValue;
  };

  const getArrayValue = (value, defaultValue) => {
    if (Array.isArray(value)) {
      return value.filter(v => v).map(v => String(v).trim());
    }
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }
    return defaultValue;
  };

  return {
    ...(resolvedSourceId !== undefined ? { sourceId: resolvedSourceId } : {}),
    name: String(payload.name || "").trim(),
    sku: String(payload.sku || "").trim(),

    // ✅ ADD THIS - Model Number
    modelNumber: String(payload.modelNumber || "").trim(),

    category: payload.category,
    mainCategory: String(payload.mainCategory || payload.categoryName || "").trim(),
    subCategory: String(payload.subCategory || payload.subcategoryName || "").trim(),
    categoryName: String(payload.categoryName || "").trim(),
    categoryIcon: String(payload.categoryIcon || "").trim(),
    subcategoryId: normalizeNumber(payload.subcategoryId ?? payload.subcategory?.id ?? 0),
    subcategoryName: String(payload.subcategoryName || payload.subcategory?.name || "").trim(),
    subcategorySlug: String(payload.subcategorySlug || slugifyText(payload.subcategoryName || payload.subcategory?.name || "")).trim(),
    pattern: String(payload.pattern || payload.keyAttributes?.Pattern || "").trim(),
    brand: String(payload.brand || payload.keyAttributes?.Brand || "").trim(),
    price: String(payload.price || "").trim(),
    offerPrice: String(payload.offerPrice || "").trim(),
    pricingTiers: normalizePricingTiers(payload.pricingTiers),
    customizationOptions: Array.isArray(payload.customizationOptions) ? payload.customizationOptions.map((item) => String(item)) : [],
    shipping: String(payload.shipping || "").trim(),
    description: String(payload.description || "").trim(),
    shortDescription: String(payload.shortDescription || "").trim(),
    image: normalizeAsset(payload.image || {}),
    images: Array.isArray(payload.images) ? payload.images.map((item) => normalizeAsset(item)) : [],
    keyAttributes: payload.keyAttributes || {},
    packagingAndDelivery: payload.packagingAndDelivery || {},
    priceSource: String(payload.priceSource || "").trim(),
    userReviews: normalizeReviews(payload.userReviews),
    tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag)) : [],
    isFeatured: Boolean(payload.isFeatured),
    isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
    isNewArrival: Boolean(payload.isNewArrival),
    isBestSeller: Boolean(payload.isBestSeller),
    metadata: payload.metadata || {},

    // Tire-specific fields
    tireType: getPrimaryValue(payload.tireType, 'all-position'),
    vehicleTypesList: getArrayValue(payload.vehicleTypesList || payload.vehicleType, ['truck']),
    applicationsList: getArrayValue(payload.applicationsList || payload.application, ['highway']),
    primaryVehicleType: getPrimaryValue(payload.primaryVehicleType || payload.vehicleType, 'truck'),
    primaryApplication: getPrimaryValue(payload.primaryApplication || payload.application, 'highway'),

    tireSpecs: payload.tireSpecs || {},
    resources: payload.resources || {},
    videoUrl: String(payload.videoUrl || "").trim(),
    threeSixtyImages: Array.isArray(payload.threeSixtyImages) ? payload.threeSixtyImages.map((item) => normalizeAsset(item)) : [],
  };
};

const resolveExistingProductForImport = async (productPayload) => {
  const sourceId = productPayload.sourceId;

  if (sourceId !== undefined) {
    const existingBySource = await Product.findOne({ sourceId });
    if (existingBySource) {
      return existingBySource;
    }
  }

  return null;
};

const normalizeSubcategories = (subcategories) => {
  if (!subcategories) {
    return [];
  }

  if (typeof subcategories === "string") {
    try {
      subcategories = JSON.parse(subcategories);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(subcategories)) {
    return [];
  }

  return subcategories
    .map((subcategory, index) => {
      if (!subcategory || typeof subcategory !== "object") {
        return null;
      }

      const name = String(subcategory.name || subcategory.title || "").trim();

      if (!name) {
        return null;
      }

      return {
        id: normalizeNumber(subcategory.id ?? subcategory._id ?? index + 1),
        name,
        slug: String(subcategory.slug || slugifyText(name)).trim(),
        description: String(subcategory.description || "").trim(),
        displayOrder: normalizeNumber(subcategory.displayOrder ?? index),
        isActive: subcategory.isActive === undefined ? true : Boolean(subcategory.isActive),
        image: {
          url: String(
            typeof subcategory.image === "string"
              ? subcategory.image
              : subcategory.image?.url || ""
          ).trim(),
          publicId: String(subcategory.image?.publicId || "").trim(),
        },
      };
    })
    .filter((subcategory) => subcategory !== null);
};

const normalizeCategoryPayload = (payload = {}) => ({
  sourceId: normalizeSourceId(payload.sourceId ?? payload.id),
  name: String(payload.name || "").trim(),
  slug: String(payload.slug || slugifyText(payload.name)).trim(),
  icon: String(payload.icon || "").trim(),
  description: String(payload.description || "").trim(),
  displayOrder: normalizeNumber(payload.displayOrder ?? 0),
  isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
  image: {
    url: String(
      typeof payload.image === "string"
        ? payload.image
        : payload.image?.url || payload.heroImage || ""
    ).trim(),
    publicId: String(payload.image?.publicId || payload.heroImagePublicId || "").trim(),
  },
  subcategories: normalizeSubcategories(payload.subcategories),
  metadata: payload.metadata || {},
});

const mapCategory = (category) => ({
  id: category._id,
  sourceId: category.sourceId,
  name: category.name,
  slug: category.slug,
  icon: category.icon,
  description: category.description,
  displayOrder: category.displayOrder,
  isActive: category.isActive,
  image: category.image || { url: "", publicId: "" },
  subcategories: category.subcategories || [],
  metadata: category.metadata || {},
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

// catalogController.js - mapProduct function সম্পূর্ণ আপডেট

const mapProduct = (product) => {
  const productData = product.toObject ? product.toObject() : product;

  return {
    id: productData._id,
    sourceId: productData.sourceId,
    name: productData.name || "",
    sku: productData.sku || "",

    // ✅ ADD THIS - Model Number
    modelNumber: productData.modelNumber || "",

    category: productData.category?._id || productData.category,
    categoryName: productData.categoryName || "",
    categoryIcon: productData.categoryIcon || "",
    subcategoryId: productData.subcategoryId,
    subcategoryName: productData.subcategoryName || "",
    subcategorySlug: productData.subcategorySlug || "",
    pattern: productData.pattern || productData.keyAttributes?.Pattern || "",
    brand: productData.brand || productData.keyAttributes?.Brand || "",
    price: productData.price || "",
    offerPrice: productData.offerPrice || "",
    pricingTiers: productData.pricingTiers || [],
    customizationOptions: productData.customizationOptions || [],
    shipping: productData.shipping || "",
    description: productData.description || "",
    shortDescription: productData.shortDescription || "",
    image: productData.image || { url: "", publicId: "" },
    images: productData.images || [],
    keyAttributes: productData.keyAttributes || {},
    packagingAndDelivery: productData.packagingAndDelivery || {},
    priceSource: productData.priceSource || "",
    userReviews: productData.userReviews || [],
    tags: productData.tags || [],
    isFeatured: productData.isFeatured || false,
    isActive: productData.isActive !== false,
    isNewArrival: productData.isNewArrival || false,
    isBestSeller: productData.isBestSeller || false,
    metadata: productData.metadata || {},
    createdAt: productData.createdAt,
    updatedAt: productData.updatedAt,

    // Tire specifications
    tireType: productData.tireType || "",
    vehicleType: Array.isArray(productData.vehicleTypesList) ? productData.vehicleTypesList : [],
    application: Array.isArray(productData.applicationsList) ? productData.applicationsList : [],
    primaryVehicleType: productData.primaryVehicleType || "",
    primaryApplication: productData.primaryApplication || "",
    vehicleTypesList: Array.isArray(productData.vehicleTypesList) ? productData.vehicleTypesList : [],
    applicationsList: Array.isArray(productData.applicationsList) ? productData.applicationsList : [],

    tireSpecs: {
      size: productData.tireSpecs?.size || "",
      loadIndex: productData.tireSpecs?.loadIndex || "",
      speedRating: productData.tireSpecs?.speedRating || "",
      treadPattern: productData.tireSpecs?.treadPattern || "",
      plyRating: productData.tireSpecs?.plyRating || "",
      loadRange: productData.tireSpecs?.loadRange || "",
      stdRim: productData.tireSpecs?.stdRim || "",
      overallDiameter: productData.tireSpecs?.overallDiameter || "",
      sectionWidth: productData.tireSpecs?.sectionWidth || "",
      treadDepth: productData.tireSpecs?.treadDepth || "",
      maxLoad: productData.tireSpecs?.maxLoad || "",
      maxInflation: productData.tireSpecs?.maxInflation || "",
      constructionType: productData.tireSpecs?.constructionType || "",
      singleMaxLoad: productData.tireSpecs?.singleMaxLoad || "",
      singleMaxPressure: productData.tireSpecs?.singleMaxPressure || "",
      dualMaxLoad: productData.tireSpecs?.dualMaxLoad || "",
      dualMaxPressure: productData.tireSpecs?.dualMaxPressure || "",
      staticLoadRadius: productData.tireSpecs?.staticLoadRadius || "",
      weight: productData.tireSpecs?.weight || "",
      weightUnit: productData.tireSpecs?.weightUnit || "lbs",
      revsPerKm: productData.tireSpecs?.revsPerKm || "",
    },

    resources: productData.resources || {},
    videoUrl: productData.videoUrl || "",
    threeSixtyImages: productData.threeSixtyImages || [],
  };
};

// UPDATED: Enhanced buildQuery with tire-specific filters
const buildQuery = (query = {}) => {
  const clauses = [];

  if (query.search) {
    const regex = { $regex: String(query.search), $options: "i" };
    clauses.push({
      $or: [
        { name: regex },
        { slug: regex },
        { description: regex },
        { mainCategory: regex },
        { subCategory: regex },
        { pattern: regex },
        { "keyAttributes.Pattern": regex },
        { brand: regex },
        { "keyAttributes.Brand": regex },
        { categoryName: regex },
        { subcategoryName: regex },
      ],
    });
  }

  if (query.categoryId && mongoose.Types.ObjectId.isValid(query.categoryId)) {
    clauses.push({ category: query.categoryId });
  }

  if (query.category) {
    clauses.push({ categoryName: { $regex: String(query.category), $options: "i" } });
  }

  if (query.subcategoryId) {
    clauses.push({ subcategoryId: normalizeNumber(query.subcategoryId) });
  }

  if (query.subcategory) {
    clauses.push({ subcategoryName: { $regex: String(query.subcategory), $options: "i" } });
  }

  if (query.pattern) {
    const regex = { $regex: String(query.pattern), $options: "i" };
    clauses.push({ $or: [{ pattern: regex }, { "keyAttributes.Pattern": regex }] });
  }

  if (query.brand) {
    const regex = { $regex: String(query.brand), $options: "i" };
    clauses.push({ $or: [{ brand: regex }, { "keyAttributes.Brand": regex }] });
  }

  // NEW: Tire-specific filters
  if (query.tireType) {
    clauses.push({ tireType: query.tireType });
  }

  if (query.vehicleTypesList) {
    clauses.push({ vehicleTypesList: { $in: [query.vehicleTypesList] } });
  }

  if (query.applicationsList) {
    clauses.push({ applicationsList: { $in: [query.applicationsList] } });
  }

  if (query.tireSize) {
    clauses.push({ 'tireSpecs.size': { $regex: String(query.tireSize), $options: 'i' } });
  }

  if (query.loadIndex) {
    clauses.push({ 'tireSpecs.loadIndex': query.loadIndex });
  }

  if (query.speedRating) {
    clauses.push({ 'tireSpecs.speedRating': query.speedRating });
  }

  if (query.minLoadIndex) {
    clauses.push({ 'tireSpecs.loadIndex': { $gte: query.minLoadIndex } });
  }

  if (query.isActive !== undefined) {
    clauses.push({ isActive: query.isActive === "true" || query.isActive === true });
  }

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
};

const syncProductCategoryFields = async (productPayload) => {
  const candidateCategoryId = productPayload.category && mongoose.Types.ObjectId.isValid(String(productPayload.category))
    ? String(productPayload.category)
    : "";

  if (!candidateCategoryId && !productPayload.mainCategory && !productPayload.categoryName) {
    return productPayload;
  }

  const category = candidateCategoryId
    ? await Category.findById(candidateCategoryId)
    : await Category.findOne({
      $or: [
        { name: productPayload.mainCategory },
        { slug: slugifyText(productPayload.mainCategory) },
        { name: productPayload.categoryName },
        { slug: slugifyText(productPayload.categoryName) },
      ],
    });

  if (!category) return productPayload;

  const subcategory = category.subcategories.find((item) => String(item.id) === String(productPayload.subcategoryId));

  return {
    ...productPayload,
    categoryName: category.name,
    categoryIcon: category.icon,
    mainCategory: category.name,
    subCategory: subcategory?.name || productPayload.subCategory || productPayload.subcategoryName,
    subcategoryName: subcategory?.name || productPayload.subcategoryName,
    subcategorySlug: subcategory?.slug || productPayload.subcategorySlug,
    category: category._id,
  };
};

const findProductByRouteId = async (routeId, { populate = false } = {}) => {
  const value = String(routeId || "").trim();
  if (!value) return null;

  const numericSourceId = Number.parseInt(value, 10);
  const candidates = [];

  if (mongoose.Types.ObjectId.isValid(value)) {
    candidates.push({ _id: value });
  }
  if (Number.isFinite(numericSourceId)) {
    candidates.push({ sourceId: numericSourceId });
  }
  if (!candidates.length) return null;

  let query = Product.findOne(candidates.length === 1 ? candidates[0] : { $or: candidates });
  if (populate) query = query.populate("category");
  return await query.exec();
};

const uploadBufferToCloudinary = (buffer, filename) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_CATALOG_FOLDER || "asian-import-export/catalog",
        resource_type: "image",
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

const downloadUrlToBuffer = (urlString) =>
  new Promise((resolve, reject) => {
    try {
      const parsedUrl = url.parse(urlString);
      const protocol = parsedUrl.protocol === "https:" ? https : http;
      const basename = path.basename(parsedUrl.pathname || "image.jpg");

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

// ==================== CATEGORY CONTROLLERS ====================

const listCategories = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const sortBy = String(req.query.sort || "main-asc").trim();
    const paginate = req.query.paginate === "true" || req.query.page || req.query.limit;
    const statusFilter = String(req.query.isActive || "all").trim().toLowerCase();

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { "subcategories.name": { $regex: search, $options: "i" } },
      ];
    }

    if (statusFilter === "true" || statusFilter === "active") {
      filter.isActive = true;
    } else if (statusFilter === "false" || statusFilter === "inactive") {
      filter.isActive = false;
    }

    const sortStage =
      sortBy === "main-desc"
        ? { name: -1 }
        : sortBy === "sub-asc"
          ? { subcategoryCount: 1, name: 1 }
          : sortBy === "sub-desc"
            ? { subcategoryCount: -1, name: 1 }
            : { name: 1 };

    if (!paginate) {
      const categories = await Category.aggregate([
        { $match: filter },
        {
          $addFields: {
            subcategoryCount: { $size: { $ifNull: ["$subcategories", []] } },
          },
        },
        { $sort: sortStage },
      ]);
      return res.json({ success: true, categories: categories.map(mapCategory) });
    }

    const { page, limit, skip } = buildPaging(req.query, { defaultLimit: 20, maxLimit: 100 });

    const [categories, total] = await Promise.all([
      Category.aggregate([
        { $match: filter },
        {
          $addFields: {
            subcategoryCount: { $size: { $ifNull: ["$subcategories", []] } },
          },
        },
        { $sort: sortStage },
        { $skip: skip },
        { $limit: limit },
      ]),
      Category.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      success: true,
      categories: categories.map(mapCategory),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createCategory = async (req, res) => {
  try {
    const payload = normalizeCategoryPayload(req.body);

    if (!payload.name) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const exists = await Category.findOne({ $or: [{ slug: payload.slug }, { name: payload.name }] });
    if (exists) {
      return res.status(409).json({ success: false, message: "Category already exists" });
    }

    const category = await Category.create(payload);
    res.status(201).json({ success: true, category: mapCategory(category) });
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const payload = normalizeCategoryPayload(req.body);

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    category.name = payload.name || category.name;
    category.slug = payload.slug || category.slug;
    category.icon = payload.icon;
    category.description = payload.description;
    category.displayOrder = payload.displayOrder;
    category.isActive = payload.isActive;
    category.image = payload.image;

    if (req.body.subcategories !== undefined) {
      category.subcategories = payload.subcategories;
    }

    category.metadata = payload.metadata;

    await category.save();
    res.json({ success: true, category: mapCategory(category) });
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    await Product.deleteMany({ category: category._id });
    await category.deleteOne();
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PRODUCT CONTROLLERS ====================

const listProducts = async (req, res) => {
  try {
    const filter = buildQuery(req.query);
    const { page, limit, skip } = buildPaging(req.query, { defaultLimit: 20, maxLimit: 100 });

    const sortBy = String(req.query.sort || "newest");
    let sort = { createdAt: -1 };
    if (sortBy === "name-asc") sort = { name: 1, createdAt: -1 };
    else if (sortBy === "name-desc") sort = { name: -1, createdAt: -1 };
    else if (sortBy === "brand-asc") sort = { brand: 1, name: 1 };
    else if (sortBy === "brand-desc") sort = { brand: -1, name: 1 };

    const buildFacetFilter = (excludeField) => {
      const clauses = [];

      if (req.query.search) {
        const regex = { $regex: String(req.query.search), $options: "i" };
        clauses.push({
          $or: [
            { name: regex },
            { slug: regex },
            { description: regex },
            { mainCategory: regex },
            { subCategory: regex },
            { pattern: regex },
            { "keyAttributes.Pattern": regex },
            { brand: regex },
            { "keyAttributes.Brand": regex },
            { categoryName: regex },
            { subcategoryName: regex },
          ],
        });
      }

      if (req.query.categoryId && excludeField !== "categoryId" && mongoose.Types.ObjectId.isValid(req.query.categoryId)) {
        clauses.push({ category: req.query.categoryId });
      }

      if (req.query.category && excludeField !== "category") {
        clauses.push({ categoryName: { $regex: String(req.query.category), $options: "i" } });
      }

      if (req.query.subcategoryId && excludeField !== "subcategoryId") {
        clauses.push({ subcategoryId: normalizeNumber(req.query.subcategoryId) });
      }

      if (req.query.subcategory && excludeField !== "subcategory") {
        clauses.push({ subcategoryName: { $regex: String(req.query.subcategory), $options: "i" } });
      }

      if (req.query.pattern && excludeField !== "pattern") {
        const regex = { $regex: String(req.query.pattern), $options: "i" };
        clauses.push({ $or: [{ pattern: regex }, { "keyAttributes.Pattern": regex }] });
      }

      if (req.query.brand && excludeField !== "brand") {
        const regex = { $regex: String(req.query.brand), $options: "i" };
        clauses.push({ $or: [{ brand: regex }, { "keyAttributes.Brand": regex }] });
      }

      // Tire-specific facet filters
      if (req.query.tireType && excludeField !== "tireType") {
        clauses.push({ tireType: req.query.tireType });
      }

      if (req.query.vehicleTypesList && excludeField !== "vehicleTypesList") {
        clauses.push({ vehicleTypesList: { $in: [req.query.vehicleTypesList] } });
      }

      if (req.query.applicationsList && excludeField !== "applicationsList") {
        clauses.push({ applicationsList: { $in: [req.query.applicationsList] } });
      }

      if (req.query.isActive !== undefined) {
        clauses.push({ isActive: req.query.isActive === "true" || req.query.isActive === true });
      }

      if (!clauses.length) return {};
      if (clauses.length === 1) return clauses[0];
      return { $and: clauses };
    };

    const facetFilters = {
      brand: buildFacetFilter("brand"),
      category: buildFacetFilter("category"),
      subcategory: buildFacetFilter("subcategoryId"),
      pattern: buildFacetFilter("pattern"),
      tireType: buildFacetFilter("tireType"),
      vehicleTypesList: buildFacetFilter("vehicleTypesList"),
      applicationsList: buildFacetFilter("applicationsList"),
    };

    const [products, total, allCategories, brandsDirect, brandsFromAttributes, patternsDirect, patternsFromAttributes, tireTypes, vehicleTypesLists, applicationsLists, tireSizes] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).populate("category"),
      Product.countDocuments(filter),
      Category.find({ isActive: true }).select("name subcategories").lean(),
      Product.distinct("brand", facetFilters.brand),
      Product.distinct("keyAttributes.Brand", facetFilters.brand),
      Product.distinct("pattern", facetFilters.pattern),
      Product.distinct("keyAttributes.Pattern", facetFilters.pattern),
      Product.distinct("tireType", facetFilters.tireType),
      Product.distinct("vehicleTypesList", facetFilters.vehicleTypesList),
      Product.distinct("applicationsList", facetFilters.applicationsList),
      Product.distinct("tireSpecs.size", facetFilters.tireType),
    ]);

    const categoryMap = {};
    allCategories.forEach((cat) => {
      const catName = String(cat.name || "").trim();
      if (catName) {
        categoryMap[catName] = (cat.subcategories || [])
          .map((sub) => String(sub.name || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
      }
    });

    const categories = Object.keys(categoryMap).sort((a, b) => a.localeCompare(b));
    const subcategories = Object.values(categoryMap)
      .flat()
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b));

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const brands = Array.from(
      new Set(
        [...(brandsDirect || []), ...(brandsFromAttributes || [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    const patterns = Array.from(
      new Set(
        [...(patternsDirect || []), ...(patternsFromAttributes || [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    const tireSizeList = Array.from(
      new Set(
        (tireSizes || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      products: products.map(mapProduct),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        categories,
        subcategories,
        categoryMap,
        brands,
        patterns,
        tireTypes: tireTypes.filter(t => t),
        vehicleTypesLists: vehicleTypesLists.flat().filter(v => v),
        applicationsLists: applicationsLists.flat().filter(a => a),
        tireSizes: tireSizeList,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const getProduct = async (req, res) => {
  try {
    const product = await findProductByRouteId(req.params.productId, { populate: true });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Debug log - দেখুন ডাটাবেস থেকে কি আসছে
    console.log('Raw Product from DB:', {
      id: product._id,
      name: product.name,
      tireType: product.tireType,
      vehicleTypesList: product.vehicleTypesList,
      applicationsList: product.applicationsList,
      tireSpecs: product.tireSpecs
    });

    const mappedProduct = mapProduct(product);

    // Debug log - ম্যাপ করার পর কি হচ্ছে
    console.log('Mapped Product:', {
      tireType: mappedProduct.tireType,
      vehicleType: mappedProduct.vehicleType,
      application: mappedProduct.application,
      tireSpecs: mappedProduct.tireSpecs
    });

    res.json({ success: true, product: mappedProduct });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    const resolvedPayload = await syncProductCategoryFields(payload);
    if (!resolvedPayload.category) {
      return res.status(400).json({ success: false, message: "Product main category is required" });
    }

    const product = await Product.create(resolvedPayload);
    res.status(201).json({ success: true, product: mapProduct(product) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await findProductByRouteId(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const payload = await syncProductCategoryFields(normalizeProductPayload(req.body));

    const wasFeatured = product.isFeatured;
    const willBeFeatured = payload.isFeatured;

    Object.assign(product, payload);
    await product.save();

    if (willBeFeatured && !wasFeatured) {
      const FeaturedProduct = require("../models/FeaturedProduct");
      const existing = await FeaturedProduct.findOne({ productId: product._id });
      if (!existing) {
        await FeaturedProduct.create({
          productId: product._id,
          order: 0,
          addedBy: req.authUser?.email || "system",
          isActive: true
        });
      }
    } else if (!willBeFeatured && wasFeatured) {
      const FeaturedProduct = require("../models/FeaturedProduct");
      await FeaturedProduct.findOneAndDelete({ productId: product._id });
    }

    res.json({ success: true, product: mapProduct(product) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await findProductByRouteId(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await product.deleteOne();
    res.json({ success: true, message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== TIRE FINDER TOOL ====================

const getRecommendationReason = (tire, criteria) => {
  const reasons = [];
  if (criteria.roadType === 'highway' && tire.applicationsList?.includes('highway')) {
    reasons.push('Optimized for highway fuel efficiency');
  }
  if (criteria.roadType === 'mixed' && tire.applicationsList?.includes('mixed-service')) {
    reasons.push('Designed for mixed on/off-road conditions');
  }
  if (criteria.roadType === 'off-road' && (tire.applicationsList?.includes('off-road') || tire.applicationsList?.includes('mining'))) {
    reasons.push('Heavy-duty off-road construction for maximum durability');
  }
  if (criteria.loadWeight === 'heavy' && tire.tireSpecs?.loadIndex >= 150) {
    reasons.push('Heavy load capacity suitable for your requirements');
  }
  if (criteria.loadWeight === 'light' && tire.tireSpecs?.loadIndex < 140) {
    reasons.push('Light load rating matches your fleet needs');
  }
  if (criteria.vehicleTypesList === 'truck' && tire.vehicleTypesList?.includes('truck')) {
    reasons.push('Specifically designed for truck applicationsLists');
  }
  return reasons.join('. ') || 'Recommended based on your criteria';
};

const findTiresByCriteria = async (req, res) => {
  try {
    const {
      vehicleTypesList,
      roadType,
      loadWeight,
      tireSize,
      applicationsList
    } = req.query;

    const filter = { isActive: true };

    if (vehicleTypesList) {
      filter.vehicleTypesList = { $in: [vehicleTypesList] };
    }

    if (roadType === 'highway') {
      filter.applicationsList = { $in: ['highway', 'regional'] };
    } else if (roadType === 'mixed') {
      filter.applicationsList = { $in: ['mixed-service', 'regional'] };
    } else if (roadType === 'off-road') {
      filter.applicationsList = { $in: ['off-road', 'mining', 'construction'] };
    }

    if (loadWeight === 'heavy') {
      filter['tireSpecs.loadIndex'] = { $gte: '150' };
    } else if (loadWeight === 'medium') {
      filter['tireSpecs.loadIndex'] = { $gte: '140', $lte: '149' };
    }

    if (tireSize) {
      filter['tireSpecs.size'] = { $regex: tireSize, $options: 'i' };
    }

    if (applicationsList) {
      filter.applicationsList = { $in: [applicationsList] };
    }

    const recommendedTires = await Product.find(filter)
      .limit(10)
      .populate('category');

    const results = recommendedTires.map(tire => ({
      ...mapProduct(tire),
      recommendationReason: getRecommendationReason(tire, { vehicleTypesList, roadType, loadWeight })
    }));

    res.json({
      success: true,
      criteria: { vehicleTypesList, roadType, loadWeight, tireSize, applicationsList },
      recommendations: results,
      total: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== COMPARE TIRES ====================

const compareTires = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: "At least 2 tire models required for comparison"
      });
    }

    if (productIds.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 tires can be compared at once"
      });
    }

    const tires = await Product.find({
      _id: { $in: productIds },
      isActive: true
    }).populate('category');

    if (tires.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: "Some tire models not found"
      });
    }

    const comparisonData = tires.map(tire => ({
      id: tire._id,
      name: tire.name,
      pattern: tire.pattern,
      image: tire.image,
      category: tire.categoryName,
      specs: {
        size: tire.tireSpecs?.size,
        loadIndex: tire.tireSpecs?.loadIndex,
        speedRating: tire.tireSpecs?.speedRating,
        treadPattern: tire.tireSpecs?.treadPattern,
        plyRating: tire.tireSpecs?.plyRating,
        treadDepth: tire.tireSpecs?.treadDepth,
        stdRim: tire.tireSpecs?.stdRim,
        overallDiameter: tire.tireSpecs?.overallDiameter,
        sectionWidth: tire.tireSpecs?.sectionWidth,
        maxLoad: tire.tireSpecs?.maxLoad,
        maxInflation: tire.tireSpecs?.maxInflation,
      },
      classification: {
        tireType: tire.tireType,
        vehicleTypesList: tire.vehicleTypesList,
        applicationsList: tire.applicationsList
      },
      features: {
        description: tire.shortDescription || tire.description?.substring(0, 200),
        brochure: tire.resources?.brochure?.url,
        datasheet: tire.resources?.datasheet?.url
      }
    }));

    res.json({
      success: true,
      comparison: comparisonData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== B2B INQUIRY ====================

const createB2BInquiry = async (req, res) => {
  try {
    const Inquiry = require("../models/Inquiry");

    const {
      companyName,
      companyType,
      contactPerson,
      email,
      phone,
      country,
      city,
      address,
      items,
      message,
      preferredContactMethod,
      preferredCurrency,
      deliveryTerm,
      expectedDeliveryDate,
      priority
    } = req.body;

    // Validation
    if (!companyName || !contactPerson || !email || !phone || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyName, contactPerson, email, phone, and at least one item"
      });
    }

    const inquiryNumber = `INQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const productIds = items.map(item => item.productId).filter(id => id);
    const products = productIds.length ? await Product.find({ _id: { $in: productIds } }) : [];
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const inquiryItems = items.map(item => {
      const product = item.productId ? productMap.get(item.productId) : null;
      return {
        productId: item.productId,
        tireModel: product?.name || item.tireModel,
        tireSize: product?.tireSpecs?.size || item.tireSize,
        quantity: item.quantity,
        applicationsList: item.applicationsList,
        specialRequirements: item.specialRequirements
      };
    });

    const inquiry = await Inquiry.create({
      inquiryNumber,
      customer: req.authUser?._id || null,
      customerSnapshot: {
        name: contactPerson,
        email,
        phone,
        companyName,
        companyType: companyType || 'fleet_owner',
        address: address || '',
        city: city || '',
        country: country || '',
        notes: message
      },
      items: inquiryItems,
      status: 'new',
      priority: priority || 'medium',
      source: 'website_form',
      preferredCurrency: preferredCurrency || 'USD',
      deliveryTerm: deliveryTerm || 'FOB',
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      contactChannel: preferredContactMethod || 'email'
    });

    res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      inquiryNumber: inquiry.inquiryNumber,
      inquiryId: inquiry._id
    });
  } catch (error) {
    console.error("B2B Inquiry error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DEALER LOCATOR ====================

const findNearbyDealers = async (req, res) => {
  try {
    const Dealer = require("../models/Dealer");
    const { lat, lng, maxDistance = 50000, country, city, search } = req.query;

    let filter = { isActive: true, isAuthorized: true };

    if (country) filter['address.country'] = { $regex: country, $options: 'i' };
    if (city) filter['address.city'] = { $regex: city, $options: 'i' };

    let dealers;

    if (lat && lng) {
      dealers = await Dealer.find({
        ...filter,
        'address.location': {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(maxDistance)
          }
        }
      }).limit(20);
    } else if (search) {
      dealers = await Dealer.find({
        ...filter,
        $text: { $search: search }
      }).limit(20);
    } else {
      dealers = await Dealer.find(filter).limit(20);
    }

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      if (!lat1 || !lon1) return null;
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c * 10) / 10;
    };

    res.json({
      success: true,
      dealers: dealers.map(dealer => ({
        id: dealer._id,
        name: dealer.name,
        company: dealer.company,
        fullAddress: dealer.fullAddress,
        address: dealer.address,
        phone: dealer.phone,
        email: dealer.email,
        website: dealer.website,
        workingHours: dealer.workingHours,
        isAuthorized: dealer.isAuthorized,
        certifications: dealer.certifications,
        specialties: dealer.specialties,
        distance: (lat && lng && dealer.address.location?.coordinates) ?
          calculateDistance(parseFloat(lat), parseFloat(lng),
            dealer.address.location.coordinates[1],
            dealer.address.location.coordinates[0]) : null
      }))
    });
  } catch (error) {
    console.error("Dealer locator error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== MEDIA CONTROLLERS ====================

const listMedia = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const paginate = req.query.paginate === "true" || req.query.page || req.query.limit;
    const { page, limit, skip } = buildPaging(req.query, { defaultLimit: 24, maxLimit: 200 });
    const filter = search
      ? {
        $or: [
          { originalFilename: { $regex: search, $options: "i" } },
          { publicId: { $regex: search, $options: "i" } },
          { folder: { $regex: search, $options: "i" } },
        ],
      }
      : {};

    if (!paginate) {
      const media = await MediaAsset.find(filter).sort({ createdAt: -1 });
      return res.json({
        success: true,
        media,
        pagination: {
          page: 1,
          limit: media.length || 1,
          total: media.length,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    const [media, total] = await Promise.all([
      MediaAsset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      MediaAsset.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      success: true,
      media,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required" });
    }

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname);
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};

    const media = await MediaAsset.create({
      publicId: uploaded.public_id,
      assetType: uploaded.resource_type || "image",
      format: uploaded.format || "",
      originalFilename: uploaded.originalFilename || req.file.originalname,
      url: uploaded.secure_url,
      optimizedUrl: uploaded.optimizedUrl,
      bytes: uploaded.bytes || 0,
      width: uploaded.width || 0,
      height: uploaded.height || 0,
      folder: uploaded.folder || process.env.CLOUDINARY_CATALOG_FOLDER || "asian-import-export/catalog",
      relatedType: req.body.relatedType || "",
      relatedId: req.body.relatedId || "",
      uploadedBy: {
        id: String(req.authUser?._id || req.authUser?.id || ""),
        name: String(req.authUser?.fullName || ""),
        role: String(req.authUser?.role || ""),
        email: String(req.authUser?.email || ""),
      },
      metadata,
    });

    res.status(201).json({ success: true, media });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadMediaFromUrl = async (req, res) => {
  try {
    const imageUrl = String(req.body.url || "").trim();
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "Image URL is required" });
    }

    try {
      new url.URL(imageUrl);
    } catch (_error) {
      return res.status(400).json({ success: false, message: "Invalid URL format" });
    }

    const { buffer, filename } = await downloadUrlToBuffer(imageUrl);
    const uploaded = await uploadBufferToCloudinary(buffer, filename);
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};

    const media = await MediaAsset.create({
      publicId: uploaded.public_id,
      assetType: uploaded.resource_type || "image",
      format: uploaded.format || "",
      originalFilename: uploaded.originalFilename || filename,
      url: uploaded.secure_url,
      optimizedUrl: uploaded.optimizedUrl,
      bytes: uploaded.bytes || 0,
      width: uploaded.width || 0,
      height: uploaded.height || 0,
      folder: uploaded.folder || process.env.CLOUDINARY_CATALOG_FOLDER || "asian-import-export/catalog",
      relatedType: req.body.relatedType || "",
      relatedId: req.body.relatedId || "",
      uploadedBy: {
        id: String(req.authUser?._id || req.authUser?.id || ""),
        name: String(req.authUser?.fullName || ""),
        role: String(req.authUser?.role || ""),
        email: String(req.authUser?.email || ""),
      },
      metadata: {
        ...metadata,
        sourceUrl: imageUrl,
      },
    });

    res.status(201).json({ success: true, media });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteMedia = async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.publicId);
    const media = await MediaAsset.findOne({ publicId });

    if (!media) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: media.assetType || "image" });
    await MediaAsset.deleteOne({ publicId });

    await Product.updateMany(
      { $or: [{ "image.publicId": publicId }, { "images.publicId": publicId }] },
      {
        $set: {
          "image.url": "",
          "image.publicId": "",
        },
        $pull: { images: { publicId } },
      }
    );

    await Category.updateMany(
      { "image.publicId": publicId },
      {
        $set: {
          "image.url": "",
          "image.publicId": "",
        },
      }
    );

    res.json({ success: true, message: "Media deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== IMPORT ====================

const importCatalogFromJson = async (_req, res) => {
  try {
    const catalogPath = getFrontendCatalogPath();
    const raw = await fs.readFile(catalogPath, "utf8");
    const parsed = JSON.parse(raw);
    const categories = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.categories) ? parsed.categories : [];

    let categoryCount = 0;
    let productCount = 0;

    for (const sourceCategory of categories) {
      const categoryPayload = normalizeCategoryPayload(sourceCategory);
      categoryPayload.image = await uploadCatalogAsset(sourceCategory.image || sourceCategory.heroImage || "", sourceCategory.name);
      const category = await Category.findOneAndUpdate(
        { sourceId: categoryPayload.sourceId || sourceCategory.id, slug: categoryPayload.slug },
        { $set: categoryPayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await upsertImportedMediaAsset({
        asset: categoryPayload.image,
        originalFilename: sourceCategory.name,
        relatedType: "category-image",
        relatedId: category._id,
        metadata: { source: "catalog-import", categoryName: category.name },
      });

      categoryCount += 1;

      for (const sourceSubcategory of sourceCategory.subcategories || []) {
        for (const sourceProduct of sourceSubcategory.products || []) {
          const productPayload = normalizeProductPayload({
            ...sourceProduct,
            category: category._id,
            mainCategory: category.name,
            categoryName: category.name,
            categoryIcon: category.icon,
            subcategoryId: sourceSubcategory.id,
            subcategoryName: sourceSubcategory.name,
            subCategory: sourceSubcategory.name,
            subcategorySlug: slugifyText(sourceSubcategory.name),
          });

          productPayload.image = await uploadCatalogAsset(sourceProduct.image || "", sourceProduct.name);
          productPayload.images = await Promise.all(
            (sourceProduct.images || []).map((asset, index) =>
              uploadCatalogAsset(asset, `${sourceProduct.name} ${index + 1}`)
            )
          );

          const existingProduct = await resolveExistingProductForImport(productPayload);
          let product;
          if (existingProduct) {
            Object.assign(existingProduct, productPayload);
            product = await existingProduct.save();
          } else {
            product = await Product.create(productPayload);
          }

          await upsertImportedMediaAsset({
            asset: productPayload.image,
            originalFilename: sourceProduct.name,
            relatedType: "product-image",
            relatedId: product._id,
            metadata: {
              source: "catalog-import",
              categoryName: category.name,
              subcategoryName: sourceSubcategory.name,
              productName: sourceProduct.name,
            },
          });

          for (const [index, galleryAsset] of (productPayload.images || []).entries()) {
            await upsertImportedMediaAsset({
              asset: galleryAsset,
              originalFilename: `${sourceProduct.name} ${index + 1}`,
              relatedType: "product-gallery",
              relatedId: product._id,
              metadata: {
                source: "catalog-import",
                categoryName: category.name,
                subcategoryName: sourceSubcategory.name,
                productName: sourceProduct.name,
                index,
              },
            });
          }

          productCount += 1;
        }
      }
    }

    if (!categories.length && Array.isArray(parsed?.products)) {
      for (const sourceProduct of parsed.products) {
        const productPayload = normalizeProductPayload(sourceProduct);
        if (!productPayload.name) continue;

        productPayload.image = await uploadCatalogAsset(sourceProduct.image || "", sourceProduct.name);
        productPayload.images = await Promise.all(
          (sourceProduct.images || []).map((asset, index) =>
            uploadCatalogAsset(asset, `${sourceProduct.name} ${index + 1}`)
          )
        );

        const category = await Category.findOne({
          $or: [
            { name: sourceProduct.mainCategory },
            { slug: slugifyText(sourceProduct.mainCategory) },
          ],
        });

        if (category) {
          productPayload.category = category._id;
          productPayload.mainCategory = category.name;
          productPayload.categoryName = category.name;
          productPayload.categoryIcon = category.icon;

          const subcategory = category.subcategories.find((item) => item.name === sourceProduct.subCategory || item.name === sourceProduct.subcategoryName);
          productPayload.subcategoryId = subcategory?.id || productPayload.subcategoryId || 0;
          productPayload.subcategoryName = subcategory?.name || productPayload.subCategory || productPayload.subcategoryName;
          productPayload.subCategory = subcategory?.name || productPayload.subCategory || productPayload.subcategoryName;
          productPayload.subcategorySlug = subcategory?.slug || productPayload.subcategorySlug || slugifyText(productPayload.subcategoryName);
        }

        const existingProduct = await resolveExistingProductForImport(productPayload);
        let product;
        if (existingProduct) {
          Object.assign(existingProduct, productPayload);
          product = await existingProduct.save();
        } else {
          product = await Product.create(productPayload);
        }

        await upsertImportedMediaAsset({
          asset: productPayload.image,
          originalFilename: sourceProduct.name,
          relatedType: "product-image",
          relatedId: product._id,
          metadata: {
            source: "catalog-import",
            categoryName: productPayload.categoryName,
            subcategoryName: productPayload.subcategoryName,
            productName: sourceProduct.name,
          },
        });

        for (const [index, galleryAsset] of (productPayload.images || []).entries()) {
          await upsertImportedMediaAsset({
            asset: galleryAsset,
            originalFilename: `${sourceProduct.name} ${index + 1}`,
            relatedType: "product-gallery",
            relatedId: product._id,
            metadata: {
              source: "catalog-import",
              categoryName: productPayload.categoryName,
              subcategoryName: productPayload.subcategoryName,
              productName: sourceProduct.name,
              index,
            },
          });
        }

        productCount += 1;
      }
    }

    res.json({ success: true, message: "Catalog imported from JSON", categoryCount, productCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
/**
 * Get complete product details for public view with all specifications
 * GET /api/products/:productId/details
 */
const getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    const { includeRelated = 'true', limit = 6 } = req.query;

    // Find product with population
    const product = await findProductByRouteId(productId, { populate: true });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Check if product is active for public view
    if (!product.isActive && !req.authUser) {
      return res.status(404).json({
        success: false,
        message: "Product not available"
      });
    }

    // Get specifications
    const specifications = getProductSpecifications(product);

    // Get features
    const features = getProductFeatures(product);

    // Get tire classification details
    const tireClassification = {
      tireType: product.tireType,
      vehicleTypes: product.vehicleTypesList || [],
      applications: product.applicationsList || [],
      primaryVehicleType: product.primaryVehicleType,
      primaryApplication: product.primaryApplication
    };

    // Calculate ratings
    const reviews = product.userReviews || [];
    const averageRating = calculateAverageRating(reviews);
    const ratingDistribution = getRatingDistribution(reviews);
    const totalReviews = reviews.length;
    const verifiedReviews = reviews.filter(r => r.verified);

    // Get pricing information
    const pricing = {
      regularPrice: product.price,
      offerPrice: product.offerPrice,
      discountPercentage: calculateDiscountPercentage(product.price, product.offerPrice),
      pricingTiers: product.pricingTiers || [],
      hasVolumeDiscount: (product.pricingTiers || []).length > 0
    };

    // Get related products
    let relatedProducts = [];
    if (includeRelated === 'true') {
      relatedProducts = await getRelatedProducts(product, parseInt(limit));
    }

    // Get similar products by size
    const similarBySize = await getSimilarBySize(product, parseInt(limit));

    // Prepare response
    const response = {
      success: true,
      product: {
        // Basic info
        id: product._id,
        sourceId: product.sourceId,
        name: product.name,
        modelNumber: product.modelNumber,
        sku: product.sku,
        brand: product.brand,
        pattern: product.pattern,

        // Descriptions
        description: product.description,
        shortDescription: product.shortDescription,

        // Pricing
        price: product.price,
        offerPrice: product.offerPrice,
        pricing,

        // Media
        image: product.image,
        images: product.images,
        videoUrl: product.videoUrl,
        threeSixtyImages: product.threeSixtyImages,

        // Downloads
        resources: product.resources,

        // Categories
        category: product.category,
        categoryName: product.categoryName,
        subcategoryName: product.subcategoryName,

        // Tire classification
        tireType: product.tireType,
        vehicleType: product.vehicleTypesList || [],
        application: product.applicationsList || [],
        primaryVehicleType: product.primaryVehicleType,
        primaryApplication: product.primaryApplication,
        tireClassification,

        // Specifications and Features
        specifications,
        features,
        tireSpecs: product.tireSpecs || {},
        technicalSpecs: product.tireSpecs || {},

        // Additional info
        shipping: product.shipping,
        customizationOptions: product.customizationOptions,
        packagingAndDelivery: product.packagingAndDelivery,
        tags: product.tags,

        // Status
        isNewArrival: product.isNewArrival,
        isBestSeller: product.isBestSeller,
        isActive: product.isActive,

        // Reviews
        reviews: {
          average: averageRating,
          total: totalReviews,
          distribution: ratingDistribution,
          verified: verifiedReviews.length,
          list: reviews.slice(0, 5) // Last 5 reviews
        },

        // Timestamps
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      },
      relatedProducts: relatedProducts.map(p => ({
        id: p._id,
        name: p.name,
        brand: p.brand,
        pattern: p.pattern,
        price: p.price,
        offerPrice: p.offerPrice,
        image: p.image,
        tireSize: p.tireSpecs?.size
      })),
      similarBySize: similarBySize.map(p => ({
        id: p._id,
        name: p.name,
        brand: p.brand,
        price: p.price,
        offerPrice: p.offerPrice,
        image: p.image
      }))
    };

    // Increment view count (optional)
    await Product.findByIdAndUpdate(product._id, { $inc: { views: 1 } });

    res.json(response);

  } catch (error) {
    console.error('Get product details error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product specifications as key-value pairs
 * @param {Object} product - Product document
 * @returns {Array} Array of specification objects
 */
const getProductSpecifications = (product) => {
  const specs = [];

  // Basic specifications
  if (product.brand) specs.push({ label: "Brand", value: product.brand });
  if (product.pattern) specs.push({ label: "Pattern", value: product.pattern });
  if (product.modelNumber) specs.push({ label: "Model Number", value: product.modelNumber });

  // Tire specifications
  const tireSpecs = product.tireSpecs || {};
  if (tireSpecs.size) specs.push({ label: "Tire Size", value: tireSpecs.size });
  if (tireSpecs.loadIndex) specs.push({ label: "Load Index", value: tireSpecs.loadIndex });
  if (tireSpecs.speedRating) specs.push({ label: "Speed Rating", value: tireSpecs.speedRating });
  if (tireSpecs.treadPattern) specs.push({ label: "Tread Pattern", value: tireSpecs.treadPattern });
  if (tireSpecs.plyRating) specs.push({ label: "Ply Rating", value: tireSpecs.plyRating });
  if (tireSpecs.loadRange) specs.push({ label: "Load Range", value: tireSpecs.loadRange });
  if (tireSpecs.stdRim) specs.push({ label: "Standard Rim", value: tireSpecs.stdRim });
  if (tireSpecs.overallDiameter) specs.push({ label: "Overall Diameter", value: tireSpecs.overallDiameter });
  if (tireSpecs.sectionWidth) specs.push({ label: "Section Width", value: tireSpecs.sectionWidth });
  if (tireSpecs.treadDepth) specs.push({ label: "Tread Depth", value: tireSpecs.treadDepth });
  if (tireSpecs.maxLoad) specs.push({ label: "Max Load (Single)", value: tireSpecs.maxLoad });
  if (tireSpecs.maxInflation) specs.push({ label: "Max Inflation Pressure", value: tireSpecs.maxInflation });
  if (tireSpecs.constructionType) {
    const constructionLabel = tireSpecs.constructionType === 'TL' ? 'Tubeless' :
      tireSpecs.constructionType === 'TT' ? 'Tube Type' : 'Both';
    specs.push({ label: "Construction", value: constructionLabel });
  }

  // Additional load specifications
  if (tireSpecs.singleMaxLoad && tireSpecs.singleMaxPressure) {
    specs.push({
      label: "Single Configuration",
      value: `${tireSpecs.singleMaxLoad} @ ${tireSpecs.singleMaxPressure} psi`
    });
  }

  if (tireSpecs.dualMaxLoad && tireSpecs.dualMaxPressure) {
    specs.push({
      label: "Dual Configuration",
      value: `${tireSpecs.dualMaxLoad} @ ${tireSpecs.dualMaxPressure} psi`
    });
  }

  if (tireSpecs.staticLoadRadius) specs.push({
    label: "Static Load Radius",
    value: `${tireSpecs.staticLoadRadius}"`
  });

  if (tireSpecs.weight) specs.push({
    label: "Weight",
    value: `${tireSpecs.weight} ${tireSpecs.weightUnit || 'lbs'}`
  });

  if (tireSpecs.revsPerKm) specs.push({
    label: "Revolutions per km",
    value: tireSpecs.revsPerKm
  });

  return specs;
};

/**
 * Get product features as array of strings
 * @param {Object} product - Product document
 * @returns {Array} Array of feature strings
 */
const getProductFeatures = (product) => {
  const features = [];

  // Tire type features
  if (product.tireType) {
    const tireTypeFeatures = {
      'steer': 'Optimized for steering axles with excellent handling',
      'drive': 'Maximum traction for drive axles with superior grip',
      'trailer': 'Free-rolling design for trailers with low rolling resistance',
      'all-position': 'Versatile tire suitable for any axle position',
      'off-road': 'Heavy-duty construction for rough terrain durability',
      'mining': 'Extreme durability for harsh mining operations'
    };
    if (tireTypeFeatures[product.tireType]) {
      features.push(tireTypeFeatures[product.tireType]);
    }
  }

  // Vehicle applications
  if (product.vehicleTypesList && product.vehicleTypesList.length > 0) {
    const vehicleLabels = {
      'truck': 'Truck',
      'bus': 'Bus',
      'otr': 'Off-The-Road Equipment',
      'industrial': 'Industrial Vehicles',
      'mining': 'Mining Equipment',
      'agricultural': 'Agricultural Vehicles'
    };
    const vehicles = product.vehicleTypesList.map(v => vehicleLabels[v] || v);
    features.push(`Compatible with: ${vehicles.join(', ')}`);
  }

  // Road applications
  if (product.applicationsList && product.applicationsList.length > 0) {
    const appLabels = {
      'highway': 'Highway/Long Haul - Fuel efficient',
      'regional': 'Regional Distribution - Versatile performance',
      'mixed-service': 'Mixed Service - On/Off road capability',
      'off-road': 'Off-Road - Rough terrain optimized',
      'mining': 'Mining - Extreme durability',
      'port': 'Port/Container - High scrub resistance',
      'construction': 'Construction - Puncture resistant'
    };
    const apps = product.applicationsList.map(app => appLabels[app] || app);
    features.push(`Best for: ${apps.join(', ')}`);
  }

  // Key attributes as features
  if (product.keyAttributes && typeof product.keyAttributes === 'object') {
    const importantKeys = ['Material', 'Construction', 'Durability', 'Warranty', 'Certification'];
    importantKeys.forEach(key => {
      if (product.keyAttributes[key]) {
        features.push(`${key}: ${product.keyAttributes[key]}`);
      }
    });
  }

  return features;
};

/**
 * Calculate average rating from reviews
 * @param {Array} reviews - Array of review objects
 * @returns {number} Average rating (0-5)
 */
const calculateAverageRating = (reviews = []) => {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
  return parseFloat((sum / reviews.length).toFixed(1));
};

/**
 * Get rating distribution (5 stars, 4 stars, etc.)
 * @param {Array} reviews - Array of review objects
 * @returns {Object} Rating distribution object
 */
const getRatingDistribution = (reviews = []) => {
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(review => {
    const rating = Math.floor(review.rating || 0);
    if (rating >= 1 && rating <= 5) {
      distribution[rating]++;
    }
  });
  return distribution;
};

/**
 * Calculate discount percentage
 * @param {string} regularPrice - Regular price string
 * @param {string} offerPrice - Offer price string
 * @returns {number} Discount percentage
 */
const calculateDiscountPercentage = (regularPrice, offerPrice) => {
  const regular = parseFloat(String(regularPrice || '0').replace(/[^0-9.-]/g, ''));
  const offer = parseFloat(String(offerPrice || '0').replace(/[^0-9.-]/g, ''));

  if (regular > 0 && offer > 0 && regular > offer) {
    return Math.round(((regular - offer) / regular) * 100);
  }
  return 0;
};

/**
 * Get related products based on category, tire type, and brand
 * @param {Object} product - Product document
 * @param {number} limit - Number of products to return
 * @returns {Array} Array of related products
 */
const getRelatedProducts = async (product, limit = 6) => {
  const criteria = [];

  // Same category (highest priority)
  if (product.category) {
    criteria.push({ category: product.category });
  }

  // Same tire type
  if (product.tireType) {
    criteria.push({ tireType: product.tireType });
  }

  // Same brand
  if (product.brand) {
    criteria.push({ brand: product.brand });
  }

  // Same vehicle type
  if (product.vehicleTypesList && product.vehicleTypesList.length > 0) {
    criteria.push({ vehicleTypesList: { $in: product.vehicleTypesList } });
  }

  if (criteria.length === 0) {
    return [];
  }

  const related = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    $or: criteria
  })
    .limit(limit)
    .select("name brand image price offerPrice pattern tireSpecs tireType")
    .lean();

  return related;
};

/**
 * Get similar products by tire size
 * @param {Object} product - Product document
 * @param {number} limit - Number of products to return
 * @returns {Array} Array of similar products
 */
const getSimilarBySize = async (product, limit = 4) => {
  const tireSize = product.tireSpecs?.size;
  if (!tireSize) return [];

  const similar = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    'tireSpecs.size': tireSize
  })
    .limit(limit)
    .select("name brand image price offerPrice")
    .lean();

  return similar;
};

/**
 * Get product quick view data (for modals/quick preview)
 * GET /api/products/:productId/quick-view
 */
const getProductQuickView = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await findProductByRouteId(productId);

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Calculate average rating
    const reviews = product.userReviews || [];
    const averageRating = calculateAverageRating(reviews);
    const totalReviews = reviews.length;

    // Calculate discount
    const discount = calculateDiscountPercentage(product.price, product.offerPrice);

    res.json({
      success: true,
      product: {
        id: product._id,
        name: product.name,
        brand: product.brand,
        pattern: product.pattern,
        modelNumber: product.modelNumber,
        price: product.price,
        offerPrice: product.offerPrice,
        discountPercentage: discount,
        image: product.image,
        shortDescription: product.shortDescription,
        tireSize: product.tireSpecs?.size,
        loadIndex: product.tireSpecs?.loadIndex,
        speedRating: product.tireSpecs?.speedRating,
        averageRating,
        totalReviews,
        inStock: product.isActive,
        isNewArrival: product.isNewArrival,
        isBestSeller: product.isBestSeller
      }
    });

  } catch (error) {
    console.error('Get product quick view error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product technical specifications table
 * GET /api/products/:productId/specs
 */
const getProductSpecsTable = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await findProductByRouteId(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const specifications = getProductSpecifications(product);
    const tireSpecs = product.tireSpecs || {};

    // Group specifications by category
    const groupedSpecs = {
      basic: specifications.filter(s =>
        ['Brand', 'Pattern', 'Model Number'].includes(s.label)
      ),
      dimensions: specifications.filter(s =>
        ['Tire Size', 'Overall Diameter', 'Section Width', 'Standard Rim', 'Static Load Radius'].includes(s.label)
      ),
      performance: specifications.filter(s =>
        ['Load Index', 'Speed Rating', 'Load Range', 'Ply Rating', 'Tread Depth', 'Revolutions per km'].includes(s.label)
      ),
      load: specifications.filter(s =>
        ['Max Load (Single)', 'Max Inflation Pressure', 'Single Configuration', 'Dual Configuration', 'Max Load'].includes(s.label)
      ),
      construction: specifications.filter(s =>
        ['Construction', 'Weight'].includes(s.label)
      )
    };

    res.json({
      success: true,
      product: {
        id: product._id,
        name: product.name,
        brand: product.brand
      },
      specifications: groupedSpecs,
      rawSpecs: tireSpecs
    });

  } catch (error) {
    console.error('Get product specs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product reviews with pagination
 * GET /api/products/:productId/reviews
 */
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    const product = await findProductByRouteId(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    let reviews = product.userReviews || [];

    // Filter by rating
    if (rating) {
      reviews = reviews.filter(r => Math.floor(r.rating) === parseInt(rating));
    }

    // Sort by date (newest first)
    reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    // Calculate statistics
    const averageRating = calculateAverageRating(reviews);
    const ratingDistribution = getRatingDistribution(reviews);

    res.json({
      success: true,
      reviews: paginatedReviews,
      statistics: {
        average: averageRating,
        total: reviews.length,
        distribution: ratingDistribution
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: reviews.length,
        totalPages: Math.ceil(reviews.length / limit)
      }
    });

  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Submit a product review
 * POST /api/products/:productId/reviews
 */
const submitProductReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { username, location, rating, title, text } = req.body;

    // Validation
    if (!username || !rating || !text) {
      return res.status(400).json({
        success: false,
        message: "Username, rating, and review text are required"
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5"
      });
    }

    const product = await findProductByRouteId(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const newReview = {
      username: username.trim(),
      location: location?.trim() || "",
      rating: parseFloat(rating),
      date: new Date().toISOString().split('T')[0],
      title: title?.trim() || "",
      text: text.trim(),
      verified: false // Can be set to true if user is verified buyer
    };

    product.userReviews.push(newReview);
    await product.save();

    res.json({
      success: true,
      message: "Review submitted successfully",
      review: newReview
    });

  } catch (error) {
    console.error('Submit product review error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product availability and pricing tiers
 * GET /api/products/:productId/pricing
 */
const getProductPricing = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity = 1 } = req.query;

    const product = await findProductByRouteId(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const regularPrice = parseFloat(String(product.price || '0').replace(/[^0-9.-]/g, ''));
    const offerPrice = parseFloat(String(product.offerPrice || '0').replace(/[^0-9.-]/g, ''));
    const basePrice = offerPrice > 0 ? offerPrice : regularPrice;

    // Calculate price based on quantity
    let calculatedPrice = basePrice;
    let appliedTier = null;

    if (product.pricingTiers && product.pricingTiers.length > 0) {
      // Sort tiers by minQuantity
      const sortedTiers = [...product.pricingTiers].sort((a, b) => a.minQuantity - b.minQuantity);

      // Find applicable tier
      for (const tier of sortedTiers) {
        if (quantity >= tier.minQuantity && (tier.maxQuantity === null || quantity <= tier.maxQuantity)) {
          const tierPrice = parseFloat(String(tier.pricePerTire || '0').replace(/[^0-9.-]/g, ''));
          if (tierPrice > 0) {
            calculatedPrice = tierPrice;
            appliedTier = tier;
          }
          break;
        }
      }
    }

    const totalPrice = calculatedPrice * quantity;
    const savings = basePrice > calculatedPrice ? (basePrice - calculatedPrice) * quantity : 0;
    const savingsPercentage = basePrice > calculatedPrice ?
      Math.round(((basePrice - calculatedPrice) / basePrice) * 100) : 0;

    res.json({
      success: true,
      product: {
        id: product._id,
        name: product.name,
        brand: product.brand
      },
      pricing: {
        regularPrice,
        offerPrice: offerPrice > 0 ? offerPrice : null,
        basePrice,
        requestedQuantity: parseInt(quantity),
        unitPrice: calculatedPrice,
        totalPrice,
        savings,
        savingsPercentage,
        appliedTier: appliedTier ? {
          minQuantity: appliedTier.minQuantity,
          maxQuantity: appliedTier.maxQuantity,
          pricePerTire: appliedTier.pricePerTire,
          note: appliedTier.note
        } : null
      },
      allTiers: product.pricingTiers || []
    });

  } catch (error) {
    console.error('Get product pricing error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get product SEO metadata
 * GET /api/products/:productId/seo
 */
const getProductSEO = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await findProductByRouteId(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Generate default SEO data if not provided
    const seoTitle = product.metadata?.seoTitle ||
      `${product.name} - ${product.brand} ${product.tireSpecs?.size || ''} Tire | Asian Import Export`;

    const seoDescription = product.metadata?.seoDescription ||
      product.shortDescription ||
      `${product.brand} ${product.name} tire. ${product.tireSpecs?.size || ''} size, ${product.tireSpecs?.loadIndex || ''} load index, ${product.tireSpecs?.speedRating || ''} speed rating. Best for ${product.applicationsList?.join(', ') || 'commercial use'}.`;

    const seoKeywords = product.metadata?.seoKeywords || [
      product.name,
      product.brand,
      product.tireSpecs?.size,
      `${product.brand} tire`,
      'commercial tire',
      product.tireType,
      ...(product.applicationsList || [])
    ].filter(Boolean);

    // Generate canonical URL
    const canonicalUrl = `/products/${product.sourceId || product._id}`;

    // Generate structured data (Schema.org)
    const structuredData = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.name,
      "image": product.image?.url,
      "description": product.shortDescription || product.description,
      "sku": product.sku || product.modelNumber,
      "mpn": product.modelNumber,
      "brand": {
        "@type": "Brand",
        "name": product.brand
      },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "USD",
        "price": parseFloat(String(product.offerPrice || product.price || '0').replace(/[^0-9.-]/g, '')),
        "availability": product.isActive ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    };

    // Add aggregate rating if exists
    const reviews = product.userReviews || [];
    if (reviews.length > 0) {
      const avgRating = calculateAverageRating(reviews);
      structuredData.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": avgRating,
        "reviewCount": reviews.length
      };
    }

    res.json({
      success: true,
      seo: {
        title: seoTitle,
        description: seoDescription,
        keywords: seoKeywords.join(', '),
        canonicalUrl,
        structuredData,
        openGraph: {
          title: seoTitle,
          description: seoDescription,
          image: product.image?.url,
          url: canonicalUrl,
          type: "product"
        },
        twitterCard: {
          card: "summary_large_image",
          title: seoTitle,
          description: seoDescription,
          image: product.image?.url
        }
      }
    });

  } catch (error) {
    console.error('Get product SEO error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
module.exports = {
  uploadMiddleware: upload.single("file"),
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
  // NEW EXPORTS
  findTiresByCriteria,
  compareTires,
  createB2BInquiry,
  findNearbyDealers,
  normalizeCategoryPayload,
  normalizeSubcategories,
  normalizeProductPayload,
  mapCategory,
  mapProduct,
  // Product Details Controllers
  getProductDetails,
  getProductQuickView,
  getProductSpecsTable,
  getProductReviews,
  submitProductReview,
  getProductPricing,
  getProductSEO,

  // Helper functions (if needed externally)
  calculateAverageRating,
  calculateDiscountPercentage,
  getProductSpecifications,
  getProductFeatures
};