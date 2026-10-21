import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isLowEndDevice } from '@/lib/devicePerf';

export default function AppLoadingSkeleton() {
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const orbitRotation = useRef(new Animated.Value(0)).current;

  // Bullet point animations (3 dots)
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations
    const entrance = Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 45, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);

    // Logo glow pulse
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    // Orbit around logo
    const orbit = Animated.loop(
      Animated.timing(orbitRotation, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Helper for smooth bullet dot wave
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 380,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 380,
            easing: Easing.bezier(0.5, 0, 0.75, 0),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 480 - delay)),
        ])
      );
    };

    const dot1Loop = createDotAnimation(dot1Anim, 0);
    const dot2Loop = createDotAnimation(dot2Anim, 160);
    const dot3Loop = createDotAnimation(dot3Anim, 320);

    const isLowEnd = isLowEndDevice();
    entrance.start();
    if (!isLowEnd) {
      glow.start();
      orbit.start();
    }
    dot1Loop.start();
    dot2Loop.start();
    dot3Loop.start();

    return () => {
      if (!isLowEnd) {
        glow.stop();
        orbit.stop();
      }
      dot1Loop.stop();
      dot2Loop.stop();
      dot3Loop.stop();
    };
  }, [dot1Anim, dot2Anim, dot3Anim, glowPulse, logoOpacity, logoScale, orbitRotation]);

  const orbitSpin = orbitRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.28] });

  // Bullet dot interpolations
  const getDotStyle = (anim: Animated.Value) => ({
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -10],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1.3],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 1],
    }),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7FAFC" />
      <View style={styles.content}>
        <Animated.View style={[styles.logoStage, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          <View style={styles.logoRing}>
            <View style={styles.logoInner}>
              <Text style={styles.rupee}>₹</Text>
            </View>
          </View>
          <Animated.View style={[styles.orbit, { transform: [{ rotate: orbitSpin }] }]}>
            <View style={[styles.orbitDot, styles.orbitDotGold]} />
            <View style={[styles.orbitDot, styles.orbitDotMint]} />
            <View style={[styles.orbitDot, styles.orbitDotBlue]} />
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ opacity: logoOpacity }}>
          <Text style={styles.brand}>Rupeo</Text>
          <Text style={styles.tagline}>Your money, made clear.</Text>
        </Animated.View>

        {/* Bullet Points Animated Loader */}
        <Animated.View style={[styles.loadingArea, { opacity: logoOpacity }]}>
          <View style={styles.bulletContainer}>
            <Animated.View style={[styles.bulletDot, styles.bulletDotGold, getDotStyle(dot1Anim)]} />
            <Animated.View style={[styles.bulletDot, styles.bulletDotAmber, getDotStyle(dot2Anim)]} />
            <Animated.View style={[styles.bulletDot, styles.bulletDotMint, getDotStyle(dot3Anim)]} />
          </View>
          <Text style={styles.statusText}>Preparing your finances</Text>
        </Animated.View>
      </View>
      <Text style={styles.footer}>SMART FINANCE TRACKER</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  logoStage: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  glow: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: '#FBBF24' },
  logoRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    padding: 5,
    backgroundColor: '#FBBF24',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.28,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoInner: {
    flex: 1,
    borderRadius: 53,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  rupee: { fontSize: 64, fontWeight: '900', color: '#0F172A', marginTop: -4 },
  orbit: { position: 'absolute', width: 146, height: 146, alignItems: 'center', justifyContent: 'flex-start' },
  orbitDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    top: 0,
    shadowOpacity: 0.8,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  orbitDotGold: { backgroundColor: '#FBBF24', shadowColor: '#FBBF24' },
  orbitDotMint: { backgroundColor: '#34D399', right: 8, top: 25, shadowColor: '#34D399' },
  orbitDotBlue: { backgroundColor: '#60A5FA', left: 8, top: 25, shadowColor: '#60A5FA' },
  brand: { color: '#0F172A', fontSize: 36, fontWeight: '900', letterSpacing: 0.3, textAlign: 'center' },
  tagline: { color: '#64748B', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  loadingArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
  },
  bulletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 24,
    marginBottom: 10,
  },
  bulletDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  bulletDotGold: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  bulletDotAmber: {
    backgroundColor: '#FBBF24',
    shadowColor: '#FBBF24',
  },
  bulletDotMint: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  statusText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textAlign: 'center',
    paddingBottom: 22,
  },
});
