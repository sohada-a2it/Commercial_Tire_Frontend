const express = require("express");
const router = express.Router();
const {
  registerUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  deleteUser,
} = require("../controllers/userController");

// POST /api/users/register - Register or update user
router.post("/register", registerUser);

// GET /api/users - Get all users (for dashboard)
router.get("/", getAllUsers);

// GET /api/users/profile/:firebaseUid - Get user profile
router.get("/profile/:firebaseUid", getUserProfile);

// PUT /api/users/profile/:firebaseUid - Update user profile
router.put("/profile/:firebaseUid", updateUserProfile);

// DELETE /api/users/:firebaseUid - Delete user
router.delete("/:firebaseUid", deleteUser);

module.exports = router;
