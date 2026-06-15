import { describe, expect, it } from 'vitest';
import { activityScore30d, effectiveProjectType, inferProjectType } from './classification';

describe('inferProjectType', () => {
  it('uses a recognized topic before the language fallback', () => {
    expect(inferProjectType({ topics: ['cli'], primaryLanguage: 'Jupyter Notebook' })).toBe(
      'tooling',
    );
    expect(inferProjectType({ topics: ['documentation'], primaryLanguage: 'Python' })).toBe(
      'content',
    );
  });

  it.each([
    ['Swift', 'application'],
    ['Kotlin', 'application'],
    ['Shell', 'tooling'],
    ['Jupyter Notebook', 'data'],
    ['HCL', 'infrastructure'],
  ] as const)('falls back from language %s to %s', (primaryLanguage, expected) => {
    expect(inferProjectType({ topics: [], primaryLanguage })).toBe(expected);
  });

  it('returns other for unknown or ambiguous signals', () => {
    expect(inferProjectType({ topics: ['experimental'], primaryLanguage: 'Brainfuck' })).toBe(
      'other',
    );
    expect(inferProjectType({ topics: ['cli', 'community'], primaryLanguage: 'Shell' })).toBe(
      'other',
    );
  });

  it.each([
    ['cli', 'tooling'],
    ['framework', 'library'],
    ['web-app', 'application'],
    ['machine-learning', 'data'],
    ['docs', 'content'],
    ['devops', 'infrastructure'],
    ['community', 'community'],
  ] as const)('classifies the %s topic as %s', (topic, expected) => {
    expect(inferProjectType({ topics: [topic], primaryLanguage: null })).toBe(expected);
  });
});

describe('effectiveProjectType', () => {
  it('gives a valid manual type precedence', () => {
    expect(effectiveProjectType({ inferredType: 'library', manualType: 'application' })).toBe(
      'application',
    );
  });

  it('falls back to a valid inferred type when the manual type is cleared or invalid', () => {
    expect(effectiveProjectType({ inferredType: 'library', manualType: null })).toBe('library');
    expect(effectiveProjectType({ inferredType: 'data', manualType: 'invalid' })).toBe('data');
  });

  it('returns other when neither type is valid', () => {
    expect(effectiveProjectType({ inferredType: 'invalid', manualType: undefined })).toBe('other');
  });
});

describe('activityScore30d', () => {
  it('weights pull requests three times and adds commits and issues', () => {
    expect(activityScore30d({ commits30d: 8, pullRequests30d: 4, issues30d: 3 })).toBe(23);
  });
});
