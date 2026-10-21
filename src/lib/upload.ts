import { storage } from '@/lib/firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { warn } from '@/lib/logger';

const CLOUDINARY_API_KEY = process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || '576483497684576';
const CLOUDINARY_API_SECRET = process.env.EXPO_PUBLIC_CLOUDINARY_API_SECRET || 'IFhiNRCh2oCRk5XTE45rK_jDhv4';
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dltxjvt8o';

/**
 * Lightweight 0-dependency SHA-1 for Cloudinary signed uploads.
 */
function fastSha1(str: string): string {
  function utf8(s: string) {
    return unescape(encodeURIComponent(s));
  }
  function hex(bin: number[]) {
    const tab = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < bin.length * 4; i++) {
      out += tab.charAt((bin[i >> 2] >> ((3 - (i % 4)) * 8 + 4)) & 0x0f) +
             tab.charAt((bin[i >> 2] >> ((3 - (i % 4)) * 8)) & 0x0f);
    }
    return out;
  }
  function add(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function rol(n: number, c: number) {
    return (n << c) | (n >>> (32 - c));
  }
  function ft(t: number, b: number, c: number, d: number) {
    if (t < 20) return (b & c) | (~b & d);
    if (t < 40) return b ^ c ^ d;
    if (t < 60) return (b & c) | (b & d) | (c & d);
    return b ^ c ^ d;
  }
  function kt(t: number) {
    return t < 20 ? 1518500249 : t < 40 ? 1859775393 : t < 60 ? -1894007588 : -899497514;
  }

  const s = utf8(str);
  const x: number[] = [];
  for (let i = 0; i < s.length * 8; i += 8) {
    x[i >> 5] |= (s.charCodeAt(i / 8) & 0xff) << (24 - (i % 32));
  }
  const len = s.length * 8;
  x[len >> 5] |= 0x80 << (24 - (len % 32));
  x[(((len + 64) >> 9) << 4) + 15] = len;

  const w = new Array(80);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878, e = -1009589776;

  for (let i = 0; i < x.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d, olde = e;
    for (let j = 0; j < 80; j++) {
      if (j < 16) w[j] = x[i + j] || 0;
      else w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      const t = add(add(rol(a, 5), ft(j, b, c, d)), add(add(e, w[j]), kt(j)));
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    a = add(a, olda); b = add(b, oldb); c = add(c, oldc); d = add(d, oldd); e = add(e, olde);
  }
  return hex([a, b, c, d, e]);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    ),
  ]);
}

/**
 * Uploads an image to Cloudinary using signed authentication via JSON body.
 */
export async function uploadImageToCloudinary(base64Data: string): Promise<string> {
  if (!base64Data) {
    throw new Error('No image data provided for upload');
  }

  if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME_HERE') {
    throw new Error('Cloudinary credentials (API Key, Secret, or Cloud Name) are missing in .env');
  }

  // Ensure standard data URI format for Cloudinary
  const formattedData = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Create signature string: timestamp=123456789[SECRET]
  const signatureString = `timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = fastSha1(signatureString);

  const request = fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: formattedData,
        api_key: CLOUDINARY_API_KEY,
        timestamp: timestamp,
        signature: signature,
      }),
    }
  ).then(res => res.json());

  interface CloudinaryUploadResponse {
    secure_url?: string;
    url?: string;
    error?: {
      message?: string;
    };
  }

  const response = (await withTimeout(request, 15000, 'Cloudinary upload timed out')) as CloudinaryUploadResponse;

  const uploadUrl = response?.secure_url || response?.url;
  if (uploadUrl) {
    return uploadUrl;
  }
  
  throw new Error(response?.error?.message || 'Invalid response from Cloudinary');
}

/**
 * Uploads an image to Firebase Storage with 3s fast timeout.
 */
async function uploadToFirebaseStorage(formattedDataUrl: string): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  const filename = `avatars/avatar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
  const storageRef = ref(storage, filename);

  const uploadTask = (async () => {
    await uploadString(storageRef, formattedDataUrl, 'data_url');
    return await getDownloadURL(storageRef);
  })();

  return await withTimeout(uploadTask, 3000, 'Firebase Storage timed out');
}

/**
 * Primary image uploader with Cloudinary, Firebase Storage, and instant Data URI fallbacks.
 * Guaranteed to never hang or block the user.
 * @param base64Data Base64 encoded image string or data URI
 */
export async function uploadImage(base64Data: string): Promise<string> {
  if (!base64Data) {
    throw new Error('No image data provided for upload');
  }

  // Ensure standard data URI format
  const formattedData = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  // 1. Try Cloudinary first (if configured)
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME_HERE') {
    try {
      const cloudinaryUrl = await uploadImageToCloudinary(formattedData);
      if (cloudinaryUrl) return cloudinaryUrl;
    } catch (cloudinaryErr: unknown) {
      warn('Cloudinary upload error/timeout, continuing fallback:', cloudinaryErr instanceof Error ? cloudinaryErr.message : cloudinaryErr);
    }
  }

  // 2. Try Firebase Storage (max 3s)
  try {
    const firebaseUrl = await uploadToFirebaseStorage(formattedData);
    if (firebaseUrl) return firebaseUrl;
  } catch (firebaseErr: unknown) {
    warn('Firebase Storage not reachable/timed out, using instant fallback:', firebaseErr instanceof Error ? firebaseErr.message : firebaseErr);
  }

  // 3. Instant Resilient Fallback: return formatted data URI directly so avatar saves immediately!
  return formattedData;
}
