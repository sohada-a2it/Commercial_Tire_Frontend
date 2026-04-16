// models/FeaturedProduct.js
const mongoose = require("mongoose");

const featuredProductSchema = new mongoose.Schema(
  {
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Product", 
      required: true,
      unique: true // একই প্রোডাক্ট একবারই ফিচার্ড হতে পারবে
    },
    order: { 
      type: Number, 
      default: 0 // সাজানোর জন্য অর্ডার নম্বর
    },
    addedBy: { 
      type: String, 
      trim: true, 
      default: "" 
    },
    addedAt: { 
      type: Date, 
      default: Date.now 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    expiryDate: { 
      type: Date, 
      default: null // null মানে কখনো মেয়াদ শেষ হবে না
    }
  },
  { timestamps: true }
);

// কম্পাউন্ড ইনডেক্স
featuredProductSchema.index({ productId: 1, isActive: 1 });
featuredProductSchema.index({ order: 1, addedAt: -1 });

module.exports = mongoose.models.FeaturedProduct || mongoose.model("FeaturedProduct", featuredProductSchema);