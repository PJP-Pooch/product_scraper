export interface ParsedPackSize {
  display: string;
  totalWeightKg: number | null;
  count: number | null;
  weightPerUnit: number | null;
  unit: 'kg' | 'g' | 'ml' | null;
}

export function parsePackSize(input: string): ParsedPackSize | null {
  if (!input) return null;
  const text = input.trim();

  // Multi-pack: "12 x 395g", "24x85g", "6 × 400g", "4 x 2kg"
  const multiMatch = text.match(/(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml)\b/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1]);
    const weight = parseFloat(multiMatch[2]);
    const unit = multiMatch[3].toLowerCase() as 'kg' | 'g' | 'ml';
    const weightKg = unit === 'kg' ? weight : weight / 1000;
    return { display: text, totalWeightKg: count * weightKg, count, weightPerUnit: weight, unit };
  }

  // Single in kg: "2kg", "2.5 kg", "10 kg"
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) {
    const weight = parseFloat(kgMatch[1]);
    return { display: text, totalWeightKg: weight, count: 1, weightPerUnit: weight, unit: 'kg' };
  }

  // Single in g: "500g", "400 g"
  const gMatch = text.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gMatch) {
    const weight = parseFloat(gMatch[1]);
    return { display: text, totalWeightKg: weight / 1000, count: 1, weightPerUnit: weight, unit: 'g' };
  }

  // Single in ml (approximate as g): "400ml"
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) {
    const weight = parseFloat(mlMatch[1]);
    return { display: text, totalWeightKg: weight / 1000, count: 1, weightPerUnit: weight, unit: 'ml' };
  }

  return null;
}

// Find the first pack-size string in arbitrary text
export function extractPackSizeFromText(text: string): string | null {
  if (!text) return null;

  const patterns = [
    // Multi-pack first (more specific)
    /\d+\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:kg|g|ml)\b/i,
    // Single weight
    /\d+(?:\.\d+)?\s*(?:kg|g)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}
