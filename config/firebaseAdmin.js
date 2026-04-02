const admin = require("firebase-admin");

let initialized = false;
let initError = null;

const parseServiceAccountFromEnv = () => {
  const directJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (directJson) {
    return JSON.parse(directJson);
  }

  const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64Json) {
    const decoded = Buffer.from(base64Json, "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
};

const initializeFirebaseAdmin = () => {
  if (initialized) {
    return;
  }

  try {
    const serviceAccount = parseServiceAccountFromEnv();

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      initialized = true;
      return;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      initialized = true;
      return;
    }

    initError =
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_PROJECT_ID+FIREBASE_CLIENT_EMAIL+FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.";
  } catch (error) {
    initError = `Firebase Admin init failed: ${error.message}`;
  }
};

initializeFirebaseAdmin();

const isFirebaseAdminReady = () => initialized;

const getFirebaseAdminInitError = () => initError;

module.exports = {
  admin,
  isFirebaseAdminReady,
  getFirebaseAdminInitError,
};
