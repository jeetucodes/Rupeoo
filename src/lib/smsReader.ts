/**
 * Message text parser & splitter for clipboard and pasted text import.
 *
 * NOTE: Direct SMS inbox reading and Android SMS permissions (READ_SMS, RECEIVE_SMS)
 * have been completely removed in favor of the 100% on-device Notification Listener.
 * This module retains only client-side text splitting for clipboard/paste fallbacks.
 */

export interface RawSmsMessage {
  _id?: string;
  address: string;
  body: string;
  date: number;
  date_sent?: number;
}

/**
 * Native SMS inbox reading is completely disabled/removed.
 */
export function isInboxImportSupported(): boolean {
  return false;
}

export const isSmsInboxSupported = isInboxImportSupported;

/**
 * Splits a multi-message pasted text string into distinct messages.
 * Supports splitting on blank lines, double line breaks, or Indian DLT headers.
 */
export function splitMultiMessagePaste(rawText: string): Array<{ sender: string; body: string; timestamp: number }> {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();

  // Strategy 1: Check if pasted text contains explicit multiple DLT headers
  // e.g. "AD-HDFCBK: Dear customer... VM-ICICIB: Dear..."
  const headerSplitPattern = /(?=(?:[A-Za-z]{2}-[A-Za-z0-9]{3,8}(?:-[A-Za-z])?[:\s\n]))/g;
  const headerChunks = text.split(headerSplitPattern).map((c) => c.trim()).filter(Boolean);

  if (headerChunks.length > 1) {
    return headerChunks.map((chunk) => {
      const headerMatch = chunk.match(/^([A-Za-z]{2}-[A-Za-z0-9]{3,8}(?:-[A-Za-z])?)[:\s\n]+/);
      if (headerMatch) {
        const sender = headerMatch[1];
        const body = chunk.substring(headerMatch[0].length).trim();
        return { sender, body, timestamp: Date.now() };
      }
      return { sender: '', body: chunk, timestamp: Date.now() };
    });
  }

  // Strategy 2: Split by blank lines or multiple newlines
  const blankLineChunks = text.split(/\r?\n\s*\r?\n+/).map((c) => c.trim()).filter(Boolean);
  if (blankLineChunks.length > 1) {
    return blankLineChunks.map((chunk) => {
      const headerMatch = chunk.match(/^([A-Za-z0-9-]{3,12})[:\s\n]+/);
      if (headerMatch && /^[A-Z0-9-]+$/i.test(headerMatch[1])) {
        return {
          sender: headerMatch[1],
          body: chunk.substring(headerMatch[0].length).trim(),
          timestamp: Date.now(),
        };
      }
      return { sender: '', body: chunk, timestamp: Date.now() };
    });
  }

  // Single message
  return [{ sender: '', body: text, timestamp: Date.now() }];
}

export const splitMultiMessageText = splitMultiMessagePaste;
