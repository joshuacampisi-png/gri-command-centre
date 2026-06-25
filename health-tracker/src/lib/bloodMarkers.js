// Built-in reference library of common blood markers, Australian units.
// Reference ranges are typical adult-female ranges where sex-specific.
// NOTE: ranges vary by lab, age, and cycle phase — always defer to the
// reference interval printed on her actual pathology report. Not medical advice.

export const CATEGORIES = [
  'Haematology',
  'Iron studies',
  'Lipids',
  'Metabolic',
  'Liver',
  'Kidney',
  'Thyroid',
  'Vitamins',
  'Hormones',
  'Inflammation',
  'Electrolytes',
];

export const MARKERS = [
  // Haematology
  { id: 'hb', name: 'Haemoglobin', category: 'Haematology', unit: 'g/L', low: 115, high: 160, optimalLow: 125, optimalHigh: 150, desc: 'Oxygen-carrying capacity. Low = anaemia.' },
  { id: 'rbc', name: 'Red cell count', category: 'Haematology', unit: '×10¹²/L', low: 3.8, high: 5.2, desc: 'Number of red blood cells.' },
  { id: 'hct', name: 'Haematocrit', category: 'Haematology', unit: 'ratio', low: 0.33, high: 0.47, desc: 'Proportion of blood that is red cells.' },
  { id: 'mcv', name: 'MCV', category: 'Haematology', unit: 'fL', low: 80, high: 100, desc: 'Average red cell size. Low with iron deficiency.' },
  { id: 'wbc', name: 'White cell count', category: 'Haematology', unit: '×10⁹/L', low: 4.0, high: 11.0, desc: 'Immune cells. High can mean infection.' },
  { id: 'plt', name: 'Platelets', category: 'Haematology', unit: '×10⁹/L', low: 150, high: 400, desc: 'Clotting cells.' },

  // Iron studies
  { id: 'ferritin', name: 'Ferritin', category: 'Iron studies', unit: 'µg/L', low: 15, high: 200, optimalLow: 50, optimalHigh: 150, desc: 'Iron stores. Best single marker for iron deficiency; <30 often symptomatic.' },
  { id: 'iron', name: 'Serum iron', category: 'Iron studies', unit: 'µmol/L', low: 10, high: 30, desc: 'Circulating iron (fluctuates daily).' },
  { id: 'transferrin', name: 'Transferrin', category: 'Iron studies', unit: 'g/L', low: 2.0, high: 3.6, desc: 'Iron transport protein. Rises in deficiency.' },
  { id: 'tsat', name: 'Transferrin saturation', category: 'Iron studies', unit: '%', low: 15, high: 45, desc: 'How saturated transport is with iron.' },

  // Lipids
  { id: 'chol', name: 'Total cholesterol', category: 'Lipids', unit: 'mmol/L', low: 0, high: 5.5, optimalHigh: 5.0, desc: 'Total blood cholesterol.' },
  { id: 'ldl', name: 'LDL cholesterol', category: 'Lipids', unit: 'mmol/L', low: 0, high: 3.5, optimalHigh: 2.0, desc: '"Bad" cholesterol — lower is better.' },
  { id: 'hdl', name: 'HDL cholesterol', category: 'Lipids', unit: 'mmol/L', low: 1.3, high: 3.0, higherIsBetter: true, desc: '"Good" cholesterol — higher is protective.' },
  { id: 'trig', name: 'Triglycerides', category: 'Lipids', unit: 'mmol/L', low: 0, high: 1.7, optimalHigh: 1.0, desc: 'Blood fats. Lower is better.' },

  // Metabolic
  { id: 'glucose', name: 'Fasting glucose', category: 'Metabolic', unit: 'mmol/L', low: 3.0, high: 5.5, optimalHigh: 5.0, desc: 'Blood sugar after fasting.' },
  { id: 'hba1c', name: 'HbA1c', category: 'Metabolic', unit: '%', low: 4.0, high: 6.0, optimalHigh: 5.4, desc: 'Average blood sugar over ~3 months.' },
  { id: 'insulin', name: 'Fasting insulin', category: 'Metabolic', unit: 'mIU/L', low: 2, high: 10, optimalHigh: 8, desc: 'High suggests insulin resistance.' },

  // Liver
  { id: 'alt', name: 'ALT', category: 'Liver', unit: 'U/L', low: 0, high: 34, desc: 'Liver enzyme.' },
  { id: 'ast', name: 'AST', category: 'Liver', unit: 'U/L', low: 0, high: 31, desc: 'Liver/muscle enzyme.' },
  { id: 'ggt', name: 'GGT', category: 'Liver', unit: 'U/L', low: 0, high: 38, desc: 'Liver enzyme, sensitive to alcohol.' },
  { id: 'alp', name: 'ALP', category: 'Liver', unit: 'U/L', low: 30, high: 110, desc: 'Liver/bone enzyme.' },
  { id: 'bili', name: 'Bilirubin (total)', category: 'Liver', unit: 'µmol/L', low: 2, high: 24, desc: 'Breakdown product of red cells.' },

  // Kidney
  { id: 'creat', name: 'Creatinine', category: 'Kidney', unit: 'µmol/L', low: 45, high: 90, desc: 'Kidney filtration marker.' },
  { id: 'egfr', name: 'eGFR', category: 'Kidney', unit: 'mL/min/1.73m²', low: 90, high: 200, higherIsBetter: true, desc: 'Estimated kidney filtration rate.' },
  { id: 'urea', name: 'Urea', category: 'Kidney', unit: 'mmol/L', low: 2.5, high: 7.5, desc: 'Protein waste product.' },
  { id: 'uric', name: 'Uric acid', category: 'Kidney', unit: 'mmol/L', low: 0.15, high: 0.40, desc: 'High can cause gout.' },

  // Thyroid
  { id: 'tsh', name: 'TSH', category: 'Thyroid', unit: 'mIU/L', low: 0.4, high: 4.0, optimalLow: 0.5, optimalHigh: 2.5, desc: 'Master thyroid signal. High = underactive thyroid.' },
  { id: 'ft4', name: 'Free T4', category: 'Thyroid', unit: 'pmol/L', low: 10, high: 20, desc: 'Thyroid hormone (storage form).' },
  { id: 'ft3', name: 'Free T3', category: 'Thyroid', unit: 'pmol/L', low: 3.5, high: 6.5, desc: 'Active thyroid hormone.' },

  // Vitamins
  { id: 'vitd', name: 'Vitamin D (25-OH)', category: 'Vitamins', unit: 'nmol/L', low: 50, high: 150, optimalLow: 75, optimalHigh: 125, higherIsBetter: true, desc: 'Bone, immune, mood. Low is very common.' },
  { id: 'b12', name: 'Vitamin B12', category: 'Vitamins', unit: 'pmol/L', low: 145, high: 600, optimalLow: 300, higherIsBetter: true, desc: 'Nerve & red cell health.' },
  { id: 'folate', name: 'Folate (serum)', category: 'Vitamins', unit: 'nmol/L', low: 7, high: 45, higherIsBetter: true, desc: 'Red cell production.' },

  // Hormones (cycle-dependent — flag rather than hard-fail)
  { id: 'estradiol', name: 'Estradiol', category: 'Hormones', unit: 'pmol/L', low: 70, high: 500, cycleDependent: true, desc: 'Varies hugely across the menstrual cycle.' },
  { id: 'progesterone', name: 'Progesterone', category: 'Hormones', unit: 'nmol/L', low: 1, high: 70, cycleDependent: true, desc: 'Peaks in the luteal phase.' },
  { id: 'fsh', name: 'FSH', category: 'Hormones', unit: 'IU/L', low: 3, high: 10, cycleDependent: true, desc: 'Follicle-stimulating hormone.' },
  { id: 'lh', name: 'LH', category: 'Hormones', unit: 'IU/L', low: 2, high: 12, cycleDependent: true, desc: 'Luteinising hormone; surges at ovulation.' },
  { id: 'testosterone', name: 'Testosterone', category: 'Hormones', unit: 'nmol/L', low: 0.5, high: 1.7, desc: 'Energy, libido, muscle.' },
  { id: 'cortisol', name: 'Cortisol (morning)', category: 'Hormones', unit: 'nmol/L', low: 130, high: 540, desc: 'Stress hormone; highest in the morning.' },

  // Inflammation
  { id: 'crp', name: 'CRP', category: 'Inflammation', unit: 'mg/L', low: 0, high: 5, optimalHigh: 1, desc: 'General inflammation marker.' },
  { id: 'esr', name: 'ESR', category: 'Inflammation', unit: 'mm/hr', low: 1, high: 20, desc: 'Inflammation marker (slower).' },

  // Electrolytes
  { id: 'sodium', name: 'Sodium', category: 'Electrolytes', unit: 'mmol/L', low: 135, high: 145, desc: 'Fluid balance.' },
  { id: 'potassium', name: 'Potassium', category: 'Electrolytes', unit: 'mmol/L', low: 3.5, high: 5.2, desc: 'Heart & muscle function.' },
  { id: 'calcium', name: 'Calcium (corrected)', category: 'Electrolytes', unit: 'mmol/L', low: 2.1, high: 2.6, desc: 'Bone & nerve function.' },
  { id: 'magnesium', name: 'Magnesium', category: 'Electrolytes', unit: 'mmol/L', low: 0.7, high: 1.1, optimalLow: 0.85, desc: 'Muscle, sleep, energy.' },
  { id: 'phosphate', name: 'Phosphate', category: 'Electrolytes', unit: 'mmol/L', low: 0.75, high: 1.5, desc: 'Bone & energy metabolism.' },
];

export const MARKER_BY_ID = Object.fromEntries(MARKERS.map((m) => [m.id, m]));

// 'low' | 'high' | 'optimal' | 'in' | 'unknown'
export function evaluate(marker, value) {
  if (marker == null || value == null || isNaN(value)) return 'unknown';
  if (value < marker.low) return 'low';
  if (value > marker.high) return 'high';
  const optLow = marker.optimalLow ?? marker.low;
  const optHigh = marker.optimalHigh ?? marker.high;
  if (value >= optLow && value <= optHigh) return 'optimal';
  return 'in';
}

export function statusLabel(status) {
  return (
    { low: 'Below range', high: 'Above range', optimal: 'Optimal', in: 'In range' }[status] || '—'
  );
}
