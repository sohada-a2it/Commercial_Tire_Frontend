// scripts/dropSlugIndex.js
// This script drops the slug_1 index from the products collection

const mongoose = require("mongoose");
require("dotenv").config();

const dropSlugIndex = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/Commercial_Tire";
        await mongoose.connect(mongoUri);

        const db = mongoose.connection.db;
        const collection = db.collection("products");

        // Check if index exists
        const indexList = await collection.listIndexes().toArray();
        const indexNames = indexList.map(idx => idx.name);
        console.log("Current indexes:", indexNames);

        if (indexNames.includes("slug_1")) {
            // Drop the slug index
            await collection.dropIndex("slug_1");
            console.log("✅ Successfully dropped slug_1 index");
        } else {
            console.log("ℹ️  slug_1 index not found, no action needed");
        }

        // Verify
        const updatedIndexList = await collection.listIndexes().toArray();
        const updatedIndexNames = updatedIndexList.map(idx => idx.name);
        console.log("Updated indexes:", updatedIndexNames);

        await mongoose.disconnect();
        console.log("✅ Database cleanup complete!");
    } catch (error) {
        console.error("❌ Error dropping index:", error.message);
        process.exit(1);
    }
};

dropSlugIndex();
