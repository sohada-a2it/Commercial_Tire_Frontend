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
      enum: ["user", "admin"],
      default: "user",
    },
    businessType: {
      type: String,
      enum: ["Wholeseller", "Wholesaler", "Retailer", "REGULAR USER", "Other"],
      trim: true,
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
