import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line as SvgLine } from 'react-native-svg';
import { colors } from '../theme';

// Minimal SVG line chart. points: [{ label, value }]. Optional band [lo, hi]
// draws a shaded reference range. No external chart dependency.
export default function TrendChart({
  points = [],
  height = 140,
  color = colors.accent,
  band,
  unit = '',
}) {
  const data = points.filter((p) => typeof p.value === 'number' && !isNaN(p.value));
  if (data.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textFaint, fontSize: 13 }}>Not enough data yet</Text>
      </View>
    );
  }

  const W = 320;
  const H = height;
  const padX = 8;
  const padY = 16;
  const values = data.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (band) {
    lo = Math.min(lo, band[0]);
    hi = Math.max(hi, band[1]);
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const range = hi - lo;
  const x = (i) => padX + (i * (W - padX * 2)) / (data.length - 1);
  const y = (v) => padY + (1 - (v - lo) / range) * (H - padY * 2);

  const path = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');

  const bandTop = band ? y(band[1]) : null;
  const bandBot = band ? y(band[0]) : null;

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {band ? (
          <Path
            d={`M ${padX} ${bandTop} L ${W - padX} ${bandTop} L ${W - padX} ${bandBot} L ${padX} ${bandBot} Z`}
            fill={colors.good}
            opacity={0.10}
          />
        ) : null}
        {band ? (
          <SvgLine x1={padX} y1={bandTop} x2={W - padX} y2={bandTop} stroke={colors.good} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
        ) : null}
        {band ? (
          <SvgLine x1={padX} y1={bandBot} x2={W - padX} y2={bandBot} stroke={colors.good} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
        ) : null}
        <Path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={color} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.textFaint, fontSize: 11 }}>
          {data[0].label}
        </Text>
        <Text style={{ color: colors.textFaint, fontSize: 11 }}>
          {data[data.length - 1].label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.textFaint, fontSize: 11 }}>
          low {lo.toFixed(range < 5 ? 1 : 0)}{unit}
        </Text>
        <Text style={{ color: colors.textFaint, fontSize: 11 }}>
          high {hi.toFixed(range < 5 ? 1 : 0)}{unit}
        </Text>
      </View>
    </View>
  );
}
