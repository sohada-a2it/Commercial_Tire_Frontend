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
    const { companyName, fullName, whatsappNumber, country, photoURL } = req.body;

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

module.exports = {
  registerUser,
  getUserProfile,
  updateUserProfile,
};
