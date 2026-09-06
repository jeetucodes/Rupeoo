import { GoogleAuthProvider, signInWithCredential, UserCredential } from 'firebase/auth';
import { auth } from './firebase';
import { Alert, Platform } from 'react-native';

const GOOGLE_WEB_CLIENT_ID = '26927139619-8opf3vlb5mqj5em7j5aenp2i3bs15aml.apps.googleusercontent.com';
let configured = false;

export async function promptGoogleSignIn(): Promise<UserCredential> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gModule = require('@react-native-google-signin/google-signin');
    const GoogleSignin = gModule?.GoogleSignin;
    if (!GoogleSignin || typeof GoogleSignin.signIn !== 'function') {
      Alert.alert(
        'Google Sign-In',
        'Native Google Sign-In requires a standalone build or development build. Please use Email/Password in Expo Go.'
      );
      throw new Error('GoogleSignin native module unavailable');
    }

    if (!configured) {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
      });
      configured = true;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken || response.idToken;

    if (!idToken) throw new Error('No ID token found');

    const credential = GoogleAuthProvider.credential(idToken);
    return await signInWithCredential(auth, credential);
  } catch (err: any) {
    const code = err?.code;
    const message = err?.message;
    console.error('[GoogleAuth] Native Sign-In Error Details:', {
      code,
      message,
      nativeError: err,
      stringified: JSON.stringify(err, Object.getOwnPropertyNames(err || {})),
    });

    if (code === 'SIGN_IN_CANCELLED' || code === '12501') {
      throw new Error('Google sign-in was cancelled.');
    }
    if (code === 'DEVELOPER_ERROR' || code === '10') {
      throw new Error(
        `Google Sign-In is not configured for ${Platform.OS} (Error Code 10: DEVELOPER_ERROR). Check SHA-1 fingerprints in Firebase Console & Google Cloud Console. Details: ${message || ''}`
      );
    }
    if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      throw new Error('Google Play Services is unavailable or needs an update.');
    }
    throw err;
  }
}
