import { describe, expect, it } from 'vitest';
import { rankProjectMatches, scoreProjectMatch } from './matching';

describe('scoreProjectMatch', () => {
  it('matches exact normalized names across punctuation, hyphens, underscores, case, and whitespace', () => {
    const match = scoreProjectMatch(
      { name: '  PROJECTS_community--manager!! ', description: null },
      { projectId: 'project-1', summary: 'projects community manager', background: null },
    );

    expect(match.score).toBe(0.95);
    expect(match.componentScores).toEqual({
      nameToSummary: 1,
      descriptionToSummary: 0,
      descriptionToBackground: 0,
    });
    expect(match.matchReasons).toEqual(['Exact normalized name']);
  });

  it('preserves Unicode letters when normalizing an exact Chinese name', () => {
    const match = scoreProjectMatch(
      { name: ' 项目_社区--管理器！ ', description: null },
      { projectId: 'project-1', summary: '项目 社区 管理器', background: null },
    );

    expect(match.score).toBe(0.95);
    expect(match.componentScores.nameToSummary).toBe(1);
    expect(match.matchReasons).toEqual(['Exact normalized name']);
  });

  it('uses the documented composite formula for description overlaps', () => {
    const match = scoreProjectMatch(
      { name: '', description: 'alpha beta' },
      {
        projectId: 'project-1',
        summary: 'alpha beta gamma',
        background: 'beta delta',
      },
    );

    expect(match.componentScores.nameToSummary).toBe(0);
    expect(match.componentScores.descriptionToSummary).toBeCloseTo(2 / 3);
    expect(match.componentScores.descriptionToBackground).toBeCloseTo(1 / 3);
    expect(match.score).toBeCloseTo(0.25 * (2 / 3) + 0.15 * (1 / 3));
    expect(match.matchReasons).toEqual([
      'Description overlaps project summary',
      'Description overlaps project background',
    ]);
  });

  it('does not generate reasons for missing or zero-overlap text', () => {
    const match = scoreProjectMatch(
      { name: 'unrelated', description: null },
      { projectId: 'project-1', summary: 'project summary', background: null },
    );

    expect(match.score).toBe(0);
    expect(match.matchReasons).toEqual([]);
  });
});

describe('rankProjectMatches', () => {
  it('keeps matches at the threshold and excludes lower or missing matches', () => {
    const matches = rankProjectMatches(
      { name: 'alpha beta', description: 'alpha beta gamma epsilon' },
      [
        {
          projectId: 'at-threshold',
          summary: 'alpha beta gamma delta',
          background: 'alpha beta gamma epsilon',
        },
        { projectId: 'below-threshold', summary: 'alpha beta gamma delta epsilon', background: null },
        { projectId: 'no-match', summary: null, background: null },
      ],
    );

    expect(matches.map(({ projectId }) => projectId)).toEqual(['at-threshold']);
    expect(matches[0]?.score).toBeCloseTo(0.6);
  });

  it('returns at most five matches with a deterministic projectId tie-break', () => {
    const projects = ['project-f', 'project-b', 'project-e', 'project-a', 'project-d', 'project-c'].map(
      (projectId) => ({ projectId, summary: 'same name', background: null }),
    );

    expect(
      rankProjectMatches({ name: 'same name', description: null }, projects).map(
        ({ projectId }) => projectId,
      ),
    ).toEqual(['project-a', 'project-b', 'project-c', 'project-d', 'project-e']);
  });

  it('orders tied non-ASCII projectIds by locale-independent JavaScript string ordering', () => {
    const projects = ['中', 'é', 'z', 'ä'].map((projectId) => ({
      projectId,
      summary: 'same name',
      background: null,
    }));

    expect(
      rankProjectMatches({ name: 'same name', description: null }, projects).map(
        ({ projectId }) => projectId,
      ),
    ).toEqual(['z', 'ä', 'é', '中']);
  });
});
