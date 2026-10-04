import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  Platform,
  BackHandler,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  insertTransaction,
  deleteTransaction,
  getUserCategories,
  CategoryItem,
  defaultCategories,
} from '@/lib/database';
import { getAllFriendsSummaries, saveFriend, addUdharEntry } from '@/lib/udharStorage';
import { getLocalDateString } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';
import { parseVoiceTranscript, ParsedVoiceTransaction } from '@/lib/voiceParser';
import { Colors } from '@/constants/theme';
import CategoryIcon from '@/components/CategoryIcon';

/**
 * NOTE ON ANDROID WIDGET MICROPHONE ACCESS:
 * Android AppWidgets render via RemoteViews inside the System Home Screen process
 * and cannot directly initialize or hold an AudioRecord / SpeechRecognizer session.
 * Therefore, tapping the widget Voice button deep-links to rupeo://quick-add-voice,
 * which opens this lightweight screen and immediately starts voice recognition with 0 extra taps.
 */

type VoiceState =
  | 'listening'
  | 'direct_saved_confirm'
  | 'manual_fix'
  | 'permission_denied'
  | 'error';

export default function VoiceQuickAddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  const { user, settings } = useAuth();
  const { t } = useTranslation();
  const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

  // Speech settings: default en-IN or user's preference in settings
  const speechLocale: 'en-IN' | 'hi-IN' = settings?.voiceLocale || 'en-IN';

  // Voice States
  const [state, setState] = useState<VoiceState>('listening');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Parsed / Editable Transaction Details
  const [savedTxId, setSavedTxId] = useState<string | null>(null);
  const [parsedTx, setParsedTx] = useState<ParsedVoiceTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('Food');
  const [editPaymentMode, setEditPaymentMode] = useState<'UPI' | 'Cash' | 'Bank' | 'Card'>('UPI');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit');
  const [editNote, setEditNote] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Auto-close countdown (4 seconds)
  const [secondsLeft, setSecondsLeft] = useState(4);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Context data
  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [knownFriends, setKnownFriends] = useState<string[]>([]);

  // Mic Pulse Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0)).current;
  const waveAnim2 = useRef(new Animated.Value(0)).current;

  // Load user categories & friends for smarter NLP classification
  useEffect(() => {
    if (!user?.uid) return;

    getUserCategories(user.uid)
      .then((cats) => {
        if (cats && cats.length > 0) setCategories(cats);
      })
      .catch(() => {});

    getAllFriendsSummaries(user.uid)
      .then((res) => {
        if (res?.friends && Array.isArray(res.friends) && res.friends.length > 0) {
          setKnownFriends(res.friends.map((f: { name: string }) => f.name));
        }
      })
      .catch(() => {});
  }, [user?.uid]);

  // Pulsing mic animation
  useEffect(() => {
    if (isListening && state === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const wave1 = Animated.loop(
        Animated.timing(waveAnim1, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      );

      const wave2 = Animated.loop(
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(waveAnim2, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      pulse.start();
      wave1.start();
      wave2.start();

      return () => {
        pulse.stop();
        wave1.stop();
        wave2.stop();
        pulseAnim.setValue(1);
        waveAnim1.setValue(0);
        waveAnim2.setValue(0);
      };
    }
  }, [isListening, state, pulseAnim, waveAnim1, waveAnim2]);

  // Hardware back press on Android
  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  const handleClose = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    try {
      ExpoSpeechRecognitionModule?.abort?.();
    } catch {}

    if (router.canGoBack()) {
      router.back();
    } else {
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    }
  }, [router]);

  // Direct Save Execution
  const performDirectSave = useCallback(
    async (parsed: ParsedVoiceTransaction) => {
      if (!user?.uid || !parsed.amount || parsed.amount <= 0) return;

      try {
        // Fallback category to 'Others' if category was not clearly identified
        const resolvedCategory = parsed.category || (parsed.type === 'credit' ? 'Salary' : 'Others');

        const payload = {
          amount: parsed.amount,
          type: parsed.type,
          category: resolvedCategory,
          description: parsed.note || parsed.rawTranscript,
          merchant_name: parsed.friendName || parsed.note || null,
          date: getLocalDateString(),
          payment_mode: parsed.paymentMode || 'UPI',
          source: 'widget_voice',
        };

        const newId = await insertTransaction(user.uid, payload);
        triggerTransactionVibration();

        // If friend name detected and Udhar feature applies, sync to Udhar
        if (parsed.isUdhar && parsed.friendName) {
          try {
            const friend = await saveFriend(user.uid, { name: parsed.friendName });
            await addUdharEntry(user.uid, {
              friendId: friend.id,
              amount: parsed.amount,
              type: parsed.type === 'credit' ? 'got' : 'gave',
              note: parsed.note || 'Voice quick entry',
              date: getLocalDateString(),
            });
          } catch (udharErr) {
            console.warn('[VoiceQuickAdd] Udhar sync error:', udharErr);
          }
        }

        setSavedTxId(newId);
        setState('direct_saved_confirm');

        // Start 4-second auto-close countdown
        setSecondsLeft(4);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              handleClose();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (saveErr) {
        console.error('[VoiceQuickAdd] Direct save error:', saveErr);
        // If Firestore offline, write is queued locally and will sync later
        setState('direct_saved_confirm');
      }
    },
    [user?.uid, handleClose]
  );

  // Process final spoken transcript
  const processTranscript = useCallback(
    (spokenText: string) => {
      const parsed = parseVoiceTranscript(spokenText, {
        availableCategories: categories.map((c) => c.name),
        knownFriends,
      });

      setParsedTx(parsed);
      setEditAmount(parsed.amount ? parsed.amount.toString() : '');
      setEditCategory(parsed.category || (parsed.type === 'credit' ? 'Salary' : 'Others'));
      setEditPaymentMode(parsed.paymentMode || 'UPI');
      setEditType(parsed.type);
      setEditNote(parsed.note);

      // DIRECT SAVE RULE:
      // If a valid amount (> 0) and type are parsed, save immediately to Firestore!
      if (parsed.amount && parsed.amount > 0) {
        performDirectSave(parsed);
      } else {
        // If no amount can be parsed, do NOT save. Show transcript and let user fix manually.
        setState('manual_fix');
      }
    },
    [categories, knownFriends, performDirectSave]
  );

  // Refs to avoid stale closures in native speech events
  const transcriptRef = useRef<string>('');
  const stateRef = useRef<VoiceState>('listening');
  const speechLocaleRef = useRef<'en-IN' | 'hi-IN'>(speechLocale);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCleaningUpRef = useRef<boolean>(false);
  const webSpeechRef = useRef<any>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    speechLocaleRef.current = speechLocale;
  }, [speechLocale]);

  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (speechDebounceTimerRef.current) {
      clearTimeout(speechDebounceTimerRef.current);
      speechDebounceTimerRef.current = null;
    }
  }, []);

  const processTranscriptRef = useRef(processTranscript);
  useEffect(() => {
    processTranscriptRef.current = processTranscript;
  }, [processTranscript]);

  // Speech Recognition Events (Native Android/iOS)
  useSpeechRecognitionEvent('start', () => {
    if (Platform.OS !== 'web') {
      setIsListening(true);
      setErrorMessage('');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (Platform.OS !== 'web') {
      setIsListening(false);
      if (stateRef.current === 'listening') {
        const captured = transcriptRef.current.trim();
        if (captured.length > 0) {
          clearSilenceTimers();
          processTranscriptRef.current(captured);
        } else {
          setErrorMessage(t('voice_no_speech'));
          setState('error');
        }
      }
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (Platform.OS !== 'web') {
      if (event.results && event.results.length > 0) {
        const latest = event.results[event.results.length - 1]?.transcript || '';
        if (latest) {
          transcriptRef.current = latest;
          setTranscript(latest);
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        if (event.isFinal && latest.trim().length > 0) {
          clearSilenceTimers();
          processTranscriptRef.current(latest);
          return;
        }

        if (speechDebounceTimerRef.current) clearTimeout(speechDebounceTimerRef.current);
        speechDebounceTimerRef.current = setTimeout(() => {
          const captured = transcriptRef.current.trim();
          if (captured.length > 0 && stateRef.current === 'listening') {
            clearSilenceTimers();
            processTranscriptRef.current(captured);
          }
        }, 1800);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (Platform.OS !== 'web') {
      if (event.error === 'aborted') return;
      const code = event.error;

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        clearSilenceTimers();
        setIsListening(false);
        setState('permission_denied');
        return;
      }

      if (code === 'no-speech' || code === 'speech-timeout') {
        const captured = transcriptRef.current.trim();
        if (captured.length > 0) {
          clearSilenceTimers();
          processTranscriptRef.current(captured);
          return;
        }
        setErrorMessage(t('voice_no_speech'));
      } else if (code === 'network') {
        clearSilenceTimers();
        setIsListening(false);
        setErrorMessage(t('voice_offline_error'));
        setState('error');
      } else if (code === 'client') {
        clearSilenceTimers();
        setIsListening(false);
        setErrorMessage(
          Platform.OS === 'android'
            ? 'Speech recognition service temporarily unavailable. Please tap Try Again.'
            : (event.message || t('voice_offline_error'))
        );
        setState('error');
      } else {
        clearSilenceTimers();
        setIsListening(false);
        setErrorMessage(event.message || t('voice_offline_error'));
        setState('error');
      }
    }
  });

  // Start listening session
  const startListening = useCallback(async () => {
    try {
      isCleaningUpRef.current = false;
      clearSilenceTimers();
      transcriptRef.current = '';
      setTranscript('');
      setErrorMessage('');
      setState('listening');

      // 1. WEB BROWSER: Use direct, standard Web Speech API (webkitSpeechRecognition)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const SpeechRecognitionClass = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SpeechRecognitionClass) {
          setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
          setState('error');
          return;
        }

        const startWebInstance = () => {
          if (isCleaningUpRef.current || stateRef.current !== 'listening') return;

          try {
            webSpeechRef.current?.abort();
          } catch (_) {}

          const recognition = new SpeechRecognitionClass();
          webSpeechRef.current = recognition;
          recognition.lang = speechLocale;
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onstart = () => {
            setIsListening(true);
            setErrorMessage('');
          };

          recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = 0; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + ' ';
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }

            const combined = (finalTranscript + interimTranscript).trim();
            if (combined) {
              transcriptRef.current = combined;
              setTranscript(combined);

              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }

              if (speechDebounceTimerRef.current) clearTimeout(speechDebounceTimerRef.current);
              speechDebounceTimerRef.current = setTimeout(() => {
                const captured = transcriptRef.current.trim();
                if (captured.length > 0 && stateRef.current === 'listening') {
                  isCleaningUpRef.current = true;
                  try {
                    recognition.stop();
                  } catch (_) {}
                  processTranscriptRef.current(captured);
                }
              }, 1500);
            }
          };

          recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') return;
            if (event.error === 'not-allowed') {
              clearSilenceTimers();
              setIsListening(false);
              setState('permission_denied');
              return;
            }
            if (transcriptRef.current.trim().length === 0 && stateRef.current === 'listening') {
              clearSilenceTimers();
              setIsListening(false);
              setErrorMessage(event.message || t('voice_offline_error'));
              setState('error');
            }
          };

          recognition.onend = () => {
            setIsListening(false);
            const captured = transcriptRef.current.trim();
            if (captured.length > 0 && stateRef.current === 'listening') {
              clearSilenceTimers();
              processTranscriptRef.current(captured);
            } else if (stateRef.current === 'listening' && !isCleaningUpRef.current) {
              try {
                startWebInstance();
              } catch (_) {}
            }
          };

          try {
            recognition.start();
            triggerTransactionVibration();
          } catch (err: any) {
            console.warn('[WebSpeech] start error:', err);
          }
        };

        startWebInstance();

        silenceTimerRef.current = setTimeout(() => {
          if (stateRef.current === 'listening' && transcriptRef.current.trim().length === 0) {
            try {
              webSpeechRef.current?.abort();
            } catch (_) {}
            setIsListening(false);
            setErrorMessage(t('voice_no_speech'));
            setState('error');
          }
        }, 8000);

        return;
      }

      // 2. NATIVE ANDROID / IOS: Use ExpoSpeechRecognitionModule
      if (!ExpoSpeechRecognitionModule || typeof ExpoSpeechRecognitionModule.start !== 'function') {
        setErrorMessage('Voice recognition requires a supported build.');
        setState('error');
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setState('permission_denied');
        return;
      }

      await ExpoSpeechRecognitionModule.start({
        lang: speechLocale,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });

      triggerTransactionVibration();

      silenceTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'listening' && transcriptRef.current.trim().length === 0) {
          try {
            ExpoSpeechRecognitionModule?.abort?.();
          } catch (_) {}
          setIsListening(false);
          setErrorMessage(t('voice_no_speech'));
          setState('error');
        }
      }, 8000);
    } catch (err: any) {
      console.warn('[VoiceQuickAdd] Start error:', err);
      clearSilenceTimers();
      setIsListening(false);
      setErrorMessage(err?.message || 'Could not start speech recognition');
      setState('error');
    }
  }, [speechLocale, t, clearSilenceTimers]);

  // Trigger listening immediately on mount
  useEffect(() => {
    isCleaningUpRef.current = false;
    const timer = setTimeout(() => {
      startListening();
    }, 100);
    return () => {
      isCleaningUpRef.current = true;
      clearTimeout(timer);
      clearSilenceTimers();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (Platform.OS === 'web') {
        try {
          webSpeechRef.current?.abort();
        } catch (_) {}
      } else {
        try {
          ExpoSpeechRecognitionModule?.abort?.();
        } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo Action: Deletes the directly saved entry from Firestore
  const handleUndo = async () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (savedTxId && user?.uid) {
      try {
        await deleteTransaction(user.uid, savedTxId);
        triggerTransactionVibration();
        Toast.show({
          type: 'info',
          text1: t('transaction_undone'),
          text2: 'The voice entry was successfully deleted.',
          visibilityTime: 1800,
        });
      } catch (err) {
        console.warn('[VoiceQuickAdd] Undo error:', err);
      }
    }

    setTimeout(() => {
      handleClose();
    }, 400);
  };

  // Edit Action: Pause auto-close timer and switch to manual fix view
  const handleSwitchToEdit = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setState('manual_fix');
  };

  // Manual Fix Save Action
  const handleSaveManualFix = async () => {
    const val = parseFloat(editAmount);
    if (isNaN(val) || val <= 0) {
      Toast.show({
        type: 'error',
        text1: t('enter_amount'),
        text2: 'Please enter a valid amount',
      });
      return;
    }

    if (!user?.uid) {
      router.replace('/login');
      return;
    }

    try {
      setIsSavingManual(true);

      // If updating the previously auto-saved record or inserting new
      const payload = {
        amount: val,
        type: editType,
        category: editCategory || (editType === 'credit' ? 'Salary' : 'Others'),
        description: editNote.trim() || transcript || null,
        merchant_name: parsedTx?.friendName || editNote.trim() || null,
        date: getLocalDateString(),
        payment_mode: editPaymentMode || parsedTx?.paymentMode || 'UPI',
        source: 'widget_voice',
      };

      if (savedTxId) {
        // Update existing record
        const { updateTransaction } = await import('@/lib/database');
        await updateTransaction(user.uid, savedTxId, payload);
      } else {
        await insertTransaction(user.uid, payload);
      }

      triggerTransactionVibration();
      Toast.show({
        type: 'success',
        text1: `${t('direct_save_added')}: ${currency}${val}`,
        text2: `${editCategory} (${editType === 'credit' ? 'Income' : 'Expense'})`,
        visibilityTime: 1800,
      });

      setTimeout(() => {
        handleClose();
      }, 350);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Error saving transaction',
        text2: err?.message || 'Check connection',
      });
      setIsSavingManual(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={handleClose}
          style={[styles.iconButton, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('voice_quick_add_title')}
        </Text>

        {/* Speech locale indicator */}
        <View style={[styles.localePill, { backgroundColor: isDark ? '#1F2937' : '#E2E8F0' }]}>
          <Text style={[styles.localeText, { color: theme.textSecondary }]}>
            {speechLocale === 'hi-IN' ? 'हिन्दी (hi-IN)' : 'EN (en-IN)'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. LISTENING VIEW */}
        {state === 'listening' && (
          <View style={styles.centerContainer}>
            {/* Pulsing Mic Indicator */}
            <View style={styles.micWrapper}>
              <Animated.View
                style={[
                  styles.micWave,
                  {
                    borderColor: '#10B981',
                    transform: [{ scale: waveAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
                    opacity: waveAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.micWave,
                  {
                    borderColor: '#059669',
                    transform: [{ scale: waveAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                    opacity: waveAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  },
                ]}
              />
              <Animated.View style={[styles.micCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="mic" size={44} color="#FFFFFF" />
              </Animated.View>
            </View>

            <Text style={[styles.listeningTitle, { color: theme.text }]}>
              {transcript ? transcript : t('voice_listening')}
            </Text>

            <Text style={[styles.listeningSubtitle, { color: theme.textSecondary }]}>
              {t('voice_speak_prompt')}
            </Text>

            {/* Examples Pill */}
            <View style={[styles.exampleBox, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
              <Text style={[styles.exampleTitle, { color: theme.textSecondary }]}>EXAMPLES</Text>
              <Text style={[styles.exampleText, { color: theme.text }]}>
                "chai 20 rupaye" • "auto ke 50" • "salary 25000 aaya"
              </Text>
            </View>
          </View>
        )}

        {/* 2. DIRECT SAVE CONFIRMATION CARD (4-Second Auto Close) */}
        {state === 'direct_saved_confirm' && (
          <View style={styles.confirmContainer}>
            {/* Auto-close Banner */}
            <View style={[styles.countdownPill, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]}>
              <Ionicons name="timer-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={[styles.countdownText, { color: '#059669' }]}>
                {t('closing_in_seconds')} {secondsLeft}s
              </Text>
            </View>

            {/* Success Card */}
            <View style={[styles.savedCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.savedCardHeader}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.savedTitle, { color: theme.text }]}>
                  {t('direct_save_added')}: {currency}{parsedTx?.amount}
                </Text>
              </View>

              <View style={[styles.savedDivider, { backgroundColor: theme.border }]} />

              <View style={styles.savedRow}>
                <Text style={[styles.savedLabel, { color: theme.textSecondary }]}>Category</Text>
                <View style={styles.savedBadge}>
                  <Text style={[styles.savedBadgeText, { color: theme.text }]}>
                    {editCategory}
                  </Text>
                </View>
              </View>

              <View style={styles.savedRow}>
                <Text style={[styles.savedLabel, { color: theme.textSecondary }]}>Type</Text>
                <Text style={[styles.savedValue, { color: editType === 'credit' ? '#10B981' : '#EF4444' }]}>
                  {editType === 'credit' ? 'Income' : 'Expense'}
                </Text>
              </View>

              <View style={styles.savedRow}>
                <Text style={[styles.savedLabel, { color: theme.textSecondary }]}>Payment</Text>
                <View style={styles.savedBadge}>
                  <Text style={[styles.savedBadgeText, { color: theme.text }]}>
                    {editPaymentMode}
                  </Text>
                </View>
              </View>

              {transcript ? (
                <View style={styles.savedRow}>
                  <Text style={[styles.savedLabel, { color: theme.textSecondary }]}>Spoken</Text>
                  <Text style={[styles.savedTranscript, { color: theme.textSecondary }]} numberOfLines={2}>
                    "{transcript}"
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons: Undo & Edit */}
              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  onPress={handleUndo}
                  style={[styles.undoButton, { borderColor: '#EF4444' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-undo-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.undoButtonText}>{t('undo')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSwitchToEdit}
                  style={[styles.editButton, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={18} color={theme.text} style={{ marginRight: 6 }} />
                  <Text style={[styles.editButtonText, { color: theme.text }]}>{t('edit')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* 3. MANUAL FIX VIEW (When amount cannot be parsed or user taps Edit) */}
        {state === 'manual_fix' && (
          <View style={styles.manualFixContainer}>
            <View style={[styles.transcriptNotice, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
              <Text style={[styles.transcriptNoticeLabel, { color: theme.textSecondary }]}>Spoken Text:</Text>
              <Text style={[styles.transcriptNoticeValue, { color: theme.text }]}>
                "{transcript || 'No speech recorded'}"
              </Text>
            </View>

            {/* Type selector */}
            <View style={[styles.typeToggleContainer, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
              <TouchableOpacity
                onPress={() => setEditType('debit')}
                style={[
                  styles.typeToggleButton,
                  editType === 'debit' && { backgroundColor: '#EF4444' },
                ]}
              >
                <Text style={[styles.typeToggleText, { color: editType === 'debit' ? '#FFFFFF' : theme.textSecondary }]}>
                  {t('widget_add_expense')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditType('credit')}
                style={[
                  styles.typeToggleButton,
                  editType === 'credit' && { backgroundColor: '#10B981' },
                ]}
              >
                <Text style={[styles.typeToggleText, { color: editType === 'credit' ? '#FFFFFF' : theme.textSecondary }]}>
                  {t('widget_add_income')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={[styles.inputCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{t('enter_amount')}</Text>
              <View style={styles.amountRow}>
                <Text style={[styles.currencyPrefix, { color: editType === 'debit' ? '#EF4444' : '#10B981' }]}>
                  {currency}
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: theme.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
                  keyboardType="decimal-pad"
                  value={editAmount}
                  onChangeText={(val) => {
                    if (/^\d*\.?\d{0,2}$/.test(val)) setEditAmount(val);
                  }}
                  autoFocus
                />
              </View>
            </View>

            {/* Category selector chips */}
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CATEGORY</Text>
              <View style={styles.chipsWrap}>
                {categories.slice(0, 12).map((cat) => {
                  const isSelected = editCategory.toLowerCase() === cat.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      onPress={() => setEditCategory(cat.name)}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#374151' : '#F1F5F9')
                            : (isDark ? '#1F2937' : '#FFFFFF'),
                          borderColor: isSelected ? '#10B981' : (isDark ? '#374151' : '#E5E7EB'),
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                    >
                      <CategoryIcon categoryName={cat.name} iconName={cat.icon} color={cat.color} size={16} />
                      <Text style={[styles.categoryChipText, { color: isSelected ? theme.text : theme.textSecondary }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Payment Mode Selector */}
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PAYMENT MODE</Text>
              <View style={styles.paymentModeChipsRow}>
                {(['UPI', 'Cash', 'Bank', 'Card'] as const).map((mode) => {
                  const isSelected = editPaymentMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setEditPaymentMode(mode)}
                      style={[
                        styles.paymentModeChip,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#374151' : '#F1F5F9')
                            : (isDark ? '#1F2937' : '#FFFFFF'),
                          borderColor: isSelected ? '#10B981' : (isDark ? '#374151' : '#E5E7EB'),
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={
                          mode === 'UPI'
                            ? 'flash'
                            : mode === 'Cash'
                            ? 'cash'
                            : mode === 'Bank'
                            ? 'business'
                            : 'card'
                        }
                        size={14}
                        color={isSelected ? (isDark ? '#34D399' : '#059669') : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.paymentModeChipText,
                          { color: isSelected ? theme.text : theme.textSecondary },
                        ]}
                      >
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Optional Note */}
            <View style={[styles.inputCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput
                style={[styles.noteInput, { color: theme.text }]}
                placeholder={t('optional_note')}
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={editNote}
                onChangeText={setEditNote}
              />
            </View>

            {/* Save Manual */}
            <TouchableOpacity
              onPress={handleSaveManualFix}
              disabled={isSavingManual || !editAmount}
              style={[
                styles.saveButton,
                {
                  backgroundColor: editType === 'debit' ? '#EF4444' : '#10B981',
                  opacity: isSavingManual || !editAmount ? 0.6 : 1,
                },
              ]}
            >
              {isSavingManual ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{t('save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 4. PERMISSION DENIED */}
        {state === 'permission_denied' && (
          <View style={styles.centerContainer}>
            <View style={[styles.errorCircle, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="mic-off" size={40} color="#EF4444" />
            </View>
            <Text style={[styles.errorTitle, { color: theme.text }]}>Microphone Permission Needed</Text>
            <Text style={[styles.errorSubtitle, { color: theme.textSecondary }]}>
              {t('voice_mic_permission')}
            </Text>
            <TouchableOpacity
              onPress={startListening}
              style={[styles.actionButton, { backgroundColor: '#10B981' }]}
            >
              <Text style={styles.actionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 5. ERROR / NO SPEECH */}
        {state === 'error' && (
          <View style={styles.centerContainer}>
            <View style={[styles.errorCircle, { backgroundColor: isDark ? '#374151' : '#F1F5F9' }]}>
              <Ionicons name="alert-circle-outline" size={40} color={theme.textSecondary} />
            </View>
            <Text style={[styles.errorTitle, { color: theme.text }]}>
              {errorMessage || t('voice_no_speech')}
            </Text>
            <TouchableOpacity
              onPress={startListening}
              style={[styles.actionButton, { backgroundColor: '#10B981' }]}
            >
              <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.actionButtonText}>{t('voice_try_again')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  localePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  localeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  micWrapper: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  micWave: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
  },
  micCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  listeningTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  listeningSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  exampleBox: {
    borderRadius: 14,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  exampleTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  exampleText: {
    fontSize: 13,
    textAlign: 'center',
  },
  confirmContainer: {
    alignItems: 'center',
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
  },
  savedCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  savedTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  savedDivider: {
    height: 1,
    width: '100%',
    marginBottom: 14,
  },
  savedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  savedLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  savedValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  savedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#10B98120',
  },
  savedBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  savedTranscript: {
    fontSize: 13,
    fontStyle: 'italic',
    maxWidth: '65%',
    textAlign: 'right',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  undoButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  editButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  manualFixContainer: {
    width: '100%',
  },
  transcriptNotice: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  transcriptNoticeLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  transcriptNoticeValue: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  typeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeToggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 26,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 28,
    fontWeight: '800',
    flex: 1,
    padding: 0,
  },
  noteInput: {
    fontSize: 14,
    padding: 0,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  paymentModeChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 6,
  },
  paymentModeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
