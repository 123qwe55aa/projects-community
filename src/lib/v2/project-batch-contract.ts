import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const projectLifecycleStates = ['active', 'dormant', 'ended', 'archived'] as const;
export const projectBuildingStyles = [
  'workshop',
  'data-center',
  'studio',
  'community-hall',
] as const;

const boundedString = (maximum: number) => z.string().trim().min(1).max(maximum);
const trimmedEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.enum(values));

const lifecycleStateSchema = trimmedEnum(projectLifecycleStates);
const buildingStyleSchema = trimmedEnum(projectBuildingStyles);

export const projectBatchProjectSchema = z
  .object({
    key: boundedString(200),
    summary: boundedString(1000),
    background: boundedString(2000),
    lifecycleState: lifecycleStateSchema.optional(),
    buildingStyle: buildingStyleSchema.optional(),
    sourceRef: boundedString(500).optional(),
  })
  .strict();

export const projectBatchSchema = z
  .object({
    version: z.literal(1),
    projects: z.array(projectBatchProjectSchema),
  })
  .strict()
  .superRefine(({ projects }, context) => {
    const keys = new Set<string>();

    projects.forEach(({ key }, index) => {
      if (keys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate project key "${key}"`,
          path: ['projects', index, 'key'],
        });
      }
      keys.add(key);
    });
  });

export const normalizedProjectImportSchema = z
  .object({
    key: boundedString(200),
    summary: boundedString(1000),
    background: boundedString(2000),
    lifecycleState: lifecycleStateSchema,
    buildingStyle: buildingStyleSchema,
    sourceRef: boundedString(500),
  })
  .strict();

export type ProjectLifecycleState = (typeof projectLifecycleStates)[number];
export type ProjectBuildingStyle = (typeof projectBuildingStyles)[number];
export type ProjectBatchProject = z.infer<typeof projectBatchProjectSchema>;
export type ProjectBatch = z.infer<typeof projectBatchSchema>;
export type NormalizedProjectImport = z.infer<typeof normalizedProjectImportSchema>;
export type NormalizedProjectBatch = {
  version: 1;
  projects: NormalizedProjectImport[];
};

export function parseProjectBatchFile(contents: string, filename: string): ProjectBatch {
  const extension = extname(filename).toLowerCase();
  let input: unknown;

  if (extension === '.yaml' || extension === '.yml') {
    input = parseYaml(contents);
  } else if (extension === '.json') {
    input = JSON.parse(contents) as unknown;
  } else {
    throw new Error(`Unsupported project batch file extension "${extension || '(none)'}"`);
  }

  return projectBatchSchema.parse(input);
}

export function normalizeProjectBatch(batch: ProjectBatch, filename: string): NormalizedProjectBatch {
  const parsed = projectBatchSchema.parse(batch);
  const defaultSourceRef = `batch-import:${basename(filename)}`;

  return {
    version: 1,
    projects: parsed.projects.map((project) =>
      normalizedProjectImportSchema.parse({
        ...project,
        lifecycleState: project.lifecycleState ?? 'active',
        buildingStyle: project.buildingStyle ?? 'workshop',
        sourceRef: project.sourceRef ?? defaultSourceRef,
      }),
    ),
  };
}

export function hashProjectImport(project: NormalizedProjectImport): string {
  const canonicalProject = {
    key: project.key,
    summary: project.summary,
    background: project.background,
    lifecycleState: project.lifecycleState,
    buildingStyle: project.buildingStyle,
    sourceRef: project.sourceRef,
  };

  return createHash('sha256').update(JSON.stringify(canonicalProject)).digest('hex');
}
