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
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { getLocalDateString, formatTime12Hour } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';
import { parseVoiceTranscript, ParsedVoiceTransaction } from '@/lib/voiceParser';
import { Colors } from '@/constants/theme';
import CategoryIcon from '@/components/CategoryIcon';

type VoiceState =
  | 'listening'
  | 'direct_saved_confirm'
  | 'manual_fix'
  | 'permission_denied'
  | 'error';

export default function VoiceQuickAddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromWidget?: string }>();
  const isFromWidget = params.fromWidget === '1' || !router.canGoBack();
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

  // Snappy auto-close countdown (2 seconds)
  const [secondsLeft, setSecondsLeft] = useState(2);
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

    if (isFromWidget) {
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } else if (router.canGoBack()) {
      router.back();
    } else {
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    }
  }, [router, isFromWidget]);

  // Direct Save Execution
  const performDirectSave = useCallback(
    async (parsed: ParsedVoiceTransaction) => {
      if (!user?.uid || !parsed.amount || parsed.amount <= 0) return;

      try {
        const resolvedCategory = parsed.category || (parsed.type === 'credit' ? 'Salary' : 'Others');
        const now = new Date();
        const saveDate = parsed.date || getLocalDateString(now);
        const timeStr = formatTime12Hour(now);

        const payload = {
          amount: parsed.amount,
          type: parsed.type,
          category: resolvedCategory,
          description: parsed.note || parsed.rawTranscript,
          merchant_name: parsed.friendName || parsed.note || null,
          date: saveDate,
          time: timeStr,
          payment_mode: parsed.paymentMode || 'UPI',
          source: 'widget_voice',
          created_at: Date.now(),
        };

        const newId = await insertTransaction(user.uid, payload);
        triggerTransactionVibration();

        if (parsed.isUdhar && parsed.friendName) {
          try {
            const friend = await saveFriend(user.uid, { name: parsed.friendName });
            await addUdharEntry(user.uid, {
              friendId: friend.id,
              amount: parsed.amount,
              type: parsed.type === 'credit' ? 'got' : 'gave',
              note: parsed.note || 'Voice quick entry',
              date: saveDate,
              time: timeStr,
            });
          } catch (udharErr) {
            console.warn('[VoiceQuickAdd] Udhar sync error:', udharErr);
          }
        }

        setSavedTxId(newId);
        setState('direct_saved_confirm');

        // Start 2-second snappy auto-close countdown
        setSecondsLeft(2);
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

      if (parsed.amount && parsed.amount > 0) {
        performDirectSave(parsed);
      } else {
        setState('manual_fix');
      }
    },
    [categories, knownFriends, performDirectSave]
  );

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

  const startListening = useCallback(async () => {
    try {
      isCleaningUpRef.current = false;
      clearSilenceTimers();
      transcriptRef.current = '';
      setTranscript('');
      setErrorMessage('');
      setState('listening');

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
  }, []);

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

  const handleSwitchToEdit = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setState('manual_fix');
  };

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

      const now = new Date();
      const saveDate = parsedTx?.date || getLocalDateString(now);
      const timeStr = formatTime12Hour(now);

      const payload = {
        amount: val,
        type: editType,
        category: editCategory || (editType === 'credit' ? 'Salary' : 'Others'),
        description: editNote.trim() || transcript || null,
        merchant_name: parsedTx?.friendName || editNote.trim() || null,
        date: saveDate,
        time: timeStr,
        payment_mode: editPaymentMode || parsedTx?.paymentMode || 'UPI',
        source: 'widget_voice',
        created_at: Date.now(),
      };

      if (savedTxId) {
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
    <View style={styles.modalBackdrop}>
      {/* Tap backdrop to dismiss & exit cleanly */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dialogWrapper}
      >
        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? '#1E293B' : '#E2E8F0',
            },
          ]}
        >
          {/* Header Row */}
          <View style={[styles.dialogHeader, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      state === 'listening'
                        ? '#10B981'
                        : state === 'direct_saved_confirm'
                        ? '#10B981'
                        : '#6366F1',
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      state === 'listening'
                        ? '#10B981'
                        : state === 'direct_saved_confirm'
                        ? '#10B981'
                        : '#818CF8',
                  },
                ]}
              >
                {state === 'listening'
                  ? 'LISTENING'
                  : state === 'direct_saved_confirm'
                  ? 'SAVED'
                  : 'VOICE ENTRY'}
              </Text>
            </View>

            <View style={styles.headerRightControls}>
              <View style={[styles.localePill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                <Text style={[styles.localeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {speechLocale === 'hi-IN' ? 'हिन्दी' : 'EN'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleClose}
                style={[styles.closeButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Dialog Scrollable Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.dialogScrollBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. LISTENING VIEW */}
            {state === 'listening' && (
              <View style={styles.centerContainer}>
                {/* Glowing Concentric Pulsing Mic Waves */}
                <View style={styles.micWrapper}>
                  <Animated.View
                    style={[
                      styles.micWave,
                      {
                        borderColor: '#4F46E5',
                        transform: [{ scale: waveAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
                        opacity: waveAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] }),
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.micWave,
                      {
                        borderColor: '#6366F1',
                        transform: [{ scale: waveAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.35] }) }],
                        opacity: waveAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                      },
                    ]}
                  />
                  <Animated.View style={[styles.micCircle, { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name="mic" size={38} color="#FFFFFF" />
                  </Animated.View>
                </View>

                {transcript ? (
                  <View style={[styles.liveTranscriptCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#818CF8" style={{ marginRight: 6 }} />
                    <Text style={[styles.liveTranscriptText, { color: theme.text }]}>
                      "{transcript}"
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.listeningTitle, { color: theme.text }]}>
                      {t('voice_listening')}
                    </Text>
                    <Text style={[styles.listeningSubtitle, { color: theme.textSecondary }]}>
                      {t('voice_speak_prompt')}
                    </Text>
                  </>
                )}

                {/* Example Hints */}
                <View style={[styles.exampleBox, { backgroundColor: isDark ? '#1E293B50' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.exampleTitle, { color: isDark ? '#818CF8' : '#6366F1' }]}>EXAMPLES</Text>
                  <Text style={[styles.exampleText, { color: theme.textSecondary }]}>
                    "chai 20" • "auto 50" • "salary 25000"
                  </Text>
                </View>

                {/* Manual Edit Fallback */}
                <TouchableOpacity
                  onPress={handleSwitchToEdit}
                  style={styles.switchManualButton}
                >
                  <Text style={[styles.switchManualText, { color: '#818CF8' }]}>
                    Type manually instead ›
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 2. DIRECT SAVE CONFIRMATION (Snappy 2s Auto Close + Immediate Exit) */}
            {state === 'direct_saved_confirm' && (
              <View style={styles.confirmContainer}>
                {/* Auto-close Banner */}
                <View style={[styles.countdownPill, { backgroundColor: isDark ? '#064E3B40' : '#ECFDF5', borderColor: '#05966950' }]}>
                  <Ionicons name="timer-outline" size={15} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={[styles.countdownText, { color: '#059669' }]}>
                    {t('closing_in_seconds')} {secondsLeft}s
                  </Text>
                </View>

                {/* Success Card */}
                <View style={[styles.savedCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <View style={styles.savedCardHeader}>
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.savedTitle, { color: theme.text }]}>
                        {currency}{parsedTx?.amount} Added
                      </Text>
                      <Text style={[styles.savedSubTitle, { color: editType === 'credit' ? '#10B981' : '#EF4444' }]}>
                        {editType === 'credit' ? '+ Income' : '- Expense'} • {editCategory}
                      </Text>
                    </View>
                  </View>

                  {transcript ? (
                    <View style={[styles.spokenBubble, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                      <Ionicons name="mic" size={14} color="#818CF8" style={{ marginRight: 6 }} />
                      <Text style={[styles.savedTranscript, { color: theme.textSecondary }]} numberOfLines={2}>
                        "{transcript}"
                      </Text>
                    </View>
                  ) : null}

                  {/* Actions: Undo, Edit, and Done */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      onPress={handleUndo}
                      style={[styles.undoButton, { borderColor: '#EF4444' }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-undo-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                      <Text style={styles.undoButtonText}>{t('undo')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSwitchToEdit}
                      style={[styles.editButton, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isDark ? '#334155' : '#CBD5E1' }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.text} style={{ marginRight: 4 }} />
                      <Text style={[styles.editButtonText, { color: theme.text }]}>{t('edit')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleClose}
                      style={[styles.doneButton, { backgroundColor: '#10B981' }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.doneButtonText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 3. MANUAL FIX VIEW */}
            {state === 'manual_fix' && (
              <View style={styles.manualFixContainer}>
                {transcript ? (
                  <View style={[styles.transcriptNotice, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <Text style={[styles.transcriptNoticeLabel, { color: theme.textSecondary }]}>Heard:</Text>
                    <Text style={[styles.transcriptNoticeValue, { color: theme.text }]}>
                      "{transcript}"
                    </Text>
                  </View>
                ) : null}

                {/* Type toggle: Expense / Income */}
                <View style={[styles.typeToggleContainer, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
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
                <View style={[styles.inputCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
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

                {/* Category Chips */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CATEGORY</Text>
                  <View style={styles.chipsWrap}>
                    {categories.slice(0, 8).map((cat) => {
                      const isSelected = editCategory.toLowerCase() === cat.name.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={cat.name}
                          onPress={() => setEditCategory(cat.name)}
                          style={[
                            styles.categoryChip,
                            {
                              backgroundColor: isSelected
                                ? (isDark ? '#374151' : '#E2E8F0')
                                : (isDark ? '#1E293B' : '#FFFFFF'),
                              borderColor: isSelected ? '#10B981' : (isDark ? '#374151' : '#E5E7EB'),
                              borderWidth: isSelected ? 2 : 1,
                            },
                          ]}
                        >
                          <CategoryIcon categoryName={cat.name} iconName={cat.icon} color={cat.color} size={15} />
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
                                ? (isDark ? '#374151' : '#E2E8F0')
                                : (isDark ? '#1E293B' : '#FFFFFF'),
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
                            size={13}
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

                {/* Save Button */}
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
                  <Ionicons name="mic-off" size={36} color="#EF4444" />
                </View>
                <Text style={[styles.errorTitle, { color: theme.text }]}>Microphone Permission Needed</Text>
                <Text style={[styles.errorSubtitle, { color: theme.textSecondary }]}>
                  {t('voice_mic_permission')}
                </Text>
                <View style={styles.errorActionsRow}>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={[styles.cancelActionBtn, { borderColor: isDark ? '#334155' : '#CBD5E1' }]}
                  >
                    <Text style={[styles.cancelActionText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={startListening}
                    style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  >
                    <Text style={styles.actionButtonText}>Grant</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 5. ERROR / NO SPEECH */}
            {state === 'error' && (
              <View style={styles.centerContainer}>
                <View style={[styles.errorCircle, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <Ionicons name="alert-circle-outline" size={36} color={theme.textSecondary} />
                </View>
                <Text style={[styles.errorTitle, { color: theme.text }]}>
                  {errorMessage || t('voice_no_speech')}
                </Text>
                <View style={styles.errorActionsRow}>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={[styles.cancelActionBtn, { borderColor: isDark ? '#334155' : '#CBD5E1' }]}
                  >
                    <Text style={[styles.cancelActionText, { color: theme.textSecondary }]}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={startListening}
                    style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  >
                    <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.actionButtonText}>{t('voice_try_again')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dialogWrapper: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
  },
  dialogCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 20,
  },
  dialogHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  localeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogScrollBody: {
    padding: 18,
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  micWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  micWave: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  liveTranscriptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 16,
    maxWidth: '95%',
  },
  liveTranscriptText: {
    fontSize: 15,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  listeningTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  listeningSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  exampleBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  exampleTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 12,
    textAlign: 'center',
  },
  switchManualButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  switchManualText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmContainer: {
    alignItems: 'center',
    width: '100%',
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
  },
  savedCard: {
    width: '100%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  savedTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  savedSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  spokenBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  savedTranscript: {
    fontSize: 12,
    fontStyle: 'italic',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  undoButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  editButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  doneButton: {
    flex: 1.2,
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  manualFixContainer: {
    width: '100%',
  },
  transcriptNotice: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  transcriptNoticeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  transcriptNoticeValue: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  typeToggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 24,
    fontWeight: '900',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 26,
    fontWeight: '900',
    flex: 1,
    padding: 0,
  },
  sectionContainer: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  paymentModeChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 4,
  },
  paymentModeChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  saveButton: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  errorCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelActionBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
