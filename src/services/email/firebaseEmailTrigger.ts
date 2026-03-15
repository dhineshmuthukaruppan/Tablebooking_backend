import { firestore } from "../../config/firebase-admin";

const FIRESTORE_MAIL_COLLECTION = "mail";

interface FirebaseEmailTriggerPayload {
  to: string | string[];
  subject: string;
  html: string;
}

export async function triggerFirebaseEmail({
  to,
  subject,
  html,
}: FirebaseEmailTriggerPayload): Promise<void> {
  try {
    const recipients = Array.from(
      new Set((Array.isArray(to) ? to : [to]).map((email) => email.trim()).filter(Boolean))
    );

    if (recipients.length === 0) {
      return;
    }

    // Queue an email document for the Firebase Email Trigger extension.
    console.info("[email] Queueing email in Firestore", {
      collection: FIRESTORE_MAIL_COLLECTION,
      to: recipients,
      subject,
    });

    const mailDocRef = await firestore.collection(FIRESTORE_MAIL_COLLECTION).add({
      to: recipients,
      message: {
        subject,
        html,
      },
    });

    console.info("[email] Email queued in Firestore mail collection", {
      collection: FIRESTORE_MAIL_COLLECTION,
      documentId: mailDocRef.id,
      to: recipients,
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

