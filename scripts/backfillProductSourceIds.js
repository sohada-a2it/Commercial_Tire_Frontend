const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("../config/db");
const Product = require("../models/Product");

const run = async () => {
  try {
    await connectDB();

    const missing = await Product.find({
      $or: [{ sourceId: { $exists: false } }, { sourceId: null }],
    }).sort({ createdAt: 1 });

    if (!missing.length) {
      console.log("No products with missing sourceId.");
      process.exit(0);
    }

    console.log(`Found ${missing.length} products with missing sourceId.`);

    for (const product of missing) {
      // Trigger Product model pre-validate hook that auto-generates sourceId.
      await product.save();
      console.log(`Assigned sourceId=${product.sourceId} to product=${product.name} (${product._id})`);
    }

    console.log("Backfill complete.");
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error.message);
    process.exit(1);
  }
};

run();
