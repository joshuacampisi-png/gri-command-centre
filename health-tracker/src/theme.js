// Central design tokens. Dark, calm, clinical — readable at a glance.
export const colors = {
  bg: '#0B0F14',
  surface: '#141A22',
  surfaceAlt: '#1B232D',
  border: '#243040',
  text: '#E8EDF2',
  textDim: '#8A97A6',
  textFaint: '#5A6878',

  // Semantic scoring
  good: '#34D399', // optimal / in range
  ok: '#FBBF24', // pay attention
  warn: '#FB7185', // out of range / low
  info: '#60A5FA',
  accent: '#7C9CF4',

  // Oura domain colours
  sleep: '#8B7FF0',
  readiness: '#34D399',
  activity: '#F4A45C',
  stress: '#FB7185',
};

// Maps a 0-100 score to a colour band.
export function scoreColor(score) {
  if (score == null) return colors.textFaint;
  if (score >= 85) return colors.good;
  if (score >= 70) return colors.ok;
  return colors.warn;
}

export const spacing = (n) => n * 4;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const font = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.text },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  small: { fontSize: 13, color: colors.textDim },
  tiny: { fontSize: 11, color: colors.textFaint },
};
