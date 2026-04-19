// models/Product.js - CORRECTED VERSION

const mongoose = require("mongoose");
const Counter = require("./Counter");

const PRODUCT_SOURCE_COUNTER_KEY = "product-source-id";

const ensureProductCounterSeeded = async () => {
  const existingCounter = await Counter.findById(PRODUCT_SOURCE_COUNTER_KEY).lean();
  if (existingCounter) {
    return;
  }

  const maxProduct = await mongoose
    .model("Product")
    .findOne({ sourceId: { $exists: true, $ne: null } })
    .sort({ sourceId: -1 })
    .select({ sourceId: 1 })
    .lean();

  const seed = Number(maxProduct?.sourceId) || 0;

  try {
    await Counter.create({
      _id: PRODUCT_SOURCE_COUNTER_KEY,
      seq: seed,
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
};

const getNextProductSourceId = async () => {
  await ensureProductCounterSeeded();

  const counter = await Counter.findByIdAndUpdate(
    PRODUCT_SOURCE_COUNTER_KEY,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return counter.seq;
};

const pricingTierSchema = new mongoose.Schema(
  {
    minQuantity: { type: Number, default: 0 },
    maxQuantity: { type: Number, default: 0 },
    pricePerTire: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    username: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    rating: { type: Number, default: 0 },
    date: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    text: { type: String, trim: true, default: "" },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: "" },
    publicId: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    format: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

// Tire Technical Specifications Schema
// tireSpecsSchema এ যোগ করুন:
const tireSpecsSchema = new mongoose.Schema(
  {
    size: { type: String, trim: true, default: "" },
    loadIndex: { type: String, trim: true, default: "" },
    speedRating: { type: String, trim: true, default: "" },
    treadPattern: { type: String, trim: true, default: "" },
    plyRating: { type: String, trim: true, default: "" },
    stdRim: { type: String, trim: true, default: "" },
    overallDiameter: { type: String, trim: true, default: "" },
    sectionWidth: { type: String, trim: true, default: "" },
    maxLoad: { type: String, trim: true, default: "" },
    maxInflation: { type: String, trim: true, default: "" },
    treadDepth: { type: String, trim: true, default: "" },
    revsPerKm: { type: String, trim: true, default: "" },
    
    // ========== নতুন ফিল্ড ==========
    loadRange: { 
      type: String, 
      trim: true, 
      enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'L'],
      default: "" 
    },  // Load Range (G, H, J, L etc.)
    
    singleMaxLoad: { type: String, trim: true, default: "" },  // Single Max Load
    singleMaxPressure: { type: String, trim: true, default: "" },  // Single Max Pressure (psi)
    
    dualMaxLoad: { type: String, trim: true, default: "" },  // Dual Max Load
    dualMaxPressure: { type: String, trim: true, default: "" },  // Dual Max Pressure (psi)
    
    staticLoadRadius: { type: String, trim: true, default: "" },  // Static Load Radius (inch)
    weight: { type: String, trim: true, default: "" },  // Weight (lbs/kg)
    weightUnit: { type: String, enum: ['lbs', 'kg'], default: 'lbs' },
    
    constructionType: { 
      type: String, 
      enum: ['TL', 'TT', 'Both'],
      default: 'TL' 
    },  // Tire construction: TL (Tubeless) or TT (Tube Type)
  },
  { _id: false }
);

// Resources Schema for Downloads
const resourcesSchema = new mongoose.Schema(
  {
    brochure: { type: assetSchema, default: () => ({}) },
    datasheet: { type: assetSchema, default: () => ({}) },
    warrantyDoc: { type: assetSchema, default: () => ({}) },
    certificate: { type: assetSchema, default: () => ({}) },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    // Auto-generated fields
    sourceId: { type: Number, unique: true, sparse: true, index: true },
    
    // Basic Info
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    sku: { type: String, trim: true, default: "" },
    
    // Categorization
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    mainCategory: { type: String, trim: true, default: "" },
    subCategory: { type: String, trim: true, default: "" },
    categoryName: { type: String, trim: true, default: "" },
    categoryIcon: { type: String, trim: true, default: "" },
    subcategoryId: { type: Number, default: 0 },
    subcategoryName: { type: String, trim: true, default: "" },
    subcategorySlug: { type: String, trim: true, default: "" },
    
    // Tire Classification - HYBRID APPROACH
    // Single string for efficient indexing (used for main filtering)
    tireType: { 
      type: String, 
      enum: ['steer', 'drive', 'trailer', 'all-position', 'off-road', 'mining'],
      default: 'all-position',
      index: true 
    },
    
    // Single string for primary vehicle type (indexed)
    primaryVehicleType: { 
      type: String, 
      enum: ['truck', 'bus', 'otr', 'industrial', 'mining', 'agricultural', 'mixed'],
      default: 'truck',
      index: true 
    },
    
    // Single string for primary application (indexed)
    primaryApplication: { 
      type: String,
      enum: ['highway', 'regional', 'mixed-service', 'off-road', 'mining', 'port', 'construction'],
      default: 'highway',
      index: true 
    },
    
    // Arrays for multi-select support (NOT indexed to avoid parallel array error)
    vehicleTypesList: { type: [String], default: [] },
    applicationsList: { type: [String], default: [] },
    
    // Technical Specifications
    tireSpecs: { type: tireSpecsSchema, default: () => ({}) },
    
    // Commercial Info
    pattern: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    price: { type: String, trim: true, default: "" },
    offerPrice: { type: String, trim: true, default: "" },
    pricingTiers: { type: [pricingTierSchema], default: [] },
    customizationOptions: { type: [String], default: [] },
    shipping: { type: String, trim: true, default: "" },
    
    // Content
    description: { type: String, trim: true, default: "" },
    shortDescription: { type: String, trim: true, default: "" },
    
    // Media
    image: { type: assetSchema, default: () => ({}) },
    images: { type: [assetSchema], default: [] },
    videoUrl: { type: String, trim: true, default: "" },
    threeSixtyImages: { type: [assetSchema], default: [] },
    
    // Downloads
    resources: { type: resourcesSchema, default: () => ({}) },
    
    // Additional Data
    keyAttributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    packagingAndDelivery: { type: mongoose.Schema.Types.Mixed, default: {} },
    priceSource: { type: String, trim: true, default: "" },
    userReviews: { type: [reviewSchema], default: [] },
    tags: { type: [String], default: [] },
    
    // Status Flags
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    
    // SEO
    metadata: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {
        seoTitle: "",
        seoDescription: "",
        seoKeywords: []
      } 
    },
  },
  { timestamps: true }
);

// Indexes - No parallel array indexes
productSchema.index({ category: 1, subcategoryId: 1, createdAt: -1 });
productSchema.index({ tireType: 1, primaryVehicleType: 1, primaryApplication: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ name: "text", description: "text", pattern: "text" });
productSchema.index({ brand: 1 });
productSchema.index({ pattern: 1 });

// Pre-save middleware to sync array fields with single-value fields
productSchema.pre("save", function syncArrayFields(next) {
  // Sync vehicleTypesList
  if (this.vehicleTypesList && this.vehicleTypesList.length > 0) {
    this.vehicleTypesList = [...new Set(this.vehicleTypesList)];
    if (!this.primaryVehicleType || !this.vehicleTypesList.includes(this.primaryVehicleType)) {
      this.primaryVehicleType = this.vehicleTypesList[0];
    }
  } else if (this.primaryVehicleType) {
    this.vehicleTypesList = [this.primaryVehicleType];
  }
  
  // Sync applicationsList
  if (this.applicationsList && this.applicationsList.length > 0) {
    this.applicationsList = [...new Set(this.applicationsList)];
    if (!this.primaryApplication || !this.applicationsList.includes(this.primaryApplication)) {
      this.primaryApplication = this.applicationsList[0];
    }
  } else if (this.primaryApplication) {
    this.applicationsList = [this.primaryApplication];
  }
  
  next();
});

// Pre-save middleware for auto-assigning sourceId
productSchema.pre("validate", async function autoAssignSourceId(next) {
  try {
    if (this.sourceId === undefined || this.sourceId === null || this.sourceId === "") {
      this.sourceId = await getNextProductSourceId();
      return next();
    }

    const numericSourceId = Number(this.sourceId);
    if (Number.isFinite(numericSourceId) && numericSourceId > 0) {
      await Counter.findByIdAndUpdate(
        PRODUCT_SOURCE_COUNTER_KEY,
        { $max: { seq: numericSourceId } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      this.sourceId = numericSourceId;
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

// Virtual for getting all vehicle types (backward compatibility)
productSchema.virtual("vehicleType").get(function() {
  return this.vehicleTypesList;
});

// Virtual for getting all applications (backward compatibility)
productSchema.virtual("application").get(function() {
  return this.applicationsList;
});

// Virtual for full tire name
productSchema.virtual("fullTireName").get(function() {
  if (this.pattern && this.tireSpecs?.size) {
    return `${this.pattern} ${this.tireSpecs.size}`;
  }
  return this.name;
});

// Method to check if tire matches filter criteria
productSchema.methods.matchesFilter = function(filters) {
  if (filters.tireType && this.tireType !== filters.tireType) return false;
  
  if (filters.vehicleType) {
    const vehicleTypes = this.vehicleTypesList;
    if (!vehicleTypes.includes(filters.vehicleType)) return false;
  }
  
  if (filters.application) {
    const applications = this.applicationsList;
    if (!applications.includes(filters.application)) return false;
  }
  
  if (filters.size && this.tireSpecs.size !== filters.size) return false;
  return true;
};

// Static method for finding tires by criteria
productSchema.statics.findByTireCriteria = async function(criteria) {
  const filter = { isActive: true };
  
  if (criteria.tireType) {
    filter.tireType = criteria.tireType;
  }
  
  if (criteria.vehicleType) {
    filter.vehicleTypesList = { $in: [criteria.vehicleType] };
  }
  
  if (criteria.application) {
    filter.applicationsList = { $in: [criteria.application] };
  }
  
  if (criteria.size) {
    filter['tireSpecs.size'] = { $regex: criteria.size, $options: 'i' };
  }
  
  if (criteria.brand) {
    filter.brand = { $regex: criteria.brand, $options: 'i' };
  }
  
  return this.find(filter).limit(criteria.limit || 20);
};

const Product = mongoose.model("Product", productSchema);

module.exports = Product;