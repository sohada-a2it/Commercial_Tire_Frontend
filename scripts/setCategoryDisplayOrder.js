const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("../config/db");
const Category = require("../models/Category");

const CATEGORY_ORDER = [
  "Vehicle Parts and Accessories",
  "Frozen Fish",
  "Dry Food",
  "Metals and Metal Products",
  "Agriculture",
  "Wood Products",
  "Cloth",
];

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const ORDER_ALIASES = new Map([
  ["vehicle parts and accessories", 1],
  ["vehicle parts accessories", 1],
  ["frozen fish", 2],
  ["dry food", 3],
  ["metals and metal products", 4],
  ["metal and metal products", 4],
  ["metals metal products", 4],
  ["agriculture", 5],
  ["wood products", 6],
  ["cloth", 7],
  ["clothing", 7],
]);

const findOrder = (categoryName = "") => {
  const key = normalize(categoryName);
  if (ORDER_ALIASES.has(key)) {
    return ORDER_ALIASES.get(key);
  }

  // Fallback matching for minor naming differences.
  if (key.includes("vehicle") && key.includes("part") && (key.includes("accessories") || key.includes("accessory"))) {
    return 1;
  }
  if (key.includes("frozen") && key.includes("fish")) {
    return 2;
  }
  if (key.includes("dry") && key.includes("food")) {
    return 3;
  }
  if (key.includes("metal") && key.includes("product")) {
    return 4;
  }
  if (key.includes("agriculture")) {
    return 5;
  }
  if (key.includes("wood") && key.includes("product")) {
    return 6;
  }
  if (key.includes("cloth") || key.includes("clothing")) {
    return 7;
  }

  return null;
};

const run = async () => {
  try {
    await connectDB();

    const categories = await Category.find({}).lean();
    if (!categories.length) {
      console.log("No categories found.");
      process.exit(0);
    }

    const matched = [];
    const unmatched = [];

    categories.forEach((category) => {
      const desiredOrder = findOrder(category.name);
      if (desiredOrder !== null) {
        matched.push({ ...category, desiredOrder });
      } else {
        unmatched.push(category);
      }
    });

    // Keep unmatched categories after the fixed sequence.
    unmatched.sort((a, b) => {
      const orderA = Number.isFinite(Number(a.displayOrder)) ? Number(a.displayOrder) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.displayOrder)) ? Number(b.displayOrder) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    const bulkOps = [];

    matched
      .sort((a, b) => a.desiredOrder - b.desiredOrder)
      .forEach((category) => {
        bulkOps.push({
          updateOne: {
            filter: { _id: category._id },
            update: { $set: { displayOrder: category.desiredOrder } },
          },
        });
      });

    let trailingOrder = CATEGORY_ORDER.length + 1;
    unmatched.forEach((category) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: category._id },
          update: { $set: { displayOrder: trailingOrder++ } },
        },
      });
    });

    if (!bulkOps.length) {
      console.log("No category updates needed.");
      process.exit(0);
    }

    await Category.bulkWrite(bulkOps);

    console.log("Category display order updated.");
    console.log("Target order:");
    CATEGORY_ORDER.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    const updated = await Category.find({}).sort({ displayOrder: 1, name: 1 }).select({ name: 1, displayOrder: 1 }).lean();
    console.log("\nCurrent DB order:");
    updated.forEach((item) => {
      console.log(`${item.displayOrder}. ${item.name}`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Failed to set category display order:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

run();
