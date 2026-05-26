const admin = require("firebase-admin");

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

const getFirebaseAdmin = () => {
  if (admin.apps.length) return admin;

  const serviceAccount = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
};

module.exports = {
  auth: () => getFirebaseAdmin().auth(),
  getFirebaseAdmin,
};
