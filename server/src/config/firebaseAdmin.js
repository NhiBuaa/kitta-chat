const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const loadServiceAccount = () => {
  try {
    return require("./firebase-service.json");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error("Firebase Admin credentials are not configured");
    }
    throw error;
  }
};

const getFirebaseApp = () => {
  if (getApps().length) return getApps()[0];

  const serviceAccount = loadServiceAccount();
  return initializeApp({
    credential: cert(serviceAccount),
  });
};

module.exports = {
  auth: () => getAuth(getFirebaseApp()),
  getFirebaseAdmin: getFirebaseApp,
};
