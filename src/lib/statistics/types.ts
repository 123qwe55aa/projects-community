export const PROJECT_TYPES = [
  'application',
  'library',
  'tooling',
  'data',
  'content',
  'infrastructure',
  'community',
  'other',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export type RepositoryMatchInput = {
  name: string | null;
  description: string | null;
};

export type ProjectMatchInput = {
  projectId: string;
  summary: string | null;
  background: string | null;
};

export type ProjectMatchSuggestion = {
  projectId: string;
  score: number;
  componentScores: {
    nameToSummary: number;
    descriptionToSummary: number;
    descriptionToBackground: number;
  };
  matchReasons: string[];
};
