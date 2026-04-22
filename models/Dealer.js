const mongoose = require("mongoose");

const dealerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },

    address: {
      street: { type: String, trim: true },
      area: { type: String, trim: true }, // 👉 NEW (Dhaka-style area)
      city: { type: String, required: true, trim: true },
      state: { type: String, trim: true },
      country: { type: String, required: true, trim: true },
      postalCode: { type: String, trim: true },
      fullAddress: { type: String, trim: true }, // 👉 NEW (formatted address)
    },

    // 🌍 GEO LOCATION
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
      },
    },

    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },

    // 🌐 WEBSITE (improved validation)
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, "Please use valid URL with http/https"],
    },

    // 🛠️ SERVICES (NEW)
    services: [
      {
        type: String,
        trim: true,
      },
    ],

    tireBrands: [{ type: String, trim: true }],
    serviceAreas: [{ type: String, trim: true }],
    certifications: [{ type: String, trim: true }],

    workingHours: {
      monday: { type: String, default: "9:00 AM - 6:00 PM" },
      tuesday: { type: String, default: "9:00 AM - 6:00 PM" },
      wednesday: { type: String, default: "9:00 AM - 6:00 PM" },
      thursday: { type: String, default: "9:00 AM - 6:00 PM" },
      friday: { type: String, default: "9:00 AM - 6:00 PM" },
      saturday: { type: String, default: "Closed" },
      sunday: { type: String, default: "Closed" },
    },

    logo: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },

    images: [{ type: String }],

    isActive: { type: Boolean, default: true, index: true },
    isAuthorized: { type: Boolean, default: false },

    socialMedia: {
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      linkedin: { type: String, default: "" },
    },

    description: { type: String, trim: true },
    specialties: [{ type: String }],
  },
  { timestamps: true }
);

// 🌍 GEO INDEX
dealerSchema.index({ location: "2dsphere" });

// 🔎 TEXT SEARCH INDEX
dealerSchema.index({
  name: "text",
  company: "text",
  "address.city": "text",
  "address.area": "text", // 👉 added
  services: "text", // 👉 searchable services
});

module.exports = mongoose.model("Dealer", dealerSchema);