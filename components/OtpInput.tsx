import React, { useRef, useState, useEffect } from "react";
import {
  StyleSheet,
  TextInput,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";

interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
}

const { width: screenWidth } = Dimensions.get("window");
const isSmallScreen = screenWidth < 380;

const INPUT_SIZE = isSmallScreen ? 40 : 52;
const INPUT_HEIGHT = isSmallScreen ? 50 : 64;

export default function OtpInput({
  length = 6,
  onComplete,
  disabled = false,
  error = false,
}: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Shake animation on error
  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 300);

      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [error, length, shakeAnim]);

  const handleChangeText = (index: number, text: string) => {
    // Handle pasting / multiple characters
    if (text.length > 1) {
      const digitsOnly = text.replace(/\D/g, "").slice(0, length);
      if (digitsOnly) {
        const newValues = [...values];
        for (let idx = 0; idx < digitsOnly.length; idx++) {
          newValues[idx] = digitsOnly[idx] || "";
        }
        setValues(newValues);

        const nextFocusIndex = Math.min(digitsOnly.length, length - 1);
        inputRefs.current[nextFocusIndex]?.focus();

        const code = newValues.join("");
        if (code.length === length && !newValues.includes("")) {
          onComplete(code);
        }
      }
      return;
    }

    const digit = text.replace(/\D/g, "");
    const newValues = [...values];
    newValues[index] = digit;
    setValues(newValues);

    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const code = newValues.join("");
    if (code.length === length && !newValues.includes("")) {
      onComplete(code);
    }
  };

  const handleKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === "Backspace") {
      if (values[index]) {
        const newValues = [...values];
        newValues[index] = "";
        setValues(newValues);
      } else if (index > 0) {
        const newValues = [...values];
        newValues[index - 1] = "";
        setValues(newValues);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      {values.map((val, i) => {
        const isFocused = focusedIndex === i;
        const inputStyle = [
          styles.input,
          error
            ? styles.inputError
            : val
            ? styles.inputFilled
            : styles.inputDefault,
          isFocused && styles.inputFocused,
          disabled && styles.inputDisabled,
        ];

        return (
          <TextInput
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            style={inputStyle}
            keyboardType="numeric"
            maxLength={1}
            value={val}
            onChangeText={(text) => handleChangeText(i, text)}
            onKeyPress={(e) => handleKeyPress(i, e)}
            editable={!disabled}
            placeholderTextColor="#71717a"
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex(null)}
            selectTextOnFocus
            textAlign="center"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: isSmallScreen ? 6 : 10,
  },
  input: {
    width: INPUT_SIZE,
    height: INPUT_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "rgba(24, 24, 27, 0.65)",
    color: "#ffffff",
    fontSize: isSmallScreen ? 18 : 22,
    fontWeight: "bold",
    textAlign: "center",
  },
  inputDefault: {
    borderColor: "#3f3f46", // border-border
  },
  inputFilled: {
    borderColor: "#ea580c", // border-primary
    color: "#ea580c", // text-primary
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
  },
  inputFocused: {
    borderColor: "#ea580c", // focus:border-primary
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  inputError: {
    borderColor: "#ef4444", // border-danger
    color: "#ef4444", // text-danger
  },
  inputDisabled: {
    opacity: 0.4,
  },
});
