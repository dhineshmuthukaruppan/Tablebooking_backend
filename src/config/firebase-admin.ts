import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env";

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    // Always use the explicit Firebase service account from env/Secret Manager
    // so local dev and Cloud Run use the same Firebase project.
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    }),
  });

export const firebaseAdminAuth = getAuth(firebaseApp);
