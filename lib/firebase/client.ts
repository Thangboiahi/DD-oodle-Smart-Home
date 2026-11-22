/**
 * DD oodle Smart Home — Firebase Client Initialization (Firestore + Auth)
 * Uses provisioned firebase-applet-config.json and targets the named Firestore database ID.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

let connectionChecked = false;

/**
 * Validates live Firestore connectivity on client boot to detect
 * misconfigured database IDs or offline configuration errors early.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (connectionChecked) return true;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase Firestore client is offline — verify firebase-applet-config.json.');
      return false;
    }
    // Permission denied on synthetic probe still proves the server endpoint is reachable
    return true;
  }
}

export { app };
