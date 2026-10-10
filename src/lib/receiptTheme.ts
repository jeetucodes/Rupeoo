import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReceiptTheme = 'gradient_slip' | 'classic_amber' | 'midnight_obsidian';

const DEFAULT_THEME_KEY = '@rupeo_default_receipt_theme';

export async function getDefaultReceiptTheme(): Promise<ReceiptTheme> {
  try {
    const saved = await AsyncStorage.getItem(DEFAULT_THEME_KEY);
    if (saved === 'gradient_slip' || saved === 'classic_amber' || saved === 'midnight_obsidian') {
      return saved as ReceiptTheme;
    }
  } catch (err) {
    console.warn('Failed to load default receipt theme:', err);
  }
  return 'gradient_slip';
}

export async function setDefaultReceiptTheme(theme: ReceiptTheme): Promise<void> {
  try {
    await AsyncStorage.setItem(DEFAULT_THEME_KEY, theme);
  } catch (err) {
    console.warn('Failed to save default receipt theme:', err);
  }
}
