#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  attachObservationToProjectInput,
  hermesRecordableEventTypes,
  observationTypes,
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

// The SDK cannot advertise top-level unions/refinements; handlers still parse the authoritative contracts.
const boundedId = z.string().min(1).max(200);
const boundedReference = z.string().min(1).max(500);
const boundedRationale = z.string().min(1).max(1000);
const boundedSummary = z.string().min(1).max(1000);
const boundedBackground = z.string().min(1).max(2000);
const isoDatetime = z.string().datetime();
const boundedIds = z.array(boundedId).max(100).describe('Unique evidence IDs.');
const requiredBoundedIds = boundedIds.min(1);

const recordObservationWireInput = z
  .object({
    idempotencyKey: boundedId,
    summary: boundedSummary,
    type: z.enum(observationTypes),
    sourceConversationRef: boundedReference,
    sourceMessageRef: boundedReference,
    sourceQuote: z.string().min(1).max(500),
    observedAt: isoDatetime,
    proposedProjectId: boundedId
      .describe('Provide together with assignmentConfidence and assignmentRationale.')
      .optional(),
    assignmentConfidence: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe('Provide together with proposedProjectId and assignmentRationale.')
      .optional(),
    assignmentRationale: boundedRationale
      .describe('Provide together with proposedProjectId and assignmentConfidence.')
      .optional(),
  })
  .strict();

const attachObservationToProjectWireInput = z
  .object({
    idempotencyKey: boundedId,
    observationId: boundedId,
    projectId: boundedId,
    rationale: boundedRationale,
    occurredAt: isoDatetime,
  })
  .strict();

const eventPayload = z.union([
  z.object({ summary: boundedSummary }).strict(),
  z.object({ obstacle: boundedSummary }).strict(),
  z.object({ theme: boundedSummary }).strict(),
  z
    .object({
      state: z.enum(['active', 'dormant', 'ended', 'archived']),
      rationale: boundedRationale,
    })
    .strict(),
]);

const recordProjectEventWireInput = z
  .object({
    idempotencyKey: boundedId,
    projectId: boundedId,
    evidenceObservationIds: requiredBoundedIds,
    rationale: boundedRationale,
    occurredAt: isoDatetime,
    eventType: z.enum(hermesRecordableEventTypes),
    payload: eventPayload.describe('Must match the selected eventType.'),
  })
  .strict();

const upsertProjectHypothesisWireInput = z
  .object({
    idempotencyKey: boundedId,
    stableKey: boundedId,
    title: z.string().min(1).max(200),
    explanation: boundedBackground,
    observationIds: boundedIds
      .describe('At least one observation or signal evidence ID is required.')
      .optional(),
    signalIds: boundedIds
      .describe('At least one observation or signal evidence ID is required.')
      .optional(),
  })
  .strict();

const suggestDecisionWireInput = z
  .object({
    idempotencyKey: boundedId,
    projectId: boundedId,
    question: boundedSummary,
    evidenceObservationIds: requiredBoundedIds,
    rationale: boundedRationale,
  })
  .strict();

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createProjectsCommunityServer() {
  const server = new McpServer({ name: 'projects-community', version: '0.2.0' });

  server.registerTool(
    'record_observation',
    { inputSchema: recordObservationWireInput },
    async (input) => jsonContent(await recordObservation(recordObservationInput.parse(input))),
  );
  server.registerTool(
    'attach_observation_to_project',
    { inputSchema: attachObservationToProjectWireInput },
    async (input) =>
      jsonContent(
        await attachObservationToProject(attachObservationToProjectInput.parse(input)),
      ),
  );
  server.registerTool(
    'record_project_event',
    { inputSchema: recordProjectEventWireInput },
    async (input) => jsonContent(await recordProjectEvent(recordProjectEventInput.parse(input))),
  );
  server.registerTool(
    'upsert_project_hypothesis',
    { inputSchema: upsertProjectHypothesisWireInput },
    async (input) =>
      jsonContent(await upsertProjectHypothesis(upsertProjectHypothesisInput.parse(input))),
  );
  server.registerTool(
    'suggest_decision',
    { inputSchema: suggestDecisionWireInput },
    async (input) => jsonContent(await suggestDecision(suggestDecisionInput.parse(input))),
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
