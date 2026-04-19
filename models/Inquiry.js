const mongoose = require("mongoose");

// Keep this - it's good for multiple tire quotes
const inquiryItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,  // Changed from String to ObjectId
      ref: "Product",
      trim: true,
    },
    tireModel: {  // More specific than just "name"
      type: String,
      required: true,
      trim: true,
    },
    tireSize: {  // NEW: Critical for tires
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // REMOVED: unitPrice, discount, lineTotal (not B2B)
    // B2B doesn't show prices publicly
    
    // NEW: B2B specific fields
    requestedDeliveryDate: {
      type: Date,
    },
    application: {  // Highway, mining, construction
      type: String,
      trim: true,
    },
    specialRequirements: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const inquirySchema = new mongoose.Schema(
  {
    inquiryNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    
    // Customer Info (Keep as is - good structure)
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    customerSnapshot: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
      companyName: { type: String, required: true, trim: true }, // Made required
      companyType: {  // NEW: Important for B2B targeting
        type: String,
        enum: ['distributor', 'dealer', 'fleet_owner', 'transporter', 'construction', 'mining', 'retailer'],
        default: 'fleet_owner'
      },
      gstVatNumber: { type: String, trim: true }, // NEW: For international B2B
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, trim: true },
      country: { type: String, required: true, trim: true }, // Changed from "zone"
      zipCode: { type: String, trim: true },
      notes: { type: String, trim: true },
      whatsappNumber: { type: String, trim: true },
    },
    
    // Items (Modified for B2B)
    items: {
      type: [inquiryItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one tire product is required",
      },
    },
    
    // REMOVED: subtotal, total, currency, paymentMethod (Not for B2B inquiry)
    // B2B quotes are negotiated, not displayed publicly
    
    // NEW: B2B Quotation Fields
    preferredCurrency: {
      type: String,
      enum: ['USD', 'EUR', 'GBP', 'THB', 'BDT'],
      default: 'USD'
    },
    
    deliveryTerm: {
      type: String,
      enum: ['FOB', 'CIF', 'EXW', 'DDP'],
      default: 'FOB'
    },
    
    expectedDeliveryDate: {
      type: Date,
    },
    
    // Status (Modified for B2B sales pipeline)
    status: {
      type: String,
      enum: [
        'new',           // Just submitted
        'reviewing',     // Sales team reviewing
        'quoted',        // Quote sent to customer
        'negotiating',   // Price negotiation
        'order_placed',  // Customer agreed to proceed
        'invoiced',      // Invoice sent
        'payment_received', // Payment done
        'shipped',       // Products shipped
        'delivered',     // Delivered to customer
        'cancelled'      // Cancelled
      ],
      default: 'new',
      index: true,
    },
    
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    
    // Quotation Info (NEW)
    quotation: {
      sentAt: { type: Date },
      validUntil: { type: Date },
      quotedAmount: { type: Number },  // Only visible to admin
      quotedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      documentUrl: { type: String },   // PDF quotation file
    },
    
    // Communication (Keep but enhance)
    contactChannel: {
      type: String,
      enum: ["email", "whatsapp", "phone", "mixed", "meeting"],
      default: "mixed",
    },
    
    internalNotes: {
      type: String,
      trim: true,
    },
    
    // NEW: Communication History
    communications: [{
      date: { type: Date, default: Date.now },
      type: { type: String, enum: ['email', 'call', 'meeting', 'whatsapp'] },
      summary: { type: String },
      conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      followUpDate: { type: Date }
    }],
    
    // Payment (Keep as is - good for tracking)
    payment: {
      confirmed: { type: Boolean, default: false },
      paidAmount: { type: Number, min: 0, default: 0 },
      confirmedAt: { type: Date },
      notes: { type: String, trim: true },
      paymentMethod: { type: String }, // Bank transfer, LC, etc.
    },
    
    // REMOVED: linkedInvoice (Keep separate invoice system)
    // Keep if you have invoice model
    
    hiddenByCustomer: {
      type: Boolean,
      default: false,
      index: true,
    },
    hiddenAt: {
      type: Date,
      default: null,
    },
    
    // NEW: Source Tracking
    source: {
      type: String,
      enum: ['website_form', 'email', 'phone', 'trade_show', 'referral', 'dealer'],
      default: 'website_form'
    },
    
    referredBy: {  // Which dealer referred this?
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer"
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
inquirySchema.index({ customer: 1, createdAt: -1 });
inquirySchema.index({ status: 1, priority: 1, createdAt: -1 });
inquirySchema.index({ inquiryNumber: 1 });
inquirySchema.index({ 'customerSnapshot.companyName': 'text', inquiryNumber: 'text' });

// Virtual for inquiry age
inquirySchema.virtual('ageInDays').get(function() {
  const diffTime = Math.abs(Date.now() - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to add communication log
inquirySchema.methods.addCommunication = async function(type, summary, userId, followUpDate = null) {
  this.communications.push({
    type,
    summary,
    conductedBy: userId,
    followUpDate
  });
  return this.save();
};

// Method to send quotation
inquirySchema.methods.sendQuotation = async function(amount, validUntil, userId, documentUrl) {
  this.quotation = {
    sentAt: new Date(),
    validUntil,
    quotedAmount: amount,
    quotedBy: userId,
    documentUrl
  };
  this.status = 'quoted';
  return this.save();
};

const Inquiry = mongoose.model("Inquiry", inquirySchema);

module.exports = Inquiry;