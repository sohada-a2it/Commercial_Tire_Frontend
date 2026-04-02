const mongoose = require("mongoose");
const User = require("../models/User");
const {
  admin,
  isFirebaseAdminReady,
  getFirebaseAdminInitError,
} = require("./firebaseAdmin");

const createDefaultAdminWithWebApi = async ({ email, password, displayName }) => {
  const webApiKey = process.env.FIREBASE_WEB_API_KEY;

  if (!webApiKey) {
    throw new Error(
      "FIREBASE_WEB_API_KEY is required for fallback default admin creation"
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${webApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const data = await response.json();

  if (response.ok && data.localId) {
    return {
      uid: data.localId,
      displayName,
      email,
    };
  }

  const firebaseMessage = data?.error?.message;
  if (firebaseMessage === "EMAIL_EXISTS") {
    throw new Error(
      `Default admin already exists in Firebase Auth (${email}). Login with existing password or reset it from Firebase Console.`
    );
  }

  throw new Error(`Fallback Firebase signUp failed: ${firebaseMessage || "Unknown error"}`);
};

const waitForDbConnection = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onConnected = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      mongoose.connection.off("connected", onConnected);
      mongoose.connection.off("error", onError);
    };

    mongoose.connection.on("connected", onConnected);
    mongoose.connection.on("error", onError);
  });
};

const seedDefaultAdmin = async () => {
  const defaultAdminEmail =
    (process.env.DEFAULT_ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "")
      .toLowerCase()
      .trim();
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "";
  const defaultAdminName = process.env.DEFAULT_ADMIN_NAME || "Default Admin";

  if (!defaultAdminEmail || !defaultAdminPassword) {
    console.log(
      "Skipping default admin seed: set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD."
    );
    return;
  }

  if (defaultAdminPassword.length < 6) {
    console.log("Skipping default admin seed: DEFAULT_ADMIN_PASSWORD must be at least 6 characters.");
    return;
  }

  try {
    await waitForDbConnection();

    let firebaseUser;
    if (isFirebaseAdminReady()) {
      try {
        firebaseUser = await admin.auth().getUserByEmail(defaultAdminEmail);
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }

        firebaseUser = await admin.auth().createUser({
          email: defaultAdminEmail,
          password: defaultAdminPassword,
          displayName: defaultAdminName,
        });
        console.log(`Created Firebase default admin: ${defaultAdminEmail}`);
      }
    } else {
      console.log(
        `Firebase Admin unavailable, using Web API fallback for default admin seed: ${getFirebaseAdminInitError()}`
      );
      firebaseUser = await createDefaultAdminWithWebApi({
        email: defaultAdminEmail,
        password: defaultAdminPassword,
        displayName: defaultAdminName,
      });
      console.log(`Created Firebase default admin via Web API: ${defaultAdminEmail}`);
    }

    const existingDbUser = await User.findOne({ email: defaultAdminEmail });
    if (existingDbUser) {
      if (existingDbUser.role !== "admin") {
        existingDbUser.role = "admin";
        await existingDbUser.save();
      }
      console.log(`Default admin already exists in MongoDB: ${defaultAdminEmail}`);
      return;
    }

    await User.create({
      firebaseUid: firebaseUser.uid,
      fullName: firebaseUser.displayName || defaultAdminName,
      email: defaultAdminEmail,
      provider: "email",
      businessType: "Other",
      role: "admin",
    });

    console.log(`Created MongoDB default admin: ${defaultAdminEmail}`);
  } catch (error) {
    console.error("Default admin seed failed:", error.message);
  }
};

module.exports = seedDefaultAdmin;