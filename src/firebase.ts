import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize core Firebase client
const app = initializeApp(firebaseConfig);

// Initialize Firestore database instance
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
