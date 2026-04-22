const express = require("express");
const router = express.Router();

const dealerController = require("../controllers/dealerController");

/* =========================
   🌍 GEO ROUTE (FIRST)
========================= */

// ✅ MUST be before /:id
router.get("/near/search", dealerController.getNearbyDealers);

/* =========================
   CRUD ROUTES
========================= */

// ➤ Create dealer
router.post("/", dealerController.createDealer);

// ➤ Get all dealers (with filters)
router.get("/", dealerController.getDealers);

// ➤ Get single dealer
router.get("/:id", dealerController.getDealerById);

// ➤ Update dealer
router.put("/:id", dealerController.updateDealer);

// ➤ Delete dealer
router.delete("/:id", dealerController.deleteDealer);

module.exports = router;