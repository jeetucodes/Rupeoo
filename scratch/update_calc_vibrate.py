with open('src/components/TransactionCalculatorModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace handleBackspacePressIn and handleBackspacePress
old_bs = '''  const handleBackspacePressIn = () => {
    handleTouchDown(false);
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
    if (!didVibrateOnTouchRef.current) {
      triggerCalculatorKeyVibration();
    }
    didVibrateOnTouchRef.current = false;
  };'''

new_bs = '''  const handleBackspacePressIn = () => {
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
  };'''

content = content.replace(old_bs, new_bs)

# Remove onPressIn={() => handleTouchDown(...)}
import re
content = re.sub(r'\s*onPressIn=\{\(\) => handleTouchDown\([^)]*\)\}', '', content)

# Remove unused handleTouchDown and didVibrateOnTouchRef
old_touch_ref = '''  const didVibrateOnTouchRef = useRef(false);

  const handleTouchDown = (isAction = false) => {
    didVibrateOnTouchRef.current = true;
    if (isAction) {
      triggerCalculatorActionVibration();
    } else {
      triggerCalculatorKeyVibration();
    }
  };'''

content = content.replace(old_touch_ref, '')

with open('src/components/TransactionCalculatorModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated TransactionCalculatorModal cleanly')
