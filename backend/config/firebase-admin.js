// config/firebase-admin.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  try {
    // Download service account key from Firebase Console:
    // Project Settings > Service Accounts > Generate New Private Key
    const serviceAccount = require('./serviceAccountKey.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'smart-attendance-a9ab4'
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.error('Make sure serviceAccountKey.json exists in the config folder');
  }
}

module.exports = admin;
