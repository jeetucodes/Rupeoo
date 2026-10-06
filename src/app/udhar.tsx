import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Linking,
  Share,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
  BackHandler,
  Image,
  Clipboard,
  NativeModules,
  Switch,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Contacts from 'expo-contacts';
import * as LegacyContacts from 'expo-contacts/legacy';

// Safe dynamic getter for expo-media-library that avoids crashing on Web / environments without native module
const getMediaLibrary = () => {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-media-library');
  } catch {
    return null;
  }
};

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { insertTransaction, deleteTransaction } from '@/lib/database';
import { safeGoBack } from '@/lib/navigation';
import { validateUpiId, validateAmount, generateUpiUri, sanitizeUpiId } from '@/lib/splitPayment';
import { ThreeDDoubleTickIcon, ThreeDPendingClockIcon } from '@/components/ThreeDIcons';

const RUPEO_DOWNLOAD_URL = 'https://rupeoo.vercel.app/download';
import {
  FriendContact,
  UdharEntry,
  FriendSummary,
  UdharEntryType,
  InterestPeriod,
  InterestCalcType,
  calculateAccruedInterest,
  getDynamicEntryAmount,
  saveFriend,
  deleteFriend,
  addUdharEntry,
  deleteUdharEntry,
  getAllFriendsSummaries,
  getUdharEntries,
  getLastUsedUpiId,
  saveLastUsedUpiId,
  getShowUdharOnDashboard,
  setShowUdharOnDashboard,
  getSyncUdharToDashboardTx,
  setSyncUdharToDashboardTx,
} from '@/lib/udharStorage';
import {
  generateUdharInvoiceWhatsAppText,
  generateAndShareInvoicePDF,
  generateInvoicePDFOnly,
  shareInvoiceDirectToWhatsApp,
  getInitials,
  GroupedEntryInvoiceData,
  UdharInvoiceOptions,
} from '@/lib/udharInvoice';
import { getLocalDateString, formatTime12Hour } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';

import { Image as ExpoImage } from 'expo-image';

const UDHAR_ICONS = {
  ledger: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Ledger.png',
  moneyBag: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20Bag.png',
  moneyWings: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20with%20Wings.png',
  sparkles: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Sparkles.png',
  receipt: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Receipt.png',
};

const AVATAR_PALETTES = [
  { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  { bg: '#FDF2F8', text: '#DB2777', border: '#FBCFE8' },
  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  { bg: '#F0FDFA', text: '#0D9488', border: '#99F6E4' },
  { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
];

function getAvatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

const POPULAR_HANDLES = [
  { id: 'hdfc', handle: '@okhdfcbank' },
  { id: 'gpay', handle: '@okaxis' },
  { id: 'phonepe', handle: '@ybl' },
  { id: 'paytm', handle: '@ptaxis' },
  { id: 'icici', handle: '@icici' },
  { id: 'sbi', handle: '@oksbi' },
];

export default function UdharScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, settings } = useAuth();
  const { t, lang } = useTranslation();
  const curr = settings?.currency || '₹';

  // Summaries & State
  const [loading, setLoading] = useState<boolean>(true);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [totalToReceive, setTotalToReceive] = useState<number>(0);
  const [totalToPay, setTotalToPay] = useState<number>(0);
  const [netBalance, setNetBalance] = useState<number>(0);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'to_get' | 'to_pay' | 'settled'>('all');

  // Modals
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState<boolean>(false);
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null);
  const [newFriendName, setNewFriendName] = useState<string>('');
  const [newFriendPhone, setNewFriendPhone] = useState<string>('');
  const [newFriendPhotoUri, setNewFriendPhotoUri] = useState<string | null>(null);
  const [isSavingFriend, setIsSavingFriend] = useState<boolean>(false);
  const [isImportingContact, setIsImportingContact] = useState<boolean>(false);
  const [isContactListModalOpen, setIsContactListModalOpen] = useState<boolean>(false);
  const [deviceContacts, setDeviceContacts] = useState<Array<{ id: string; name: string; phone: string; photoUri?: string }>>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(false);
  const [contactSearchQuery, setContactSearchQuery] = useState<string>('');

  // Add Entry Modal
  const [isAddEntryModalOpen, setIsAddEntryModalOpen] = useState<boolean>(false);
  const [selectedFriendForEntry, setSelectedFriendForEntry] = useState<FriendSummary | null>(null);
  const [entryAmount, setEntryAmount] = useState<string>('');
  const [entryType, setEntryType] = useState<UdharEntryType>('gave');
  const [entryNote, setEntryNote] = useState<string>('');
  const [isSavingEntry, setIsSavingEntry] = useState<boolean>(false);

  // Friend Detail Ledger Modal
  const [selectedFriendDetail, setSelectedFriendDetail] = useState<FriendSummary | null>(null);
  const [friendEntries, setFriendEntries] = useState<UdharEntry[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);

  // Payment Request (UPI QR + WhatsApp) Modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [requestFriend, setRequestFriend] = useState<FriendSummary | null>(null);
  const [requestAmount, setRequestAmount] = useState<string>('');
  const [myUpiId, setMyUpiId] = useState<string>('');
  const [isQrGenerated, setIsQrGenerated] = useState<boolean>(false);
  const qrPassCardRef = useRef<View>(null);
  const [isSharingImage, setIsSharingImage] = useState<boolean>(false);

  // Phone number prompt modal
  const [isAddPhoneModalOpen, setIsAddPhoneModalOpen] = useState<boolean>(false);
  const [friendPhoneInput, setFriendPhoneInput] = useState<string>('');
  const [isSavingPhone, setIsSavingPhone] = useState<boolean>(false);

  // Delete friend modal state
  const [isDeleteFriendModalOpen, setIsDeleteFriendModalOpen] = useState<boolean>(false);
  const [friendToDelete, setFriendToDelete] = useState<FriendSummary | null>(null);
  const [isDeletingFriend, setIsDeletingFriend] = useState<boolean>(false);

  // Delete entry modal state
  const [isDeleteEntryModalOpen, setIsDeleteEntryModalOpen] = useState<boolean>(false);
  const [entryToDelete, setEntryToDelete] = useState<UdharEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState<boolean>(false);

  // Settle Balance Modal State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState<boolean>(false);
  const [settleFriend, setSettleFriend] = useState<FriendSummary | null>(null);
  const [settleTargetEntry, setSettleTargetEntry] = useState<UdharEntry | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleMode, setSettleMode] = useState<'Cash' | 'UPI' | 'Bank'>('Cash');
  const [isSettling, setIsSettling] = useState<boolean>(false);

  // Interest Modal State
  const [isInterestModalOpen, setIsInterestModalOpen] = useState<boolean>(false);
  const [interestTarget, setInterestTarget] = useState<'balance' | 'entry'>('balance');
  const [interestTargetEntry, setInterestTargetEntry] = useState<UdharEntry | null>(null);
  const [interestPeriod, setInterestPeriod] = useState<InterestPeriod>('monthly');
  const [interestStartDate, setInterestStartDate] = useState<string>(getLocalDateString(new Date()));
  const [interestCalcType, setInterestCalcType] = useState<InterestCalcType>('pro_rata');
  const [interestRateInput, setInterestRateInput] = useState<string>('2');
  const [interestNoteInput, setInterestNoteInput] = useState<string>('');
  const [isSavingInterest, setIsSavingInterest] = useState<boolean>(false);

  // Invoice & Receipt Modal State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [invoiceMode, setInvoiceMode] = useState<'single' | 'all'>('single');
  const [invoiceSingleGroup, setInvoiceSingleGroup] = useState<GroupedEntryInvoiceData | null>(null);
  const [isGeneratingInvoicePdf, setIsGeneratingInvoicePdf] = useState<boolean>(false);
  const [isSharingInvoicePhoto, setIsSharingInvoicePhoto] = useState<boolean>(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<boolean>(false);
  const [isSharingInvoice, setIsSharingInvoice] = useState<boolean>(false);
  const [generatedInvoiceUri, setGeneratedInvoiceUri] = useState<string | null>(null);
  const [generatedInvoiceType, setGeneratedInvoiceType] = useState<'pdf' | 'photo' | null>(null);
  const invoicePreviewRef = useRef<View>(null);

  // Load friends summary data (offline-first & instant)
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(prev => (friends.length === 0 ? true : prev));
      }
      const res = await getAllFriendsSummaries(user?.uid);
      setFriends(res.friends);
      setTotalToReceive(res.totalToReceive);
      setTotalToPay(res.totalToPay);
      setNetBalance(res.netBalance);
    } catch (err) {
      console.warn('Failed to load udhar data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, friends.length]);

  // Dashboard Spends sync preference (controlled from Settings or Friends card)
  const [syncOnDashboardDefault, setSyncOnDashboardDefault] = useState<boolean>(false);

  // Collapsible settlement thread breakdown state (key: parentId, value: boolean)
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  const toggleThread = (parentId: string) => {
    setExpandedThreads(prev => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  // Load last UPI ID and dashboard toggle preference on mount
  useEffect(() => {
    loadData();
    getLastUsedUpiId(user?.uid).then((saved) => {
      if (saved) setMyUpiId(saved);
    });
    getSyncUdharToDashboardTx(user?.uid).then((val) => {
      setSyncOnDashboardDefault(val);
    });
  }, [loadData, user?.uid]);

  const handleToggleDashboard = async (val: boolean) => {
    setSyncOnDashboardDefault(val);
    await setSyncUdharToDashboardTx(user?.uid, val);
    triggerTransactionVibration().catch(() => { });
    Toast.show({
      type: 'info',
      text1: val ? (lang === 'Hindi' ? 'डैशबोर्ड में शामिल' : 'Added to Dashboard Spends') : (lang === 'Hindi' ? 'डैशबोर्ड से अलग' : 'Separate from Dashboard'),
      text2: val
        ? (lang === 'Hindi' ? 'उधार लेन-देन होम स्क्रीन खर्च और बजट में जुड़ेंगे' : 'Udhar entries will record in Home spends')
        : (lang === 'Hindi' ? 'उधार लेन-देन सिर्फ खाताबुक में रहेंगे' : 'Udhar entries will stay in Khata only'),
      position: 'top',
      visibilityTime: 2500,
    });
  };

  // Handle Android hardware back button when inside friend detail
  useEffect(() => {
    if (!selectedFriendDetail) return;
    const backAction = () => {
      setSelectedFriendDetail(null);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectedFriendDetail]);

  // Load entries for selected friend detail
  const loadFriendEntries = useCallback(
    async (friendId: string) => {
      try {
        setIsLoadingEntries(true);
        const entries = await getUdharEntries(user?.uid, friendId);
        setFriendEntries(entries);
      } catch (err) {
        console.warn('Failed to load friend entries:', err);
      } finally {
        setIsLoadingEntries(false);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    if (selectedFriendDetail) {
      loadFriendEntries(selectedFriendDetail.id);
    }
  }, [selectedFriendDetail, loadFriendEntries]);

  // Filtered Friends
  const filteredFriends = useMemo(() => {
    return friends.filter((f) => {
      // Search filter
      const matchesSearch =
        !searchQuery.trim() ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (f.phone && f.phone.includes(searchQuery.trim()));

      if (!matchesSearch) return false;

      // Tab filter
      if (activeFilter === 'to_get') return f.balance > 0;
      if (activeFilter === 'to_pay') return f.balance < 0;
      if (activeFilter === 'settled') return f.balance === 0;
      return true;
    });
  }, [friends, searchQuery, activeFilter]);

  const toGetCount = useMemo(() => friends.filter((f) => f.balance > 0).length, [friends]);
  const toPayCount = useMemo(() => friends.filter((f) => f.balance < 0).length, [friends]);
  const settledCount = useMemo(() => friends.filter((f) => f.balance === 0).length, [friends]);

  // Pick profile photo for friend
  const handlePickFriendPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Toast.show({
          type: 'error',
          text1: 'Permission Required',
          text2: 'Gallery access is needed to pick a profile photo.',
          position: 'top',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        try {
          const manip = await manipulateAsync(
            asset.uri,
            [{ resize: { width: 240, height: 240 } }],
            { compress: 0.6, format: SaveFormat.JPEG, base64: true }
          );
          const finalUri = manip.base64 ? `data:image/jpeg;base64,${manip.base64}` : manip.uri;
          setNewFriendPhotoUri(finalUri);
        } catch {
          setNewFriendPhotoUri(asset.uri);
        }
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Photo Pick Failed',
        text2: err?.message || 'Could not pick photo.',
        position: 'top',
      });
    }
  };

  // Open Add Friend Modal
  const openAddFriendModal = () => {
    setEditingFriendId(null);
    setNewFriendName('');
    setNewFriendPhone('');
    setNewFriendPhotoUri(null);
    setIsAddFriendModalOpen(true);
  };

  // Open Edit Friend Modal
  const openEditFriendModal = (friend: FriendSummary) => {
    setEditingFriendId(friend.id);
    setNewFriendName(friend.name);
    setNewFriendPhone(friend.phone || '');
    setNewFriendPhotoUri(friend.photoUri || null);
    setIsAddFriendModalOpen(true);
  };

  // Apply selected contact details to Add Friend form
  const applyContactToFriend = (contact: any) => {
    let name = (contact.name || '').trim();
    if (!name) {
      name = [contact.firstName, contact.middleName, contact.lastName].filter(Boolean).join(' ').trim();
    }
    if (name) {
      setNewFriendName(name);
    }

    let phoneStr = '';
    if (Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0) {
      phoneStr = contact.phoneNumbers[0]?.number || '';
    } else if (typeof contact.phone === 'string') {
      phoneStr = contact.phone;
    }

    if (phoneStr) {
      let clean = phoneStr.replace(/[^\d+]/g, '');
      if (clean.startsWith('+91')) {
        clean = clean.slice(3);
      } else if (clean.startsWith('91') && clean.length === 12) {
        clean = clean.slice(2);
      } else if (clean.startsWith('0') && clean.length === 11) {
        clean = clean.slice(1);
      }
      clean = clean.replace(/\D/g, '').slice(-10);
      setNewFriendPhone(clean);
    }

    const photo = contact.image?.uri || contact.rawImage?.uri || contact.photoUri || null;
    if (photo) {
      setNewFriendPhotoUri(photo);
    }

    Toast.show({
      type: 'success',
      text1: 'Contact Imported ✨',
      text2: name ? `${name} details auto-filled.` : 'Details auto-filled.',
      position: 'top',
    });
  };

  // Open native contact picker or fallback to in-app contact browser
  const handlePickFromContacts = async () => {
    try {
      setIsImportingContact(true);

      let hasPermission = false;

      // 1. Check and request via Android native PermissionsAndroid
      if (Platform.OS === 'android') {
        try {
          const alreadyGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_CONTACTS
          );
          if (alreadyGranted) {
            hasPermission = true;
          } else {
            const status = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
              {
                title: 'Contacts Permission',
                message: 'Rupeo needs access to your contacts to quickly pick friends and auto-fill details.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
              }
            );
            if (status === PermissionsAndroid.RESULTS.GRANTED) {
              hasPermission = true;
            }
          }
        } catch (androidErr) {
          console.warn('Android permissions check error:', androidErr);
        }
      }

      // 2. Fallback to LegacyContacts permission check
      if (!hasPermission) {
        try {
          if (typeof LegacyContacts?.requestPermissionsAsync === 'function') {
            const perm = await LegacyContacts.requestPermissionsAsync();
            if (perm?.status === 'granted' || perm?.granted) {
              hasPermission = true;
            }
          }
        } catch (permErr) {
          console.warn('LegacyContacts permission error:', permErr);
        }
      }

      if (!hasPermission) {
        Alert.alert(
          'Contacts Permission Required',
          'Rupeo needs access to your contacts to quickly pick friends and auto-fill their name & phone number.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        return;
      }

      // 3. Try native contact picker intent first
      try {
        if (typeof LegacyContacts?.presentContactPickerAsync === 'function') {
          const picked = await LegacyContacts.presentContactPickerAsync();
          if (picked) {
            applyContactToFriend(picked);
            return;
          }
          // User closed/cancelled native picker
          return;
        }
      } catch (pickerErr) {
        console.warn('Native contact picker unavailable, opening contact list browser:', pickerErr);
      }

      // 4. Fallback: open in-app contact list browser
      await openContactListPicker();
    } catch (err: any) {
      console.error('Contact pick error:', err);
      Alert.alert('Contacts Error', err?.message || 'Could not access contacts.');
    } finally {
      setIsImportingContact(false);
    }
  };

  // Open in-app contacts browser
  const openContactListPicker = async () => {
    try {
      setIsLoadingContacts(true);
      setContactSearchQuery('');
      setIsContactListModalOpen(true);

      const { data } = await LegacyContacts.getContactsAsync({
        fields: [LegacyContacts.Fields.PhoneNumbers, LegacyContacts.Fields.Image],
        pageSize: 600,
      });

      const list: Array<{ id: string; name: string; phone: string; photoUri?: string }> = [];
      if (Array.isArray(data)) {
        for (const c of data) {
          const n = (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ')).trim();
          const p = c.phoneNumbers?.[0]?.number || '';
          if (n || p) {
            list.push({
              id: c.id || Math.random().toString(),
              name: n || 'Unnamed Contact',
              phone: p,
              photoUri: c.image?.uri || c.rawImage?.uri,
            });
          }
        }
      }
      setDeviceContacts(list);
    } catch (err: any) {
      console.error('Failed to load contacts list:', err);
      Toast.show({
        type: 'error',
        text1: 'Failed to Load Contacts',
        text2: err?.message || 'Could not fetch device contacts.',
        position: 'top',
      });
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Filtered contacts for in-app contact picker
  const filteredDeviceContacts = useMemo(() => {
    if (!contactSearchQuery.trim()) return deviceContacts;
    const q = contactSearchQuery.toLowerCase().trim();
    return deviceContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  }, [deviceContacts, contactSearchQuery]);

  // Save new or edited friend handler
  const handleSaveFriend = async () => {
    const trimmedName = newFriendName.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('friend_name'),
        text2: 'Please enter friend name.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSavingFriend(true);
      const saved = await saveFriend(user?.uid, {
        id: editingFriendId || undefined,
        name: trimmedName,
        phone: newFriendPhone.trim() || undefined,
        photoUri: newFriendPhotoUri,
      });

      await loadData();
      if (selectedFriendDetail && (selectedFriendDetail.id === saved.id || editingFriendId === selectedFriendDetail.id)) {
        const summaries = await getAllFriendsSummaries(user?.uid);
        const ref = summaries.friends.find((f) => f.id === saved.id);
        if (ref) setSelectedFriendDetail(ref);
      }

      const isEdit = !!editingFriendId;
      setNewFriendName('');
      setNewFriendPhone('');
      setNewFriendPhotoUri(null);
      setEditingFriendId(null);
      setIsAddFriendModalOpen(false);

      Toast.show({
        type: 'success',
        text1: isEdit ? 'Friend Updated ✨' : 'Friend Added! 🎉',
        text2: `${saved.name} details saved.`,
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Could not save friend.',
        position: 'top',
      });
    } finally {
      setIsSavingFriend(false);
    }
  };

  // Open Add Entry Modal
  const openAddEntryModal = (friend: FriendSummary, defaultType: UdharEntryType = 'gave') => {
    setSelectedFriendForEntry(friend);
    setEntryType(defaultType);
    setEntryAmount('');
    setEntryNote('');
    setIsAddEntryModalOpen(true);
  };

  // Save Entry Handler
  const handleSaveEntry = async () => {
    const amt = parseFloat(entryAmount.replace(/[^0-9.]/g, ''));
    if (!selectedFriendForEntry || !amt || isNaN(amt) || amt <= 0) {
      Toast.show({
        type: 'error',
        text1: t('enter_amount'),
        text2: 'Please enter a valid amount.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSavingEntry(true);
      const now = new Date();
      const dateStr = getLocalDateString(now);
      const timeStr = formatTime12Hour(now);

      // Record transaction to main Rupeo Transactions page (if turned ON from settings or friends card)
      let createdTxId: string | undefined = undefined;
      if (user?.uid && syncOnDashboardDefault) {
        try {
          const isGave = entryType === 'gave';
          const desc = isGave
            ? (entryNote.trim() ? `${entryNote.trim()} (Udhar to ${selectedFriendForEntry.name})` : `Udhar to ${selectedFriendForEntry.name}`)
            : (entryNote.trim() ? `${entryNote.trim()} (Udhar from ${selectedFriendForEntry.name})` : `Udhar from ${selectedFriendForEntry.name}`);

          const id = await insertTransaction(user.uid, {
            date: dateStr,
            time: timeStr,
            amount: amt,
            type: isGave ? 'debit' : 'credit',
            merchant_name: selectedFriendForEntry.name,
            category: 'Friend',
            description: desc,
            payment_mode: 'Cash',
            source: 'udhar',
          });
          if (id) createdTxId = id;
        } catch (txErr) {
          console.warn('Could not insert transaction to main list:', txErr);
        }
      }

      await addUdharEntry(user?.uid, {
        friendId: selectedFriendForEntry.id,
        amount: amt,
        type: entryType,
        date: dateStr,
        time: timeStr,
        note: entryNote.trim() || undefined,
        linkedTxId: createdTxId,
      });

      triggerTransactionVibration().catch(() => { });
      setIsAddEntryModalOpen(false);
      setEntryAmount('');
      setEntryNote('');

      await loadData();
      if (selectedFriendDetail && selectedFriendDetail.id === selectedFriendForEntry.id) {
        await loadFriendEntries(selectedFriendDetail.id);
        // refresh detail summary
        const updatedSummaries = await getAllFriendsSummaries(user?.uid);
        const ref = updatedSummaries.friends.find((f) => f.id === selectedFriendDetail.id);
        if (ref) setSelectedFriendDetail(ref);
      }

      const typeLabel = entryType === 'gave' ? t('you_gave') : t('you_got');
      Toast.show({
        type: 'success',
        text1: `${typeLabel} ${curr}${amt}`,
        text2: `Recorded with ${selectedFriendForEntry.name} & added to Transactions.`,
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Could not record entry.',
        position: 'top',
      });
    } finally {
      setIsSavingEntry(false);
    }
  };

  // Prompt Delete Entry (Opens In-App Confirmation Modal)
  const promptDeleteEntry = (entry: UdharEntry) => {
    setEntryToDelete(entry);
    setIsDeleteEntryModalOpen(true);
  };

  const handleDeleteEntry = (entry: UdharEntry) => {
    promptDeleteEntry(entry);
  };

  // Confirm Delete Entry Handler
  const handleConfirmDeleteEntry = async () => {
    if (!entryToDelete) return;
    try {
      setIsDeletingEntry(true);
      // Clean up linked Firestore transaction from Transactions page
      if (user?.uid && entryToDelete.linkedTxId) {
        await deleteTransaction(user.uid, entryToDelete.linkedTxId).catch(() => { });
      }
      await deleteUdharEntry(user?.uid, entryToDelete.id);
      if (selectedFriendDetail) {
        await loadFriendEntries(selectedFriendDetail.id);
        const updatedSummaries = await getAllFriendsSummaries(user?.uid);
        const ref = updatedSummaries.friends.find((f) => f.id === selectedFriendDetail.id);
        if (ref) setSelectedFriendDetail(ref);
      }
      await loadData();
      setIsDeleteEntryModalOpen(false);
      setEntryToDelete(null);
      Toast.show({
        type: 'info',
        text1: 'Entry Removed 🗑️',
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: err?.message || 'Could not delete entry.',
        position: 'top',
      });
    } finally {
      setIsDeletingEntry(false);
    }
  };

  // Prompt Settle Up (Opens Dedicated Settlement Modal)
  const promptSettleUp = (friend: FriendSummary) => {
    if (friend.balance === 0) {
      Toast.show({
        type: 'info',
        text1: t('all_settled'),
        text2: 'Account is already at ₹0 balance.',
        position: 'top',
      });
      return;
    }

    setSettleTargetEntry(null);
    setSettleFriend(friend);
    setSettleAmountInput(Math.abs(friend.balance).toString());
    setSettleMode('Cash');
    setIsSettleModalOpen(true);
  };

  // Settle a specific transaction (creates a threaded settlement)
  const promptSettleEntry = (friend: FriendSummary, entry: UdharEntry, remainingAmount: number) => {
    setSettleTargetEntry(entry);
    setSettleFriend(friend);
    setSettleAmountInput(remainingAmount.toString());
    setSettleMode('Cash');
    setIsSettleModalOpen(true);
  };

  const handleSettleUp = (friend: FriendSummary) => {
    promptSettleUp(friend);
  };

  // Confirm Settlement Handler
  const handleConfirmSettle = async () => {
    if (!settleFriend) return;
    const amt = parseFloat(settleAmountInput.replace(/[^0-9.]/g, ''));
    if (!amt || isNaN(amt) || amt <= 0) {
      Toast.show({
        type: 'error',
        text1: t('enter_amount'),
        text2: 'Please enter a valid settlement amount.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSettling(true);
      const now = new Date();
      const dateStr = getLocalDateString(now);
      const timeStr = formatTime12Hour(now);

      // If friend owes user (balance > 0): settling means user received money (type: 'got').
      // When received, this is Income ('credit') on Rupeo Transactions page.
      // If user owes friend (balance < 0): settling means user paid money (type: 'gave').
      // When paid, this is Expense ('debit') on Rupeo Transactions page.
      const isUserReceiving = settleTargetEntry
        ? settleTargetEntry.type === 'gave' // if user gave earlier, settling means receiving back
        : settleFriend.balance > 0;
      const settleType: UdharEntryType = isUserReceiving ? 'got' : 'gave';

      let createdTxId: string | undefined = undefined;
      if (user?.uid && syncOnDashboardDefault) {
        try {
          const desc = isUserReceiving
            ? lang === 'Hindi'
              ? `${settleFriend.name} से हिसाब चुकता (प्राप्त)`
              : lang === 'Hinglish'
                ? `Settlement from ${settleFriend.name} (Hisaab Clear)`
                : `Settlement received from ${settleFriend.name} (All Cleared)`
            : lang === 'Hindi'
              ? `${settleFriend.name} को हिसाब चुकता (भुगतान)`
              : lang === 'Hinglish'
                ? `Settlement to ${settleFriend.name} (Hisaab Clear)`
                : `Settlement paid to ${settleFriend.name} (All Cleared)`;

          const id = await insertTransaction(user.uid, {
            date: dateStr,
            time: timeStr,
            amount: amt,
            type: isUserReceiving ? 'credit' : 'debit',
            merchant_name: settleFriend.name,
            category: 'Friend',
            description: desc,
            payment_mode: settleMode,
            source: 'udhar_settlement',
          });
          if (id) createdTxId = id;
        } catch (txErr) {
          console.warn('Could not insert settlement transaction:', txErr);
        }
      }

      // Link to target parent entry if explicitly selected, or auto-link to open parent
      let targetParentId = settleTargetEntry?.id;
      let targetParentAmt = settleTargetEntry?.amount || amt;

      if (!targetParentId && selectedFriendDetail) {
        const candidate = friendEntries.find((e) => {
          const isOpposite = isUserReceiving ? e.type === 'gave' : e.type === 'got';
          if (!isOpposite || e.parentEntryId) return false;
          const children = friendEntries.filter((c) => c.parentEntryId === e.id);
          const settled = children.reduce((s, c) => s + c.amount, 0);
          return settled < e.amount;
        });
        if (candidate) {
          targetParentId = candidate.id;
          targetParentAmt = candidate.amount;
        }
      }

      const isFull = amt >= targetParentAmt;
      const settlementType: 'full' | 'partial' = isFull ? 'full' : 'partial';

      const noteLabel = isUserReceiving
        ? lang === 'Hindi'
          ? `हिसाब चुकता (${settleMode}) - ${isFull ? 'पूर्ण' : 'आंशिक'}`
          : lang === 'Hinglish'
            ? `Settlement (${settleMode}) - ${isFull ? 'Full' : 'Partial'}`
            : `Settlement (${settleMode}) - ${isFull ? 'Full Cleared' : 'Partial'}`
        : lang === 'Hindi'
          ? `हिसाब चुकता (${settleMode}) - ${isFull ? 'पूर्ण' : 'आंशिक'}`
          : lang === 'Hinglish'
            ? `Settlement (${settleMode}) - ${isFull ? 'Full' : 'Partial'}`
            : `Settlement (${settleMode}) - ${isFull ? 'Full Cleared' : 'Partial'}`;

      await addUdharEntry(user?.uid, {
        friendId: settleFriend.id,
        amount: amt,
        type: settleType,
        date: dateStr,
        time: timeStr,
        note: noteLabel,
        linkedTxId: createdTxId,
        parentEntryId: targetParentId,
        settlementType,
      });

      triggerTransactionVibration().catch(() => { });
      setIsSettleModalOpen(false);
      const settledFriendName = settleFriend.name;
      setSettleFriend(null);
      setSettleTargetEntry(null);

      await loadData();
      if (selectedFriendDetail && selectedFriendDetail.id === settleFriend.id) {
        await loadFriendEntries(settleFriend.id);
        const updatedSummaries = await getAllFriendsSummaries(user?.uid);
        const ref = updatedSummaries.friends.find((f) => f.id === settleFriend.id);
        if (ref) setSelectedFriendDetail(ref);
      }

      const toastMsg =
        lang === 'Hindi'
          ? `${settledFriendName} के साथ ${curr}${amt.toLocaleString('en-IN')} का हिसाब (${isFull ? 'पूर्ण' : 'आंशिक'}) दर्ज हो गया।`
          : lang === 'Hinglish'
            ? `${settledFriendName} ke sath ${curr}${amt.toLocaleString('en-IN')} (${isFull ? 'Full' : 'Partial'}) settlement thread me add ho gaya.`
            : `Settled ${curr}${amt.toLocaleString('en-IN')} (${isFull ? 'Full' : 'Partial'}) with ${settledFriendName}.`;

      Toast.show({
        type: 'success',
        text1: isFull ? t('settlement_done') : 'Partial Settlement Recorded',
        text2: toastMsg,
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Settlement Failed',
        text2: err?.message || 'Could not settle balance.',
        position: 'top',
      });
    } finally {
      setIsSettling(false);
    }
  };

  // Prompt Add Interest Modal
  const promptAddInterest = (target: 'balance' | 'entry', entry?: UdharEntry) => {
    setInterestTarget(target);
    setInterestTargetEntry(entry || null);
    setInterestPeriod('monthly');
    setInterestStartDate(getLocalDateString(new Date()));
    setInterestCalcType('pro_rata');
    setInterestRateInput('2');
    setInterestNoteInput('');
    setIsInterestModalOpen(true);
  };

  const baseForInterest = useMemo(() => {
    if (interestTarget === 'entry' && interestTargetEntry) {
      return interestTargetEntry.amount;
    }
    return Math.abs(selectedFriendDetail?.balance || 0);
  }, [interestTarget, interestTargetEntry, selectedFriendDetail]);

  const interestAccrualCalc = useMemo(() => {
    const rate = parseFloat(interestRateInput) || 0;
    return calculateAccruedInterest(
      baseForInterest,
      rate,
      interestPeriod,
      interestStartDate,
      interestCalcType
    );
  }, [baseForInterest, interestRateInput, interestPeriod, interestStartDate, interestCalcType]);

  const calculatedInterestAmt = useMemo(() => {
    if (interestPeriod === 'one_time') {
      return parseFloat(interestRateInput) || 0;
    }
    return interestAccrualCalc.accruedAmount;
  }, [interestPeriod, interestRateInput, interestAccrualCalc]);

  // Confirm and Save Interest
  const handleConfirmInterest = async () => {
    if (!selectedFriendDetail) return;
    const rateVal = parseFloat(interestRateInput);
    if (!rateVal || isNaN(rateVal) || rateVal <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Rate',
        text2: 'Please enter a valid interest rate or amount.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSavingInterest(true);
      const now = new Date();
      const dateStr = getLocalDateString(now);
      const timeStr = formatTime12Hour(now);

      const isTargetEntry = interestTarget === 'entry' && interestTargetEntry;
      const type: UdharEntryType = isTargetEntry
        ? interestTargetEntry.type
        : selectedFriendDetail.balance >= 0
          ? 'gave'
          : 'got';

      const periodLabel =
        interestPeriod === 'monthly'
          ? `${rateVal}%/mo`
          : interestPeriod === 'yearly'
            ? `${rateVal}%/yr`
            : `${curr}${rateVal} Flat`;

      const defaultNote =
        interestPeriod === 'one_time'
          ? `Interest ${curr}${rateVal}`
          : `Interest ${periodLabel} • Starts ${interestStartDate}`;

      const note = interestNoteInput.trim() ? `${interestNoteInput.trim()} • ${defaultNote}` : defaultNote;

      const baseAmt = isTargetEntry ? interestTargetEntry.amount : Math.abs(selectedFriendDetail.balance);
      const initialAmt = interestPeriod === 'one_time' ? rateVal : interestAccrualCalc.accruedAmount;

      let createdTxId: string | undefined = undefined;
      if (user?.uid && initialAmt > 0) {
        try {
          const desc =
            type === 'gave'
              ? `Interest Charged to ${selectedFriendDetail.name} (${periodLabel})`
              : `Interest Owed to ${selectedFriendDetail.name} (${periodLabel})`;

          const id = await insertTransaction(user.uid, {
            date: dateStr,
            time: timeStr,
            amount: initialAmt,
            type: type === 'gave' ? 'debit' : 'credit',
            merchant_name: selectedFriendDetail.name,
            category: 'Friend',
            description: desc,
            payment_mode: 'Cash',
            source: 'udhar',
          });
          if (id) createdTxId = id;
        } catch (txErr) {
          console.warn('Could not insert transaction to main list:', txErr);
        }
      }

      await addUdharEntry(user?.uid, {
        friendId: selectedFriendDetail.id,
        amount: initialAmt,
        type,
        date: dateStr,
        time: timeStr,
        note,
        linkedTxId: createdTxId,
        parentEntryId: isTargetEntry ? interestTargetEntry.id : undefined,
        settlementType: isTargetEntry ? 'interest' : undefined,
        isInterest: true,
        interestPercent: rateVal,
        interestPeriod,
        interestStartDate,
        interestCalcType,
        baseAmount: baseAmt,
        interestStatus: 'active',
      });

      triggerTransactionVibration().catch(() => { });
      setIsInterestModalOpen(false);

      await loadData();
      await loadFriendEntries(selectedFriendDetail.id);
      const updatedSummaries = await getAllFriendsSummaries(user?.uid);
      const ref = updatedSummaries.friends.find((f) => f.id === selectedFriendDetail.id);
      if (ref) setSelectedFriendDetail(ref);

      Toast.show({
        type: 'success',
        text1: 'Interest Active! 📈',
        text2: `${periodLabel} interest active from ${interestStartDate}.`,
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to Add Interest',
        text2: err?.message || 'Could not save interest.',
        position: 'top',
      });
    } finally {
      setIsSavingInterest(false);
    }
  };

  // Prompt Delete Friend (Opens Confirmation Modal)
  const promptDeleteFriend = (friend: FriendSummary) => {
    setFriendToDelete(friend);
    setIsDeleteFriendModalOpen(true);
  };

  // Alias for compatibility
  const handleDeleteFriend = (friend: FriendSummary) => {
    promptDeleteFriend(friend);
  };

  // Confirm Delete Friend Handler
  const handleConfirmDeleteFriend = async () => {
    if (!friendToDelete) return;
    try {
      setIsDeletingFriend(true);
      const deletedEntries = await deleteFriend(user?.uid, friendToDelete.id);

      // Clean up linked transactions in Firestore
      if (user?.uid && deletedEntries && deletedEntries.length > 0) {
        for (const entry of deletedEntries) {
          if (entry.linkedTxId) {
            await deleteTransaction(user.uid, entry.linkedTxId).catch(() => { });
          }
        }
      }

      // If the friend being deleted was open in ledger detail modal, close it
      if (selectedFriendDetail && selectedFriendDetail.id === friendToDelete.id) {
        setSelectedFriendDetail(null);
      }

      await loadData();
      setIsDeleteFriendModalOpen(false);
      const deletedFriendName = friendToDelete.name;
      setFriendToDelete(null);

      Toast.show({
        type: 'info',
        text1: `${deletedFriendName} Removed 🗑️`,
        text2: 'Friend and all ledger records deleted.',
        position: 'top',
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: err?.message || 'Could not delete friend.',
        position: 'top',
      });
    } finally {
      setIsDeletingFriend(false);
    }
  };

  // Open Request Payment (UPI QR & WhatsApp) Modal
  const openPaymentRequestModal = (friend: FriendSummary) => {
    setRequestFriend(friend);
    // prefill with friend's balance if positive, otherwise empty or 0
    const amt = friend.balance > 0 ? friend.balance.toString() : '';
    setRequestAmount(amt);
    setIsQrGenerated(false);
    setIsRequestModalOpen(true);
  };

  // Append handle to UPI ID
  const handleSelectUpiSuffix = (suffix: string) => {
    setIsQrGenerated(false);
    setMyUpiId((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return suffix;
      if (trimmed.includes('@')) {
        const prefix = trimmed.split('@')[0].trim();
        return `${prefix}${suffix}`;
      }
      return `${trimmed}${suffix}`;
    });
  };

  // Generate UPI Deep Link URI with strict NPCI compliance
  const parsedRequestAmount = parseFloat(requestAmount.replace(/[^0-9.]/g, '')) || 0;
  const upiDeepLink = useMemo(() => {
    const cleanedUpi = sanitizeUpiId(myUpiId);
    if (!cleanedUpi || parsedRequestAmount <= 0) return '';
    return generateUpiUri({
      upiId: cleanedUpi,
      payeeName: user?.displayName?.trim(),
      amount: parsedRequestAmount,
      note: 'Dues settlement',
    });
  }, [myUpiId, parsedRequestAmount, user?.displayName]);

  // Done · Generate QR Handler
  const handleGeneratePaymentQr = async () => {
    const amtVal = validateAmount(parsedRequestAmount);
    if (!amtVal.isValid) {
      Toast.show({
        type: 'error',
        text1: t('enter_amount'),
        text2: amtVal.error || 'Please enter a valid amount.',
        position: 'top',
      });
      return;
    }

    const upiVal = validateUpiId(myUpiId);
    if (!upiVal.isValid) {
      Toast.show({
        type: 'error',
        text1: 'Complete UPI ID Required',
        text2: upiVal.error || t('enter_full_upi_hint'),
        position: 'top',
      });
      return;
    }

    await saveLastUsedUpiId(user?.uid, myUpiId.trim());
    setIsQrGenerated(true);
    triggerTransactionVibration().catch(() => { });
    Toast.show({
      type: 'success',
      text1: 'QR Code Ready! ✨',
      text2: `${curr}${parsedRequestAmount} payment QR code generated.`,
      position: 'top',
    });
  };

  // Generate structured, clean share message with breakdown and single download link
  const generateRequestShareText = () => {
    const friendName = requestFriend?.name || 'Friend';
    const myName = user?.displayName?.trim() || 'Rupeo User';
    const formattedAmount = `${curr}${parsedRequestAmount.toFixed(2)}`;

    if (lang === 'Hindi') {
      return [
        `नमस्ते ${friendName}! 👋`,
        '',
        `Rupeo से भुगतान अनुरोध (Payment Request):`,
        `💰 कितना देना है: ${formattedAmount}`,
        `👤 किसे देना है: ${myName}`,
        `📱 UPI ID: ${myUpiId.trim()}`,
        '',
        `👉 सीधे UPI लिंक से भुगतान करें:`,
        upiDeepLink,
        '',
        `📲 Rupeo ऐप डाउनलोड करें:`,
        RUPEO_DOWNLOAD_URL,
        '',
        `धन्यवाद! 🙏 - ${myName}`,
      ].join('\n');
    }

    if (lang === 'Hinglish') {
      return [
        `Hi ${friendName}! 👋`,
        '',
        `Rupeo se payment request:`,
        `💰 Kitna Dena Hai: ${formattedAmount}`,
        `👤 Kisko Pay Karna Hai: ${myName}`,
        `📱 UPI ID: ${myUpiId.trim()}`,
        '',
        `👉 Direct UPI Link se payment karein:`,
        upiDeepLink,
        '',
        `📲 Download Rupeo App:`,
        RUPEO_DOWNLOAD_URL,
        '',
        `Thank you! 🙏 - ${myName}`,
      ].join('\n');
    }

    return [
      `Hi ${friendName}! 👋`,
      '',
      `Payment Request from Rupeo:`,
      `💰 Amount Due: ${formattedAmount}`,
      `👤 Pay To: ${myName}`,
      `📱 UPI ID: ${myUpiId.trim()}`,
      '',
      `👉 Pay directly via UPI Link:`,
      upiDeepLink,
      '',
      `📲 Download Rupeo App:`,
      RUPEO_DOWNLOAD_URL,
      '',
      `Thank you! 🙏 - ${myName}`,
    ].join('\n');
  };

  // Single Request Payment Handler: Sends both QR photo and formatted text message
  const handleRequestPaymentShare = async () => {
    if (isSharingImage) return;
    if (!myUpiId.trim() || parsedRequestAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'UPI & Amount Required',
        text2: 'Please enter a valid amount and your UPI ID.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSharingImage(true);
      Toast.show({
        type: 'info',
        text1: 'Sending Request...',
        text2: 'Preparing QR photo & payment details...',
        position: 'top',
      });

      const shareText = generateRequestShareText();
      const friendPhone = requestFriend?.phone?.replace(/[^0-9]/g, '') || undefined;

      if (qrPassCardRef.current && Platform.OS !== 'web') {
        const uri = await captureRef(qrPassCardRef, {
          format: 'png',
          quality: 1.0,
          result: 'tmpfile',
        });

        // 1. Android: Use native RupeoShare to send BOTH QR image and text caption attached directly to WhatsApp
        if (Platform.OS === 'android') {
          if (NativeModules.RupeoShare?.shareToWhatsApp) {
            try {
              await NativeModules.RupeoShare.shareToWhatsApp(
                uri,
                shareText,
                friendPhone
              );
              return;
            } catch (waErr) {
              console.warn('Native shareToWhatsApp failed, trying shareImageAndText:', waErr);
            }
          }

          if (NativeModules.RupeoShare?.shareImageAndText) {
            try {
              await NativeModules.RupeoShare.shareImageAndText(
                uri,
                shareText,
                `Rupeo Payment Request - ${curr}${parsedRequestAmount.toFixed(2)}`
              );
              return;
            } catch (nativeErr) {
              console.warn('Native RupeoShare failed, falling back:', nativeErr);
            }
          }
        }

        // 2. iOS: Share.share supports message (text caption) + url (image)
        if (Platform.OS === 'ios') {
          try {
            await Share.share({
              message: shareText,
              url: uri,
            });
            return;
          } catch (iosErr) {
            console.warn('iOS share error, falling back to expo-sharing:', iosErr);
          }
        }

        // 3. Fallback to standard sharing (copy text to clipboard as safety net only on fallback)
        if (await Sharing.isAvailableAsync()) {
          try {
            Clipboard.setString(shareText);
          } catch { }
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Rupeo Payment Request - ${curr}${parsedRequestAmount.toFixed(2)}`,
            UTI: 'public.png',
          });
          return;
        }
      }

      // Fallback if view shot or sharing is unavailable
      await Share.share({
        title: `Payment Request - ${curr}${parsedRequestAmount.toFixed(2)}`,
        message: shareText,
      });
    } catch (err: any) {
      console.warn('Error sharing QR payment request:', err);
      Toast.show({
        type: 'error',
        text1: 'Share Failed',
        text2: err?.message || 'Could not send payment request.',
        position: 'top',
      });
    } finally {
      setIsSharingImage(false);
    }
  };

  // Backwards compatibility alias
  const handleShareQrPhoto = handleRequestPaymentShare;

  // Execute WhatsApp Share directly to a phone number
  const executeWhatsAppShare = async (phoneNumber: string) => {
    const msgText = generateRequestShareText();

    try {
      const rawPhone = phoneNumber.replace(/[^0-9]/g, '');
      const formattedPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

      const whatsappUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(msgText)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        return;
      }

      // Web/Webview fallback
      const webUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msgText)}`;
      await Linking.openURL(webUrl);
    } catch (err) {
      console.warn('WhatsApp share error, falling back to Share:', err);
      try {
        await Share.share({
          title: `Payment Reminder - ${curr}${parsedRequestAmount.toFixed(2)}`,
          message: msgText,
        });
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Share Failed',
          text2: 'Could not open sharing.',
          position: 'top',
        });
      }
    }
  };

  // Share on WhatsApp Handler (Prompts for phone if missing, otherwise sends directly)
  const handleShareWhatsApp = async () => {
    if (!myUpiId.trim() || parsedRequestAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'UPI & Amount Required',
        text2: 'Please enter a valid amount and your UPI ID.',
        position: 'top',
      });
      return;
    }

    const existingPhone = requestFriend?.phone?.replace(/[^0-9]/g, '') || '';
    if (existingPhone.length >= 10) {
      // Number already added -> directly send!
      await executeWhatsAppShare(existingPhone);
    } else {
      // Number NOT added -> ask user to add number
      setFriendPhoneInput('');
      setIsAddPhoneModalOpen(true);
    }
  };

  // Save phone number and immediately send to WhatsApp
  const handleSavePhoneAndSend = async () => {
    const cleanPhone = friendPhoneInput.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Phone Number',
        text2: 'Please enter a valid 10-digit mobile number.',
        position: 'top',
      });
      return;
    }

    if (!requestFriend) return;

    try {
      setIsSavingPhone(true);
      await saveFriend(user?.uid, {
        id: requestFriend.id,
        name: requestFriend.name,
        phone: cleanPhone,
      });

      // Update state in modal and friends list
      setRequestFriend((prev) => (prev ? { ...prev, phone: cleanPhone } : null));
      await loadData();
      setIsAddPhoneModalOpen(false);

      Toast.show({
        type: 'success',
        text1: 'Number Saved! 📱',
        text2: 'Opening WhatsApp...',
        position: 'top',
      });

      await executeWhatsAppShare(cleanPhone);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Could not save phone number.',
        position: 'top',
      });
    } finally {
      setIsSavingPhone(false);
    }
  };

  // Group ledger entries into parent transactions and their threaded child settlements
  const groupedLedgerEntries = useMemo(() => {
    const childMap = new Map<string, UdharEntry[]>();
    const parents: UdharEntry[] = [];
    const orphanSettlements: UdharEntry[] = [];

    friendEntries.forEach((entry) => {
      if (entry.parentEntryId) {
        const list = childMap.get(entry.parentEntryId) || [];
        list.push(entry);
        childMap.set(entry.parentEntryId, list);
      } else {
        const isLegacy =
          entry.note?.includes('Settlement') ||
          entry.note?.includes('हिसाब चुकता') ||
          entry.note?.includes('Hisaab Clear');
        if (isLegacy) {
          orphanSettlements.push(entry);
        } else {
          parents.push(entry);
        }
      }
    });

    // Auto-match legacy settlements to opposite unsettled parents
    orphanSettlements.forEach((settlement) => {
      const targetParent = parents.find((p) => {
        const isOpposite =
          (p.type === 'gave' && settlement.type === 'got') ||
          (p.type === 'got' && settlement.type === 'gave');
        if (!isOpposite) return false;
        const existingChildren = childMap.get(p.id) || [];
        const currentSettled = existingChildren.reduce((s, c) => s + c.amount, 0);
        return currentSettled < p.amount;
      });

      if (targetParent) {
        const list = childMap.get(targetParent.id) || [];
        list.push(settlement);
        childMap.set(targetParent.id, list);
      } else {
        parents.push(settlement);
      }
    });

    return parents.map((parent) => {
      const allChildren = (childMap.get(parent.id) || []).sort(
        (a, b) => new Date(a.date + ' ' + (a.time || '')).getTime() - new Date(b.date + ' ' + (b.time || '')).getTime()
      );
      const interestChildren = allChildren.filter((c) => c.settlementType === 'interest' || c.isInterest);
      const settlementChildren = allChildren.filter((c) => c.settlementType !== 'interest' && !c.isInterest);

      const totalInterest = interestChildren.reduce((sum, c) => sum + getDynamicEntryAmount(c), 0);
      const totalSettled = settlementChildren.reduce((sum, c) => sum + c.amount, 0);
      const effectiveAmount = parent.amount + totalInterest;
      const remaining = Math.max(0, effectiveAmount - totalSettled);
      const isFullySettled = totalSettled >= effectiveAmount && settlementChildren.length > 0;
      const isPartiallySettled = totalSettled > 0 && totalSettled < effectiveAmount;

      return {
        parent,
        children: allChildren,
        settlementChildren,
        interestChildren,
        totalInterest,
        effectiveAmount,
        totalSettled,
        remaining,
        isFullySettled,
        isPartiallySettled,
      };
    });
  }, [friendEntries]);

  // Open Invoice Modal
  const openInvoiceModal = (mode: 'single' | 'all', group?: GroupedEntryInvoiceData) => {
    setInvoiceMode(mode);
    if (mode === 'single' && group) {
      setInvoiceSingleGroup(group);
    } else if (mode === 'single' && groupedLedgerEntries.length > 0) {
      setInvoiceSingleGroup(groupedLedgerEntries[0]);
    } else {
      setInvoiceSingleGroup(null);
    }
    setGeneratedInvoiceUri(null);
    setGeneratedInvoiceType(null);
    setIsInvoiceModalOpen(true);
  };

  // Helper to build invoice options
  const getInvoiceOptions = (): UdharInvoiceOptions | null => {
    if (!selectedFriendDetail) return null;
    return {
      mode: invoiceMode,
      friend: selectedFriendDetail,
      userName: user?.displayName || 'Rupeo User',
      upiId: myUpiId || undefined,
      curr,
      singleGroup: invoiceMode === 'single' ? (invoiceSingleGroup || groupedLedgerEntries[0] || undefined) : undefined,
      allGroups: groupedLedgerEntries,
      netBalance: selectedFriendDetail.balance,
    };
  };

  // Share Invoice on WhatsApp
  const handleShareInvoiceWhatsApp = async () => {
    const opts = getInvoiceOptions();
    if (!opts) return;

    try {
      setIsSharingInvoicePhoto(true);
      Toast.show({
        type: 'info',
        text1: 'Opening WhatsApp... 💬',
        text2: 'Preparing digital invoice bill.',
        position: 'top',
      });

      let imageUri: string | undefined = undefined;
      if (invoicePreviewRef.current && Platform.OS !== 'web') {
        try {
          imageUri = await captureRef(invoicePreviewRef, {
            format: 'png',
            quality: 1.0,
            result: 'tmpfile',
          });
        } catch (snapErr) {
          console.warn('Could not snapshot invoice preview:', snapErr);
        }
      }

      const res = await shareInvoiceDirectToWhatsApp(opts, imageUri);
      if (!res.success && res.error) {
        const msg = generateUdharInvoiceWhatsAppText(opts);
        Clipboard.setString(msg);
        Toast.show({
          type: 'info',
          text1: 'Copied to Clipboard 📋',
          text2: 'WhatsApp not opened directly. Paste message in chat.',
          position: 'top',
        });
      }
    } catch (err: any) {
      console.warn('WhatsApp share invoice error:', err);
      Toast.show({
        type: 'error',
        text1: 'Share Failed',
        text2: err?.message || 'Could not share to WhatsApp.',
        position: 'top',
      });
    } finally {
      setIsSharingInvoicePhoto(false);
    }
  };

  // Generate PDF Invoice (Step 1 - PDF clicked)
  const handleGenerateInvoicePDF = async () => {
    const opts = getInvoiceOptions();
    if (!opts) return;

    try {
      setIsGeneratingInvoicePdf(true);
      Toast.show({
        type: 'info',
        text1: 'Creating PDF Invoice... 📄',
        text2: 'Generating official A4 document.',
        position: 'top',
      });

      const res = await generateInvoicePDFOnly(opts);
      if (res.success && res.uri) {
        setGeneratedInvoiceUri(res.uri);
        setGeneratedInvoiceType('pdf');
        Toast.show({
          type: 'success',
          text1: 'PDF Ready! 📄',
          text2: 'Tap Download or Share below.',
          position: 'top',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'PDF Generation Failed',
          text2: res.error || 'Could not create PDF file.',
          position: 'top',
        });
      }
    } catch (err: any) {
      console.warn('PDF generation error:', err);
      Toast.show({
        type: 'error',
        text1: 'PDF Failed',
        text2: err?.message || 'Could not create PDF.',
        position: 'top',
      });
    } finally {
      setIsGeneratingInvoicePdf(false);
    }
  };

  // Capture Photo Slip (Step 1 - Photo clicked)
  const handleGenerateInvoicePhoto = async () => {
    const opts = getInvoiceOptions();
    if (!opts) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Friend details not loaded.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSharingInvoicePhoto(true);

      let uri = '';

      if (Platform.OS === 'web') {
        // On web, capture DOM element or create SVG data URL
        try {
          const el = invoicePreviewRef.current as any;
          if (el && typeof document !== 'undefined') {
            const width = el.offsetWidth || 380;
            const height = el.offsetHeight || 600;
            const canvas = document.createElement('canvas');
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.scale(2, 2);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);

              const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                <foreignObject width="100%" height="100%">
                  <div xmlns="http://www.w3.org/1999/xhtml">
                    ${el.outerHTML || el.innerHTML}
                  </div>
                </foreignObject>
              </svg>`;

              const img = typeof window !== 'undefined' ? new (window as any).Image() : null;
              if (img) {
                uri = await new Promise<string>((resolve) => {
                  img.onload = () => {
                    try {
                      ctx.drawImage(img, 0, 0);
                      resolve(canvas.toDataURL('image/png'));
                    } catch {
                      resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
                    }
                  };
                  img.onerror = () => {
                    resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
                  };
                  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                });
              }
            }
          }
        } catch (webErr) {
          console.warn('Web capture error:', webErr);
        }

        if (!uri) {
          const safeFriendName = opts.friend?.name || 'Customer';
          const fallbackAmt = Math.abs(opts.singleGroup ? opts.singleGroup.remaining : (opts.netBalance || 0));
          const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520">
            <rect width="100%" height="100%" fill="#F8FAFC"/>
            <rect x="20" y="20" width="360" height="480" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
            <text x="200" y="70" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#0F172A">RUPEO KHATA</text>
            <text x="200" y="95" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#64748B">DIGITAL RECEIPT SLIP</text>
            <line x1="40" y1="120" x2="360" y2="120" stroke="#E2E8F0" stroke-dasharray="4"/>
            <text x="200" y="160" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#64748B">Account: ${safeFriendName}</text>
            <text x="200" y="240" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="middle" fill="#15803D">${curr}${fallbackAmt.toLocaleString('en-IN')}</text>
            <text x="200" y="280" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#94A3B8">Verified Digital Proof</text>
          </svg>`;
          uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fallbackSvg);
        }
      } else {
        // Native mobile (Android / iOS)
        await new Promise((r) => setTimeout(r, 60));
        if (invoicePreviewRef.current) {
          try {
            uri = await captureRef(invoicePreviewRef, {
              format: 'png',
              quality: 1.0,
              result: 'tmpfile',
            });
          } catch (captureRefErr) {
            console.warn('captureRef with ref failed, trying with current:', captureRefErr);
            uri = await captureRef(invoicePreviewRef.current, {
              format: 'png',
              quality: 1.0,
              result: 'tmpfile',
            });
          }
        }
      }

      if (!uri) {
        throw new Error('Could not capture photo bill.');
      }

      setGeneratedInvoiceUri(uri);
      setGeneratedInvoiceType('photo');
      Toast.show({
        type: 'success',
        text1: 'Photo Ready! 🖼️',
        text2: 'Tap Download or Share below.',
        position: 'top',
      });
    } catch (err: any) {
      console.warn('Photo capture error:', err);
      Toast.show({
        type: 'error',
        text1: 'Photo Capture Failed',
        text2: err?.message || 'Could not capture photo bill.',
        position: 'top',
      });
    } finally {
      setIsSharingInvoicePhoto(false);
    }
  };

  // Download Invoice to Device (Step 2 - Download clicked)
  const handleDownloadInvoice = async () => {
    if (!generatedInvoiceUri) return;

    try {
      setIsDownloadingInvoice(true);

      if (Platform.OS === 'web') {
        try {
          const a = document.createElement('a');
          a.href = generatedInvoiceUri;
          a.download = generatedInvoiceType === 'pdf' ? 'Rupeo_Invoice.html' : 'Rupeo_Bill.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          Toast.show({
            type: 'success',
            text1: 'Downloaded! 📥',
            text2: 'File saved to your Downloads.',
            position: 'top',
          });
          return;
        } catch (webDlErr) {
          console.warn('Web download error:', webDlErr);
        }
      }

      if (generatedInvoiceType === 'photo') {
        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary?.requestPermissionsAsync && MediaLibrary?.saveToLibraryAsync) {
          try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              await MediaLibrary.saveToLibraryAsync(generatedInvoiceUri);
              Toast.show({
                type: 'success',
                text1: 'Saved to Photos! 🖼️',
                text2: 'Invoice saved directly to your Gallery.',
                position: 'top',
              });
              return;
            }
          } catch (mediaErr) {
            console.warn('MediaLibrary save error, fallback to share:', mediaErr);
          }
        }

        // Fallback to Sharing with save intent if permission denied or failed
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(generatedInvoiceUri, {
            mimeType: 'image/png',
            dialogTitle: 'Save Invoice Photo',
          });
        }
      } else if (generatedInvoiceType === 'pdf') {
        let savedViaSaf = false;
        if (Platform.OS === 'android' && FileSystem?.StorageAccessFramework) {
          try {
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              const base64 = await FileSystem.readAsStringAsync(generatedInvoiceUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              const rawName = (selectedFriendDetail?.name || 'Customer').trim();
              const cleanFriendName = rawName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20) || 'Customer';
              const filename = `Rupeo_Invoice_${cleanFriendName}_${Date.now().toString().slice(-6)}.pdf`;
              const createdFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                filename,
                'application/pdf'
              );
              await FileSystem.writeAsStringAsync(createdFileUri, base64, {
                encoding: FileSystem.EncodingType.Base64,
              });
              savedViaSaf = true;
              Toast.show({
                type: 'success',
                text1: 'PDF Downloaded! 📥',
                text2: 'Invoice saved to your selected folder.',
                position: 'top',
              });
              return;
            }
          } catch (safErr) {
            console.warn('StorageAccessFramework error, fallback to share:', safErr);
          }
        }

        // iOS or fallback when Android SAF is cancelled/restricted: System share sheet allows saving or sending
        if (!savedViaSaf && await Sharing.isAvailableAsync()) {
          Toast.show({
            type: 'info',
            text1: 'Save / Download PDF 📄',
            text2: 'Choose "Save to device" or an app to save your PDF.',
            position: 'top',
          });
          await Sharing.shareAsync(generatedInvoiceUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save / Download PDF Invoice',
            UTI: 'com.adobe.pdf',
          });
        }
      }
    } catch (err: any) {
      console.warn('Download error:', err);
      Toast.show({
        type: 'error',
        text1: 'Download Failed',
        text2: err?.message || 'Could not download invoice.',
        position: 'top',
      });
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  // Share Invoice via System Share (Step 2 - Share clicked)
  const handleShareInvoice = async () => {
    if (!generatedInvoiceUri) return;
    try {
      setIsSharingInvoice(true);

      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          try {
            await (navigator as any).share({
              title: `Rupeo Invoice - ${selectedFriendDetail?.name || 'Customer'}`,
              url: generatedInvoiceUri,
            });
            return;
          } catch { }
        }
        if (typeof window !== 'undefined') {
          window.open(generatedInvoiceUri, '_blank');
          return;
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(generatedInvoiceUri, {
          mimeType: generatedInvoiceType === 'pdf' ? 'application/pdf' : 'image/png',
          dialogTitle: `Rupeo Invoice - ${selectedFriendDetail?.name || 'Customer'}`,
          UTI: generatedInvoiceType === 'pdf' ? 'com.adobe.pdf' : 'public.png',
        });
      }
    } catch (err: any) {
      console.warn('Share invoice error:', err);
    } finally {
      setIsSharingInvoice(false);
    }
  };

  // Copy Invoice Summary Text
  const handleCopyInvoiceText = () => {
    const opts = getInvoiceOptions();
    if (!opts) return;
    const msg = generateUdharInvoiceWhatsAppText(opts);
    Clipboard.setString(msg);
    Toast.show({
      type: 'success',
      text1: 'Copied to Clipboard! 📋',
      text2: 'Invoice breakdown ready to paste anywhere.',
      position: 'top',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {selectedFriendDetail ? (
        /* ================= FRIEND DETAIL LEDGER SCREEN ================= */
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          {/* Polished Top Bar */}
          <View style={styles.ledgerTopBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedFriendDetail(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>

            {/* Friend Photo / Avatar in Ledger Top Bar */}
            <View style={styles.ledgerAvatarBadge}>
              {selectedFriendDetail.photoUri ? (
                <Image source={{ uri: selectedFriendDetail.photoUri }} style={styles.ledgerAvatarImage} />
              ) : (
                <View
                  style={[
                    styles.ledgerAvatarFallback,
                    {
                      backgroundColor: getAvatarPalette(selectedFriendDetail.name).bg,
                      borderColor: getAvatarPalette(selectedFriendDetail.name).border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.ledgerAvatarInitial,
                      { color: getAvatarPalette(selectedFriendDetail.name).text },
                    ]}
                  >
                    {(selectedFriendDetail.name[0] || 'F').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.ledgerHeaderTitleCol}>
              <Text style={styles.ledgerHeaderTitle} numberOfLines={1}>
                {selectedFriendDetail.name}
              </Text>
              {selectedFriendDetail.phone ? (
                <View style={styles.ledgerPhoneRow}>
                  <Ionicons name="call-outline" size={11} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.ledgerHeaderSubtitle}>{selectedFriendDetail.phone}</Text>
                </View>
              ) : (
                <View style={styles.ledgerPhoneRow}>
                  <Ionicons name="book-outline" size={11} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.ledgerHeaderSubtitle}>Ledger Transactions</Text>
                </View>
              )}
            </View>

            <View style={styles.ledgerTopBarActions}>
              <TouchableOpacity
                style={styles.editFriendBtn}
                onPress={() => openEditFriendModal(selectedFriendDetail)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil" size={15} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteFriendBtn}
                onPress={() => promptDeleteFriend(selectedFriendDetail)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ================= CLEAN SIMPLE SUMMARY CARD ================= */}
          <View
            style={[
              styles.simpleHeroCard,
              selectedFriendDetail.balance > 0
                ? styles.simpleHeroCardGreen
                : selectedFriendDetail.balance < 0
                  ? styles.simpleHeroCardRed
                  : styles.simpleHeroCardNeutral,
            ]}
          >
            {/* Background Organic Wave Accents */}
            <View
              pointerEvents="none"
              style={[
                styles.heroOrganicWaveOuter,
                selectedFriendDetail.balance > 0
                  ? styles.heroOrganicWaveOuterGreen
                  : selectedFriendDetail.balance < 0
                    ? styles.heroOrganicWaveOuterRed
                    : styles.heroOrganicWaveOuterNeutral,
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.heroOrganicWaveInner,
                selectedFriendDetail.balance > 0
                  ? styles.heroOrganicWaveInnerGreen
                  : selectedFriendDetail.balance < 0
                    ? styles.heroOrganicWaveInnerRed
                    : styles.heroOrganicWaveInnerNeutral,
              ]}
            />

            <View style={styles.simpleHeroTopRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text
                  style={[
                    styles.simpleHeroLabel,
                    selectedFriendDetail.balance > 0
                      ? { color: '#166534' }
                      : selectedFriendDetail.balance < 0
                        ? { color: '#991B1B' }
                        : { color: '#334155' },
                  ]}
                >
                  {selectedFriendDetail.balance > 0
                    ? t('you_will_get')
                    : selectedFriendDetail.balance < 0
                      ? t('you_will_pay')
                      : t('all_settled')}
                </Text>
                <Text
                  style={[
                    styles.simpleHeroAmount,
                    selectedFriendDetail.balance > 0
                      ? { color: '#15803D' }
                      : selectedFriendDetail.balance < 0
                        ? { color: '#DC2626' }
                        : { color: '#0F172A' },
                  ]}
                >
                  {curr}{Math.abs(selectedFriendDetail.balance).toLocaleString('en-IN')}
                </Text>
                <Text style={styles.simpleHeroSubText}>
                  {selectedFriendDetail.balance > 0
                    ? (lang === 'Hindi'
                      ? `${selectedFriendDetail.name} से लेना बाकी है`
                      : lang === 'Hinglish'
                        ? `${selectedFriendDetail.name} se lena baaki hai`
                        : `${selectedFriendDetail.name} owes you ${curr}${Math.abs(selectedFriendDetail.balance)}`)
                    : selectedFriendDetail.balance < 0
                      ? (lang === 'Hindi'
                        ? `${selectedFriendDetail.name} को देना बाकी है`
                        : lang === 'Hinglish'
                          ? `${selectedFriendDetail.name} ko dena baaki hai`
                          : `You owe ${selectedFriendDetail.name} ${curr}${Math.abs(selectedFriendDetail.balance)}`)
                      : (lang === 'Hindi'
                        ? 'सभी हिसाब बराबर है 👍'
                        : lang === 'Hinglish'
                          ? 'Sab hisaab barabar hai 👍'
                          : 'All accounts are balanced 👍')}
                </Text>
              </View>

              <View
                style={[
                  styles.simpleHeroIconBadge,
                  selectedFriendDetail.balance > 0
                    ? styles.simpleHeroIconBadgeGreen
                    : selectedFriendDetail.balance < 0
                      ? styles.simpleHeroIconBadgeRed
                      : styles.simpleHeroIconBadgeNeutral,
                ]}
              >
                <Ionicons
                  name={
                    selectedFriendDetail.balance > 0
                      ? 'arrow-down'
                      : selectedFriendDetail.balance < 0
                        ? 'arrow-up'
                        : 'checkmark'
                  }
                  size={selectedFriendDetail.balance === 0 ? 24 : 22}
                  color="#FFFFFF"
                />
              </View>
            </View>

            {/* Quick Action Buttons inside the card */}
            {selectedFriendDetail.balance !== 0 && (
              <View style={styles.simpleHeroActionsRow}>
                {selectedFriendDetail.balance > 0 && (
                  <TouchableOpacity
                    style={styles.simpleHeroBtnWa}
                    onPress={() => openPaymentRequestModal(selectedFriendDetail)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="logo-whatsapp" size={13} color="#16A34A" style={{ marginRight: 4 }} />
                    <Text style={styles.simpleHeroBtnWaText}>Request</Text>
                  </TouchableOpacity>
                )}

                {/* Add Interest to overall balance */}
                <TouchableOpacity
                  style={styles.simpleHeroBtnInterest}
                  onPress={() => promptAddInterest('balance')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trending-up" size={13} color="#B45309" style={{ marginRight: 4 }} />
                  <Text style={styles.simpleHeroBtnInterestText}>+ Interest</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.simpleHeroBtnSettle,
                    selectedFriendDetail.balance <= 0 && { flex: 1.2 },
                  ]}
                  onPress={() => promptSettleUp(selectedFriendDetail)}
                  activeOpacity={0.8}
                >
                  <ThreeDDoubleTickIcon size={16} boxStyle={true} />
                  <Text style={[styles.simpleHeroBtnSettleText, { marginLeft: 4 }]}>{t('settle_up')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Section Header: Entries */}
          <View style={styles.simpleSectionHeader}>
            <Text style={styles.simpleSectionTitle}>TRANSACTIONS</Text>
            <Text style={styles.simpleSectionCount}>
              {groupedLedgerEntries.length} {groupedLedgerEntries.length === 1 ? 'Entry' : 'Entries'}
            </Text>
          </View>

          {/* Transactions List */}
          {isLoadingEntries ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0F172A" />
            </View>
          ) : groupedLedgerEntries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{t('no_entries_yet')}</Text>
              <Text style={styles.emptySubtitle}>
                Use the buttons below to record money given or taken.
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 110 + (insets.bottom > 0 ? insets.bottom : 0),
              }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={Platform.OS === 'android'}
            >
              {groupedLedgerEntries.map((group) => {
                const {
                  parent,
                  children,
                  totalInterest,
                  effectiveAmount,
                  totalSettled,
                  remaining,
                  isFullySettled,
                  isPartiallySettled,
                } = group;
                const isGave = parent.type === 'gave';

                return (
                  <View key={parent.id} style={styles.simpleEntryCard}>
                    {/* Top Row: Kitne Diye/Liye & Kitna Bacha Hai */}
                    <View style={styles.simpleEntryMainRow}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        {/* Type Pill + Amount Given / Taken */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <View style={[styles.simpleEntryTypePill, isGave ? styles.typePillGave : styles.typePillGot]}>
                            <Ionicons
                              name={isGave ? 'arrow-up-circle' : 'arrow-down-circle'}
                              size={11}
                              color={isGave ? '#15803D' : '#DC2626'}
                              style={{ marginRight: 3 }}
                            />
                            <Text style={[styles.simpleEntryTypeText, isGave ? { color: '#15803D' } : { color: '#DC2626' }]}>
                              {isGave ? t('you_gave') : t('you_got')}
                            </Text>
                          </View>
                          <Text style={[styles.simpleEntryAmount, isFullySettled && styles.simpleAmountStruck]}>
                            {curr}{parent.amount.toLocaleString('en-IN')}
                          </Text>
                          {totalInterest > 0 && (
                            <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '700' }}>
                              (+{curr}{totalInterest.toLocaleString('en-IN')})
                            </Text>
                          )}
                        </View>

                        {/* Note & Date */}
                        {parent.note ? (
                          <Text style={styles.simpleEntryNote} numberOfLines={2}>
                            💬 {parent.note}
                          </Text>
                        ) : null}
                        <Text style={styles.simpleEntryDate}>
                          {parent.date} {parent.time ? `• ${parent.time}` : ''}
                        </Text>
                      </View>

                      {/* Right: Kitna Bacha Hai Status */}
                      <View style={{ alignItems: 'flex-end', justifyContent: 'flex-start' }}>
                        {isFullySettled ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={styles.simpleBadgeSettled}>
                              <ThreeDDoubleTickIcon size={12} boxStyle={true} />
                              <Text style={styles.simpleBadgeSettledText}>{lang === 'Hindi' ? 'चुकता' : 'SETTLED'}</Text>
                            </View>
                            <Text style={styles.simpleRemainingZeroText}>
                              {lang === 'Hindi' ? 'बकाया: ₹0' : 'Remaining: ₹0'}
                            </Text>
                          </View>
                        ) : isPartiallySettled ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.simpleRemainingDueText}>
                              {curr}{remaining.toLocaleString('en-IN')} {lang === 'Hindi' ? 'बाकी' : 'Left'}
                            </Text>
                            <View style={styles.simpleBadgePartial}>
                              <Text style={styles.simpleBadgePartialText}>
                                {curr}{totalSettled.toLocaleString('en-IN')} {lang === 'Hindi' ? 'जमा' : 'Paid'}
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.simpleRemainingDueText}>
                              {curr}{parent.amount.toLocaleString('en-IN')} {lang === 'Hindi' ? 'बाकी' : 'Left'}
                            </Text>
                            <View style={styles.simpleBadgePending}>
                              <Text style={styles.simpleBadgePendingText}>
                                {lang === 'Hindi' ? 'लंबित' : 'PENDING'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Dropdown Toggle Button (when payments/settlements exist) */}
                    {children.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.threadDropdownBtn,
                          expandedThreads[parent.id] && styles.threadDropdownBtnOpen,
                        ]}
                        onPress={() => toggleThread(parent.id)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.threadDropdownBtnLeft}>
                          <View style={styles.threadDropdownIconWrap}>
                            {isFullySettled ? (
                              <ThreeDDoubleTickIcon size={24} />
                            ) : (
                              <ThreeDPendingClockIcon size={24} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.threadDropdownBtnTitle} numberOfLines={1}>
                              {children.length} {children.length === 1 ? (lang === 'Hindi' ? 'किस्त' : 'Settlement') : (lang === 'Hindi' ? 'किस्तें' : 'Settlements')} • {curr}{totalSettled.toLocaleString('en-IN')} {isGave ? (lang === 'Hindi' ? 'प्राप्त' : 'Received') : (lang === 'Hindi' ? 'चुकाया' : 'Paid')}
                            </Text>
                            <Text style={styles.threadDropdownBtnSubtitle} numberOfLines={1}>
                              {expandedThreads[parent.id]
                                ? (lang === 'Hindi' ? 'हिसाब बंद करने के लिए टैप करें' : 'Tap to collapse breakdown')
                                : (lang === 'Hindi' ? 'कब कितना दिया देखने के लिए टैप करें' : 'Tap to see when & how much was paid')}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.threadDropdownBtnRight}>
                          <Ionicons
                            name={expandedThreads[parent.id] ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#64748B"
                          />
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Simple Thread-Like Structure Dropdown Timeline */}
                    {children.length > 0 && expandedThreads[parent.id] && (
                      <View style={styles.threadDropdownContent}>
                        {/* Continuous vertical timeline rail line */}
                        <View style={styles.threadRailLine} />

                        {children.map((child) => {
                          const isInterestItem = child.settlementType === 'interest' || child.isInterest;
                          const isReceived = child.type === 'got';
                          const childAmt = isInterestItem ? getDynamicEntryAmount(child) : child.amount;

                          return (
                            <View key={child.id} style={styles.threadItemRow}>
                              {/* Thread Node Dot directly on rail */}
                              <View
                                style={[
                                  styles.threadNodeDot,
                                  isInterestItem && styles.threadNodeDotInterest,
                                  !isInterestItem && isReceived && styles.threadNodeDotReceived,
                                  !isInterestItem && !isReceived && styles.threadNodeDotPaid,
                                ]}
                              >
                                <Ionicons
                                  name={isInterestItem ? 'trending-up' : isReceived ? 'arrow-down' : 'arrow-up'}
                                  size={9}
                                  color="#FFFFFF"
                                />
                              </View>

                              {/* Clean minimal row content */}
                              <View style={styles.threadItemCard}>
                                <View style={styles.threadItemCardTop}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Text style={styles.threadItemActionTitle}>
                                      {isInterestItem
                                        ? (lang === 'Hindi' ? 'ब्याज जोड़ा गया' : 'Interest Added')
                                        : isReceived
                                          ? (lang === 'Hindi' ? 'प्राप्त हुआ' : 'Received')
                                          : (lang === 'Hindi' ? 'चुकाया गया' : 'Paid Back')}
                                    </Text>
                                    {child.paymentMode && (
                                      <View style={styles.threadModeBadge}>
                                        <Text style={styles.threadModeBadgeText}>{child.paymentMode}</Text>
                                      </View>
                                    )}
                                    {isInterestItem && child.interestPercent ? (
                                      <View style={[styles.threadModeBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                                        <Text style={[styles.threadModeBadgeText, { color: '#B45309' }]}>
                                          {child.interestPercent}%
                                        </Text>
                                      </View>
                                    ) : null}
                                  </View>

                                  <Text
                                    style={[
                                      styles.threadItemAmount,
                                      { color: isInterestItem ? '#D97706' : isReceived ? '#15803D' : '#DC2626' },
                                    ]}
                                  >
                                    {isInterestItem ? '+' : isReceived ? '+' : '-'}{curr}{childAmt.toLocaleString('en-IN')}
                                  </Text>
                                </View>

                                <View style={styles.threadItemCardBottom}>
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={styles.threadItemDate}>
                                      {isInterestItem && child.interestStartDate
                                        ? `${lang === 'Hindi' ? 'सक्रिय:' : 'Active since'} ${child.interestStartDate}`
                                        : `${child.date} ${child.time ? `• ${child.time}` : ''}`}
                                    </Text>
                                    {child.note ? (
                                      <Text style={styles.threadItemNote} numberOfLines={2}>
                                        💬 {child.note}
                                      </Text>
                                    ) : null}
                                  </View>

                                  <TouchableOpacity
                                    onPress={() => promptDeleteEntry(child)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={styles.threadDeleteBtn}
                                  >
                                    <Ionicons name="trash-outline" size={13} color="#94A3B8" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })}

                        {/* Final Thread Summary Node */}
                        <View style={styles.threadItemRow}>
                          <View
                            style={[
                              styles.threadNodeDot,
                              isFullySettled ? styles.threadNodeDotDone : styles.threadNodeDotPending,
                            ]}
                          >
                            {isFullySettled ? (
                              <ThreeDDoubleTickIcon size={14} />
                            ) : (
                              <Ionicons
                                name="hourglass-outline"
                                size={9}
                                color="#FFFFFF"
                              />
                            )}
                          </View>
                          <View style={[styles.threadSummaryCard, isFullySettled ? styles.threadSummarySettled : styles.threadSummaryPending]}>
                            <Text style={styles.threadSummaryLabel}>
                              {isFullySettled
                                ? (lang === 'Hindi' ? ' पूरा हिसाब चुकता हो चुका है' : ' Full amount settled')
                                : (lang === 'Hindi' ? 'बाकी बकाया शेष:' : 'Current Remaining Due:')}
                            </Text>
                            <Text
                              style={[
                                styles.threadSummaryAmount,
                                { color: isFullySettled ? '#15803D' : '#D97706' },
                              ]}
                            >
                              {isFullySettled ? `${curr}0` : `${curr}${remaining.toLocaleString('en-IN')}`}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Footer Actions: Settle Remaining, Add Interest & Delete */}
                    <View style={styles.simpleEntryFooter}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        {!isFullySettled && remaining > 0 && selectedFriendDetail && (
                          <TouchableOpacity
                            style={styles.simpleEntrySettleBtn}
                            onPress={() => promptSettleEntry(selectedFriendDetail, parent, remaining)}
                            activeOpacity={0.8}
                          >
                            <ThreeDDoubleTickIcon size={14} boxStyle={true} />
                            <Text style={[styles.simpleEntrySettleBtnText, { marginLeft: 3 }]}>
                              {isPartiallySettled
                                ? `Pay Rem (${curr}${remaining.toLocaleString('en-IN')})`
                                : `Settle (${curr}${parent.amount.toLocaleString('en-IN')})`}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Add Interest to this single payment */}
                        {!isFullySettled && (
                          <TouchableOpacity
                            style={styles.simpleEntryInterestBtn}
                            onPress={() => promptAddInterest('entry', parent)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trending-up" size={13} color="#B45309" style={{ marginRight: 3 }} />
                            <Text style={styles.simpleEntryInterestBtnText}>+ Interest</Text>
                          </TouchableOpacity>
                        )}

                        {/* Bill / Invoice — only for 'gave' (give) entries */}
                        {parent.type === 'gave' && (
                          <TouchableOpacity
                            style={styles.simpleEntryInvoiceBtn}
                            onPress={() => openInvoiceModal('single', group)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="receipt-outline" size={13} color="#2563EB" style={{ marginRight: 3 }} />
                            <Text style={styles.simpleEntryInvoiceBtnText}>Bill</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.simpleEntryDeleteBtn}
                        onPress={() => promptDeleteEntry(parent)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={13} color="#94A3B8" />
                        <Text style={styles.simpleEntryDeleteBtnText}>{t('delete') || 'Delete'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Simple Bottom Action Bar (Khatabook Style) */}
          <View style={[styles.simpleBottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 12 }]}>
            <TouchableOpacity
              style={[styles.simpleBottomBtn, styles.simpleBottomBtnGave]}
              onPress={() => openAddEntryModal(selectedFriendDetail, 'gave')}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-down-circle" size={20} color="#15803D" style={{ marginRight: 6 }} />
              <Text style={styles.simpleBottomBtnTextGave}>+ {t('you_gave')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simpleBottomBtn, styles.simpleBottomBtnGot]}
              onPress={() => openAddEntryModal(selectedFriendDetail, 'got')}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up-circle" size={20} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.simpleBottomBtnTextGot}>- {t('you_got')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ================= MAIN FRIENDS & UDHAR LIST VIEW ================= */
        <View style={{ flex: 1 }}>
          {/* Top Navigation Bar */}
          <View style={styles.topNavBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => safeGoBack(router)}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.topNavTitleWrap}>
              <View style={styles.topNavTitleRow}>
                <ExpoImage
                  source={{ uri: UDHAR_ICONS.ledger }}
                  style={{ width: 24, height: 24, marginRight: 6 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.topNavTitle}>{t('udhar_title')}</Text>
              </View>
              <Text style={styles.topNavSubtitle}>{t('udhar_subtitle')}</Text>
            </View>

            <TouchableOpacity
              style={styles.addFriendHeaderBtn}
              onPress={openAddFriendModal}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.addFriendHeaderBtnText}>{t('add_friend')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + (insets.bottom > 0 ? insets.bottom + 16 : 0) }]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
          >
            {/* Master Net Khata Position Banner */}
            <View style={styles.netKhataCard}>
              <LinearGradient
                colors={
                  netBalance > 0
                    ? ['#F0FDF4', '#DCFCE7']
                    : netBalance < 0
                      ? ['#FEF2F2', '#FEE2E2']
                      : ['#F4FAF6', '#EAF7F0']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.netKhataGradient}
              >
                {/* Background Organic Wave Accents */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.heroOrganicWaveOuter,
                    netBalance > 0
                      ? styles.heroOrganicWaveOuterGreen
                      : netBalance < 0
                        ? styles.heroOrganicWaveOuterRed
                        : styles.heroOrganicWaveOuterNeutral,
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.heroOrganicWaveInner,
                    netBalance > 0
                      ? styles.heroOrganicWaveInnerGreen
                      : netBalance < 0
                        ? styles.heroOrganicWaveInnerRed
                        : styles.heroOrganicWaveInnerNeutral,
                  ]}
                />

                <View style={styles.netKhataTopRow}>
                  <View style={styles.netKhataLeft}>
                    <View
                      style={[
                        styles.netKhataBadge,
                        {
                          backgroundColor:
                            netBalance > 0
                              ? '#DCFCE7'
                              : netBalance < 0
                                ? '#FEE2E2'
                                : '#D1F0E0',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.netKhataBadgeText,
                          {
                            color:
                              netBalance > 0
                                ? '#15803D'
                                : netBalance < 0
                                  ? '#DC2626'
                                  : '#059669',
                          },
                        ]}
                      >
                        {netBalance > 0
                          ? (lang === 'Hindi' ? 'कुल मिलेगा' : 'NET TO RECEIVE')
                          : netBalance < 0
                            ? (lang === 'Hindi' ? 'कुल देना है' : 'NET TO PAY')
                            : (lang === 'Hindi' ? 'सब हिसाब चुकता' : 'ALL CLEAR & SETTLED')}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.netKhataAmount,
                        {
                          color:
                            netBalance > 0
                              ? '#15803D'
                              : netBalance < 0
                                ? '#DC2626'
                                : '#0F172A',
                        },
                      ]}
                    >
                      {netBalance > 0 ? '+' : netBalance < 0 ? '-' : ''}
                      {curr}
                      {Math.abs(netBalance).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.netKhataSub}>
                      {netBalance > 0
                        ? (lang === 'Hindi' ? 'दोस्तों से कुल बकाया राशि लेनी है' : 'Overall money you will receive')
                        : netBalance < 0
                          ? (lang === 'Hindi' ? 'दोस्तों को कुल बकाया राशि चुकानी है' : 'Overall money you need to pay back')
                          : (lang === 'Hindi' ? 'कोई बकाया नहीं, सब हिसाब बराबर ✨' : 'No pending dues with any friend ✨')}
                    </Text>
                  </View>
                  <View style={styles.netKhataIconWrap}>
                    {netBalance === 0 ? (
                      <View style={[styles.simpleHeroIconBadge, styles.simpleHeroIconBadgeNeutral]}>
                        <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                      </View>
                    ) : (
                      <ExpoImage
                        source={{
                          uri:
                            netBalance > 0
                              ? UDHAR_ICONS.moneyBag
                              : UDHAR_ICONS.moneyWings,
                        }}
                        style={{ width: 44, height: 44 }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    )}
                  </View>
                </View>

                {/* Integrated Dashboard Sync Toggle Strip inside ALL CLEAR & SETTLED Card */}
                <View style={styles.netKhataDivider} />
                <View style={styles.netKhataToggleRow}>
                  <View style={styles.netKhataToggleLeft}>
                    <View
                      style={[
                        styles.netKhataToggleIconWrap,
                        {
                          backgroundColor:
                            netBalance > 0
                              ? '#DCFCE7'
                              : netBalance < 0
                                ? '#FEE2E2'
                                : '#D1F0E0',
                        },
                      ]}
                    >
                      <Ionicons
                        name={syncOnDashboardDefault ? 'wallet' : 'wallet-outline'}
                        size={13}
                        color={
                          netBalance > 0
                            ? '#15803D'
                            : netBalance < 0
                              ? '#DC2626'
                              : '#059669'
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.netKhataToggleTitle}>{t('sync_udhar_to_dashboard')}</Text>
                      <Text style={styles.netKhataToggleSub} numberOfLines={1}>
                        {syncOnDashboardDefault
                          ? (lang === 'Hindi' ? 'होम स्क्रीन खर्चों में जुड़ेगा' : 'Auto-record to Home Spends')
                          : (lang === 'Hindi' ? 'सिर्फ खाताबुक में रहेगा (होम पर नहीं)' : 'Khata only (not on Home)')}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={syncOnDashboardDefault}
                    onValueChange={handleToggleDashboard}
                    trackColor={{
                      false: 'rgba(148, 163, 184, 0.35)',
                      true:
                        netBalance > 0
                          ? '#16A34A'
                          : netBalance < 0
                            ? '#DC2626'
                            : '#059669',
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </LinearGradient>
            </View>

            {/* Hero Balance Cards Grid (Compact & Sleek) */}
            <View style={styles.heroStatsContainer}>
              {/* 1. To Receive Card (Green Accent) */}
              <View style={[styles.statCard, styles.statCardReceive]}>
                <View style={styles.statCardTop}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#16A34A' }]}>
                    <Ionicons name="arrow-down" size={12} color="#FFFFFF" />
                  </View>
                  <Text style={styles.statCardLabel} numberOfLines={1}>{t('you_will_get')}</Text>
                </View>
                <View style={styles.statAmountRow}>
                  <Text style={[styles.statCurrency, { color: '#15803D' }]}>{curr}</Text>
                  <Text style={[styles.statAmount, { color: '#15803D' }]} numberOfLines={1}>
                    {totalToReceive.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* 2. To Pay Card (Red Accent) */}
              <View style={[styles.statCard, styles.statCardPay]}>
                <View style={styles.statCardTop}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#DC2626' }]}>
                    <Ionicons name="arrow-up" size={12} color="#FFFFFF" />
                  </View>
                  <Text style={styles.statCardLabel} numberOfLines={1}>{t('you_will_pay')}</Text>
                </View>
                <View style={styles.statAmountRow}>
                  <Text style={[styles.statCurrency, { color: '#DC2626' }]}>{curr}</Text>
                  <Text style={[styles.statAmount, { color: '#DC2626' }]} numberOfLines={1}>
                    {totalToPay.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBarContainer}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={lang === 'Hindi' ? 'दोस्त खोजें...' : 'Search friends...'}
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Pills with Count Badges */}
            <View style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
                onPress={() => setActiveFilter('all')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
                  {t('udhar_filter_all')}
                </Text>
                <View style={[styles.filterCountBadge, activeFilter === 'all' && styles.filterCountBadgeActive]}>
                  <Text style={[styles.filterCountText, activeFilter === 'all' && styles.filterCountTextActive]}>
                    {friends.length}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, activeFilter === 'to_get' && styles.filterPillActive]}
                onPress={() => setActiveFilter('to_get')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, activeFilter === 'to_get' && styles.filterPillTextActive]}>
                  {t('filter_to_get')}
                </Text>
                {toGetCount > 0 && (
                  <View style={[styles.filterCountBadge, activeFilter === 'to_get' && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, activeFilter === 'to_get' && styles.filterCountTextActive]}>
                      {toGetCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, activeFilter === 'to_pay' && styles.filterPillActive]}
                onPress={() => setActiveFilter('to_pay')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, activeFilter === 'to_pay' && styles.filterPillTextActive]}>
                  {t('filter_to_pay')}
                </Text>
                {toPayCount > 0 && (
                  <View style={[styles.filterCountBadge, activeFilter === 'to_pay' && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, activeFilter === 'to_pay' && styles.filterCountTextActive]}>
                      {toPayCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, activeFilter === 'settled' && styles.filterPillActive]}
                onPress={() => setActiveFilter('settled')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, activeFilter === 'settled' && styles.filterPillTextActive]}>
                  {t('filter_settled')}
                </Text>
                {settledCount > 0 && (
                  <View style={[styles.filterCountBadge, activeFilter === 'settled' && styles.filterCountBadgeActive]}>
                    <Text style={[styles.filterCountText, activeFilter === 'settled' && styles.filterCountTextActive]}>
                      {settledCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Friends List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0F172A" />
              </View>
            ) : filteredFriends.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <ExpoImage
                    source={{ uri: UDHAR_ICONS.ledger }}
                    style={{ width: 44, height: 44 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </View>
                <Text style={styles.emptyTitle}>{t('no_friends_yet')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_friends_sub')}</Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={openAddFriendModal}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person-add" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyAddBtnText}>{t('add_friend')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.friendsList}>
                {filteredFriends.map((friend) => {
                  const initial = (friend.name[0] || 'F').toUpperCase();
                  const isToGet = friend.balance > 0;
                  const isToPay = friend.balance < 0;
                  const isSettled = friend.balance === 0;
                  const palette = getAvatarPalette(friend.name);

                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={styles.friendCard}
                      onPress={() => setSelectedFriendDetail(friend)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.friendCardMain}>
                        {/* Friend Photo / Initial Circle Avatar with Palette */}
                        <View
                          style={[
                            styles.friendAvatarCircle,
                            {
                              backgroundColor: palette.bg,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          {friend.photoUri ? (
                            <Image source={{ uri: friend.photoUri }} style={styles.friendCardPhotoImage} />
                          ) : (
                            <Text style={[styles.friendAvatarText, { color: palette.text }]}>
                              {initial}
                            </Text>
                          )}
                        </View>

                        {/* Friend Name & Phone Column */}
                        <View style={styles.friendInfoColumn}>
                          <Text style={styles.friendNameText} numberOfLines={1}>
                            {friend.name}
                          </Text>
                          {friend.phone ? (
                            <View style={styles.phoneRow}>
                              <Ionicons name="call-outline" size={11} color="#64748B" style={{ marginRight: 4 }} />
                              <Text style={styles.phoneText}>{friend.phone}</Text>
                            </View>
                          ) : (
                            <Text style={styles.noPhoneText}>
                              {friend.entryCount} {friend.entryCount === 1 ? 'entry' : 'entries'}
                            </Text>
                          )}
                        </View>

                        {/* Balance Pill on Right */}
                        <View style={styles.friendBalanceWrap}>
                          <Text
                            style={[
                              styles.friendBalanceAmount,
                              isToGet
                                ? { color: '#15803D' }
                                : isToPay
                                  ? { color: '#DC2626' }
                                  : { color: '#475569' },
                            ]}
                          >
                            {isToGet ? '+' : isToPay ? '-' : ''}
                            {curr}
                            {Math.abs(friend.balance).toLocaleString('en-IN')}
                          </Text>
                          <View
                            style={[
                              styles.friendBalanceBadge,
                              isToGet
                                ? styles.badgeGreen
                                : isToPay
                                  ? styles.badgeRed
                                  : styles.badgeNeutral,
                            ]}
                          >
                            <Text
                              style={[
                                styles.friendBalanceBadgeText,
                                isToGet
                                  ? { color: '#15803D' }
                                  : isToPay
                                    ? { color: '#DC2626' }
                                    : { color: '#475569' },
                              ]}
                            >
                              {isToGet
                                ? t('you_will_get')
                                : isToPay
                                  ? t('you_will_pay')
                                  : t('settled')}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Friend Quick Actions Footer */}
                      <View style={styles.friendCardActions}>
                        {/* Add Entry Action */}
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => openAddEntryModal(friend, 'gave')}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add-circle" size={15} color="#475569" style={{ marginRight: 4 }} />
                          <Text style={styles.cardActionBtnText}>{t('add_entry')}</Text>
                        </TouchableOpacity>

                        {/* QR & WhatsApp Request Button */}
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          onPress={() => openPaymentRequestModal(friend)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="logo-whatsapp"
                            size={14}
                            color="#16A34A"
                            style={{ marginRight: 4 }}
                          />
                          <Text style={[styles.cardActionBtnText, { color: '#16A34A', fontWeight: '800' }]}>
                            {t('request_payment')}
                          </Text>
                        </TouchableOpacity>

                        {/* Settle Quick Action if balance != 0 */}
                        {friend.balance !== 0 && (
                          <TouchableOpacity
                            style={styles.cardActionBtn}
                            onPress={() => promptSettleUp(friend)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="checkmark-circle" size={14} color="#6366F1" style={{ marginRight: 4 }} />
                            <Text style={[styles.cardActionBtnText, { color: '#6366F1', fontWeight: '800' }]}>
                              {t('settle_up')}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Details Chevron */}
                        <View style={styles.cardDetailsChevron}>
                          <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ================= MODAL 1: ADD / EDIT FRIEND MODAL ================= */}
      <Modal
        visible={isAddFriendModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingFriend) {
            setIsAddFriendModalOpen(false);
            setEditingFriendId(null);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modernAddFriendCard}>
            {/* Header */}
            <View style={styles.modernAddFriendHeader}>
              <LinearGradient
                colors={['#6366F1', '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modernHeaderIconBadge}
              >
                <Ionicons name={editingFriendId ? 'create' : 'person-add'} size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modernAddFriendTitle}>
                  {editingFriendId ? t('edit_friend') : t('add_friend')}
                </Text>
                <Text style={styles.modernAddFriendSubtitle}>
                  {editingFriendId ? 'Edit friend details & profile photo' : 'Track lending, borrowing & reminders'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isSavingFriend) {
                    setIsAddFriendModalOpen(false);
                    setEditingFriendId(null);
                  }
                }}
                style={styles.modernCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Profile Photo Avatar */}
            <View style={styles.modernPhotoSection}>
              <TouchableOpacity
                style={styles.modernPhotoAvatarTouch}
                onPress={handlePickFriendPhoto}
                activeOpacity={0.8}
              >
                {newFriendPhotoUri ? (
                  <Image source={{ uri: newFriendPhotoUri }} style={styles.modernPhotoAvatarImg} />
                ) : (
                  <View style={styles.modernPhotoPlaceholder}>
                    <Ionicons name="person" size={38} color="#94A3B8" />
                  </View>
                )}
                <View style={styles.modernCameraBadge}>
                  <Ionicons name="camera" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              {newFriendPhotoUri && (
                <TouchableOpacity
                  onPress={() => setNewFriendPhotoUri(null)}
                  style={{ marginTop: 6 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modernPhotoRemoveText}>{t('remove_photo')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Input 1: Friend Name */}
            <View style={styles.modernInputGroup}>
              <View style={styles.modernInputLabelRow}>
                <Ionicons name="person" size={13} color="#4F46E5" />
                <Text style={styles.modernInputLabel}>
                  {t('friend_name')} <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
              </View>
              <View style={styles.modernTextInputContainer}>
                <Ionicons name="person-outline" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.modernTextInput}
                  placeholder={t('friend_name_placeholder')}
                  placeholderTextColor="#94A3B8"
                  value={newFriendName}
                  onChangeText={setNewFriendName}
                  autoCapitalize="words"
                />
                {newFriendName.length > 0 && (
                  <TouchableOpacity onPress={() => setNewFriendName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Input 2: Phone Number with '+' Icon to select from Contacts */}
            <View style={styles.modernInputGroup}>
              <View style={styles.modernInputLabelRow}>
                <Ionicons name="call" size={13} color="#4F46E5" />
                <Text style={styles.modernInputLabel}>{t('phone_optional')}</Text>
              </View>
              <View style={styles.modernPhoneInputRow}>
                <View style={styles.modernCountryPill}>
                  <Text style={styles.modernCountryText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.modernPhoneTextInput}
                  placeholder={t('phone_placeholder')}
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={newFriendPhone}
                  onChangeText={setNewFriendPhone}
                />
                <TouchableOpacity
                  style={styles.addContactPlusBtn}
                  onPress={handlePickFromContacts}
                  activeOpacity={0.7}
                  disabled={isImportingContact}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isImportingContact ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Buttons Row */}
            <View style={styles.modernModalButtonsRow}>
              <TouchableOpacity
                style={styles.modernCancelBtn}
                onPress={() => {
                  setIsAddFriendModalOpen(false);
                  setEditingFriendId(null);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.modernCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modernSaveBtn, isSavingFriend && { opacity: 0.7 }]}
                onPress={handleSaveFriend}
                disabled={isSavingFriend}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modernSaveGradient}
                >
                  {isSavingFriend ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.modernSaveText}>
                        {editingFriendId ? t('save_changes') : t('save_friend')}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= IN-APP DEVICE CONTACTS BROWSER MODAL ================= */}
      <Modal
        visible={isContactListModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsContactListModalOpen(false)}
      >
        <View style={styles.contactBrowserBackdrop}>
          <SafeAreaView style={styles.contactBrowserSheet}>
            {/* Header */}
            <View style={styles.contactBrowserHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactBrowserTitle}>Choose Contact</Text>
                <Text style={styles.contactBrowserSubtitle}>Tap any contact to auto-fill into Rupeo</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsContactListModalOpen(false)}
                style={styles.modernCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.contactSearchWrap}>
              <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.contactSearchInput}
                placeholder={t('search_contacts')}
                placeholderTextColor="#94A3B8"
                value={contactSearchQuery}
                onChangeText={setContactSearchQuery}
                autoCorrect={false}
              />
              {contactSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearchQuery('')}>
                  <Ionicons name="close-circle" size={17} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            {isLoadingContacts ? (
              <View style={styles.contactLoadingWrap}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={styles.contactLoadingText}>Loading contacts...</Text>
              </View>
            ) : filteredDeviceContacts.length === 0 ? (
              <View style={styles.contactEmptyWrap}>
                <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                <Text style={styles.contactEmptyTitle}>No contacts found</Text>
                <Text style={styles.contactEmptySub}>Try searching with a different name or number</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredDeviceContacts.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.contactListItem}
                    onPress={() => {
                      applyContactToFriend(c);
                      setIsContactListModalOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    {c.photoUri ? (
                      <Image source={{ uri: c.photoUri }} style={styles.contactListAvatar} />
                    ) : (
                      <View style={styles.contactListInitials}>
                        <Text style={styles.contactListInitialsText}>
                          {c.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.contactListName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.phone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Ionicons name="call-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                          <Text style={styles.contactListPhone}>{c.phone}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.contactSelectBadge}>
                      <Text style={styles.contactSelectText}>Select</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* ================= MODAL 2: ADD ENTRY MODAL (MAINE DIYE / MAINE LIYE) ================= */}
      <Modal
        visible={isAddEntryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddEntryModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View
                style={[
                  styles.modalIconCircle,
                  entryType === 'gave'
                    ? { backgroundColor: '#F0FDF4' }
                    : { backgroundColor: '#FEF2F2' },
                ]}
              >
                <Ionicons
                  name={entryType === 'gave' ? 'arrow-down' : 'arrow-up'}
                  size={20}
                  color={entryType === 'gave' ? '#15803D' : '#DC2626'}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>
                  {selectedFriendForEntry?.name || 'Friend'}
                </Text>
                <Text style={styles.modalSubtitle}>{t('add_entry')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddEntryModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Segmented Type Toggle: Light and Minimalist */}
            <View style={styles.entryTypeToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.entryTypeToggleBtn,
                  entryType === 'gave' && styles.entryTypeToggleGaveActive,
                ]}
                onPress={() => setEntryType('gave')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-down-circle"
                  size={16}
                  color={entryType === 'gave' ? '#15803D' : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.entryTypeToggleText,
                    entryType === 'gave' && { color: '#15803D', fontWeight: '800' },
                  ]}
                >
                  {t('you_gave')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.entryTypeToggleBtn,
                  entryType === 'got' && styles.entryTypeToggleGotActive,
                ]}
                onPress={() => setEntryType('got')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-up-circle"
                  size={16}
                  color={entryType === 'got' ? '#DC2626' : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.entryTypeToggleText,
                    entryType === 'got' && { color: '#DC2626', fontWeight: '800' },
                  ]}
                >
                  {t('you_got')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Type Subtitle Helper */}
            <Text style={styles.typeSubExplanation}>
              {entryType === 'gave'
                ? lang === 'Hindi'
                  ? 'आपने पैसे दिए हैं (दोस्त से बाद में वापस लेने हैं)'
                  : lang === 'Hinglish'
                    ? 'Maine paise diye hain (Friend se wapas lene hain)'
                    : 'You gave/lent money (Friend owes you)'
                : lang === 'Hindi'
                  ? 'आपने पैसे लिए हैं (दोस्त को बाद में वापस देने हैं)'
                  : lang === 'Hinglish'
                    ? 'Maine paise liye hain (Friend ko wapas dene hain)'
                    : 'You borrowed money (You owe friend)'}
            </Text>

            {/* Quick Settle Chip if balance exists with this friend */}
            {selectedFriendForEntry && selectedFriendForEntry.balance !== 0 && (
              <TouchableOpacity
                style={styles.quickSettleInModalBtn}
                onPress={() => {
                  const isOwed = selectedFriendForEntry.balance > 0;
                  setEntryType(isOwed ? 'got' : 'gave');
                  setEntryAmount(Math.abs(selectedFriendForEntry.balance).toString());
                  setEntryNote(
                    lang === 'Hindi'
                      ? 'हिसाब चुकता'
                      : lang === 'Hinglish'
                        ? 'Hisaab Clear'
                        : 'Full Settlement'
                  );
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-circle" size={15} color="#15803D" style={{ marginRight: 6 }} />
                <Text style={styles.quickSettleInModalText} numberOfLines={1}>
                  {lang === 'Hindi'
                    ? `बाकी हिसाब चुकता भरें (${curr}${Math.abs(selectedFriendForEntry.balance).toLocaleString('en-IN')})`
                    : lang === 'Hinglish'
                      ? `Pending Hisaab Settle Karein (${curr}${Math.abs(selectedFriendForEntry.balance).toLocaleString('en-IN')})`
                      : `Fill Settlement Amount (${curr}${Math.abs(selectedFriendForEntry.balance).toLocaleString('en-IN')})`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Amount Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('enter_amount')}</Text>
              <View style={styles.amountInputWrap}>
                <Text style={styles.amountInputPrefix}>{curr}</Text>
                <TextInput
                  style={styles.amountInputField}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={entryAmount}
                  onChangeText={setEntryAmount}
                  autoFocus
                />
              </View>
            </View>

            {/* Note / Reason */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('note_optional')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('udhar_note_placeholder')}
                placeholderTextColor="#94A3B8"
                value={entryNote}
                onChangeText={setEntryNote}
              />
            </View>

            {/* Buttons */}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddEntryModalOpen(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  isSavingEntry && { opacity: 0.7 },
                ]}
                onPress={handleSaveEntry}
                disabled={isSavingEntry}
                activeOpacity={0.85}
              >
                {isSavingEntry ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t('add_entry')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 4: REQUEST PAYMENT (UPI QR & WHATSAPP SHARE) ================= */}
      <Modal
        visible={isRequestModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRequestModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
              <View style={styles.modalHeaderRow}>
                <View style={[styles.modalIconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="qr-code" size={20} color="#475569" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.modalTitle}>{t('request_payment_qr')}</Text>
                  <Text style={styles.modalSubtitle}>
                    {requestFriend?.name || 'Friend'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsRequestModalOpen(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {!isQrGenerated ? (
                /* STEP 1: Enter Amount & Complete UPI ID, click Done to Generate */
                <View style={{ width: '100%' }}>
                  {/* Amount to request */}
                  <View style={[styles.formGroup, { marginTop: 4 }]}>
                    <Text style={styles.formLabel}>{t('enter_amount')}</Text>
                    <View style={styles.amountInputWrap}>
                      <Text style={styles.amountInputPrefix}>{curr}</Text>
                      <TextInput
                        style={styles.amountInputField}
                        placeholder="400"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        value={requestAmount}
                        onChangeText={(txt) => {
                          setRequestAmount(txt);
                          setIsQrGenerated(false);
                        }}
                      />
                    </View>
                  </View>

                  {/* Your Receiving UPI ID */}
                  <View style={styles.formGroup}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.formLabel}>{t('your_upi_id')}</Text>
                      <Text style={styles.upiFormatHint}>name@bank</Text>
                    </View>
                    <TextInput
                      style={styles.formInput}
                      placeholder={t('enter_upi_placeholder')}
                      placeholderTextColor="#94A3B8"
                      value={myUpiId}
                      onChangeText={(txt) => {
                        setMyUpiId(txt);
                        setIsQrGenerated(false);
                      }}
                      autoCapitalize="none"
                    />

                    {/* Quick handle suffix chips */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.handleChipsRow}
                    >
                      {POPULAR_HANDLES.map((h) => (
                        <TouchableOpacity
                          key={h.id}
                          style={styles.handleChip}
                          onPress={() => {
                            handleSelectUpiSuffix(h.handle);
                            setIsQrGenerated(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.handleChipText}>{h.handle}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Big Done · Generate QR Button */}
                  <TouchableOpacity
                    style={styles.generateDoneBtn}
                    onPress={handleGeneratePaymentQr}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.generateDoneBtnText}>{t('generate_qr_btn')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* STEP 2: Live QR Preview with Rupeo Logo Emblem & WhatsApp Send Button */
                <View style={{ width: '100%', alignItems: 'center' }}>
                  {/* Preview Top Header: Preview badge + Edit button */}
                  <View style={styles.previewHeaderRow}>
                    <View style={styles.previewBadge}>
                      <Ionicons name="eye" size={13} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.previewBadgeText}>{t('qr_preview_title')}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.editQrDetailsBtn}
                      onPress={() => setIsQrGenerated(false)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="pencil" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.editQrDetailsBtnText}>{t('edit_qr_details')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Viewfinder QR Pass Card with Rupeo Logo Emblem */}
                  <View
                    ref={qrPassCardRef}
                    collapsable={false}
                    style={styles.qrPassContainer}
                  >
                    {/* Top bar */}
                    <View style={styles.qrPassTopRedBar} />

                    {/* Pass Header */}
                    <View style={styles.qrPassHeader}>
                      <View style={styles.qrBrandRow}>
                        <View style={styles.qrLogoSquare}>
                          <Text style={styles.qrLogoSquareText}>₹</Text>
                        </View>
                        <Text style={styles.qrLogoTitle}>Rupeo</Text>
                        <View style={styles.qrPassPill}>
                          <Text style={styles.qrPassPillText}>REQUEST</Text>
                        </View>
                      </View>
                      <View style={styles.npciBadge}>
                        <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                        <Text style={styles.npciBadgeText}>NPCI Unified</Text>
                      </View>
                    </View>

                    {/* "Kitna Dena Hai" Amount Due Highlight Box */}
                    <View style={styles.qrPassDueContainer}>
                      <Text style={styles.qrPassDueLabel}>{t('kitna_dena_hai')}</Text>
                      <View style={styles.qrPassAmountBox}>
                        <Text style={styles.qrPassAmountSymbol}>{curr}</Text>
                        <Text style={styles.qrPassAmountValue}>{parsedRequestAmount.toFixed(2)}</Text>
                        <View style={styles.inrBadge}>
                          <Text style={styles.inrBadgeText}>INR</Text>
                        </View>
                      </View>
                      {requestFriend?.name ? (
                        <Text style={styles.qrPassFriendTag} numberOfLines={1}>
                          {lang === 'Hinglish' ? 'Kiske Liye: ' : lang === 'Hindi' ? 'भुगतानकर्ता: ' : 'From: '}
                          {requestFriend.name}
                        </Text>
                      ) : null}
                    </View>

                    {/* Payee Info & UPI ID */}
                    <View style={styles.qrPassPayeeRow}>
                      <Text style={styles.qrPassPayeeLabel}>
                        {lang === 'Hinglish' ? 'Pay To: ' : lang === 'Hindi' ? 'किसे देना है: ' : 'Pay To: '}
                        <Text style={styles.qrPassPayeeName}>
                          {user?.displayName?.trim() || 'Rupeo User'}
                        </Text>
                      </Text>
                    </View>

                    <View style={styles.vpaPillContainer}>
                      <Ionicons name="shield-checkmark" size={12} color="#0284C7" style={{ marginRight: 4 }} />
                      <Text style={styles.vpaPillText} numberOfLines={1}>
                        {myUpiId.trim()}
                      </Text>
                    </View>

                    {/* Viewfinder 4 Corner Brackets around QRCode */}
                    <View style={styles.qrViewfinderBox}>
                      <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
                      <View style={[styles.cornerBracket, styles.cornerTopRight]} />
                      <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
                      <View style={[styles.cornerBracket, styles.cornerBottomRight]} />

                      <View style={styles.qrInnerCodeWrapper}>
                        <QRCode
                          value={upiDeepLink}
                          size={175}
                          color="#0F172A"
                          backgroundColor="#FFFFFF"
                          quietZone={10}
                          ecl="Q"
                          logo={require('../../assets/images/rupeo-qr-emblem.png')}
                          logoSize={32}
                          logoBackgroundColor="#FFFFFF"
                          logoMargin={3}
                          logoBorderRadius={0}
                        />
                      </View>
                    </View>

                    {/* Direct Bank-to-bank Caption */}
                    <Text style={styles.scanCaption}>
                      Scan & Pay with any UPI App (GPay, PhonePe, Paytm, BHIM)
                    </Text>
                  </View>

                  {/* Single Request Payment Button (Sends QR Photo & Message together) */}
                  <TouchableOpacity
                    style={styles.singleRequestPaymentBtn}
                    onPress={handleRequestPaymentShare}
                    activeOpacity={0.85}
                    disabled={isSharingImage}
                  >
                    {isSharingImage ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.singleRequestPaymentBtnText}>
                      {isSharingImage ? t('qr_photo_sharing') : t('request_payment')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 5: ADD PHONE NUMBER PROMPT MODAL ================= */}
      <Modal
        visible={isAddPhoneModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddPhoneModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="call" size={20} color="#475569" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>{t('add_phone_modal_title')}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {requestFriend?.name ? `${requestFriend.name} ka mobile number` : t('add_phone_modal_desc')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddPhoneModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={[styles.formGroup, { marginTop: 4 }]}>
              <Text style={styles.formLabel}>{t('phone_optional')}</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={[styles.formInput, { flex: 1, marginLeft: 8 }]}
                  placeholder={t('phone_placeholder')}
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={friendPhoneInput}
                  onChangeText={setFriendPhoneInput}
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddPhoneModalOpen(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#25D366' }, isSavingPhone && { opacity: 0.7 }]}
                onPress={handleSavePhoneAndSend}
                disabled={isSavingPhone}
                activeOpacity={0.85}
              >
                {isSavingPhone ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalConfirmText}>{t('save_and_send')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 6: DELETE FRIEND CONFIRMATION MODAL ================= */}
      <Modal
        visible={isDeleteFriendModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingFriend) setIsDeleteFriendModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="trash" size={22} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>{t('delete_friend_title')}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {friendToDelete?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isDeletingFriend) setIsDeleteFriendModalOpen(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.deleteModalDesc}>
              {t('delete_friend_msg')}
            </Text>

            <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteFriendModalOpen(false)}
                disabled={isDeletingFriend}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: '#DC2626' },
                  isDeletingFriend && { opacity: 0.7 },
                ]}
                onPress={handleConfirmDeleteFriend}
                disabled={isDeletingFriend}
                activeOpacity={0.85}
              >
                {isDeletingFriend ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalConfirmText}>{t('delete') || 'Delete'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 7: DELETE ENTRY CONFIRMATION MODAL ================= */}
      <Modal
        visible={isDeleteEntryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingEntry) setIsDeleteEntryModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="trash" size={22} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>{t('delete_entry_title')}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {entryToDelete
                    ? `${entryToDelete.type === 'gave' ? t('you_gave') : t('you_got')} ${curr}${entryToDelete.amount.toLocaleString('en-IN')}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isDeletingEntry) setIsDeleteEntryModalOpen(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.deleteModalDesc}>
              {t('delete_entry_msg')}
            </Text>

            <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteEntryModalOpen(false)}
                disabled={isDeletingEntry}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: '#DC2626' },
                  isDeletingEntry && { opacity: 0.7 },
                ]}
                onPress={handleConfirmDeleteEntry}
                disabled={isDeletingEntry}
                activeOpacity={0.85}
              >
                {isDeletingEntry ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalConfirmText}>{t('delete') || 'Delete'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 8: SETTLE BALANCE CONFIRMATION MODAL ================= */}
      <Modal
        visible={isSettleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSettling) setIsSettleModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modal3dTickWrap}>
                <ThreeDDoubleTickIcon size={34} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>{t('settle_modal_title')}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {settleFriend?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isSettling) setIsSettleModalOpen(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {settleTargetEntry ? (
              <View
                style={[
                  styles.settleInfoCard,
                  { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
                ]}
              >
                <View style={styles.settleInfoTop}>
                  <Ionicons name="git-branch-outline" size={17} color="#15803D" style={{ marginRight: 6 }} />
                  <Text style={[styles.settleInfoStatusText, { color: '#15803D' }]}>
                    {settleTargetEntry.type === 'gave'
                      ? `Settling Loan: ${curr}${settleTargetEntry.amount.toLocaleString('en-IN')}`
                      : `Settling Borrowed: ${curr}${settleTargetEntry.amount.toLocaleString('en-IN')}`}
                  </Text>
                </View>
                <Text style={styles.settleInfoDesc}>
                  {lang === 'Hindi'
                    ? 'पूरा या आधा/आंशिक भुगतान दर्ज करें। यह इस लेन-देन के नीचे थ्रेड बन जाएगा।'
                    : lang === 'Hinglish'
                      ? 'Full ya half/partial payment enter karein. Ye is transaction ke niche thread ban jayega.'
                      : 'Record full or partial payment. It will link as a thread under this transaction.'}
                </Text>
              </View>
            ) : settleFriend ? (
              <View
                style={[
                  styles.settleInfoCard,
                  { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
                ]}
              >
                <View style={styles.settleInfoTop}>
                  <Ionicons
                    name={settleFriend.balance > 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={18}
                    color={settleFriend.balance > 0 ? '#15803D' : '#DC2626'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.settleInfoStatusText,
                      { color: settleFriend.balance > 0 ? '#15803D' : '#DC2626' },
                    ]}
                  >
                    {settleFriend.balance > 0
                      ? `${t('you_will_get')}: ${curr}${Math.abs(settleFriend.balance).toLocaleString('en-IN')}`
                      : `${t('you_will_pay')}: ${curr}${Math.abs(settleFriend.balance).toLocaleString('en-IN')}`}
                  </Text>
                </View>
                <Text style={styles.settleInfoDesc}>
                  {settleFriend.balance > 0
                    ? lang === 'Hindi'
                      ? `${settleFriend.name} से भुगतान प्राप्त हुआ। यह "आपने लिए" में जुड़ेगा, बाकी हिसाब ₹0 होगा और लेन-देन में आय दर्ज होगी।`
                      : lang === 'Hinglish'
                        ? `${settleFriend.name} se paise mil gaye. Ye "Maine Liye" me judega, pending hisaab ₹0 hoga aur Transactions me Income add hogi.`
                        : `Payment received from ${settleFriend.name}. This will be added to You Got, balance will be ₹0, and recorded as Income in Transactions.`
                    : lang === 'Hindi'
                      ? `${settleFriend.name} को भुगतान किया। यह "आपने दिए" में जुड़ेगा, बाकी हिसाब ₹0 होगा और लेन-देन में खर्च दर्ज होगा।`
                      : lang === 'Hinglish'
                        ? `${settleFriend.name} ko paise diye. Ye "Maine Diye" me judega, pending hisaab ₹0 hoga aur Transactions me Expense add hoga.`
                        : `Payment paid to ${settleFriend.name}. This will be added to You Gave, balance will be ₹0, and recorded as Expense in Transactions.`}
                </Text>
              </View>
            ) : null}

            {/* Quick Settle Amount Chips if target entry exists */}
            {settleTargetEntry && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.handleChip,
                    settleAmountInput === settleTargetEntry.amount.toString() && {
                      backgroundColor: '#0F172A',
                      borderColor: '#0F172A',
                    },
                  ]}
                  onPress={() => setSettleAmountInput(settleTargetEntry.amount.toString())}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.handleChipText,
                      settleAmountInput === settleTargetEntry.amount.toString() && { color: '#FFFFFF' },
                    ]}
                  >
                    Full (100%): {curr}{settleTargetEntry.amount.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.handleChip,
                    settleAmountInput === Math.round(settleTargetEntry.amount / 2).toString() && {
                      backgroundColor: '#0F172A',
                      borderColor: '#0F172A',
                    },
                  ]}
                  onPress={() => setSettleAmountInput(Math.round(settleTargetEntry.amount / 2).toString())}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.handleChipText,
                      settleAmountInput === Math.round(settleTargetEntry.amount / 2).toString() && { color: '#FFFFFF' },
                    ]}
                  >
                    Half (50%): {curr}{Math.round(settleTargetEntry.amount / 2).toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.formGroup, { marginTop: 14 }]}>
              <Text style={styles.formLabel}>{settleTargetEntry ? 'Settlement Amount' : t('amount')} ({curr})</Text>
              <View style={styles.amountInputWrap}>
                <Text style={styles.amountInputPrefix}>{curr}</Text>
                <TextInput
                  style={styles.amountInputField}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={settleAmountInput}
                  onChangeText={setSettleAmountInput}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('payment_mode')}</Text>
              <View style={styles.settleModeRow}>
                {(['Cash', 'UPI', 'Bank'] as const).map((mode) => {
                  const isSelected = settleMode === mode;
                  const iconName =
                    mode === 'Cash' ? 'cash-outline' : mode === 'UPI' ? 'flash-outline' : 'business-outline';
                  const modeLabel =
                    mode === 'Cash'
                      ? lang === 'Hindi'
                        ? 'नकद'
                        : 'Cash'
                      : mode === 'Bank'
                        ? lang === 'Hindi'
                          ? 'बैंक'
                          : 'Bank'
                        : 'UPI';
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.settleModeChip, isSelected && styles.settleModeChipActive]}
                      onPress={() => setSettleMode(mode)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={iconName}
                        size={15}
                        color={isSelected ? '#FFFFFF' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[styles.settleModeChipText, isSelected && styles.settleModeChipTextActive]}
                      >
                        {modeLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.modalButtonsRow, { marginTop: 18 }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsSettleModalOpen(false)}
                disabled={isSettling}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>
                  {lang === 'Hindi' ? 'रद्द करें' : 'Cancel'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  isSettling && { opacity: 0.7 },
                ]}
                onPress={handleConfirmSettle}
                disabled={isSettling}
                activeOpacity={0.85}
              >
                {isSettling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ThreeDDoubleTickIcon size={18} boxStyle={true} />
                    <Text style={[styles.modalConfirmText, { marginLeft: 6 }]}>{t('confirm_settle')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 9: ADD INTEREST MODAL ================= */}
      <Modal
        visible={isInterestModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingInterest) setIsInterestModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Ionicons name="trending-up" size={22} color="#B45309" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>
                  {lang === 'Hindi' ? 'ब्याज जोड़ें (Add Interest)' : 'Add Interest'}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {selectedFriendDetail?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isSavingInterest) setIsInterestModalOpen(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {/* Target Selector: Balance vs Single Entry */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.formLabel}>
                  {lang === 'Hindi' ? 'ब्याज किस पर लगाना है?' : 'Apply Interest On:'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[
                      styles.interestTargetChip,
                      interestTarget === 'balance' && styles.interestTargetChipActive,
                    ]}
                    onPress={() => setInterestTarget('balance')}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={14}
                      color={interestTarget === 'balance' ? '#FFFFFF' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.interestTargetChipText,
                        interestTarget === 'balance' && styles.interestTargetChipTextActive,
                      ]}
                    >
                      {lang === 'Hindi' ? 'कुल बकाया' : 'Total Balance'} ({curr}{Math.abs(selectedFriendDetail?.balance || 0).toLocaleString('en-IN')})
                    </Text>
                  </TouchableOpacity>

                  {interestTargetEntry && (
                    <TouchableOpacity
                      style={[
                        styles.interestTargetChip,
                        interestTarget === 'entry' && styles.interestTargetChipActive,
                      ]}
                      onPress={() => setInterestTarget('entry')}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="receipt-outline"
                        size={14}
                        color={interestTarget === 'entry' ? '#FFFFFF' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          styles.interestTargetChipText,
                          interestTarget === 'entry' && styles.interestTargetChipTextActive,
                        ]}
                      >
                        {lang === 'Hindi' ? 'यह लेन-देन' : 'This Payment'} ({curr}{interestTargetEntry.amount.toLocaleString('en-IN')})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Interest Period / Frequency Selector (Monthly vs Yearly vs One-time) */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.formLabel}>
                  {lang === 'Hindi' ? 'ब्याज अवधि (Interest Period):' : 'Interest Period:'}
                </Text>
                <View style={styles.interestModeRow}>
                  <TouchableOpacity
                    style={[styles.interestModeTab, interestPeriod === 'monthly' && styles.interestModeTabActive]}
                    onPress={() => {
                      setInterestPeriod('monthly');
                      setInterestRateInput('2');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.interestModeTabText, interestPeriod === 'monthly' && styles.interestModeTabTextActive]}>
                      📅 {lang === 'Hindi' ? 'मासिक (% / माह)' : 'Monthly (%)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.interestModeTab, interestPeriod === 'yearly' && styles.interestModeTabActive]}
                    onPress={() => {
                      setInterestPeriod('yearly');
                      setInterestRateInput('12');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.interestModeTabText, interestPeriod === 'yearly' && styles.interestModeTabTextActive]}>
                      🗓️ {lang === 'Hindi' ? 'वार्षिक (% / वर्ष)' : 'Yearly (%)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.interestModeTab, interestPeriod === 'one_time' && styles.interestModeTabActive]}
                    onPress={() => {
                      setInterestPeriod('one_time');
                      setInterestRateInput('50');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.interestModeTabText, interestPeriod === 'one_time' && styles.interestModeTabTextActive]}>
                      ⚡ {lang === 'Hindi' ? 'एकमुश्त (Flat)' : 'One-Time'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Start Date Selector: Jis din add kare us din se start */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.formLabel}>
                  {lang === 'Hindi' ? 'कब से ब्याज शुरू होगा? (Start Date):' : 'Interest Starts On:'}
                </Text>

                {/* Quick Date Chips */}
                <View style={styles.interestDateChipsRow}>
                  <TouchableOpacity
                    style={[
                      styles.interestDateChip,
                      interestStartDate === getLocalDateString(new Date()) && styles.interestDateChipActive,
                    ]}
                    onPress={() => setInterestStartDate(getLocalDateString(new Date()))}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="today-outline"
                      size={12}
                      color={interestStartDate === getLocalDateString(new Date()) ? '#B45309' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.interestDateChipText,
                        interestStartDate === getLocalDateString(new Date()) && styles.interestDateChipTextActive,
                      ]}
                    >
                      {lang === 'Hindi' ? 'आज से (Today)' : 'Today'}
                    </Text>
                  </TouchableOpacity>

                  {interestTargetEntry && (
                    <TouchableOpacity
                      style={[
                        styles.interestDateChip,
                        interestStartDate === interestTargetEntry.date && styles.interestDateChipActive,
                      ]}
                      onPress={() => setInterestStartDate(interestTargetEntry.date)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color={interestStartDate === interestTargetEntry.date ? '#B45309' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.interestDateChipText,
                          interestStartDate === interestTargetEntry.date && styles.interestDateChipTextActive,
                        ]}
                      >
                        {lang === 'Hindi' ? 'लेन-देन के दिन से' : 'Loan Date'} ({interestTargetEntry.date})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Date Input Field */}
                <View style={[styles.amountInputWrap, { paddingVertical: 2 }]}>
                  <Ionicons name="calendar" size={16} color="#B45309" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.amountInputField, { fontSize: 14.5, paddingVertical: 8 }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    value={interestStartDate}
                    onChangeText={setInterestStartDate}
                  />
                </View>
              </View>

              {/* Rate or Amount Input Box */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.formLabel}>
                  {interestPeriod === 'monthly'
                    ? (lang === 'Hindi' ? 'मासिक ब्याज दर (% प्रति माह)' : 'Monthly Interest Rate (%/month)')
                    : interestPeriod === 'yearly'
                      ? (lang === 'Hindi' ? 'वार्षिक ब्याज दर (% प्रति वर्ष)' : 'Annual Interest Rate (%/year)')
                      : (lang === 'Hindi' ? 'एकमुश्त ब्याज राशि (₹)' : 'One-Time Flat Amount (₹)')}
                </Text>
                <View style={styles.amountInputWrap}>
                  <Text style={styles.amountInputPrefix}>
                    {interestPeriod === 'one_time' ? curr : '%'}
                  </Text>
                  <TextInput
                    style={styles.amountInputField}
                    keyboardType="numeric"
                    placeholder={interestPeriod === 'one_time' ? 'e.g. 100' : 'e.g. 2'}
                    placeholderTextColor="#94A3B8"
                    value={interestRateInput}
                    onChangeText={(txt) => setInterestRateInput(txt.replace(/[^0-9.]/g, ''))}
                  />
                </View>

                {/* Quick Chips */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {interestPeriod === 'monthly'
                    ? ['1', '2', '3', '5', '10', '12'].map((pct) => (
                      <TouchableOpacity
                        key={pct}
                        style={[
                          styles.handleChip,
                          interestRateInput === pct && { backgroundColor: '#B45309', borderColor: '#B45309' },
                        ]}
                        onPress={() => setInterestRateInput(pct)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.handleChipText,
                            interestRateInput === pct && { color: '#FFFFFF' },
                          ]}
                        >
                          {pct}%/mo
                        </Text>
                      </TouchableOpacity>
                    ))
                    : interestPeriod === 'yearly'
                      ? ['6', '8', '10', '12', '18', '24'].map((pct) => (
                        <TouchableOpacity
                          key={pct}
                          style={[
                            styles.handleChip,
                            interestRateInput === pct && { backgroundColor: '#B45309', borderColor: '#B45309' },
                          ]}
                          onPress={() => setInterestRateInput(pct)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.handleChipText,
                              interestRateInput === pct && { color: '#FFFFFF' },
                            ]}
                          >
                            {pct}%/yr
                          </Text>
                        </TouchableOpacity>
                      ))
                      : ['50', '100', '200', '500', '1000'].map((amt) => (
                        <TouchableOpacity
                          key={amt}
                          style={[
                            styles.handleChip,
                            interestRateInput === amt && { backgroundColor: '#B45309', borderColor: '#B45309' },
                          ]}
                          onPress={() => setInterestRateInput(amt)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.handleChipText,
                              interestRateInput === amt && { color: '#FFFFFF' },
                            ]}
                          >
                            {curr}{amt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                </View>
              </View>

              {/* Calculation Basis (for recurring interest) */}
              {interestPeriod !== 'one_time' && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={styles.formLabel}>
                    {lang === 'Hindi' ? 'गणना का तरीका:' : 'Calculation Method:'}
                  </Text>
                  <View style={styles.interestCalcTypeRow}>
                    <TouchableOpacity
                      style={[
                        styles.interestCalcTypeTab,
                        interestCalcType === 'pro_rata' && styles.interestCalcTypeTabActive,
                      ]}
                      onPress={() => setInterestCalcType('pro_rata')}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="trending-up"
                        size={13}
                        color={interestCalcType === 'pro_rata' ? '#FFFFFF' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.interestCalcTypeTabText,
                          interestCalcType === 'pro_rata' && styles.interestCalcTypeTabTextActive,
                        ]}
                      >
                        {lang === 'Hindi' ? 'दैनिक (समय के साथ रोज़ बढ़ेगा)' : 'Daily Accrual (Continuous)'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.interestCalcTypeTab,
                        interestCalcType === 'cycle' && styles.interestCalcTypeTabActive,
                      ]}
                      onPress={() => setInterestCalcType('cycle')}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="repeat"
                        size={13}
                        color={interestCalcType === 'cycle' ? '#FFFFFF' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.interestCalcTypeTabText,
                          interestCalcType === 'cycle' && styles.interestCalcTypeTabTextActive,
                        ]}
                      >
                        {lang === 'Hindi' ? 'पूरा चक्र (शुरू में ही जुड़ेगा)' : 'Full Cycle Upfront'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Live Calculation Preview Box */}
              <View style={styles.interestCalcBox}>
                <View style={styles.interestCalcRow}>
                  <Text style={styles.interestCalcLabel}>
                    {interestTarget === 'entry' ? 'Base Principal:' : 'Current Balance:'}
                  </Text>
                  <Text style={styles.interestCalcVal}>
                    {curr}{baseForInterest.toLocaleString('en-IN')}
                  </Text>
                </View>

                {interestPeriod !== 'one_time' && (
                  <View style={styles.interestCalcRow}>
                    <Text style={styles.interestCalcLabel}>Rate & Run Rate:</Text>
                    <Text style={[styles.interestCalcVal, { color: '#B45309', fontWeight: '700' }]}>
                      {interestRateInput}% {interestPeriod === 'monthly' ? '/ month' : '/ year'} (≈ {curr}{interestAccrualCalc.dailyRate}/day)
                    </Text>
                  </View>
                )}

                {interestPeriod !== 'one_time' && (
                  <View style={styles.interestCalcRow}>
                    <Text style={styles.interestCalcLabel}>Active Since:</Text>
                    <Text style={[styles.interestCalcVal, { fontWeight: '600' }]}>
                      {interestStartDate} ({interestAccrualCalc.daysElapsed} days)
                    </Text>
                  </View>
                )}

                <View style={styles.interestCalcRow}>
                  <Text style={styles.interestCalcLabel}>Accrued Interest So Far:</Text>
                  <Text style={[styles.interestCalcVal, { color: '#B45309', fontWeight: '800' }]}>
                    +{curr}{calculatedInterestAmt.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={[styles.interestCalcRow, { paddingTop: 6, marginTop: 6, borderTopWidth: 1, borderTopColor: '#FDE68A' }]}>
                  <Text style={[styles.interestCalcLabel, { fontWeight: '800', color: '#0F172A' }]}>
                    {lang === 'Hindi' ? 'कुल बकाया राशि:' : 'Total Outstanding:'}
                  </Text>
                  <Text style={[styles.interestCalcVal, { fontWeight: '900', fontSize: 16, color: '#0F172A' }]}>
                    {curr}{(baseForInterest + calculatedInterestAmt).toLocaleString('en-IN')}
                  </Text>
                </View>

                {interestPeriod !== 'one_time' && (
                  <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#FDE68A', flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 0, backgroundColor: '#16A34A', marginRight: 6 }} />
                    <Text style={{ fontSize: 10.5, color: '#92400E', fontWeight: '600', flex: 1 }}>
                      {lang === 'Hindi'
                        ? '🟢 यह ब्याज चुनी गई तारीख से अपने-आप हर दिन/महीने राशि में जुड़ता रहेगा।'
                        : '🟢 This interest automatically accrues and adds to the balance continuously.'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Optional Note Field */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.formLabel}>
                  {lang === 'Hindi' ? 'कारण / नोट (वैकल्पिक)' : 'Note / Reason (Optional)'}
                </Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder={
                    interestPeriod === 'monthly'
                      ? `Monthly vyaj (${interestRateInput}%/mo)`
                      : interestPeriod === 'yearly'
                        ? `Annual interest (${interestRateInput}%/yr)`
                        : 'Late payment fee'
                  }
                  placeholderTextColor="#94A3B8"
                  value={interestNoteInput}
                  onChangeText={setInterestNoteInput}
                />
              </View>
            </ScrollView>

            {/* Modal Action Buttons */}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsInterestModalOpen(false)}
                disabled={isSavingInterest}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>
                  {lang === 'Hindi' ? 'रद्द करें' : 'Cancel'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  { backgroundColor: '#B45309' },
                  isSavingInterest && { opacity: 0.7 },
                ]}
                onPress={handleConfirmInterest}
                disabled={isSavingInterest || (!parseFloat(interestRateInput) || parseFloat(interestRateInput) <= 0)}
                activeOpacity={0.85}
              >
                {isSavingInterest ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trending-up" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalConfirmText} numberOfLines={1}>
                      {interestPeriod === 'one_time'
                        ? `Add ${curr}${calculatedInterestAmt.toLocaleString('en-IN')}`
                        : `Activate ${interestRateInput}% ${interestPeriod === 'monthly' ? '/mo' : '/yr'}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 10: INVOICE & STATEMENT MODAL ================= */}
      <Modal
        visible={isInvoiceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isGeneratingInvoicePdf && !isSharingInvoicePhoto) {
            setIsInvoiceModalOpen(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '92%', width: '92%', maxWidth: 440 }]}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Ionicons name="receipt" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>
                  {lang === 'Hindi' ? 'चालान व रसीद (Invoice)' : 'Invoice & Bill'}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {selectedFriendDetail?.name} • Rupeo Khata
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isGeneratingInvoicePdf && !isSharingInvoicePhoto) {
                    setIsInvoiceModalOpen(false);
                  }
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Mode Switcher Tabs */}
            <View style={styles.invoiceTabRow}>
              <TouchableOpacity
                style={[styles.invoiceTab, invoiceMode === 'single' && styles.invoiceTabActive]}
                onPress={() => setInvoiceMode('single')}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="document-text-outline"
                  size={13}
                  color={invoiceMode === 'single' ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.invoiceTabText, invoiceMode === 'single' && styles.invoiceTabTextActive]}>
                  {lang === 'Hindi' ? 'चुना हुआ बिल' : 'This Payment'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.invoiceTab, invoiceMode === 'all' && styles.invoiceTabActive]}
                onPress={() => setInvoiceMode('all')}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="albums-outline"
                  size={13}
                  color={invoiceMode === 'all' ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.invoiceTabText, invoiceMode === 'all' && styles.invoiceTabTextActive]}>
                  {lang === 'Hindi' ? 'पूरा खाता (All)' : 'Complete Khata'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable Live Receipt Preview Box */}
            <ScrollView
              style={{ maxHeight: 380, marginVertical: 10 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              <View ref={invoicePreviewRef} collapsable={false} style={styles.invoiceSlipBox}>
                {/* Brand Header */}
                <View style={styles.invoiceSlipHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.invoiceSlipLogoBadge}>
                      <Text style={styles.invoiceSlipLogoText}>₹</Text>
                    </View>
                    <View>
                      <Text style={styles.invoiceSlipBrandTitle}>RUPEO KHATA</Text>
                      <Text style={styles.invoiceSlipBrandSub}>OFFICIAL FINANCIAL STATEMENT</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.invoiceSlipRefBadge}>
                      <Text style={styles.invoiceSlipRefText}>
                        #{Date.now().toString(36).toUpperCase().slice(-5)}
                      </Text>
                    </View>
                    <Text style={styles.invoiceSlipDateText}>
                      {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                </View>

                {/* Parties Info Cards with Avatars */}
                <View style={styles.invoiceSlipPartiesGrid}>
                  <View style={styles.invoiceSlipPartyCard}>
                    <Text style={styles.invoiceSlipPartyLabel}>ISSUED BY (LENDER)</Text>
                    <View style={styles.invoiceSlipPartyContent}>
                      <View style={[styles.invoiceSlipAvatar, { backgroundColor: '#0F172A' }]}>
                        <Text style={styles.invoiceSlipAvatarText}>{getInitials(user?.displayName || 'Rupeo')}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceSlipPartyVal} numberOfLines={1}>{user?.displayName || 'Rupeo User'}</Text>
                        {myUpiId ? (
                          <Text style={[styles.invoiceSlipPartySub, { color: '#059669', fontWeight: '700' }]} numberOfLines={1}>
                            ⚡ {myUpiId}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={styles.invoiceSlipPartyCard}>
                    <Text style={styles.invoiceSlipPartyLabel}>PARTY (BORROWER)</Text>
                    <View style={styles.invoiceSlipPartyContent}>
                      <View style={[styles.invoiceSlipAvatar, { backgroundColor: '#0284C7' }]}>
                        <Text style={styles.invoiceSlipAvatarText}>{getInitials(selectedFriendDetail?.name || 'Party')}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceSlipPartyVal} numberOfLines={1}>{selectedFriendDetail?.name}</Text>
                        {selectedFriendDetail?.phone ? (
                          <Text style={styles.invoiceSlipPartySub} numberOfLines={1}>{selectedFriendDetail.phone}</Text>
                        ) : (
                          <Text style={[styles.invoiceSlipPartySub, { color: '#94A3B8' }]} numberOfLines={1}>Contact not set</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Content Section: Single Entry vs All Entries */}
                {invoiceMode === 'single' ? (
                  (() => {
                    const activeGroup = invoiceSingleGroup || groupedLedgerEntries[0];
                    if (!activeGroup) {
                      return (
                        <Text style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>
                          No transaction selected.
                        </Text>
                      );
                    }
                    const { parent, settlementChildren, interestChildren, totalInterest, totalSettled, remaining, isFullySettled, isPartiallySettled } = activeGroup;
                    const isGave = parent.type === 'gave';

                    return (
                      <View style={{ marginTop: 8 }}>
                        {/* Principal Row */}
                        <View style={styles.invoiceSlipRow}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={[styles.invoiceSlipTag, { backgroundColor: '#E2E8F0' }]}>
                                <Text style={[styles.invoiceSlipTagText, { color: '#334155' }]}>PRINCIPAL</Text>
                              </View>
                              <Text style={styles.invoiceSlipItemName} numberOfLines={1}>
                                {isGave ? 'Money Lent (दिया)' : 'Money Borrowed (लिया)'}
                              </Text>
                            </View>
                            <Text style={styles.invoiceSlipItemSub}>
                              Date: {parent.date} {parent.note ? `• ${parent.note}` : ''}
                            </Text>
                          </View>
                          <Text style={styles.invoiceSlipItemAmt}>
                            {curr}{parent.amount.toLocaleString('en-IN')}
                          </Text>
                        </View>

                        {/* Interest Accruals */}
                        {interestChildren.map((ic) => {
                          const dynAmt = getDynamicEntryAmount(ic);
                          const rateLabel = ic.interestPercent
                            ? `${ic.interestPercent}%${ic.interestPeriod === 'monthly' ? '/mo' : ic.interestPeriod === 'yearly' ? '/yr' : ''}`
                            : 'Interest';
                          return (
                            <View key={ic.id} style={[styles.invoiceSlipRow, { backgroundColor: '#FFFBEB', paddingHorizontal: 8, borderRadius: 0, marginVertical: 3 }]}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <View style={[styles.invoiceSlipTag, { backgroundColor: '#FEF3C7' }]}>
                                    <Text style={[styles.invoiceSlipTagText, { color: '#B45309' }]}>INTEREST</Text>
                                  </View>
                                  <Text style={[styles.invoiceSlipItemName, { color: '#B45309' }]} numberOfLines={1}>
                                    Accrued Interest ({rateLabel})
                                  </Text>
                                </View>
                                <Text style={[styles.invoiceSlipItemSub, { color: '#92400E' }]}>
                                  {ic.interestStartDate ? `Active since ${ic.interestStartDate}` : ic.date}
                                </Text>
                              </View>
                              <Text style={[styles.invoiceSlipItemAmt, { color: '#D97706' }]}>
                                +{curr}{dynAmt.toLocaleString('en-IN')}
                              </Text>
                            </View>
                          );
                        })}

                        {/* Settlements Paid */}
                        {settlementChildren.map((sc) => (
                          <View key={sc.id} style={[styles.invoiceSlipRow, { backgroundColor: '#F0FDF4', paddingHorizontal: 8, borderRadius: 0, marginVertical: 3 }]}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={[styles.invoiceSlipTag, { backgroundColor: '#DCFCE7' }]}>
                                  <Text style={[styles.invoiceSlipTagText, { color: '#15803D' }]}>PAYMENT</Text>
                                </View>
                                <Text style={[styles.invoiceSlipItemName, { color: '#15803D' }]} numberOfLines={1}>
                                  Payment Received ({sc.paymentMode || 'Cash'})
                                </Text>
                              </View>
                              <Text style={[styles.invoiceSlipItemSub, { color: '#166534' }]}>
                                {sc.date} {sc.note ? `• ${sc.note}` : ''}
                              </Text>
                            </View>
                            <Text style={[styles.invoiceSlipItemAmt, { color: '#15803D' }]}>
                              -{curr}{sc.amount.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        ))}

                        {/* Total Highlight Banner */}
                        <View style={styles.invoiceSlipHighlight}>
                          <View>
                            <Text style={styles.invoiceSlipHighlightLabel}>NET REMAINING BALANCE DUE</Text>
                            <Text style={styles.invoiceSlipHighlightSub}>
                              {isFullySettled ? '✓ Fully Cleared & Settled' : isPartiallySettled ? `₹${totalSettled.toLocaleString('en-IN')} paid of ₹${(parent.amount + totalInterest).toLocaleString('en-IN')}` : 'Active Unsettled Loan'}
                            </Text>
                          </View>
                          <Text style={[styles.invoiceSlipHighlightAmt, isFullySettled ? { color: '#4ADE80' } : null]}>
                            {curr}{remaining.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  /* ALL TRANSACTIONS STATEMENT */
                  (() => {
                    let totalGiven = 0;
                    let totalGot = 0;
                    let totalInterestAll = 0;
                    let totalSettledAll = 0;

                    groupedLedgerEntries.forEach((g) => {
                      if (g.parent.type === 'gave') totalGiven += g.parent.amount;
                      else totalGot += g.parent.amount;
                      totalInterestAll += g.totalInterest;
                      totalSettledAll += g.totalSettled;
                    });

                    const bal = selectedFriendDetail?.balance || 0;
                    const isPositive = bal > 0;

                    return (
                      <View style={{ marginTop: 8 }}>
                        {/* 4 Summary Stats */}
                        <View style={styles.invoiceSlipGrid}>
                          <View style={styles.invoiceSlipGridItem}>
                            <Text style={styles.invoiceSlipGridLabel}>LENT (दिया)</Text>
                            <Text style={[styles.invoiceSlipGridVal, { color: '#15803D' }]}>
                              {curr}{totalGiven.toLocaleString('en-IN')}
                            </Text>
                          </View>
                          <View style={styles.invoiceSlipGridItem}>
                            <Text style={styles.invoiceSlipGridLabel}>TAKEN (लिया)</Text>
                            <Text style={[styles.invoiceSlipGridVal, { color: '#DC2626' }]}>
                              {curr}{totalGot.toLocaleString('en-IN')}
                            </Text>
                          </View>
                          <View style={styles.invoiceSlipGridItem}>
                            <Text style={styles.invoiceSlipGridLabel}>INTEREST</Text>
                            <Text style={[styles.invoiceSlipGridVal, { color: '#D97706' }]}>
                              +{curr}{totalInterestAll.toLocaleString('en-IN')}
                            </Text>
                          </View>
                          <View style={styles.invoiceSlipGridItem}>
                            <Text style={styles.invoiceSlipGridLabel}>SETTLED</Text>
                            <Text style={[styles.invoiceSlipGridVal, { color: '#2563EB' }]}>
                              -{curr}{totalSettledAll.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>

                        {/* Net Outstanding Balance Banner */}
                        <View style={[styles.invoiceSlipHighlight, { marginTop: 10 }]}>
                          <View>
                            <Text style={styles.invoiceSlipHighlightLabel}>
                              {isPositive ? 'YOU WILL GET (लेना बाकी)' : bal < 0 ? 'YOU WILL PAY (देना बाकी)' : 'ALL CLEARED & BALANCED'}
                            </Text>
                            <Text style={styles.invoiceSlipHighlightSub}>
                              Across {groupedLedgerEntries.length} total entries
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.invoiceSlipHighlightAmt,
                              { color: isPositive ? '#38BDF8' : bal < 0 ? '#F87171' : '#94A3B8' },
                            ]}
                          >
                            {curr}{Math.abs(bal).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                    );
                  })()
                )}

                {/* Instant Repayment UPI Strip if configured */}
                {myUpiId ? (
                  <View style={styles.invoiceSlipUpiStrip}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 13, marginRight: 4 }}>📲</Text>
                      <Text style={styles.invoiceSlipUpiLabel}>UPI: </Text>
                      <Text style={styles.invoiceSlipUpiId} numberOfLines={1}>{myUpiId}</Text>
                    </View>
                    <Text style={styles.invoiceSlipUpiApps}>GPay • PhonePe • Paytm</Text>
                  </View>
                ) : null}

                {/* Footer notes */}
                <View style={styles.invoiceSlipFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 2 }}>
                    <Ionicons name="shield-checkmark" size={13} color="#0284C7" />
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0369A1', letterSpacing: 0.5 }}>
                      RUPEO KHATA • VERIFIED LEDGER • TAMPER-PROOF
                    </Text>
                  </View>
                  <Text style={styles.invoiceSlipFootText}>
                    Certified Digital Ledger Record • IT Act Compliant
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons: 2-step flow */}
            {!generatedInvoiceUri ? (
              /* Step 1: Exactly 2 buttons - PDF & Photo */
              <View style={styles.invoiceTwoBtnRow}>
                {/* PDF Button */}
                <TouchableOpacity
                  style={[styles.invoiceFormatBtn, styles.invoiceFormatBtnPdf]}
                  onPress={handleGenerateInvoicePDF}
                  disabled={isGeneratingInvoicePdf || isSharingInvoicePhoto}
                  activeOpacity={0.85}
                >
                  {isGeneratingInvoicePdf ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <View>
                        <Text style={styles.invoiceFormatBtnTitle}>PDF</Text>
                        <Text style={styles.invoiceFormatBtnSub}>Official bill</Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>

                {/* Photo Button */}
                <TouchableOpacity
                  style={[styles.invoiceFormatBtn, styles.invoiceFormatBtnPhoto]}
                  onPress={handleGenerateInvoicePhoto}
                  disabled={isSharingInvoicePhoto || isGeneratingInvoicePdf}
                  activeOpacity={0.85}
                >
                  {isSharingInvoicePhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="image" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <View>
                        <Text style={styles.invoiceFormatBtnTitle}>Photo</Text>
                        <Text style={styles.invoiceFormatBtnSub}>Slip image</Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* Step 2: Exactly 2 buttons - Download & Share */
              <View style={{ gap: 8, marginTop: 4 }}>
                {/* Status Bar showing what was generated with Change button */}
                <View style={styles.invoiceReadyBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <View style={styles.invoiceReadyDot}>
                      <Ionicons
                        name={generatedInvoiceType === 'pdf' ? 'document-text' : 'image'}
                        size={13}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.invoiceReadyText}>
                      {generatedInvoiceType === 'pdf' ? 'PDF Generated' : 'Photo Captured'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setGeneratedInvoiceUri(null);
                      setGeneratedInvoiceType(null);
                    }}
                    style={styles.invoiceChangeFormatBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="refresh-outline" size={13} color="#64748B" />
                    <Text style={styles.invoiceChangeFormatText}>Change</Text>
                  </TouchableOpacity>
                </View>

                {/* Download and Share Buttons */}
                <View style={styles.invoiceTwoBtnRow}>
                  {/* Download Button */}
                  <TouchableOpacity
                    style={[styles.invoiceActionBtn, styles.invoiceDownloadBtn]}
                    onPress={handleDownloadInvoice}
                    disabled={isDownloadingInvoice}
                    activeOpacity={0.85}
                  >
                    {isDownloadingInvoice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.invoiceActionBtnText}>Download</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Share Button */}
                  <TouchableOpacity
                    style={[styles.invoiceActionBtn, styles.invoiceShareBtn]}
                    onPress={handleShareInvoice}
                    disabled={isSharingInvoice}
                    activeOpacity={0.85}
                  >
                    {isSharingInvoice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="share-social-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.invoiceActionBtnText}>Share</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Direct WhatsApp Share to Friend */}
                <TouchableOpacity
                  style={styles.invoiceWhatsAppDirectBtn}
                  onPress={handleShareInvoiceWhatsApp}
                  disabled={isSharingInvoicePhoto}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.invoiceWhatsAppDirectBtnText}>Send to Friend on WhatsApp</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topNavTitleWrap: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  topNavTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topNavTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  topNavSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  addFriendHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  addFriendHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  netKhataCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1F0E0',
    position: 'relative',
  },
  netKhataGradient: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  netKhataTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  netKhataDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginTop: 12,
    marginBottom: 8,
  },
  netKhataToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  netKhataToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
    gap: 8,
  },
  netKhataToggleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netKhataToggleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  netKhataToggleSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  netKhataLeft: {
    flex: 1,
    marginRight: 12,
  },
  netKhataBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  netKhataBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  netKhataAmount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  netKhataSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  netKhataIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  statCardReceive: {
    backgroundColor: '#F4FBF7',
    borderColor: '#C6F0D6',
  },
  statCardPay: {
    backgroundColor: '#FEF4F4',
    borderColor: '#FCD8D8',
  },
  statCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCardLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  statAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statCurrency: {
    fontSize: 13,
    fontWeight: '800',
  },
  statAmount: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  statSubText: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  dashboardToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  dashboardToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  dashboardToggleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dashboardToggleTextCol: {
    flex: 1,
  },
  dashboardToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  dashboardToggleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  entrySyncToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  entrySyncToggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  entrySyncToggleSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillActiveGreen: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillActiveRed: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterPillTextActiveGreen: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterPillTextActiveRed: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterCountBadge: {
    marginLeft: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 0,
  },
  filterCountBadgeActive: {
    backgroundColor: '#334155',
  },
  filterCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
  },
  filterCountTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 0,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  emptyAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendsList: {
    gap: 12,
  },
  friendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  friendCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginRight: 12,
  },
  avatarCircleGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  avatarCircleRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  avatarCircleNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
  },
  friendInfoColumn: {
    flex: 1,
    minWidth: 0,
  },
  friendNameText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  noPhoneText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  },
  friendBalanceWrap: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  friendBalanceAmount: {
    fontSize: 15.5,
    fontWeight: '900',
    marginBottom: 3,
  },
  friendBalanceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  badgeGreen: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  badgeRed: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  badgeNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  friendBalanceBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  friendCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
    paddingTop: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexShrink: 1,
  },
  cardActionBtnHighlight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  cardActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  cardDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDetailsChevron: {
    marginLeft: 'auto',
  },

  // Modern Add Friend Modal Styles
  modernAddFriendCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modernAddFriendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modernHeaderIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  modernAddFriendTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modernAddFriendSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  modernCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Photo Uploader Section
  modernPhotoSection: {
    alignItems: 'center',
    marginBottom: 14,
  },
  modernPhotoAvatarTouch: {
    width: 76,
    height: 76,
    borderRadius: 38,
    position: 'relative',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modernPhotoAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  modernPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  modernPhotoRemoveText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  // Inputs
  modernInputGroup: {
    marginBottom: 12,
  },
  modernInputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  modernInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  modernTextInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 46,
  },
  modernTextInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 0,
  },
  modernPhoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    height: 46,
    paddingRight: 4,
    overflow: 'hidden',
  },
  modernCountryPill: {
    backgroundColor: '#F1F5F9',
    height: '100%',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  modernCountryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  modernPhoneTextInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  addContactPlusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 2,
  },
  // Modal Action Buttons
  modernModalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modernCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modernCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  modernSaveBtn: {
    flex: 1.4,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modernSaveGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernSaveText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  // Contact Browser Sheet Styles
  contactBrowserBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  contactBrowserSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  contactBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactBrowserTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  contactBrowserSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  contactSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  contactSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '500',
  },
  contactLoadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  contactLoadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    fontWeight: '600',
  },
  contactEmptyWrap: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  contactEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
  },
  contactEmptySub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  contactListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  contactListAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  contactListInitials: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  contactListInitialsText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  contactListName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactListPhone: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  contactSelectBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  contactSelectText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  modalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  deleteModalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 6,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 13.5,
    color: '#0F172A',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countryCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  photoUploadContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  photoAvatarTouch: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAvatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    resizeMode: 'cover',
  },
  photoAvatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  photoPickText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  photoRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 0,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Entry Modal Specifics
  entryTypeToggleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  entryTypeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  entryTypeToggleGaveActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#15803D',
  },
  entryTypeToggleGotActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  entryTypeToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  entryTypeToggleTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  typeSubExplanation: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 14,
    textAlign: 'center',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
  },
  amountInputPrefix: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
  },
  amountInputField: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 9,
  },

  // Ledger Detail View
  ledgerSafeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  ledgerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ledgerHeaderTitleCol: {
    flex: 1,
    marginLeft: 12,
  },
  ledgerHeaderTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  ledgerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ledgerHeaderSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  ledgerAvatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginLeft: 10,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: 'cover',
  },
  ledgerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerAvatarInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
  },
  friendCardPhotoImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    resizeMode: 'cover',
  },
  ledgerTopBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editFriendBtn: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteFriendBtn: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // =========================================================================
  // CLEAN SIMPLE KHATABOOK-STYLE HERO & ENTRIES
  // =========================================================================
  simpleHeroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  simpleHeroCardGreen: {
    backgroundColor: '#F2FBF6',
    borderColor: '#C6F0D6',
  },
  simpleHeroCardRed: {
    backgroundColor: '#FEF4F4',
    borderColor: '#FCD8D8',
  },
  simpleHeroCardNeutral: {
    backgroundColor: '#F3FAF5',
    borderColor: '#D1F0E0',
  },
  heroOrganicWaveOuter: {
    position: 'absolute',
    right: -30,
    bottom: -45,
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  heroOrganicWaveOuterGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  heroOrganicWaveOuterRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
  },
  heroOrganicWaveOuterNeutral: {
    backgroundColor: 'rgba(16, 185, 129, 0.13)',
  },
  heroOrganicWaveInner: {
    position: 'absolute',
    right: -10,
    bottom: -25,
    width: 105,
    height: 105,
    borderRadius: 55,
  },
  heroOrganicWaveInnerGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  heroOrganicWaveInnerRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  heroOrganicWaveInnerNeutral: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
  },
  simpleHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  simpleHeroLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  simpleHeroAmount: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 2,
    marginBottom: 4,
  },
  simpleHeroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  simpleHeroIconBadgeGreen: {
    backgroundColor: '#16A34A',
  },
  simpleHeroIconBadgeRed: {
    backgroundColor: '#DC2626',
  },
  simpleHeroIconBadgeNeutral: {
    backgroundColor: '#10B981',
  },
  simpleHeroSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 18,
  },
  simpleHeroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  simpleHeroBtnWa: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#22C55E',
  },
  simpleHeroBtnWaText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  simpleHeroBtnSettle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    borderRadius: 10,
  },
  simpleHeroBtnSettleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  simpleHeroBtnInterest: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  simpleHeroBtnInterestText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },

  // Section Header
  simpleSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  simpleSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  simpleSectionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // Entry Card
  simpleEntryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  simpleEntryMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  simpleEntryType: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  simpleEntryNote: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 2,
  },
  simpleEntryDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },
  simpleEntryAmount: {
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  simpleAmountStruck: {
    textDecorationLine: 'line-through',
    opacity: 0.4,
  },
  simpleBadgeSettled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  simpleBadgeSettledText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  simpleBadgePartial: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  simpleBadgePartialText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  simpleBadgePending: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  simpleBadgePendingText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  simpleEntryTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
  },
  typePillGave: {
    backgroundColor: '#DCFCE7',
  },
  typePillGot: {
    backgroundColor: '#FEE2E2',
  },
  simpleEntryTypeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  simpleRemainingZeroText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  simpleRemainingDueText: {
    fontSize: 13.5,
    color: '#D97706',
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // =========================================================================
  // SETTLEMENT TIMELINE THREAD & DROPDOWN STYLES
  // =========================================================================
  threadDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  threadDropdownBtnOpen: {
    backgroundColor: '#F1F5F9',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: '#CBD5E1',
  },
  threadDropdownBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  threadDropdownIconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  threadDropdownIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modal3dTickWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSettled: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  iconCirclePartial: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  threadDropdownBtnTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  threadDropdownBtnSubtitle: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  threadDropdownBtnRight: {
    paddingLeft: 4,
  },
  threadDropdownContent: {
    backgroundColor: '#F8FAFC',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  threadRailLine: {
    position: 'absolute',
    left: 17,
    top: 14,
    bottom: 22,
    width: 2,
    backgroundColor: '#CBD5E1',
    zIndex: 0,
  },
  threadItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    position: 'relative',
    zIndex: 1,
  },
  threadNodeDot: {
    width: 16,
    height: 16,
    borderRadius: 0,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#F8FAFC',
    marginTop: 3,
  },
  threadNodeDotReceived: {
    backgroundColor: '#10B981',
  },
  threadNodeDotPaid: {
    backgroundColor: '#0284C7',
  },
  threadNodeDotInterest: {
    backgroundColor: '#F59E0B',
  },
  threadNodeDotDone: {
    backgroundColor: '#059669',
  },
  threadNodeDotPending: {
    backgroundColor: '#F59E0B',
  },
  threadItemCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  threadItemCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  threadItemActionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  threadModeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  threadModeBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#475569',
  },
  threadItemAmount: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  threadItemCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  threadItemDate: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  threadItemNote: {
    fontSize: 9.5,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 1,
  },
  threadDeleteBtn: {
    padding: 3,
  },
  threadSummaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 0,
    borderWidth: 1,
  },
  threadSummarySettled: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  threadSummaryPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  threadSummaryLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  threadSummaryAmount: {
    fontSize: 12,
    fontWeight: '900',
  },

  // Entry Card Footer
  simpleEntryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  simpleEntrySettleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 0,
  },
  simpleEntrySettleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  simpleEntryInterestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 0,
    gap: 3,
  },
  simpleEntryInterestBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  simpleEntryDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    gap: 4,
  },
  simpleEntryDeleteBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // Simple Bottom Bar (Fixed at bottom)
  simpleBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  simpleBottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 0,
    borderWidth: 1.5,
  },
  simpleBottomBtnGave: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  simpleBottomBtnGot: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  simpleBottomBtnTextGave: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  simpleBottomBtnTextGot: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },

  // QR Request Modal
  upiFormatHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  generateDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 0,
    paddingVertical: 12,
    marginTop: 10,
  },
  generateDoneBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  editQrDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editQrDetailsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  qrPassContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 14,
  },
  qrPassTopRedBar: {
    width: '100%',
    height: 3,
    backgroundColor: '#0F172A',
  },
  qrPassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  qrBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qrLogoSquare: {
    width: 22,
    height: 22,
    borderRadius: 0,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogoSquareText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFD740',
  },
  qrLogoTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrPassPill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 0,
  },
  qrPassPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFD740',
  },
  npciBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  npciBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
  },
  qrPassAmountBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 4,
  },
  qrPassAmountSymbol: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 2,
  },
  qrPassAmountValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  inrBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 0,
    marginLeft: 6,
  },
  inrBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  qrPassDueContainer: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    width: '90%',
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrPassDueLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qrPassFriendTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  qrPassPayeeRow: {
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  qrPassPayeeLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
  },
  qrPassPayeeName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  vpaPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 0,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '85%',
  },
  vpaPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  qrViewfinderBox: {
    position: 'relative',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBracket: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#0F172A',
  },
  cornerTopLeft: {
    top: 2,
    left: 2,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  cornerTopRight: {
    top: 2,
    right: 2,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  cornerBottomLeft: {
    bottom: 2,
    left: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  cornerBottomRight: {
    bottom: 2,
    right: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  qrInnerCodeWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCaption: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  singleRequestPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 0,
    marginTop: 14,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  singleRequestPaymentBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  handleChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingVertical: 2,
  },
  handleChip: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  handleChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  whatsappShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 0,
    marginTop: 0,
  },
  whatsappShareBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardActionBtnSettle: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  cardActionBtnSettleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  settleInfoCard: {
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  settleInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  settleInfoStatusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  settleInfoDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },

  settleModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  settleModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 0,
    paddingVertical: 8,
  },
  settleModeChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  settleModeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  settleModeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  historySettleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  historySettleBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  historySettleBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  historySettleBannerSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  historySettleBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 0,
  },
  historySettleBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickSettleInModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 0,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  quickSettleInModalText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },

  // Interest Modal Styles
  interestTargetChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 0,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  interestTargetChipActive: {
    backgroundColor: '#B45309',
    borderColor: '#B45309',
  },
  interestTargetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  interestTargetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  interestModeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 0,
    padding: 3,
    gap: 4,
  },
  interestModeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 0,
  },
  interestModeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  interestModeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  interestModeTabTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  interestCalcBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  interestCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  interestCalcLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350F',
  },
  interestCalcVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350F',
  },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 13.5,
    color: '#0F172A',
  },
  interestDateChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  interestDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 0,
  },
  interestDateChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  interestDateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  interestDateChipTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  interestCalcTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  interestCalcTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 0,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  interestCalcTypeTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  interestCalcTypeTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  interestCalcTypeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  invoiceTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 0,
  },
  invoiceTopBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  simpleHeroBtnInvoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  simpleHeroBtnInvoiceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  simpleEntryInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    backgroundColor: '#EFF6FF',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  simpleEntryInvoiceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  invoiceTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  invoiceTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invoiceTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  invoiceTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  invoiceTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  invoiceSlipBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  invoiceSlipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#0F172A',
    paddingBottom: 8,
    marginBottom: 8,
  },
  invoiceSlipLogoBadge: {
    width: 30,
    height: 30,
    borderRadius: 0,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  invoiceSlipLogoText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#38BDF8',
  },
  invoiceSlipBrandTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  invoiceSlipBrandSub: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  invoiceSlipRefBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 0,
    marginBottom: 2,
  },
  invoiceSlipRefText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  invoiceSlipDateText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  invoiceSlipPartiesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  invoiceSlipPartyCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invoiceSlipPartyLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  invoiceSlipPartyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  invoiceSlipAvatar: {
    width: 26,
    height: 26,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceSlipAvatarText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  invoiceSlipPartyVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  invoiceSlipPartySub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  invoiceSlipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  invoiceSlipTag: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 0,
    marginRight: 4,
  },
  invoiceSlipTagText: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  invoiceSlipItemName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  invoiceSlipItemSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1.5,
  },
  invoiceSlipItemAmt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  invoiceSlipHighlight: {
    backgroundColor: '#0B1120',
    borderRadius: 0,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  invoiceSlipHighlightLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  invoiceSlipHighlightSub: {
    fontSize: 9,
    color: '#CBD5E1',
    marginTop: 1,
  },
  invoiceSlipHighlightAmt: {
    fontSize: 17,
    fontWeight: '900',
    color: '#38BDF8',
  },
  invoiceSlipGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  invoiceSlipGridItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  invoiceSlipGridLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  invoiceSlipGridVal: {
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 2,
  },
  invoiceSlipUpiStrip: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invoiceSlipUpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  invoiceSlipUpiId: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    maxWidth: 130,
  },
  invoiceSlipUpiApps: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#047857',
  },
  invoiceSlipFooter: {
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  invoiceSlipFootText: {
    fontSize: 8.5,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  invoiceActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 0,
    elevation: 3,
  },
  invoiceActionPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  invoiceTwoBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  invoiceFormatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 0,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  invoiceFormatBtnPdf: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
  },
  invoiceFormatBtnPhoto: {
    backgroundColor: '#0F172A',
    shadowColor: '#000000',
  },
  invoiceFormatBtnTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  invoiceFormatBtnSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  invoiceReadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invoiceReadyDot: {
    width: 22,
    height: 22,
    borderRadius: 0,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceReadyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  invoiceChangeFormatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  invoiceChangeFormatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  invoiceActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 0,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  invoiceDownloadBtn: {
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A',
  },
  invoiceShareBtn: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
  },
  invoiceActionBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  invoiceWhatsAppDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    paddingVertical: 12,
    borderRadius: 0,
    marginTop: 4,
    elevation: 2,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  invoiceWhatsAppDirectBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  invoiceSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  invoiceSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    borderRadius: 0,
  },
  invoiceSecondaryBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  invoiceGeneratedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  invoiceGeneratedStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  invoiceGeneratedIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceGeneratedStripTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  invoiceGeneratedStripSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#047857',
    marginTop: 1,
  },
  invoiceGeneratedActions: {
    flexDirection: 'row',
    gap: 6,
  },
  invoiceGeneratedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  invoiceGeneratedBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
});
