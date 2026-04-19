const mongoose = require("mongoose");

const dealerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, required: true, trim: true },
  
  address: {
    street: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
    }
  },
  
  contactPerson: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  website: { type: String, trim: true },
  
  // Business Info
  tireBrands: [{ type: String, trim: true }], // Which tire brands they carry
  serviceAreas: [{ type: String, trim: true }],
  certifications: [{ type: String, trim: true }],
  
  // Working Hours
  workingHours: {
    monday: { type: String, default: "9:00 AM - 6:00 PM" },
    tuesday: { type: String, default: "9:00 AM - 6:00 PM" },
    wednesday: { type: String, default: "9:00 AM - 6:00 PM" },
    thursday: { type: String, default: "9:00 AM - 6:00 PM" },
    friday: { type: String, default: "9:00 AM - 6:00 PM" },
    saturday: { type: String, default: "Closed" },
    sunday: { type: String, default: "Closed" }
  },
  
  // Media
  logo: {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" }
  },
  images: [{ type: String }], // Gallery images
  
  // Status
  isActive: { type: Boolean, default: true, index: true },
  isAuthorized: { type: Boolean, default: false }, // Authorized dealer or not
  
  // Social Media
  socialMedia: {
    facebook: { type: String, default: "" },
    instagram: { type: String, default: "" },
    linkedin: { type: String, default: "" }
  },
  
  // Additional Info
  description: { type: String, trim: true },
  specialties: [{ type: String }], // Special services (e.g., fleet service, emergency repair)
  
}, { timestamps: true });

// Create geospatial index for location-based queries
dealerSchema.index({ 'address.location': '2dsphere' });
dealerSchema.index({ company: 'text', name: 'text', city: 'text' });

// Method to get full address
dealerSchema.virtual('fullAddress').get(function() {
  const parts = [
    this.address.street,
    this.address.city,
    this.address.state,
    this.address.postalCode,
    this.address.country
  ].filter(Boolean);
  return parts.join(', ');
});

const Dealer = mongoose.model("Dealer", dealerSchema);
module.exports = Dealer;