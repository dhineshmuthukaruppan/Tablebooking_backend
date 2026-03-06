import { firebaseAdminAuth } from "../../config/firebase-admin";

export interface DecodedIdToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

export async function verifyIdToken(idToken: string | undefined): Promise<DecodedIdToken | null> {
  if (!idToken || typeof idToken !== "string") return null;
  try {
    return await firebaseAdminAuth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}
