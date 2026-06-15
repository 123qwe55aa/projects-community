import { describe, expect, it } from 'vitest';
import {
  hashProjectImport,
  normalizeProjectBatch,
  parseProjectBatchFile,
} from './project-batch-contract';

const yamlBatch = `
version: 1
projects:
  - key: " project-one "
    summary: " First project "
    background: " Initial context "
  - key: project-two
    summary: Second project
    background: More context
    lifecycleState: dormant
    buildingStyle: studio
    sourceRef: " manual:project-two "
`;

const jsonBatch = JSON.stringify({
  version: 1,
  projects: [
    {
      key: ' project-one ',
      summary: ' First project ',
      background: ' Initial context ',
    },
    {
      key: 'project-two',
      summary: 'Second project',
      background: 'More context',
      lifecycleState: 'dormant',
      buildingStyle: 'studio',
      sourceRef: ' manual:project-two ',
    },
  ],
});

describe('project batch contract', () => {
  it('parses equivalent YAML and JSON through one normalized contract', () => {
    const yaml = normalizeProjectBatch(parseProjectBatchFile(yamlBatch, 'projects.yaml'), 'projects.yaml');
    const json = normalizeProjectBatch(parseProjectBatchFile(jsonBatch, 'projects.json'), 'projects.yaml');

    expect(yaml).toEqual(json);
    expect(yaml).toEqual({
      version: 1,
      projects: [
        {
          key: 'project-one',
          summary: 'First project',
          background: 'Initial context',
          lifecycleState: 'active',
          buildingStyle: 'workshop',
          sourceRef: 'batch-import:projects.yaml',
          imageUrl: null,
          deployUrl: null,
        },
        {
          key: 'project-two',
          summary: 'Second project',
          background: 'More context',
          lifecycleState: 'dormant',
          buildingStyle: 'studio',
          sourceRef: 'manual:project-two',
          imageUrl: null,
          deployUrl: null,
        },
      ],
    });
  });

  it('supports .yml and rejects unsupported extensions before parsing', () => {
    expect(parseProjectBatchFile(yamlBatch, 'projects.yml').version).toBe(1);
    expect(() => parseProjectBatchFile('not relevant', 'projects.toml')).toThrow(
      /unsupported project batch file extension/i,
    );
  });

  it('rejects unknown top-level and project fields', () => {
    expect(() =>
      parseProjectBatchFile(
        JSON.stringify({ version: 1, projects: [], unexpected: true }),
        'projects.json',
      ),
    ).toThrow();
    expect(() =>
      parseProjectBatchFile(
        JSON.stringify({
          version: 1,
          projects: [
            { key: 'one', summary: 'One', background: 'Context', unexpected: true },
          ],
        }),
        'projects.json',
      ),
    ).toThrow();
  });

  it('requires version 1 and required non-empty project strings', () => {
    expect(() => parseProjectBatchFile(JSON.stringify({ version: 2, projects: [] }), 'x.json')).toThrow();

    for (const field of ['key', 'summary', 'background'] as const) {
      const project = { key: 'one', summary: 'One', background: 'Context', [field]: '   ' };
      expect(() =>
        parseProjectBatchFile(JSON.stringify({ version: 1, projects: [project] }), 'x.json'),
      ).toThrow();
    }
  });

  it('enforces string bounds and supported enums after trimming', () => {
    const valid = { key: 'one', summary: 'One', background: 'Context' };
    const invalidProjects = [
      { ...valid, key: 'x'.repeat(201) },
      { ...valid, summary: 'x'.repeat(1001) },
      { ...valid, background: 'x'.repeat(2001) },
      { ...valid, sourceRef: 'x'.repeat(501) },
      { ...valid, lifecycleState: 'paused' },
      { ...valid, buildingStyle: 'office' },
    ];

    for (const project of invalidProjects) {
      expect(() =>
        parseProjectBatchFile(JSON.stringify({ version: 1, projects: [project] }), 'x.json'),
      ).toThrow();
    }
  });

  it('trims valid lifecycle and building style enum values before validation', () => {
    const [project] = parseProjectBatchFile(
      JSON.stringify({
        version: 1,
        projects: [
          {
            key: 'one',
            summary: 'One',
            background: 'Context',
            lifecycleState: ' dormant ',
            buildingStyle: ' studio ',
          },
        ],
      }),
      'x.json',
    ).projects;

    expect(project.lifecycleState).toBe('dormant');
    expect(project.buildingStyle).toBe('studio');
  });

  it('enforces the sourceRef bound on filename-derived defaults', () => {
    const batch = parseProjectBatchFile(
      JSON.stringify({
        version: 1,
        projects: [{ key: 'one', summary: 'One', background: 'Context' }],
      }),
      'x.json',
    );

    expect(() => normalizeProjectBatch(batch, `${'x'.repeat(500)}.json`)).toThrow();
  });

  it('rejects duplicate normalized keys', () => {
    expect(() =>
      parseProjectBatchFile(
        JSON.stringify({
          version: 1,
          projects: [
            { key: 'same-key', summary: 'One', background: 'Context' },
            { key: ' same-key ', summary: 'Two', background: 'Context' },
          ],
        }),
        'projects.json',
      ),
    ).toThrow(/duplicate project key/i);
  });

  it('hashes stable ordered normalized project values with SHA-256', () => {
    const [project] = normalizeProjectBatch(
      parseProjectBatchFile(jsonBatch, 'projects.json'),
      'projects.json',
    ).projects;
    const reordered = {
      sourceRef: project.sourceRef,
      buildingStyle: project.buildingStyle,
      lifecycleState: project.lifecycleState,
      background: project.background,
      summary: project.summary,
      key: project.key,
      imageUrl: project.imageUrl,
      deployUrl: project.deployUrl,
    };

    expect(hashProjectImport(project)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProjectImport(reordered)).toBe(hashProjectImport(project));
    expect(hashProjectImport({ ...project, summary: 'Changed' })).not.toBe(hashProjectImport(project));
  });
});
