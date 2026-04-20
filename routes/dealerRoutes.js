const express = require("express");
const router = express.Router();

const dealerController = require("../controllers/dealerController");

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

/* =========================
   🌍 GEO ROUTE (NEARBY)
========================= */

router.get("/near/search", dealerController.getNearbyDealers);

module.exports = router;