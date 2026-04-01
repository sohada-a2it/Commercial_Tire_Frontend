const express = require("express");
const router = express.Router();
const {
  registerUser,
  getUserProfile,
  updateUserProfile,
} = require("../controllers/userController");

// POST /api/users/register - Register or update user
router.post("/register", registerUser);

// GET /api/users/profile/:firebaseUid - Get user profile
router.get("/profile/:firebaseUid", getUserProfile);

// PUT /api/users/profile/:firebaseUid - Update user profile
router.put("/profile/:firebaseUid", updateUserProfile);

module.exports = router;
