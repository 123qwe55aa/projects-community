import { PROJECT_TYPES, type ProjectType } from './types';

const TOPICS_BY_TYPE: Record<Exclude<ProjectType, 'other'>, ReadonlySet<string>> = {
  application: new Set(['app', 'application', 'desktop-app', 'mobile-app', 'web-app']),
  library: new Set(['framework', 'library', 'package', 'sdk']),
  tooling: new Set(['cli', 'command-line', 'developer-tool', 'tooling']),
  data: new Set(['ai', 'data', 'data-science', 'machine-learning', 'ml', 'notebook']),
  content: new Set(['content', 'docs', 'documentation']),
  infrastructure: new Set(['cloud', 'devops', 'infrastructure', 'terraform']),
  community: new Set(['community', 'community-project', 'open-source-community']),
};

const LANGUAGES_BY_TYPE: Partial<Record<ProjectType, ReadonlySet<string>>> = {
  application: new Set(['dart', 'kotlin', 'swift']),
  tooling: new Set(['powershell', 'shell']),
  data: new Set(['jupyter notebook', 'r']),
  infrastructure: new Set(['dockerfile', 'hcl']),
};

export function inferProjectType({
  topics,
  primaryLanguage,
}: {
  topics: readonly string[];
  primaryLanguage: string | null;
}): ProjectType {
  const topicTypes = new Set<ProjectType>();

  for (const topic of topics) {
    const normalizedTopic = topic.trim().toLowerCase();
    for (const [type, recognizedTopics] of Object.entries(TOPICS_BY_TYPE) as Array<
      [Exclude<ProjectType, 'other'>, ReadonlySet<string>]
    >) {
      if (recognizedTopics.has(normalizedTopic)) topicTypes.add(type);
    }
  }

  if (topicTypes.size === 1) return [...topicTypes][0];
  if (topicTypes.size > 1) return 'other';

  const normalizedLanguage = primaryLanguage?.trim().toLowerCase();
  if (!normalizedLanguage) return 'other';

  for (const type of PROJECT_TYPES) {
    if (LANGUAGES_BY_TYPE[type]?.has(normalizedLanguage)) return type;
  }
  return 'other';
}

export function effectiveProjectType({
  inferredType,
  manualType,
}: {
  inferredType: string | null | undefined;
  manualType: string | null | undefined;
}): ProjectType {
  if (isProjectType(manualType)) return manualType;
  if (isProjectType(inferredType)) return inferredType;
  return 'other';
}

export function activityScore30d({
  commits30d,
  pullRequests30d,
  issues30d,
}: {
  commits30d: number;
  pullRequests30d: number;
  issues30d: number;
}): number {
  return commits30d + pullRequests30d * 3 + issues30d;
}

function isProjectType(value: string | null | undefined): value is ProjectType {
  return PROJECT_TYPES.includes(value as ProjectType);
}
