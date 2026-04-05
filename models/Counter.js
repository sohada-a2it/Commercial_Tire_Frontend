const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const Counter = mongoose.model("Counter", counterSchema);

module.exports = Counter;
