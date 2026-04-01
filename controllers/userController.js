const User = require("../models/User");

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

    // Validate required fields
    if (!firebaseUid || !email || !fullName) {
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

      await user.save();

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: {
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
          role: user.role,
        },
      });
    }

    // Check if email already exists with different firebaseUid
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered with another account",
      });
    }

    // Create new user
    user = new User({
      firebaseUid,
      companyName,
      fullName,
      email,
      whatsappNumber,
      country,
      provider: provider || "email",
      photoURL,
      businessType,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
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
        role: user.role,
      },
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
      user: {
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
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
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
      user: {
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
        role: user.role,
      },
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
    const { page = 1, limit = 10, search = "", country = "", businessType = "" } = req.query;

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
        id: user._id,
        firebaseUid: user.firebaseUid,
        companyName: user.companyName || "N/A",
        fullName: user.fullName,
        email: user.email,
        whatsappNumber: user.whatsappNumber || "Not provided",
        country: user.country || "Not specified",
        businessType: user.businessType || "Other",
        provider: user.provider,
        photoURL: user.photoURL,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
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

    const deletedUser = await User.findOneAndDelete({ firebaseUid });

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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

module.exports = {
  registerUser,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  deleteUser,
};
