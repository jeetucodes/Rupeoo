import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

// Standard ISO/IEC 16388 Code 39 Character Set Table
// Each character: 9 elements (5 bars at indices 0,2,4,6,8 and 4 spaces at indices 1,3,5,7)
// '0' = narrow (1 module), '1' = wide (2.5 modules)
const CODE39_ENCODINGS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  'A': '100001001',
  'B': '001001001',
  'C': '101001000',
  'D': '000011001',
  'E': '100011000',
  'F': '001011000',
  'G': '000001101',
  'H': '100001100',
  'I': '001001100',
  'J': '000011100',
  'K': '100000011',
  'L': '001000011',
  'M': '101000010',
  'N': '000010011',
  'O': '100010010',
  'P': '001010010',
  'Q': '000000111',
  'R': '100000110',
  'S': '001000110',
  'T': '000010110',
  'U': '110000001',
  'V': '011000001',
  'W': '111000000',
  'X': '010010001',
  'Y': '110010000',
  'Z': '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '$': '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100', // Standard start/stop delimiter
};

interface ScannableBarcodeProps {
  value: string;
  width?: number;
  height?: number;
}

export const ScannableBarcode: React.FC<ScannableBarcodeProps> = ({
  value,
  width = 280,
  height = 50,
}) => {
  // Clean string to valid Code 39 characters
  const sanitized = (value || 'TXN000')
    .toUpperCase()
    .replace(/[^0-9A-Z\-]/g, '')
    .slice(0, 16);

  const payload = sanitized.length > 0 ? sanitized : 'TXN000';
  const fullText = `*${payload}*`;

  // Each character takes: 6 narrow (1) + 3 wide (2.5) = 13.5 modules
  // Plus 1 narrow inter-character gap (except after the last character)
  // Plus standard quiet zone (10 modules on left, 10 modules on right)
  const charCount = fullText.length;
  const totalModules = (charCount - 1) * 14.5 + 13.5 + 20;
  const unit = width / totalModules;
  const narrowWidth = unit;
  const wideWidth = unit * 2.5;
  const quietZone = unit * 10;

  const bars: { x: number; width: number }[] = [];
  let curX = quietZone;

  for (let c = 0; c < charCount; c++) {
    const char = fullText[c];
    const pattern = CODE39_ENCODINGS[char] || CODE39_ENCODINGS['-'];

    for (let e = 0; e < 9; e++) {
      const isBar = e % 2 === 0;
      const isWide = pattern[e] === '1';
      const w = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        bars.push({
          x: curX,
          width: w,
        });
      }
      curX += w;
    }

    // Inter-character narrow space gap
    if (c < charCount - 1) {
      curX += narrowWidth;
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.barcodeBox, { width, height }]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Pure solid white background for high optical contrast */}
          <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />

          {/* Solid pure black barcode lines */}
          {bars.map((bar, idx) => (
            <Rect
              key={idx}
              x={bar.x}
              y={2}
              width={bar.width}
              height={height - 4}
              fill="#000000"
            />
          ))}
        </Svg>
      </View>

      {/* Human Readable Interpretation (HRI) text */}
      <Text style={styles.captionText}>
        * {payload} *
      </Text>
      <View style={styles.badgeRow}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>
          RUPEO · CODE 39 SCANNABLE RECORD
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 10,
  },
  barcodeBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    // Subtle shadow so the white card pops cleanly
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  captionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 2,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

export default ScannableBarcode;
