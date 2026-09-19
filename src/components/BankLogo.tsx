import React from 'react';
import Svg, { Rect, Circle, Path, G, Text as SvgText } from 'react-native-svg';

export type BankLogoId =
  | 'hdfc'
  | 'icici'
  | 'phonepe'
  | 'paytm'
  | 'gpay'
  | 'axis'
  | 'sbi'
  | 'bhim';

export interface BankLogoProps {
  id: BankLogoId;
  height?: number;
  width?: number;
}

const LOGO_CONFIGS: Record<BankLogoId, { viewBox: string; aspect: number }> = {
  hdfc: { viewBox: '0 0 92 20', aspect: 92 / 20 },
  icici: { viewBox: '0 0 88 20', aspect: 88 / 20 },
  phonepe: { viewBox: '0 0 82 20', aspect: 82 / 20 },
  paytm: { viewBox: '0 0 58 20', aspect: 58 / 20 },
  gpay: { viewBox: '0 0 60 20', aspect: 60 / 20 },
  axis: { viewBox: '0 0 90 20', aspect: 90 / 20 },
  sbi: { viewBox: '0 0 54 20', aspect: 54 / 20 },
  bhim: { viewBox: '0 0 60 20', aspect: 60 / 20 },
};

export const BankLogo: React.FC<BankLogoProps> = ({ id, height = 18, width }) => {
  const config = LOGO_CONFIGS[id];
  const svgWidth = width || (config ? Math.round(height * config.aspect) : 60);
  const viewBox = config?.viewBox || '0 0 60 20';

  switch (id) {
    case 'hdfc':
      // HDFC Bank: Navy blue & red emblem + navy text (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          {/* HDFC Red/Blue emblem */}
          <Rect x="0" y="1" width="18" height="18" rx="2" fill="#004C8F" />
          <Rect x="3" y="4" width="12" height="12" fill="#ED1C24" />
          <Rect x="7.5" y="1" width="3" height="18" fill="#004C8F" />
          <Rect x="0" y="8.5" width="18" height="3" fill="#004C8F" />
          <Rect x="6.5" y="7.5" width="5" height="5" fill="#FFFFFF" />
          {/* Brand Text */}
          <SvgText
            x="24"
            y="14.5"
            fill="#004C8F"
            fontSize="9.5"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="0.4"
          >
            HDFC BANK
          </SvgText>
        </Svg>
      );

    case 'icici':
      // ICICI Bank: Maroon & orange iconic symbol + text (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <Circle cx="9" cy="10" r="8.5" fill="#991B1E" />
          <Circle cx="9" cy="10" r="5" fill="#F37021" />
          <Circle cx="9" cy="10" r="2.2" fill="#FFFFFF" />
          <SvgText
            x="23"
            y="14.5"
            fill="#991B1E"
            fontSize="10"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="-0.2"
          >
            ICICI Bank
          </SvgText>
        </Svg>
      );

    case 'phonepe':
      // PhonePe: Purple circle with white 'पे' + purple text (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <Circle cx="9" cy="10" r="8.5" fill="#5F259F" />
          <Path
            d="M5.5 6.5 H12.5 M9 6.5 V13.5 M6.5 9.5 H11 A1.8 1.8 0 0 1 11 13 H8.5"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <SvgText
            x="23"
            y="14.5"
            fill="#5F259F"
            fontSize="11"
            fontWeight="900"
            fontFamily="sans-serif"
          >
            PhonePe
          </SvgText>
        </Svg>
      );

    case 'paytm':
      // Paytm: Dark Navy "pay" + Cyan "tm" (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <SvgText
            x="0"
            y="15"
            fill="#002E6E"
            fontSize="14.5"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="-0.5"
          >
            pay
          </SvgText>
          <SvgText
            x="28"
            y="15"
            fill="#00BAF2"
            fontSize="14.5"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="-0.5"
          >
            tm
          </SvgText>
        </Svg>
      );

    case 'gpay':
      // Google Pay: 4-color G + grey Pay (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <G transform="translate(1, 2) scale(0.72)">
            <Path
              d="M 21.5 11.2 C 21.5 10.4 21.4 9.7 21.3 9 L 11 9 L 11 13.3 L 16.9 13.3 C 16.6 14.8 15.7 16.1 14.4 17 L 14.4 20 L 18 20 C 20.1 18.1 21.5 15.2 21.5 11.2 Z"
              fill="#4285F4"
            />
            <Path
              d="M 11 22 C 14 22 16.5 21 18 19.5 L 14.4 16.6 C 13.5 17.2 12.3 17.6 11 17.6 C 8.1 17.6 5.6 15.6 4.7 12.9 L 1 12.9 L 1 16 C 2.8 19.5 6.6 22 11 22 Z"
              fill="#34A853"
            />
            <Path
              d="M 4.7 12.9 C 4.5 12.1 4.4 11.2 4.4 10.4 C 4.4 9.5 4.5 8.7 4.7 7.9 L 4.7 4.8 L 1 4.8 C 0.4 6.2 0 7.8 0 9.5 C 0 11.2 0.4 12.8 1 14.2 L 4.7 12.9 Z"
              fill="#FBBC05"
            />
            <Path
              d="M 11 3.2 C 12.6 3.2 14.1 3.8 15.2 4.8 L 18.1 1.9 C 16.3 0.7 13.9 0 11 0 C 6.6 0 2.8 2.5 1 6 L 4.7 9 C 5.6 6.3 8.1 4.3 11 3.2 Z"
              fill="#EA4335"
            />
          </G>
          <SvgText
            x="21"
            y="14.5"
            fill="#5F6368"
            fontSize="12"
            fontWeight="800"
            fontFamily="sans-serif"
          >
            Pay
          </SvgText>
        </Svg>
      );

    case 'axis':
      // Axis Bank: Burgundy inverted chevron + text (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <Path d="M1 3 L9 3 L15 17 L9 17 Z" fill="#861F41" />
          <Path d="M8 3 L14 17 L18 17 L12 3 Z" fill="#861F41" opacity="0.5" />
          <SvgText
            x="24"
            y="14.5"
            fill="#861F41"
            fontSize="9.5"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="0.4"
          >
            AXIS BANK
          </SvgText>
        </Svg>
      );

    case 'sbi':
      // State Bank of India: Cyan/Blue keyhole circle + text (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <Circle cx="9" cy="10" r="8" fill="#0284C7" />
          <Circle cx="9" cy="10" r="3" fill="#FFFFFF" />
          <Rect x="7.8" y="10" width="2.4" height="8" fill="#FFFFFF" />
          <SvgText
            x="23"
            y="14.5"
            fill="#0284C7"
            fontSize="12"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="0.5"
          >
            SBI
          </SvgText>
        </Svg>
      );

    case 'bhim':
      // BHIM UPI (transparent background)
      return (
        <Svg width={svgWidth} height={height} viewBox={viewBox}>
          <Path d="M1 3 L8 10 L1 17 L5 17 L12 10 L5 3 Z" fill="#F97316" />
          <Path d="M7 3 L14 10 L7 17 L11 17 L18 10 L11 3 Z" fill="#16A34A" />
          <SvgText
            x="22"
            y="14.5"
            fill="#0F172A"
            fontSize="12"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="0.5"
          >
            BHIM
          </SvgText>
        </Svg>
      );

    default:
      return null;
  }
};

export default BankLogo;
