export interface AssessmentRef {
  id: string;
  maxScore: number;
}

export interface CategoryRef {
  weight: number;
  assessments: AssessmentRef[];
}

/** Computes the weighted final grade (0–100) from categories and a score map.
 *  Null scores are excluded from that assessment's category average.
 *  If an entire category has no scores, its weight is redistributed proportionally. */
export function computeWeightedGrade(
  categories: CategoryRef[],
  scores: Record<string, number | null>,
): number | null {
  let weightedSum = 0;
  let activeWeight = 0;

  for (const cat of categories) {
    const pctScores = cat.assessments
      .map(a => (scores[a.id] != null ? (scores[a.id]! / a.maxScore) * 100 : null))
      .filter((s): s is number => s !== null);

    if (pctScores.length === 0) continue;

    const catAvg = pctScores.reduce((a, b) => a + b, 0) / pctScores.length;
    weightedSum += catAvg * cat.weight;
    activeWeight += cat.weight;
  }

  if (activeWeight === 0) return null;
  // Normalize: if not all category weights are active, scale to what's present
  return parseFloat((weightedSum / activeWeight).toFixed(2));
}

export function numericToLetter(grade: number): string {
  if (grade >= 97) return '1.00';
  if (grade >= 93) return '1.25';
  if (grade >= 89) return '1.50';
  if (grade >= 85) return '1.75';
  if (grade >= 81) return '2.00';
  if (grade >= 77) return '2.25';
  if (grade >= 73) return '2.50';
  if (grade >= 69) return '2.75';
  if (grade >= 65) return '3.00';
  return '5.00';
}
