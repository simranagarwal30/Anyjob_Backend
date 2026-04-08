import { Request, Response } from "express";
import admin from "firebase-admin";
import { NotificationModel } from "../models/notification.model";
import {
  FIREBASE_TYPE,
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_CLIENT_ID,
  FIREBASE_AUTH_URI,
  FIREBASE_AUTH_PROVIDER_CERT_URL,
  FIREBASE_CLIENT_CERT_URL,
  FIREBASE_UNIVERSE_DOMAIN,
  FIREBASE_TOKEN_URI,
} from "../config/config";
import { getMessaging } from "firebase-admin/messaging";
const serviceAccount = {
  type: FIREBASE_TYPE,
  project_id: FIREBASE_PROJECT_ID,
  private_key_id: FIREBASE_PRIVATE_KEY_ID,
  private_key: FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: FIREBASE_CLIENT_EMAIL,
  client_id: FIREBASE_CLIENT_ID,
  auth_uri: FIREBASE_AUTH_URI,
  token_uri: FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: FIREBASE_CLIENT_CERT_URL,
  universe_domain: FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as any),
});

export const firestore = admin.firestore(); //Gets firebase store
// console.log(firestore,"firestore");

// Store FCM token
export const storeFcmToken = async (req: Request, res: Response) => {
  try {
    const { userId, token, deviceId } = req.body;

    if (!userId || !token || !deviceId) {
      return res
        .status(400)
        .json({ message: "User ID, token, and device ID are required." });
    }

    const userRef = firestore.collection("fcmTokens").doc(userId);
    const doc = await userRef.get();

    const newEntry = { token, deviceId };

    if (doc.exists) {
      const existingTokens: { token: string; deviceId: string }[] =
        doc.data()?.tokens || [];

      const alreadyExists = existingTokens.some(
        (entry) => entry.deviceId === deviceId && entry.token === token
      );

      if (!alreadyExists) {
        await userRef.update({
          tokens: [...existingTokens, newEntry],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      await userRef.set({
        tokens: [newEntry],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ message: "Token stored successfully." });
  } catch (error) {
    console.error("Error storing FCM token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//remove stale tokens
export const removeStaleFcmTokens = async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const snapshot = await firestore.collection("fcmTokens").get();

    snapshot.forEach(async (doc) => {
      const { updatedAt, tokens } = doc.data();
      if (updatedAt?.toDate() < oneMonthAgo) {
        await doc.ref.delete();
        console.log(`Deleted stale tokens for user: ${doc.id}`);
      }
    });

    console.log("Stale tokens cleanup completed.");
  } catch (error) {
    console.error("Error removing stale FCM tokens:", error);
  }
};

// Function to send notification
// export default async function sendNotification(token: string, title: string, body: string, dbData?: object) {

//     const message = {
//         notification: { title, body },
//         token,
//     };
//     try {
//         const response = await admin.messaging().send(message);

//         if (dbData) {
//             const notification = new NotificationModel(dbData);
//             await notification.save();
//             console.log("Notification saved to database:", notification);
//         }
//         console.log("Notification sent successfully:", response);
//     } catch (error) {
//         console.error("Error sending notification:", error);
//     }

// };

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  dbData?: object
) {
  try {
    const userRef = firestore.collection("fcmTokens").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists)
      return console.log("No FCM tokens found for user:", userId);

    let tokens: any[] = doc.data()?.tokens || [];
    console.log({ tokens });
    const tokenArray = tokens.map((token) => token?.token);
    console.log({ tokenArray });

    const message = {
      notification: { body },
      tokens: tokenArray,
    };

    const response = await getMessaging().sendEachForMulticast(message);

    // Handle invalid tokens
    response.responses.forEach((res, index) => {
      if (
        !res.success &&
        (res.error?.code === "messaging/registration-token-not-registered" ||
          res.error?.code === "messaging/invalid-argument")
      ) {
        tokens.splice(index, 1);
      }
    });

    // Update Firestore if tokens were removed
    if (tokens.length === 0) {
      await userRef.delete();
    } else {
      await userRef.update({ tokens });
    }

    if (dbData) {
      const notification = new NotificationModel(dbData);
      await notification.save();
      // console.log("Notification saved to database:", notification);
    }

    console.log("Notification sent successfully");
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
