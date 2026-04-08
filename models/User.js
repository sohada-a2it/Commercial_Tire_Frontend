const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    photoURL: {
      type: String,
    },
    role: {
      type: String,
      enum: ["customer", "user", "wholesaler", "distributor", "manufacturer", "supplier", "exporter / importer", "service provider", "trading business"],
      default: "customer",
    },
    businessType: {
      type: String,
      trim: true,
    },
    address: {
      street: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      postalCode: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ firebaseUid: 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;
