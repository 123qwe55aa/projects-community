import type {
  ProjectMatchInput,
  ProjectMatchSuggestion,
  RepositoryMatchInput,
} from './types';

const MATCH_THRESHOLD = 0.6;
const MAX_MATCHES = 5;

export function scoreProjectMatch(
  repository: RepositoryMatchInput,
  project: ProjectMatchInput,
): ProjectMatchSuggestion {
  const normalizedName = normalizeText(repository.name);
  const normalizedSummary = normalizeText(project.summary);
  const componentScores = {
    nameToSummary: jaccardSimilarity(normalizedName, normalizedSummary),
    descriptionToSummary: jaccardSimilarity(
      normalizeText(repository.description),
      normalizedSummary,
    ),
    descriptionToBackground: jaccardSimilarity(
      normalizeText(repository.description),
      normalizeText(project.background),
    ),
  };
  const exactNormalizedName =
    normalizedName.length > 0 && normalizedName === normalizedSummary;
  const compositeScore =
    componentScores.nameToSummary * 0.6 +
    componentScores.descriptionToSummary * 0.25 +
    componentScores.descriptionToBackground * 0.15;

  return {
    projectId: project.projectId,
    score: exactNormalizedName ? Math.max(compositeScore, 0.95) : compositeScore,
    componentScores,
    matchReasons: matchReasons(componentScores, exactNormalizedName),
  };
}

export function rankProjectMatches(
  repository: RepositoryMatchInput,
  projects: readonly ProjectMatchInput[],
): ProjectMatchSuggestion[] {
  return projects
    .map((project) => scoreProjectMatch(repository, project))
    .filter(({ score }) => score >= MATCH_THRESHOLD)
    .sort(
      (left, right) => right.score - left.score || compareStrings(left.projectId, right.projectId),
    )
    .slice(0, MAX_MATCHES);
}

function normalizeText(value: string | null): string {
  return value
    ? value
        .normalize('NFC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ')
    : '';
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function jaccardSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;

  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersectionSize = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;

  return intersectionSize / unionSize;
}

function matchReasons(
  componentScores: ProjectMatchSuggestion['componentScores'],
  exactNormalizedName: boolean,
): string[] {
  const reasons: string[] = [];
  if (exactNormalizedName) reasons.push('Exact normalized name');
  else if (componentScores.nameToSummary > 0) reasons.push('Repository name overlaps project summary');
  if (componentScores.descriptionToSummary > 0) {
    reasons.push('Description overlaps project summary');
  }
  if (componentScores.descriptionToBackground > 0) {
    reasons.push('Description overlaps project background');
  }
  return reasons;
}
