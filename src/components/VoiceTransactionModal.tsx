import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { useTranslation } from '@/lib/i18n';
import { parseVoiceTranscript, ParsedVoiceTransaction } from '@/lib/voiceParser';
import { insertTransaction, getUserCategories, CategoryItem, defaultCategories } from '@/lib/database';
import { getAllFriendsSummaries, getFriends, saveFriend, addUdharEntry } from '@/lib/udharStorage';
import { getLocalDateString } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';
import { useAuth } from '@/context/AuthContext';
import CategoryIcon from '@/components/CategoryIcon';

export interface VoiceTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (parsedTx: ParsedVoiceTransaction) => void;
  /**
   * If provided, instead of directly inserting into the database,
   * passes the parsed transaction values to the parent (e.g. Add Transaction form)
   */
  onApplyToForm?: (parsedTx: ParsedVoiceTransaction) => void;
  /**
   * Default category list if available
   */
  availableCategories?: CategoryItem[];
}

type ModalStep = 'listening' | 'confirm' | 'permission_denied' | 'error';

export const VoiceTransactionModal: React.FC<VoiceTransactionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onApplyToForm,
  availableCategories: propCategories,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Speech Recognition States
  const [selectedLocale, setSelectedLocale] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [modalStep, setModalStep] = useState<ModalStep>('listening');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Editable Form States for Confirmation Card
  const [amount, setAmount] = useState<string>('');
  const [txType, setTxType] = useState<'debit' | 'credit'>('debit');
  const [category, setCategory] = useState<string>('Food');
  const [note, setNote] = useState<string>('');
  const [friendName, setFriendName] = useState<string>('');
  const [isUdhar, setIsUdhar] = useState<boolean>(false);

  // Categories & Friends list
  const [categories, setCategories] = useState<CategoryItem[]>(propCategories || defaultCategories);
  const [knownFriends, setKnownFriends] = useState<string[]>([]);

  // Pulse & Wave Animations for Mic
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0)).current;
  const waveAnim2 = useRef(new Animated.Value(0)).current;

  // Load user categories & friends
  useEffect(() => {
    if (!visible) return;

    if (user?.uid) {
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
    }
  }, [visible, user?.uid]);

  // Pulsing wave loop
  useEffect(() => {
    if (isListening && visible) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
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
  }, [isListening, visible, pulseAnim, waveAnim1, waveAnim2]);

  // Speech Recognition Event Listeners
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setErrorMessage('');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      const latest = event.results[event.results.length - 1]?.transcript || '';
      setTranscript(latest);

      if (event.isFinal) {
        processTranscript(latest);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    const code = event.error;
    if (code === 'no-speech') {
      setErrorMessage(t('voice_no_speech'));
    } else if (code === 'network') {
      setErrorMessage(t('voice_offline_error'));
    } else {
      setErrorMessage(event.message || t('voice_offline_error'));
    }
    setModalStep('error');
  });

  // Request Permissions & Start Listening
  const startListeningSession = useCallback(async (locale: 'en-IN' | 'hi-IN' = selectedLocale) => {
    try {
      setTranscript('');
      setErrorMessage('');
      setModalStep('listening');

      // Check if module is available
      if (!ExpoSpeechRecognitionModule || typeof ExpoSpeechRecognitionModule.start !== 'function') {
        setErrorMessage('Speech recognition is only available in Expo development builds.');
        setModalStep('error');
        return;
      }

      // Check permissions
      const permissionRes = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permissionRes.granted) {
        setModalStep('permission_denied');
        return;
      }

      // Stop any existing session
      try {
        await ExpoSpeechRecognitionModule.abort();
      } catch (_) {}

      // Start recognition
      await ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });

      triggerTransactionVibration();
    } catch (err: any) {
      setIsListening(false);
      setErrorMessage(err?.message || t('voice_offline_error'));
      setModalStep('error');
    }
  }, [selectedLocale, t]);

  // Stop Listening & Process Transcript
  const stopListeningSession = useCallback(async () => {
    try {
      if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.stop === 'function') {
        await ExpoSpeechRecognitionModule.stop();
      }
    } catch (_) {}
    setIsListening(false);

    if (transcript.trim().length > 0) {
      processTranscript(transcript);
    } else {
      setErrorMessage(t('voice_no_speech'));
      setModalStep('error');
    }
  }, [transcript, t]);

  // Parse transcript and switch to confirmation step
  const processTranscript = useCallback((textToParse: string) => {
    const categoryNames = categories.map((c) => c.name);
    const parsed = parseVoiceTranscript(textToParse, {
      availableCategories: categoryNames,
      knownFriends,
    });

    const chosenCat = parsed.category || 'Food';
    if (!categories.some((c) => c.name.toLowerCase() === chosenCat.toLowerCase())) {
      const newCustomCat: CategoryItem = {
        name: chosenCat,
        icon: 'cube',
        color: '#6366F1',
      };
      setCategories((prev) => [newCustomCat, ...prev]);
    }

    setAmount(parsed.amount !== null ? parsed.amount.toString() : '');
    setTxType(parsed.type);
    setCategory(chosenCat);
    setNote(parsed.note || textToParse);
    setFriendName(parsed.friendName || '');
    setIsUdhar(Boolean(parsed.isUdhar));

    setModalStep('confirm');
  }, [categories, knownFriends]);

  // Trigger start whenever modal opens
  useEffect(() => {
    if (visible) {
      startListeningSession();
    } else {
      try {
        ExpoSpeechRecognitionModule?.abort?.();
      } catch (_) {}
      setIsListening(false);
      setTranscript('');
      setModalStep('listening');
    }
  }, [visible]);

  // Handle Save from Confirmation Card
  const handleConfirmSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Amount',
        text2: 'Please enter a valid amount before saving.',
        position: 'top',
      });
      return;
    }

    const parsedTx: ParsedVoiceTransaction = {
      amount: numAmount,
      amountText: numAmount.toString(),
      type: txType,
      category,
      note: note.trim() || category,
      friendName: friendName || undefined,
      isUdhar,
      confidence: 1,
      rawTranscript: transcript,
    };

    // If caller provided onApplyToForm (e.g. from Add Transaction screen)
    if (onApplyToForm) {
      onApplyToForm(parsedTx);
      onClose();
      return;
    }

    // Direct save into database
    try {
      if (!user?.uid) {
        Toast.show({
          type: 'error',
          text1: 'Sign In Required',
          text2: 'Please sign in to record transactions.',
          position: 'top',
        });
        return;
      }

      setIsSaving(true);
      const todayStr = getLocalDateString();
      const timeStr = new Date().toTimeString().slice(0, 5);

      const createdTxId = await insertTransaction(user.uid, {
        amount: numAmount,
        type: txType,
        category: txType === 'credit' && category === 'Food' ? 'Income' : category,
        merchant_name: friendName || note.trim() || category,
        description: note.trim() || undefined,
        date: todayStr,
        time: timeStr,
        payment_mode: 'Cash',
      });

      if (isUdhar && friendName) {
        try {
          const friends = await getFriends(user.uid);
          let targetFriend = friends.find((f) => f.name.toLowerCase() === friendName.toLowerCase());
          if (!targetFriend) {
            targetFriend = await saveFriend(user.uid, { name: friendName });
          }
          if (targetFriend?.id) {
            await addUdharEntry(user.uid, {
              friendId: targetFriend.id,
              amount: numAmount,
              type: txType === 'debit' ? 'gave' : 'got',
              date: todayStr,
              time: timeStr,
              note: note.trim() || (txType === 'debit' ? `Udhar to ${friendName}` : `Udhar from ${friendName}`),
              linkedTxId: createdTxId || undefined,
            });
          }
        } catch (udharErr) {
          console.warn('Could not record linked udhar entry:', udharErr);
        }
      }

      triggerTransactionVibration();
      Toast.show({
        type: 'success',
        text1: 'Transaction Recorded! ✨',
        text2: `${txType === 'credit' ? '+' : '-'}₹${numAmount.toLocaleString('en-IN')} under ${category}`,
        position: 'top',
      });

      if (onSuccess) {
        onSuccess(parsedTx);
      }
      onClose();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Error Saving Transaction',
        text2: err?.message || 'Please try again.',
        position: 'top',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const currentThemeColor = txType === 'credit' ? '#10B981' : '#EF4444';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header Bar */}
          <View style={styles.topHeader}>
            <View style={styles.voiceTitleRow}>
              <View style={styles.micBadge}>
                <Ionicons name="mic" size={14} color="#6366F1" />
              </View>
              <Text style={styles.voiceTitle}>{t('voice_entry')}</Text>
            </View>

            {/* Language Switcher */}
            <View style={styles.localeSwitcher}>
              <TouchableOpacity
                style={[styles.localeBtn, selectedLocale === 'en-IN' && styles.localeBtnActive]}
                onPress={() => {
                  setSelectedLocale('en-IN');
                  if (modalStep === 'listening') startListeningSession('en-IN');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.localeBtnText, selectedLocale === 'en-IN' && styles.localeBtnTextActive]}>
                  EN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.localeBtn, selectedLocale === 'hi-IN' && styles.localeBtnActive]}
                onPress={() => {
                  setSelectedLocale('hi-IN');
                  if (modalStep === 'listening') startListeningSession('hi-IN');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.localeBtnText, selectedLocale === 'hi-IN' && styles.localeBtnTextActive]}>
                  हिंदी
                </Text>
              </TouchableOpacity>
            </View>

            {/* Close Button */}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* STEP 1: LISTENING & SPEAKING */}
          {modalStep === 'listening' && (
            <View style={styles.listeningContainer}>
              <Text style={styles.promptHint}>{t('voice_speak_prompt')}</Text>

              {/* Pulsing Mic Visualizer */}
              <View style={styles.micVisualizerWrap}>
                {isListening && (
                  <>
                    <Animated.View
                      style={[
                        styles.waveCircle,
                        {
                          transform: [
                            {
                              scale: waveAnim1.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 2.2],
                              }),
                            },
                          ],
                          opacity: waveAnim1.interpolate({
                            inputRange: [0, 0.7, 1],
                            outputRange: [0.4, 0.15, 0],
                          }),
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.waveCircle,
                        {
                          transform: [
                            {
                              scale: waveAnim2.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 2.2],
                              }),
                            },
                          ],
                          opacity: waveAnim2.interpolate({
                            inputRange: [0, 0.7, 1],
                            outputRange: [0.4, 0.15, 0],
                          }),
                        },
                      ]}
                    />
                  </>
                )}

                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity
                    style={[styles.mainMicCircle, isListening ? styles.mainMicCircleActive : styles.mainMicCircleIdle]}
                    onPress={isListening ? stopListeningSession : () => startListeningSession()}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={isListening ? ['#EF4444', '#DC2626'] : ['#6366F1', '#4F46E5']}
                      style={styles.micGradient}
                    >
                      <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={36} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>

              <Text style={styles.statusLabel}>
                {isListening ? t('voice_listening') : t('voice_tap_to_speak')}
              </Text>

              {/* Live Transcript Display Box */}
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptText}>
                  {transcript.length > 0 ? transcript : '“Chai 20 rupaye” / “Auto ke 50”'}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.listeningActionsRow}>
                {transcript.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.doneSpeakingBtn}
                    onPress={() => processTranscript(transcript)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.doneSpeakingText}>Review Details →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* STEP 2: CONFIRMATION CARD (EDITABLE BEFORE SAVE) */}
          {modalStep === 'confirm' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.confirmScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.confirmHeader}>
                <View style={styles.confirmCheckCircle}>
                  <Ionicons name="checkmark" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.confirmTitle}>{t('voice_confirm_title')}</Text>
                  <Text style={styles.confirmSub}>{t('voice_confirm_desc')}</Text>
                </View>
              </View>

              {/* Original Raw Speech Badge */}
              <View style={styles.rawSpeechRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={13} color="#6366F1" style={{ marginRight: 6 }} />
                <Text style={styles.rawSpeechText} numberOfLines={2}>
                  "{transcript}"
                </Text>
              </View>

              {/* Friend Detected Notice (if Udhar) */}
              {isUdhar && friendName !== '' && (
                <View style={styles.friendNoticeCard}>
                  <Ionicons name="person-circle" size={18} color="#D97706" style={{ marginRight: 6 }} />
                  <Text style={styles.friendNoticeText}>
                    {t('voice_friend_detected')}: <Text style={{ fontWeight: '800' }}>{friendName}</Text> (Udhar Entry)
                  </Text>
                </View>
              )}

              {/* Type Switcher: Expense vs Income */}
              <View style={styles.typeToggleRow}>
                <TouchableOpacity
                  style={[styles.typeToggleBtn, txType === 'debit' && styles.typeToggleExpenseActive]}
                  onPress={() => setTxType('debit')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="arrow-up"
                    size={13}
                    color={txType === 'debit' ? '#FFFFFF' : '#EF4444'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.typeToggleText, txType === 'debit' && styles.typeToggleTextActive]}>
                    {t('type_expense')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeToggleBtn, txType === 'credit' && styles.typeToggleIncomeActive]}
                  onPress={() => setTxType('credit')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="arrow-down"
                    size={13}
                    color={txType === 'credit' ? '#FFFFFF' : '#10B981'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.typeToggleText, txType === 'credit' && styles.typeToggleTextActive]}>
                    {t('type_income')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Amount Input Field */}
              <View style={styles.amountInputContainer}>
                <Text style={styles.inputLabel}>{t('amount').toUpperCase()}</Text>
                <View style={styles.amountInputWrapper}>
                  <Text style={[styles.currencySymbol, { color: currentThemeColor }]}>₹</Text>
                  <TextInput
                    style={[styles.amountInput, { color: currentThemeColor }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#CBD5E1"
                  />
                </View>
              </View>

              {/* Category Picker Chips */}
              <View style={styles.fieldSection}>
                <Text style={styles.inputLabel}>{t('category').toUpperCase()}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryChipsScroll}
                >
                  {categories.map((cat) => {
                    const isSelected = category.toLowerCase() === cat.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                        onPress={() => setCategory(cat.name)}
                        activeOpacity={0.75}
                      >
                        <CategoryIcon
                          categoryName={cat.name}
                          iconName={cat.icon}
                          size={13}
                          color={isSelected ? '#FFFFFF' : cat.color || '#64748B'}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Note / Description Field */}
              <View style={styles.fieldSection}>
                <Text style={styles.inputLabel}>{t('note').toUpperCase()}</Text>
                <View style={styles.noteInputBox}>
                  <Ionicons name="document-text-outline" size={15} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.noteTextInput}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Note / Description"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Confirmation Actions */}
              <View style={styles.confirmButtonsRow}>
                <TouchableOpacity
                  style={styles.tryAgainBtn}
                  onPress={() => startListeningSession()}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={15} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.tryAgainText}>{t('voice_try_again')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveConfirmBtn}
                  onPress={handleConfirmSave}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    style={styles.saveConfirmGradient}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.saveConfirmText}>
                          {onApplyToForm ? 'Apply to Form' : t('voice_save_and_record')}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* STEP 3: PERMISSION DENIED */}
          {modalStep === 'permission_denied' && (
            <View style={styles.stateNoticeContainer}>
              <View style={[styles.stateNoticeIconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="mic-off" size={32} color="#DC2626" />
              </View>
              <Text style={styles.stateNoticeTitle}>Microphone Permission Needed</Text>
              <Text style={styles.stateNoticeSub}>
                {t('voice_mic_permission')}
              </Text>
              <TouchableOpacity
                style={styles.stateNoticeActionBtn}
                onPress={() => startListeningSession()}
                activeOpacity={0.8}
              >
                <Text style={styles.stateNoticeActionText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: ERROR / NO SPEECH */}
          {modalStep === 'error' && (
            <View style={styles.stateNoticeContainer}>
              <View style={[styles.stateNoticeIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="alert-circle" size={32} color="#D97706" />
              </View>
              <Text style={styles.stateNoticeTitle}>Could Not Capture Speech</Text>
              <Text style={styles.stateNoticeSub}>
                {errorMessage || t('voice_no_speech')}
              </Text>
              <TouchableOpacity
                style={styles.stateNoticeActionBtn}
                onPress={() => startListeningSession()}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.stateNoticeActionText}>{t('voice_try_again')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 10,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  voiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  micBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  localeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
  },
  localeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  localeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  localeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  localeBtnTextActive: {
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  listeningContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  promptHint: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 20,
    textAlign: 'center',
  },
  micVisualizerWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 10,
  },
  waveCircle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366F1',
  },
  mainMicCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 8,
  },
  mainMicCircleActive: {
    shadowColor: '#DC2626',
  },
  mainMicCircleIdle: {},
  micGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6366F1',
    marginTop: 14,
  },
  transcriptBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
    marginTop: 18,
    minHeight: 56,
    justifyContent: 'center',
  },
  transcriptText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  listeningActionsRow: {
    marginTop: 18,
    width: '100%',
  },
  doneSpeakingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 14,
  },
  doneSpeakingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  confirmScrollContent: {
    paddingVertical: 14,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  confirmCheckCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  confirmSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  rawSpeechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
  },
  rawSpeechText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    flex: 1,
    fontStyle: 'italic',
  },
  friendNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
  },
  friendNoticeText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  typeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  typeToggleExpenseActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  typeToggleIncomeActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  typeToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  typeToggleTextActive: {
    color: '#FFFFFF',
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    paddingVertical: 4,
  },
  fieldSection: {
    marginBottom: 16,
  },
  categoryChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  noteInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteTextInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  tryAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
  },
  tryAgainText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  saveConfirmBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stateNoticeContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 10,
  },
  stateNoticeIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stateNoticeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  stateNoticeSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  stateNoticeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  stateNoticeActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default VoiceTransactionModal;
