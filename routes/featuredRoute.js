// routes/featuredProductRoutes.js
const express = require("express");
const router = express.Router();
const {
  getFeaturedProducts,
  addToFeatured,
  removeFromFeatured,
  updateFeaturedOrder,
  toggleFeaturedStatus,
  listAllFeatured,
  cleanupExpiredFeatured
} = require("../controllers/featuredController");

// পাবলিক রাউট
router.get("/", getFeaturedProducts);

// এডমিন রাউট - সঠিক endpoint গুলো
router.get("/admin/list", listAllFeatured);
router.get("/", getFeaturedProducts);
router.post("/:productId", addToFeatured);  // ✅ সঠিক
router.delete("/:productId", removeFromFeatured);  // ✅ সঠিক
router.put("/:productId/order", updateFeaturedOrder);
router.patch("/:productId/status", toggleFeaturedStatus);
router.post("/cleanup", cleanupExpiredFeatured);

module.exports = router;