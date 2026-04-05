require("dotenv").config();
const fs = require("fs");
const path = require("path");
const connect = require("../config/db");
const Product = require("../models/Product");

(async () => {
  const jsonPath = path.resolve(__dirname, "..", "..", "Asian.Import.Export.Co.Frontend", "public", "categories.json");
  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const categories = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.categories) ? parsed.categories : []);

  const sourceIds = [];
  for (const category of categories) {
    for (const subcategory of (category.subcategories || [])) {
      for (const product of (subcategory.products || [])) {
        if (product && product.id !== undefined && product.id !== null && product.name) {
          sourceIds.push(Number(product.id));
        }
      }
    }
  }

  const uniqueIds = [...new Set(sourceIds.filter(Number.isFinite))];

  await connect();

  const existing = await Product.find({ sourceId: { $in: uniqueIds } }, { sourceId: 1 }).lean();
  const existingSet = new Set(existing.map((item) => Number(item.sourceId)));
  const missing = uniqueIds.filter((id) => !existingSet.has(id));

  console.log(JSON.stringify({
    jsonProducts: sourceIds.length,
    jsonUniqueSourceIds: uniqueIds.length,
    dbMatchedBySourceId: existingSet.size,
    missingCount: missing.length,
    sampleMissing: missing.slice(0, 30),
  }, null, 2));

  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
