const mongoose = require("mongoose");

const authorizedPersonSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
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
      enum: ["admin", "moderator"],
      required: true,
      default: "moderator",
    },
    passwordHash: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

authorizedPersonSchema.index({ email: 1 });
authorizedPersonSchema.index({ firebaseUid: 1 });

const AuthorizedPerson = mongoose.model("AuthorizedPerson", authorizedPersonSchema);

module.exports = AuthorizedPerson;
