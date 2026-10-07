import { Platform, Share, NativeModules } from 'react-native';
import * as Sharing from 'expo-sharing';

export interface ShareImageAndTextOptions {
  uri: string;
  text?: string;
  title?: string;
  dialogTitle?: string;
}

/**
 * Shares an image together with text caption.
 * On Android, uses the native RupeoShare module to trigger the Android system share sheet
 * with both the image file and caption text attached together in the Intent (no clipboard copying).
 * On iOS, uses the native Share sheet with url (image) + message (text).
 */
export async function shareImageAndText({
  uri,
  text,
  title,
  dialogTitle,
}: ShareImageAndTextOptions): Promise<void> {
  const dTitle = dialogTitle || title || 'Rupeo Share';

  // 1. Android: Use native RupeoShare to send BOTH image and text caption together
  if (Platform.OS === 'android') {
    if (NativeModules.RupeoShare?.shareImageAndText) {
      try {
        await NativeModules.RupeoShare.shareImageAndText(uri, text || '', dTitle);
        return;
      } catch (nativeErr) {
        console.warn('Native RupeoShare error, falling back:', nativeErr);
      }
    }
  }

  // 2. iOS: Share.share handles message (text caption) + url (image)
  if (Platform.OS === 'ios') {
    try {
      await Share.share({
        title: dTitle,
        message: text || '',
        url: uri,
      });
      return;
    } catch (iosErr) {
      console.warn('iOS share error, falling back to standard Sharing:', iosErr);
    }
  }

  // 3. Fallback: standard Expo Sharing (shares image file directly, without copying to clipboard)
  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: dTitle,
        UTI: 'public.png',
      });
      return;
    } catch (expoSharingErr) {
      console.warn('Expo sharing failed:', expoSharingErr);
    }
  }

  // 4. Fallback: text only if file sharing is completely unavailable
  if (text) {
    await Share.share({
      title: dTitle,
      message: text,
    });
  }
}
