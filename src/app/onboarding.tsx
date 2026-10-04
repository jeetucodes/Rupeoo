import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { requestNotificationPermissions } from '@/lib/notifications';
import Animated, { FadeInDown, ZoomIn, FadeIn, withRepeat, withTiming, useSharedValue, useAnimatedStyle, Easing } from 'react-native-reanimated';

const SLIDES = [
  {
    id: '1',
    title: 'Track Money',
    description: 'Log expenses instantly. No bank linking required.',
    icon: 'wallet',
  },
  {
    id: '2',
    title: 'Smart Insights',
    description: 'See exactly where your money goes with simple charts.',
    icon: 'bar-chart',
  },
  {
    id: '3',
    title: '100% Private',
    description: 'Your data stays on your device. Safe and secure.',
    icon: 'shield-checkmark',
  },
];

export default function OnboardingScreen() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const router = useRouter();

  // Floating background animation
  const floatAnim1 = useSharedValue(0);
  const floatAnim2 = useSharedValue(0);

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
    
    // Start floating background animation
    floatAnim1.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    floatAnim2.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: floatAnim1.value * 20 },
        { scale: 1 + floatAnim1.value * 0.1 },
      ],
    };
  });

  const animatedStyle2 = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: floatAnim2.value * -30 },
        { scale: 1 + floatAnim2.value * 0.15 },
      ],
    };
  });

  const handleNext = () => {
    requestNotificationPermissions().catch(() => {});
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.replace('/login');
    }
  };

  const slide = SLIDES[currentSlide];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.meshCircle1, animatedStyle1]} />
      <Animated.View style={[styles.meshCircle2, animatedStyle2]} />

      <View style={styles.content}>
        <Animated.View 
          key={`icon-${currentSlide}`}
          entering={ZoomIn.duration(600).springify()}
          style={styles.iconWrapper}
        >
          <View style={styles.iconRing}>
            <Ionicons name={slide.icon as any} size={80} color="#0F0F11" />
          </View>
          <Animated.View 
            entering={ZoomIn.delay(300).springify()}
            style={styles.sparkleBadge}
          >
            <Ionicons name="sparkles" size={20} color="#FFD740" />
          </Animated.View>
        </Animated.View>

        <View style={styles.textContainer}>
          <Animated.Text 
            key={`title-${currentSlide}`}
            entering={FadeInDown.duration(600).delay(200)}
            style={styles.title}
          >
            {slide.title}
          </Animated.Text>
          <Animated.Text 
            key={`desc-${currentSlide}`}
            entering={FadeInDown.duration(600).delay(350)}
            style={styles.description}
          >
            {slide.description}
          </Animated.Text>
        </View>
      </View>

      <Animated.View entering={FadeIn.delay(500)} style={styles.footer}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                currentSlide === index ? styles.activeDot : null,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleNext}>
          <Text style={styles.buttonText}>
            {currentSlide === SLIDES.length - 1 ? 'Get Started' : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={24} color="#0F0F11" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', // App background
  },
  meshCircle1: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255, 215, 64, 0.3)', // Accent Yellow
    filter: 'blur(10px)',
  },
  meshCircle2: {
    position: 'absolute',
    bottom: 50,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255, 215, 64, 0.15)', // Accent Yellow (lighter)
    filter: 'blur(10px)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  iconWrapper: {
    marginBottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#FFD740', // Theme Accent
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  sparkleBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0F0F11', // Theme Primary
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F0F11', // Theme Primary
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    color: '#60646C', // Theme textSecondary
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 15,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 50,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E8ECF2', // Theme border/light
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  activeDot: {
    backgroundColor: '#0F0F11', // Theme Primary
    borderColor: '#0F0F11',
    width: 32,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#FFD740', // Theme Accent
    paddingVertical: 18,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: {
    color: '#0F0F11', // Theme Primary
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
