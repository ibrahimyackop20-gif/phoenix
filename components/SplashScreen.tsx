import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, Text, Animated, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";

interface SplashScreenProps {
  onFinish: () => void;
  onReadyToHideNative: () => void;
}

const { width } = Dimensions.get("window");

export default function SplashScreen({ onFinish, onReadyToHideNative }: SplashScreenProps) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

  // Animated values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoEntrance = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const textEntrance = useRef(new Animated.Value(0)).current;
  const subtitleEntrance = useRef(new Animated.Value(0)).current;
  const orbPulse = useRef(new Animated.Value(0)).current;

  // Rotation animation for glow ring
  const glowRotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Notify layout that we are mounted and ready to hide native splash
    onReadyToHideNative();

    // 1. Orb pulse loop (4s, alternate)
    const orbLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(orbPulse, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );
    orbLoop.start();

    // 2. Glow rotation loop
    const rotationLoop = Animated.loop(
      Animated.timing(glowRotation, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      })
    );
    rotationLoop.start();

    // 3. Logo Entrance (1.2s)
    Animated.timing(logoEntrance, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    // 4. Logo Pulse loop starts after 1.2s delay
    let logoPulseLoop: Animated.CompositeAnimation | null = null;
    const logoPulseTimer = setTimeout(() => {
      logoPulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(logoPulse, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      logoPulseLoop.start();
    }, 1200);

    // 5. Glow Pulse loop starts after 1.2s delay
    let glowPulseLoop: Animated.CompositeAnimation | null = null;
    const glowPulseTimer = setTimeout(() => {
      glowPulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowPulse, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      glowPulseLoop.start();
    }, 1200);

    // 6. Text Entrance starts after 1.4s delay
    const textTimer = setTimeout(() => {
      Animated.timing(textEntrance, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 1400);

    // 7. Subtitle Entrance starts after 1.8s delay
    const subtitleTimer = setTimeout(() => {
      Animated.timing(subtitleEntrance, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 1800);

    // 8. Dismiss container after 3.0 seconds total, followed by 800ms fade-out
    const dismissTimer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setHidden(true);
        onFinish();
      });
    }, 3000);

    return () => {
      orbLoop.stop();
      rotationLoop.stop();
      if (logoPulseLoop) logoPulseLoop.stop();
      if (glowPulseLoop) glowPulseLoop.stop();
      clearTimeout(logoPulseTimer);
      clearTimeout(glowPulseTimer);
      clearTimeout(textTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(dismissTimer);
    };
  }, []);

  if (hidden) return null;

  // Interpolations
  const orb1Scale = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.1],
  });
  const orb1Opacity = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const orb2Scale = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.1, 0.9],
  });
  const orb2Opacity = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.4],
  });

  const logoScale = Animated.add(
    logoEntrance.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1.0],
    }),
    logoPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.05],
    })
  );

  const logoOpacity = logoEntrance;

  const glowRingScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.1],
  });

  const glowRingOpacity = Animated.multiply(
    logoEntrance,
    glowPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.6],
    })
  );

  const interpolatedRotation = glowRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const textY = textEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const subtitleY = subtitleEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Ambient glow orbs */}
      <Animated.View
        style={[
          styles.orb1,
          {
            opacity: orb1Opacity,
            transform: [{ scale: orb1Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb2,
          {
            opacity: orb2Opacity,
            transform: [{ scale: orb2Scale }],
          },
        ]}
      />

      {/* Phoenix logo container */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        {/* Glow ring behind logo */}
        <Animated.Image
          source={require("@/assets/images/logo-glow.png")}
          style={[
            styles.glowImage,
            {
              opacity: glowRingOpacity,
              transform: [{ scale: glowRingScale }, { rotate: interpolatedRotation }],
            },
          ]}
        />
        {/* Phoenix logo */}
        <Animated.Image
          source={require("@/assets/images/logo.png")}
          style={styles.logoImage}
        />
      </Animated.View>

      {/* Brand text */}
      <View style={styles.brandContainer}>
        {/* Title */}
        <Animated.View
          style={{
            opacity: textEntrance,
            transform: [{ translateY: textY }],
          }}
        >
          <Text style={styles.title}>{t("brand_name").toUpperCase()}</Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.View
          style={{
            opacity: subtitleEntrance,
            transform: [{ translateY: subtitleY }],
            marginTop: 6,
          }}
        >
          <Text style={styles.subtitle}>PRINTING & DESIGN</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
  },
  orb1: {
    position: "absolute",
    top: "15%",
    left: "50%",
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(234, 88, 12, 0.18)",
  },
  orb2: {
    position: "absolute",
    bottom: "25%",
    left: "50%",
    marginLeft: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: width > 768 ? 240 : 180,
    height: width > 768 ? 240 : 180,
    marginBottom: 24,
  },
  glowImage: {
    position: "absolute",
    width: "150%",
    height: "150%",
    resizeMode: "contain",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
    borderRadius: 90,
  },
  brandContainer: {
    alignItems: "center",
    marginTop: 10,
  },
  title: {
    fontSize: width > 768 ? 44 : 32,
    fontWeight: "900",
    color: "#ea580c",
    letterSpacing: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: width > 768 ? 14 : 10,
    fontWeight: "600",
    color: "rgba(161, 161, 170, 0.7)",
    letterSpacing: 5,
    textAlign: "center",
  },
});
