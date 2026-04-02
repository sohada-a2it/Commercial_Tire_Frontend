const User = require("../models/User");
const { admin } = require("../config/firebaseAdmin");

const ALLOWED_BUSINESS_TYPES = [
  "Wholeseller",
  "Wholesaler",
  "Retailer",
  "REGULAR USER",
  "Other",
];

const ALLOWED_AUTHORIZED_ROLES = ["admin", "moderator"];

const getInitialAdminEmail = () =>
  (process.env.DEFAULT_ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "")
    .toLowerCase()
    .trim();

const normalizeRole = (role) => (role === "user" ? "customer" : role);

const mapUserPayload = (user) => ({
  id: user._id,
  firebaseUid: user.firebaseUid,
  companyName: user.companyName,
  fullName: user.fullName,
  email: user.email,
  whatsappNumber: user.whatsappNumber,
  country: user.country,
  provider: user.provider,
  photoURL: user.photoURL,
  businessType: user.businessType,
  role: normalizeRole(user.role),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// Register or update user after Firebase authentication
const registerUser = async (req, res) => {
  try {
    const {
      firebaseUid,
      companyName,
      fullName,
      email,
      whatsappNumber,
      country,
      provider,
      photoURL,
      businessType,
    } = req.body;
    const initialAdminEmail = getInitialAdminEmail();
    const normalizedEmail = email?.toLowerCase().trim();

    if (businessType && !ALLOWED_BUSINESS_TYPES.includes(businessType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid business type",
      });
    }

    // Validate required fields
    if (!firebaseUid || !normalizedEmail || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID, email, and full name are required",
      });
    }

    // Check if user already exists by firebaseUid
    let user = await User.findOne({ firebaseUid });

    if (user) {
      // Update existing user
      user.companyName = companyName || user.companyName;
      user.fullName = fullName || user.fullName;
      user.whatsappNumber = whatsappNumber || user.whatsappNumber;
      user.country = country || user.country;
      user.photoURL = photoURL || user.photoURL;
      user.businessType = businessType || user.businessType;
      if (provider) user.provider = provider;
      if (initialAdminEmail && normalizedEmail === initialAdminEmail) {
        user.role = "admin";
      }

      await user.save();

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: mapUserPayload(user),
      });
    }

    // Check if email already exists with different firebaseUid
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered with another account",
      });
    }

    const assignedRole =
      initialAdminEmail && normalizedEmail === initialAdminEmail
        ? "admin"
        : "customer";

    // Create new user
    user = new User({
      firebaseUid,
      companyName,
      fullName,
      email: normalizedEmail,
      whatsappNumber,
      country,
      provider: provider || "email",
      photoURL,
      businessType: businessType || "Other",
      role: assignedRole,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: mapUserPayload(user),
    });
  } catch (error) {
    console.error("Register user error:", error);
    res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
};

// Get user profile by Firebase UID
const getUserProfile = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required",
      });
    }

    const user = await User.findOne({ firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user: mapUserPayload(user),
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { companyName, fullName, whatsappNumber, country, photoURL, businessType } = req.body;

    if (businessType && !ALLOWED_BUSINESS_TYPES.includes(businessType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid business type",
      });
    }

    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required",
      });
    }

    const user = await User.findOne({ firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields if provided
    if (companyName !== undefined) user.companyName = companyName;
    if (fullName !== undefined) user.fullName = fullName;
    if (whatsappNumber !== undefined) user.whatsappNumber = whatsappNumber;
    if (country !== undefined) user.country = country;
    if (photoURL !== undefined) user.photoURL = photoURL;
    if (businessType !== undefined) user.businessType = businessType;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: mapUserPayload(user),
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user profile",
      error: error.message,
    });
  }
};

// Get all users (for admin dashboard)
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      country = "",
      businessType = "",
      role = "",
    } = req.query;

    // Build query
    const query = {};

    // Search by name, email, company
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { whatsappNumber: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by country
    if (country) {
      query.country = country;
    }

    // Filter by business type
    if (businessType) {
      query.businessType = businessType;
    }

    if (role) {
      query.role = role;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(query)
      .select("-__v")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      users: users.map((user) => ({
        ...mapUserPayload(user),
        companyName: user.companyName || "N/A",
        whatsappNumber: user.whatsappNumber || "Not provided",
        country: user.country || "Not specified",
        businessType: user.businessType || "Other",
      })),
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};

// Delete user by Firebase UID
const deleteUser = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID is required",
      });
    }

    if (req.authUser?.firebaseUid === firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const deletedUser = await User.findOneAndDelete({ firebaseUid, role: { $in: ["customer", "user"] } });

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      user: {
        id: deletedUser._id,
        firebaseUid: deletedUser.firebaseUid,
        email: deletedUser.email,
      },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
};

const getAuthorizedPersons = async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ALLOWED_AUTHORIZED_ROLES } })
      .select("-__v")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      users: users.map(mapUserPayload),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch authorized persons",
      error: error.message,
    });
  }
};

const createAuthorizedPerson = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email?.toLowerCase().trim();

    if (!fullName || !normalizedEmail || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, password, and role are required",
      });
    }

    if (!ALLOWED_AUTHORIZED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or moderator",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const firebaseUser = await admin.auth().createUser({
      email: normalizedEmail,
      password,
      displayName: fullName,
    });

    const user = await User.create({
      firebaseUid: firebaseUser.uid,
      fullName,
      email: normalizedEmail,
      provider: "email",
      businessType: "Other",
      role,
    });

    return res.status(201).json({
      success: true,
      message: "Authorized person created successfully",
      user: mapUserPayload(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create authorized person",
      error: error.message,
    });
  }
};

const updateAuthorizedPerson = async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email?.toLowerCase().trim();

    const targetUser = await User.findOne({ firebaseUid });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!ALLOWED_AUTHORIZED_ROLES.includes(targetUser.role)) {
      return res.status(400).json({
        success: false,
        message: "Only admin and moderator can be updated here",
      });
    }

    if (role && !ALLOWED_AUTHORIZED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or moderator",
      });
    }

    if (normalizedEmail && normalizedEmail !== targetUser.email) {
      const emailConflict = await User.findOne({ email: normalizedEmail });
      if (emailConflict) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    const firebaseUpdatePayload = {};
    if (fullName !== undefined) firebaseUpdatePayload.displayName = fullName;
    if (normalizedEmail !== undefined) firebaseUpdatePayload.email = normalizedEmail;
    if (password !== undefined && password !== "") firebaseUpdatePayload.password = password;

    if (Object.keys(firebaseUpdatePayload).length > 0) {
      await admin.auth().updateUser(firebaseUid, firebaseUpdatePayload);
    }

    if (fullName !== undefined) targetUser.fullName = fullName;
    if (normalizedEmail !== undefined) targetUser.email = normalizedEmail;
    if (role !== undefined) targetUser.role = role;

    await targetUser.save();

    return res.status(200).json({
      success: true,
      message: "Authorized person updated successfully",
      user: mapUserPayload(targetUser),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update authorized person",
      error: error.message,
    });
  }
};

const deleteAuthorizedPerson = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    if (req.authUser?.firebaseUid === firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const targetUser = await User.findOne({ firebaseUid });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!ALLOWED_AUTHORIZED_ROLES.includes(targetUser.role)) {
      return res.status(400).json({
        success: false,
        message: "Only admin and moderator can be deleted here",
      });
    }

    await admin.auth().deleteUser(firebaseUid);
    await User.deleteOne({ firebaseUid });

    return res.status(200).json({
      success: true,
      message: "Authorized person deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete authorized person",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  deleteUser,
  getAuthorizedPersons,
  createAuthorizedPerson,
  updateAuthorizedPerson,
  deleteAuthorizedPerson,
};
