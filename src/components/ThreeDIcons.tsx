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

export interface ThreeDDoubleTickProps extends IconProps {
  boxStyle?: boolean;
}

/**
 * Premium 3D Isometric-styled Double Tick Icon (WhatsApp / Banking Reconciled style)
 * Features rich emerald depth, bevel rim, glass sheen, and extruded 3D double checkmarks.
 */
export const ThreeDDoubleTickIcon: React.FC<ThreeDDoubleTickProps> = ({ size = 26, boxStyle = false }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Defs>
        {/* Soft Ambient Base Glow */}
        <RadialGradient id="tickDropGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
          <Stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </RadialGradient>

        {/* 3D Depth Slab Extrusion (Bottom bevel) */}
        <LinearGradient id="tickSlabExtrusion" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#047857" />
          <Stop offset="100%" stopColor="#064E3B" />
        </LinearGradient>

        {/* Front Glossy Face Gradient */}
        <LinearGradient id="tickFrontFace" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0%" stopColor="#34D399" />
          <Stop offset="45%" stopColor="#10B981" />
          <Stop offset="100%" stopColor="#059669" />
        </LinearGradient>

        {/* Top Rim Specular Bevel Highlight */}
        <LinearGradient id="tickRimBevel" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <Stop offset="100%" stopColor="#059669" stopOpacity="0.1" />
        </LinearGradient>

        {/* 3D Checkmark Bottom Shadow */}
        <LinearGradient id="check3dShadow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#064E3B" />
          <Stop offset="100%" stopColor="#022C22" />
        </LinearGradient>
      </Defs>

      {/* Ambient Soft Drop Shadow */}
      <Rect x="4" y="30" width="28" height="5" rx="2.5" fill="url(#tickDropGlow)" />

      {/* 3D Base Slab (Extrusion) */}
      <Rect
        x="3.5"
        y="7"
        width="29"
        height="23"
        rx={boxStyle ? 1 : 11.5}
        fill="url(#tickSlabExtrusion)"
      />

      {/* Front Surface Face */}
      <Rect
        x="3.5"
        y="5"
        width="29"
        height="23"
        rx={boxStyle ? 1 : 11.5}
        fill="url(#tickFrontFace)"
        stroke="url(#tickRimBevel)"
        strokeWidth="1.2"
      />

      {/* Specular Diagonal Sheen (Glass effect) */}
      <Path
        d="M 4 14 L 18 5 L 23 5 L 4 19 Z"
        fill="rgba(255, 255, 255, 0.28)"
      />

      {/* Top Specular Rim */}
      <Path
        d="M 7 6.2 L 29 6.2"
        stroke="rgba(255, 255, 255, 0.7)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* === 3D DOUBLE TICK MARKS === */}
      {/* Left Checkmark Shadow Layer */}
      <Path
        d="M 8.5 17.2 L 13.5 22.2 L 21.5 13.2"
        stroke="url(#check3dShadow)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left Checkmark Pure White Layer */}
      <Path
        d="M 8 16 L 13 21 L 21 12"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left Checkmark Specular Glint */}
      <Path
        d="M 13.5 20.2 L 20.2 12.2"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="0.9"
        strokeLinecap="round"
      />

      {/* Right Checkmark Shadow Layer */}
      <Path
        d="M 15 17.2 L 19 22.2 L 27.5 13.2"
        stroke="url(#check3dShadow)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right Checkmark Pure White Layer */}
      <Path
        d="M 14.5 16 L 18.5 21 L 27 12"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right Checkmark Specular Glint */}
      <Path
        d="M 19 20.2 L 26.2 12.2"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </Svg>
  );
};

/**
 * Premium 3D Isometric-styled Pending Clock Icon (Matching pair for settlements)
 */
export const ThreeDPendingClockIcon: React.FC<IconProps & { boxStyle?: boolean }> = ({ size = 26, boxStyle = false }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Defs>
        <RadialGradient id="clockDropGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="clockSlabExtrusion" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#B45309" />
          <Stop offset="100%" stopColor="#78350F" />
        </LinearGradient>
        <LinearGradient id="clockFrontFace" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0%" stopColor="#FBBF24" />
          <Stop offset="50%" stopColor="#F59E0B" />
          <Stop offset="100%" stopColor="#D97706" />
        </LinearGradient>
        <LinearGradient id="clockRimBevel" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <Stop offset="100%" stopColor="#B45309" stopOpacity="0.1" />
        </LinearGradient>
      </Defs>

      <Rect x="4" y="30" width="28" height="5" rx="2.5" fill="url(#clockDropGlow)" />
      <Rect x="3.5" y="7" width="29" height="23" rx={boxStyle ? 1 : 11.5} fill="url(#clockSlabExtrusion)" />
      <Rect
        x="3.5"
        y="5"
        width="29"
        height="23"
        rx={boxStyle ? 1 : 11.5}
        fill="url(#clockFrontFace)"
        stroke="url(#clockRimBevel)"
        strokeWidth="1.2"
      />
      <Path d="M 4 14 L 18 5 L 23 5 L 4 19 Z" fill="rgba(255, 255, 255, 0.28)" />
      <Path d="M 7 6.2 L 29 6.2" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1" strokeLinecap="round" />

      {/* Clock Dial & Hands */}
      <Circle cx="18" cy="16.5" r="7.5" fill="#78350F" opacity={0.25} />
      <Circle cx="18" cy="16.5" r="7" stroke="#FFFFFF" strokeWidth="1.8" />
      {/* Shadow Hands */}
      <Path d="M 18 12.5 L 18 17.5 L 21.5 17.5" stroke="#78350F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Crisp White Hands */}
      <Path d="M 18 11.5 L 18 16.5 L 21.5 16.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="18" cy="16.5" r="1.3" fill="#FFFFFF" />
    </Svg>
  );
};

/**
 * Premium 3D Standalone Single Checkmark (Direct tick with 3D gradient stroke & shadow)
 */
export const ThreeDSingleCheckIcon: React.FC<IconProps & { color?: string }> = ({ size = 20 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id="singleCheckGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#4ADE80" />
          <Stop offset="50%" stopColor="#10B981" />
          <Stop offset="100%" stopColor="#059669" />
        </LinearGradient>
      </Defs>
      {/* 3D Extrusion Shadow */}
      <Path
        d="M 4.5 13.5 L 9.5 18.5 L 20.5 7.5"
        stroke="#064E3B"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Front Glossy Check */}
      <Path
        d="M 4 12 L 9 17 L 20 6"
        stroke="url(#singleCheckGrad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Specular Highlight */}
      <Path
        d="M 9.5 16 L 19 6.5"
        stroke="rgba(255, 255, 255, 0.85)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  );
};

