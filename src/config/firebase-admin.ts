import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env";

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential:
      env.NODE_ENV === "production"
        ? applicationDefault()
        : cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: env.FIREBASE_PRIVATE_KEY,
          }),
  });

export const firebaseAdminAuth = getAuth(firebaseApp);
