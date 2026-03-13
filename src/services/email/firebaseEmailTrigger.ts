import { firestore } from "../../config/firebase-admin";

const FIRESTORE_MAIL_COLLECTION = "mail";

interface FirebaseEmailTriggerPayload {
  to: string;
  subject: string;
  html: string;
}

export async function triggerFirebaseEmail({
  to,
  subject,
  html,
}: FirebaseEmailTriggerPayload): Promise<void> {
  try {
    // Queue an email document for the Firebase Email Trigger extension.
    console.info("[email] Queueing email in Firestore", {
      collection: FIRESTORE_MAIL_COLLECTION,
      to,
      subject,
    });

    const mailDocRef = await firestore.collection(FIRESTORE_MAIL_COLLECTION).add({
      to: [to],
      message: {
        subject,
        html,
      },
    });

    console.info("[email] Email queued in Firestore mail collection", {
      collection: FIRESTORE_MAIL_COLLECTION,
      documentId: mailDocRef.id,
      to,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] Failed to queue Firestore email", {
      collection: FIRESTORE_MAIL_COLLECTION,
      to,
      subject,
      error: err instanceof Error ? err.message : err,
    });
  }
}

