const User = require("../models/User");
const AuthorizedPerson = require("../models/AuthorizedPerson");
const jwt = require("jsonwebtoken");
const {
  admin,
  isFirebaseAdminReady,
  getFirebaseAdminInitError,
} = require("../config/firebaseAdmin");

const verifyAuthorizedJwt = async (token) => {
  const secret = process.env.JWT_SECRET || "local-dev-jwt-secret";
  const payload = jwt.verify(token, secret);

  if (payload?.type !== "authorized" || !payload?.sub) {
    throw new Error("Invalid authorized token payload");
  }

  const authorizedUser = await AuthorizedPerson.findById(payload.sub);
  if (!authorizedUser) {
    throw new Error("Authorized account not found");
  }

  return {
    authUser: authorizedUser,
    decodedToken: payload,
  };
};

const verifyTokenWithIdentityToolkit = async (token) => {
  const webApiKey = process.env.FIREBASE_WEB_API_KEY;

  if (!webApiKey) {
    throw new Error(
      "Firebase Admin is not configured and FIREBASE_WEB_API_KEY is missing for fallback token verification"
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${webApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken: token }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.users || data.users.length === 0) {
    const firebaseMessage = data?.error?.message || "Invalid token";
    throw new Error(`Identity Toolkit verification failed: ${firebaseMessage}`);
  }

  const firebaseUser = data.users[0];
  return {
    uid: firebaseUser.localId,
    email: firebaseUser.email,
  };
};

const getBearerToken = (authorizationHeader = "") => {
  const [prefix, token] = authorizationHeader.split(" ");
  if (prefix !== "Bearer" || !token) {
    return null;
  }
  return token;
};

const authenticate = async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid authorization token",
      });
    }

    let dbUser = null;
    let decodedToken = null;

    try {
      const authorizedResult = await verifyAuthorizedJwt(token);
      dbUser = authorizedResult.authUser;
      decodedToken = authorizedResult.decodedToken;
    } catch (_jwtError) {
      if (isFirebaseAdminReady()) {
        decodedToken = await admin.auth().verifyIdToken(token);
      } else {
        decodedToken = await verifyTokenWithIdentityToolkit(token);
      }

      const authorizedUser = await AuthorizedPerson.findOne({
        firebaseUid: decodedToken.uid,
      });
      const customerUser = !authorizedUser
        ? await User.findOne({ firebaseUid: decodedToken.uid })
        : null;
      dbUser = authorizedUser || customerUser;
    }

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: "User not found in database",
      });
    }

    req.authUser = dbUser;
    if (req.authUser?.role === "user") {
      req.authUser.role = "customer";
    }
    req.decodedToken = decodedToken;
    next();
  } catch (error) {
    const fallbackHint = isFirebaseAdminReady()
      ? ""
      : ` (${getFirebaseAdminInitError()})`;
    return res.status(401).json({
      success: false,
      message: `Unauthorized request${fallbackHint}`,
      error: error.message,
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.authUser || req.authUser.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

module.exports = {
  authenticate,
  requireAdmin,
};
