const express = require("express");
const router = express.Router();
const {
  registerUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  deleteUser,
  getAuthorizedPersons,
  createAuthorizedPerson,
  updateAuthorizedPerson,
  deleteAuthorizedPerson,
  loginAuthorizedPerson,
} = require("../controllers/userController");
const { authenticate, requireAdmin } = require("../middleware/auth");

// POST /api/users/register - Register or update user
router.post("/register", registerUser);

// POST /api/users/authorized-login - Login for DB-only authorized persons
router.post("/authorized-login", loginAuthorizedPerson);

// GET /api/users - Get all users (for dashboard)
router.get("/", authenticate, requireAdmin, getAllUsers);

// GET /api/users/profile/:firebaseUid - Get user profile
router.get("/profile/:firebaseUid", getUserProfile);

// PUT /api/users/profile/:firebaseUid - Update user profile
router.put("/profile/:firebaseUid", updateUserProfile);

// DELETE /api/users/customers/:firebaseUid - Delete customer
router.delete("/customers/:firebaseUid", authenticate, requireAdmin, deleteUser);

// Authorized person management (admin only)
router.get("/authorized-persons", authenticate, requireAdmin, getAuthorizedPersons);
router.post("/authorized-persons", authenticate, requireAdmin, createAuthorizedPerson);
router.put(
  "/authorized-persons/:firebaseUid",
  authenticate,
  requireAdmin,
  updateAuthorizedPerson
);
router.delete(
  "/authorized-persons/:firebaseUid",
  authenticate,
  requireAdmin,
  deleteAuthorizedPerson
);

module.exports = router;
