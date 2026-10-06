import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { requestNotificationPermissions } from '@/lib/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    titlePrefix: 'Track ',
    titleHighlight: 'Money',
    description: 'Log expenses instantly.\nNo bank linking required.',
    image: require('@/assets/images/onboarding_track_money.png'),
    buttonText: 'Continue',
  },
  {
    id: '2',
    titlePrefix: 'Smart ',
    titleHighlight: 'Insights',
    description: 'See exactly where your money goes\nwith simple charts.',
    image: require('@/assets/images/onboarding_smart_insights.png'),
    buttonText: 'Continue',
  },
  {
    id: '3',
    titlePrefix: '100% ',
    titleHighlight: 'Private',
    description: 'Your data stays on your device.\nSafe and secure.',
    image: require('@/assets/images/onboarding_private.png'),
    buttonText: 'Get Started',
  },
];

export default function OnboardingScreen() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const router = useRouter();

  // Gentle ambient background animation
  const floatAnim1 = useSharedValue(0);
  const floatAnim2 = useSharedValue(0);

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});

    floatAnim1.value = withRepeat(
      withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    floatAnim2.value = withRepeat(
      withTiming(1, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedBlob1 = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatAnim1.value * 15 },
      { scale: 1 + floatAnim1.value * 0.08 },
    ],
  }));

  const animatedBlob2 = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatAnim2.value * -18 },
      { scale: 1 + floatAnim2.value * 0.1 },
    ],
  }));

  const handleNext = () => {
    requestNotificationPermissions().catch(() => {});
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.replace('/login');
    }
  };

  const handleSkip = () => {
    requestNotificationPermissions().catch(() => {});
    router.replace('/login');
  };

  // Swipe gesture support
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 30;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx < -50) {
        // Swiped Left -> Next
        if (currentSlide < SLIDES.length - 1) {
          setCurrentSlide((prev) => prev + 1);
        } else {
          router.replace('/login');
        }
      } else if (gestureState.dx > 50) {
        // Swiped Right -> Previous
        if (currentSlide > 0) {
          setCurrentSlide((prev) => prev - 1);
        }
      }
    },
  });

  const slide = SLIDES[currentSlide];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Ambient Warm Golden Blobs */}
      <Animated.View style={[styles.ambientBlobTop, animatedBlob1]} />
      <Animated.View style={[styles.ambientBlobBottom, animatedBlob2]} />

      {/* Top Bar with Skip Button */}
      <View style={styles.topBar}>
        <View style={{ width: 60 }} />
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Center Slide Body with Swipe gesture */}
      <View style={styles.content} {...panResponder.panHandlers}>
        {/* 3D Illustration */}
        <Animated.View
          key={`img-${currentSlide}`}
          entering={FadeIn.duration(450)}
          style={styles.imageWrapper}
        >
          <Image
            source={slide.image}
            style={styles.illustration}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Text Section */}
        <Animated.View
          key={`text-${currentSlide}`}
          entering={FadeInDown.duration(450)}
          style={styles.textContainer}
        >
          <Text style={styles.title}>
            {slide.titlePrefix}
            <Text style={styles.titleHighlight}>{slide.titleHighlight}</Text>
          </Text>
          <Text style={styles.description}>{slide.description}</Text>
        </Animated.View>
      </View>

      {/* Footer: Pagination Dots & Action Pill Button */}
      <View style={styles.footer}>
        {/* Pagination Dots */}
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentSlide === index ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.85}
          onPress={handleNext}
        >
          <Text style={styles.buttonText}>{slide.buttonText}</Text>
          <Ionicons name="arrow-forward" size={19} color="#0F172A" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFCF7', // Warm ivory cream background from reference
  },
  ambientBlobTop: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(254, 240, 138, 0.45)',
  },
  ambientBlobBottom: {
    position: 'absolute',
    bottom: 80,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(253, 224, 71, 0.25)',
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  imageWrapper: {
    width: SCREEN_WIDTH * 0.72,
    height: SCREEN_WIDTH * 0.72,
    maxWidth: 270,
    maxHeight: 270,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleHighlight: {
    color: '#EAB308', // Vibrant warm gold accent
  },
  description: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    backgroundColor: '#0F172A',
  },
  inactiveDot: {
    backgroundColor: '#CBD5E1',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#FFCA28', // Warm rich golden yellow from reference
    height: 56,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
