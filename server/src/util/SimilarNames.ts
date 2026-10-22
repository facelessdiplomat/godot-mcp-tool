const minimumSimilarity = 0.5;
const defaultLimit = 3;
const closeEditBonus = 0.5;
const nameLengthPerAllowedEdit = 4;

export function similarNames(name: string, candidates: readonly string[], limit: number = defaultLimit): string[] {
  const lowercaseName = name.toLowerCase();
  const allowedEdits = Math.max(1, Math.floor(lowercaseName.length / nameLengthPerAllowedEdit));
  const scored: { readonly candidate: string; readonly score: number }[] = [];
  for (const candidate of candidates) {
    const lowercaseCandidate = candidate.toLowerCase();
    const similarity = letterPairSimilarity(lowercaseName, lowercaseCandidate);
    const isClose = isWithinEdits(lowercaseName, lowercaseCandidate, allowedEdits);
    if (similarity >= minimumSimilarity || isClose) {
      scored.push({ candidate, score: similarity + (isClose ? closeEditBonus : 0) });
    }
  }
  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function similarNamesHint(name: string, candidates: readonly string[]): string {
  const similar = similarNames(name, candidates);
  return similar.length === 0 ? '' : `Similar: ${similar.join(', ')}.`;
}

function letterPairSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }
  const leftPairs = letterPairs(left);
  const rightPairs = new Set(letterPairs(right));
  const shared = leftPairs.filter((pair) => rightPairs.has(pair)).length;
  return (2 * shared) / (leftPairs.length + right.length - 1);
}

function letterPairs(text: string): string[] {
  const pairs: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    pairs.push(text.slice(index, index + 2));
  }
  return pairs;
}

function isWithinEdits(left: string, right: string, allowedEdits: number): boolean {
  return Math.abs(left.length - right.length) <= allowedEdits && editDistance(left, right) <= allowedEdits;
}

function editDistance(left: string, right: string): number {
  let previousRow = Array.from({ length: right.length + 1 }, (_, column) => column);
  for (let row = 1; row <= left.length; row += 1) {
    const currentRow = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      currentRow.push(Math.min((previousRow[column] ?? 0) + 1, (currentRow[column - 1] ?? 0) + 1, (previousRow[column - 1] ?? 0) + substitutionCost));
    }
    previousRow = currentRow;
  }
  return previousRow[right.length] ?? 0;
}
