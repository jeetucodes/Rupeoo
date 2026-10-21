import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { triggerCalculatorKeyVibration, triggerCalculatorActionVibration } from '@/lib/sound';

interface TransactionCalculatorModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (calculatedAmount: string) => void;
  initialAmount?: string;
  currencySymbol?: string;
  themeColor?: string;
}

export default function TransactionCalculatorModal({
  visible,
  onClose,
  onApply,
  initialAmount = '',
  currencySymbol = '₹',
  themeColor = '#EF4444',
}: TransactionCalculatorModalProps) {
  const [expression, setExpression] = useState('');
  const [previewResult, setPreviewResult] = useState('0');

  const backspaceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backspaceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isContinuousDeletingRef = useRef(false);

  const stopContinuousDelete = useCallback(() => {
    if (backspaceTimerRef.current) {
      clearTimeout(backspaceTimerRef.current);
      backspaceTimerRef.current = null;
    }
    if (backspaceIntervalRef.current) {
      clearInterval(backspaceIntervalRef.current);
      backspaceIntervalRef.current = null;
    }
  }, []);

  const deleteOneChar = useCallback(() => {
    setExpression(prev => {
      if (prev.length <= 1) {
        stopContinuousDelete();
        return '';
      }
      return prev.slice(0, -1);
    });
    triggerCalculatorKeyVibration();
  }, [stopContinuousDelete]);

  // Clean up timers on unmount or when modal visibility changes
  useEffect(() => {
    return () => {
      stopContinuousDelete();
    };
  }, [stopContinuousDelete]);

  useEffect(() => {
    if (!visible) {
      stopContinuousDelete();
    }
  }, [visible, stopContinuousDelete]);



  const handleBackspacePressIn = () => {
    isContinuousDeletingRef.current = false;
    stopContinuousDelete();

    // After 350ms of holding, delete one by one rapidly
    backspaceTimerRef.current = setTimeout(() => {
      isContinuousDeletingRef.current = true;
      deleteOneChar();
      backspaceIntervalRef.current = setInterval(() => {
        deleteOneChar();
      }, 75);
    }, 350);
  };

  const handleBackspacePressOut = () => {
    stopContinuousDelete();
  };

  const handleBackspacePress = () => {
    if (isContinuousDeletingRef.current) {
      isContinuousDeletingRef.current = false;
      return;
    }
    setExpression(prev => {
      if (prev.length <= 1) {
        stopContinuousDelete();
        return '';
      }
      return prev.slice(0, -1);
    });
    triggerCalculatorKeyVibration();
  };

  // Safe expression evaluator without eval()
  const evaluateMathExpression = (expr: string): number | null => {
    try {
      if (!expr || expr.trim() === '') return null;

      // Replace unicode operators with standard js operators
      let clean = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/\s+/g, '');

      // Remove trailing operators for preview
      clean = clean.replace(/[+\-*/%]+$/, '');
      if (!clean) return null;

      // Handle simple percentage: number% => number / 100
      clean = clean.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

      // Validate expression only contains valid chars
      if (!/^[\d+\-*/().]+$/.test(clean)) return null;

      // Safe evaluation using Function
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${clean})`)();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return Math.round(result * 100) / 100;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Reset or initialize on visibility change
  useEffect(() => {
    if (visible) {
      const init = initialAmount && !isNaN(parseFloat(initialAmount)) ? initialAmount : '';
      setExpression(init);
      const evalRes = evaluateMathExpression(init);
      setPreviewResult(evalRes !== null ? evalRes.toString() : init || '0');
    }
  }, [visible, initialAmount]);

  // Recalculate preview on expression change
  useEffect(() => {
    if (!expression) {
      setPreviewResult('0');
      return;
    }
    const res = evaluateMathExpression(expression);
    if (res !== null) {
      setPreviewResult(res.toString());
    }
  }, [expression]);

  const handleKeyPress = (char: string) => {
    const isAction = char === 'C' || char === '=';
    if (isAction) {
      triggerCalculatorActionVibration();
    } else {
      triggerCalculatorKeyVibration();
    }

    if (char === 'C') {
      setExpression('');
      setPreviewResult('0');
      return;
    }

    if (char === 'DEL') {
      deleteOneChar();
      return;
    }

    if (char === '=') {
      const res = evaluateMathExpression(expression);
      if (res !== null) {
        setExpression(res.toString());
        setPreviewResult(res.toString());
      }
      return;
    }

    // Operator handling
    const isOperator = ['+', '−', '×', '÷', '%'].includes(char);
    const lastChar = expression.slice(-1);
    const lastIsOperator = ['+', '−', '×', '÷', '%'].includes(lastChar);

    if (isOperator && expression === '') {
      if (char === '−') {
        setExpression('-');
      }
      return;
    }

    if (isOperator && lastIsOperator) {
      // Replace last operator
      setExpression(expression.slice(0, -1) + char);
      return;
    }

    if (char === '.') {
      // Find current active number chunk
      const parts = expression.split(/[+−×÷%]/);
      const currentNumber = parts[parts.length - 1];
      if (currentNumber.includes('.')) return;
      if (currentNumber === '') {
        setExpression(expression + '0.');
        return;
      }
    }

    if (char === '00') {
      if (expression === '' || lastIsOperator) {
        setExpression(expression + '0');
        return;
      }
    }

    setExpression((prev) => prev + char);
  };

  const handleApply = () => {
    triggerCalculatorActionVibration();
    const finalVal = evaluateMathExpression(expression);
    const resultToApply = finalVal !== null ? finalVal : parseFloat(previewResult) || 0;
    if (resultToApply > 0) {
      onApply(resultToApply.toString());
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.sheetContainer}>
              {/* Drag Handle */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={[styles.headerIconWrap, { backgroundColor: themeColor + '18' }]}>
                    <Ionicons name="calculator" size={20} color={themeColor} />
                  </View>
                  <Text style={styles.headerTitle}>Calculator</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Display Area */}
              <View style={styles.displayCard}>
                <Text style={styles.expressionText} numberOfLines={1} ellipsizeMode="head">
                  {expression || '0'}
                </Text>
                <View style={styles.resultRow}>
                  <Text style={[styles.currencyLabel, { color: themeColor }]}>{currencySymbol}</Text>
                  <Text style={styles.resultText} numberOfLines={1}>
                    {previewResult || '0'}
                  </Text>
                </View>
              </View>

              {/* Keypad Grid */}
              <View style={styles.keypad}>
                {/* Row 1 */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.clearBtn]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('C')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearBtnText}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.functionBtn]}
                    delayPressIn={0}
                    onPress={handleBackspacePress}
                    onPressIn={handleBackspacePressIn}
                    onPressOut={handleBackspacePressOut}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="backspace-outline" size={22} color="#0F172A" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.functionBtn]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('%')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.functionBtnText}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.operatorBtn, { backgroundColor: themeColor + '18' }]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('÷')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.operatorBtnText, { color: themeColor }]}>÷</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 2 */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('7')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>7</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('8')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>8</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('9')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>9</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.operatorBtn, { backgroundColor: themeColor + '18' }]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('×')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.operatorBtnText, { color: themeColor }]}>×</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 3 */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('4')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>4</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('5')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('6')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>6</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.operatorBtn, { backgroundColor: themeColor + '18' }]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('−')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.operatorBtnText, { color: themeColor }]}>−</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 4 */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('1')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>1</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('2')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>2</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('3')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>3</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.operatorBtn, { backgroundColor: themeColor + '18' }]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('+')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.operatorBtnText, { color: themeColor }]}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* Row 5 */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('00')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>00</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('0')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>0</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyBtn}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('.')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.numberBtnText}>.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyBtn, styles.equalsBtn, { backgroundColor: themeColor }]}
                    delayPressIn={0}
                    onPress={() => handleKeyPress('=')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.equalsBtnText}>=</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={styles.applyBtn}
                delayPressIn={0}
                onPress={handleApply}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={themeColor === '#EF4444' ? ['#FF5555', '#EF4444'] : ['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyGradient}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.applyBtnText}>
                    Apply Amount ({currencySymbol}{previewResult || '0'})
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const { width } = Dimensions.get('window');
const BUTTON_GAP = 10;
const BUTTON_WIDTH = (width - 48 - (BUTTON_GAP * 3)) / 4;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  expressionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
    minHeight: 20,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencyLabel: {
    fontSize: 22,
    fontWeight: '800',
    marginRight: 4,
  },
  resultText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  keypad: {
    gap: BUTTON_GAP,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: BUTTON_GAP,
  },
  keyBtn: {
    width: BUTTON_WIDTH,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  numberBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  clearBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  clearBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EF4444',
  },
  functionBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  functionBtnText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
  },
  operatorBtn: {
    borderWidth: 0,
  },
  operatorBtnText: {
    fontSize: 22,
    fontWeight: '800',
  },
  equalsBtn: {
    borderWidth: 0,
  },
  equalsBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  applyBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  applyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
