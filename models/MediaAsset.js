const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, trim: true, index: true },
    assetType: { type: String, default: "image", trim: true },
    format: { type: String, trim: true, default: "" },
    originalFilename: { type: String, trim: true, default: "" },
    url: { type: String, required: true, trim: true },
    optimizedUrl: { type: String, trim: true, default: "" },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    folder: { type: String, trim: true, default: "catalog" },
    relatedType: { type: String, trim: true, default: "" },
    relatedId: { type: String, trim: true, default: "" },
    uploadedBy: {
      id: { type: String, trim: true, default: "" },
      name: { type: String, trim: true, default: "" },
      role: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const MediaAsset = mongoose.model("MediaAsset", mediaAssetSchema);

module.exports = MediaAsset;