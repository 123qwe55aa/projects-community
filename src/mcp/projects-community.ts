#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  attachObservationToProjectInput,
  recordObservationInput,
  recordProjectEventInput,
  suggestDecisionInput,
  upsertProjectHypothesisInput,
} from '@/lib/v2/contracts';
import {
  attachObservationToProject,
  recordObservation,
  recordProjectEvent,
  suggestDecision,
  upsertProjectHypothesis,
} from '@/lib/v2/ingestion';

export const toolNames = [
  'record_observation',
  'attach_observation_to_project',
  'record_project_event',
  'upsert_project_hypothesis',
  'suggest_decision',
] as const;

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createProjectsCommunityServer() {
  const server = new McpServer({ name: 'projects-community', version: '0.2.0' });

  server.registerTool(
    'record_observation',
    { inputSchema: recordObservationInput },
    async (input) => jsonContent(await recordObservation(input)),
  );
  server.registerTool(
    'attach_observation_to_project',
    { inputSchema: attachObservationToProjectInput },
    async (input) => jsonContent(await attachObservationToProject(input)),
  );
  server.registerTool(
    'record_project_event',
    { inputSchema: recordProjectEventInput },
    async (input) => jsonContent(await recordProjectEvent(input)),
  );
  server.registerTool(
    'upsert_project_hypothesis',
    { inputSchema: upsertProjectHypothesisInput },
    async (input) => jsonContent(await upsertProjectHypothesis(input)),
  );
  server.registerTool(
    'suggest_decision',
    { inputSchema: suggestDecisionInput },
    async (input) => jsonContent(await suggestDecision(input)),
  );

  return server;
}

async function main() {
  const server = createProjectsCommunityServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
