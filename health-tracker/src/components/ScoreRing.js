import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, scoreColor } from '../theme';

// Circular 0-100 score ring. Colour bands by score.
export default function ScoreRing({ score, label, size = 96, stroke = 9, color }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const ringColor = color || scoreColor(score);

  return (
    <View style={{ alignItems: 'center', width: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', width: size }}>
        <Text style={{ fontSize: size * 0.28, fontWeight: '700', color: colors.text }}>
          {score == null ? '—' : Math.round(score)}
        </Text>
      </View>
      {label ? (
        <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 6 }}>{label}</Text>
      ) : null}
    </View>
  );
}
