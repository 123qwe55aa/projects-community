import { describe, expect, it } from 'vitest';
import { createProjectsCommunityServer, toolNames } from './projects-community';

describe('Projects Community MCP', () => {
  it('registers the Hermes V2 write tools', () => {
    expect(createProjectsCommunityServer()).toBeDefined();
    expect(toolNames).toEqual([
      'record_observation',
      'attach_observation_to_project',
      'record_project_event',
      'upsert_project_hypothesis',
      'suggest_decision',
    ]);
  });
});
