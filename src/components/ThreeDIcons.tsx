import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Path,
  Circle,
  G,
} from 'react-native-svg';

interface IconProps {
  size?: number;
}

/**
 * Premium 3D Isometric-styled Calendar Icon
 * Features rich depth bevel, glossy top header, metallic binder rings, and calendar grid.
 */
export const ThreeDCalendarIcon: React.FC<IconProps> = ({ size = 26 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Defs>
        {/* 3D Bottom Slab Extrusion */}
        <LinearGradient id="calDepth" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#BE123C" />
          <Stop offset="100%" stopColor="#881337" />
        </LinearGradient>

        {/* Calendar Body Surface */}
        <LinearGradient id="calSurface" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#F1F5F9" />
        </LinearGradient>

        {/* 3D Header Bar */}
        <LinearGradient id="calHeaderBar" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FB7185" />
          <Stop offset="50%" stopColor="#E11D48" />
          <Stop offset="100%" stopColor="#BE123C" />
        </LinearGradient>

        {/* Metallic Chrome Ring Gradient */}
        <LinearGradient id="calRing" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="30%" stopColor="#CBD5E1" />
          <Stop offset="70%" stopColor="#64748B" />
          <Stop offset="100%" stopColor="#334155" />
        </LinearGradient>

        {/* Ambient Drop Shadow */}
        <RadialGradient id="calDropShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#E11D48" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#E11D48" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Ambient Glow / Soft Base Shadow */}
      <Rect x="4" y="29" width="28" height="5" rx="2.5" fill="url(#calDropShadow)" />

      {/* 3D Depth Base (Extrusion) */}
      <Rect x="3.5" y="7" width="29" height="23" rx="6" fill="url(#calDepth)" />

      {/* Front Surface Plate */}
      <Rect x="3.5" y="5.5" width="29" height="22.5" rx="6" fill="url(#calSurface)" />

      {/* Top Header Bar */}
      <Path
        d="M 3.5 11.5 C 3.5 8.2 6.2 5.5 9.5 5.5 L 26.5 5.5 C 29.8 5.5 32.5 8.2 32.5 11.5 L 32.5 14 L 3.5 14 Z"
        fill="url(#calHeaderBar)"
      />

      {/* Header Gloss Highlight Stripe */}
      <Path
        d="M 5.5 7 C 7 6 9 5.8 11.5 5.8 L 24.5 5.8 C 27 5.8 29 6 30.5 7"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Binder Rings (Left & Right) */}
      <Rect x="9" y="3" width="2.8" height="5" rx="1.4" fill="url(#calRing)" />
      <Rect x="24.2" y="3" width="2.8" height="5" rx="1.4" fill="url(#calRing)" />

      {/* Calendar Grid / Number Emboss */}
      {/* Row 1 */}
      <Circle cx="10" cy="18" r="1.3" fill="#E11D48" />
      <Circle cx="15.3" cy="18" r="1.3" fill="#E11D48" />
      <Circle cx="20.7" cy="18" r="1.3" fill="#E11D48" />
      <Circle cx="26" cy="18" r="1.3" fill="#CBD5E1" />

      {/* Row 2 */}
      <Circle cx="10" cy="22.5" r="1.3" fill="#CBD5E1" />
      <Rect x="13.8" y="21.3" width="8.4" height="2.4" rx="1.2" fill="#E11D48" />
      <Circle cx="26" cy="22.5" r="1.3" fill="#CBD5E1" />

      {/* Specular Diagonal Sheen (Glass effect) */}
      <Path
        d="M 4 14 L 20 5.5 L 24 5.5 L 4 17.5 Z"
        fill="rgba(255, 255, 255, 0.22)"
      />
    </Svg>
  );
};

/**
 * Premium 3D Isometric-styled QR Pay Icon
 * Features rich indigo depth, rounded scanner plate, finder modules, and glowing laser scanner.
 */
export const ThreeDQRCodeIcon: React.FC<IconProps> = ({ size = 26 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Defs>
        {/* 3D Depth Slab Extrusion */}
        <LinearGradient id="qrDepth" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#4338CA" />
          <Stop offset="100%" stopColor="#1E1B4B" />
        </LinearGradient>

        {/* Scanner Surface */}
        <LinearGradient id="qrSurface" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#EEF2FF" />
        </LinearGradient>

        {/* Finder Module Color */}
        <LinearGradient id="qrFinderGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#4F46E5" />
          <Stop offset="100%" stopColor="#312E81" />
        </LinearGradient>

        {/* Glowing Laser Scan Bar */}
        <LinearGradient id="qrLaser" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.2" />
          <Stop offset="30%" stopColor="#38BDF8" />
          <Stop offset="50%" stopColor="#06B6D4" />
          <Stop offset="70%" stopColor="#38BDF8" />
          <Stop offset="100%" stopColor="#38BDF8" stopOpacity="0.2" />
        </LinearGradient>

        {/* Ambient Drop Shadow */}
        <RadialGradient id="qrDropShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#4F46E5" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Ambient Glow / Soft Base Shadow */}
      <Rect x="4" y="29" width="28" height="5" rx="2.5" fill="url(#qrDropShadow)" />

      {/* 3D Depth Base (Extrusion) */}
      <Rect x="3.5" y="7" width="29" height="23" rx="6" fill="url(#qrDepth)" />

      {/* Front Surface Plate */}
      <Rect x="3.5" y="5.5" width="29" height="22.5" rx="6" fill="url(#qrSurface)" />

      {/* Top-Left Finder Module */}
      <Rect
        x="7.5"
        y="9.5"
        width="7"
        height="7"
        rx="2"
        stroke="url(#qrFinderGrad)"
        strokeWidth="1.6"
      />
      <Rect x="9.5" y="11.5" width="3" height="3" rx="0.8" fill="url(#qrFinderGrad)" />

      {/* Top-Right Finder Module */}
      <Rect
        x="21.5"
        y="9.5"
        width="7"
        height="7"
        rx="2"
        stroke="url(#qrFinderGrad)"
        strokeWidth="1.6"
      />
      <Rect x="23.5" y="11.5" width="3" height="3" rx="0.8" fill="url(#qrFinderGrad)" />

      {/* Bottom-Left Finder Module */}
      <Rect
        x="7.5"
        y="19"
        width="7"
        height="7"
        rx="2"
        stroke="url(#qrFinderGrad)"
        strokeWidth="1.6"
      />
      <Rect x="9.5" y="21" width="3" height="3" rx="0.8" fill="url(#qrFinderGrad)" />

      {/* Data Bits (Bottom-Right & Center) */}
      <Rect x="21.5" y="19" width="2.6" height="2.6" rx="0.7" fill="#4338CA" />
      <Rect x="25.9" y="19" width="2.6" height="2.6" rx="0.7" fill="#6366F1" />
      <Rect x="21.5" y="23.4" width="2.6" height="2.6" rx="0.7" fill="#6366F1" />
      <Rect x="25.9" y="23.4" width="2.6" height="2.6" rx="0.7" fill="#4338CA" />
      <Rect x="16.7" y="14" width="2.6" height="2.6" rx="0.7" fill="#4F46E5" />

      {/* Glowing 3D Laser Beam */}
      <Rect x="4" y="16.5" width="28" height="1.8" rx="0.9" fill="url(#qrLaser)" />

      {/* Specular Diagonal Sheen (Glass effect) */}
      <Path
        d="M 4 14 L 20 5.5 L 24 5.5 L 4 17.5 Z"
        fill="rgba(255, 255, 255, 0.22)"
      />
    </Svg>
  );
};
