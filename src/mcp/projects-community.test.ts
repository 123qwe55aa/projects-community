import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createProjectsCommunityServer } from './projects-community';

vi.mock('@/lib/v2/ingestion', () => ({
  attachObservationToProject: vi.fn(async () => ({ eventId: 'event-1', deduplicated: false })),
  recordObservation: vi.fn(async () => ({
    observationId: 'observation-1',
    reviewStatus: 'pending',
    attachedProjectId: null,
    deduplicated: false,
  })),
  recordProjectEvent: vi.fn(async () => ({ eventId: 'event-1', deduplicated: false })),
  suggestDecision: vi.fn(async () => ({ eventId: 'event-1', deduplicated: false })),
  upsertProjectHypothesis: vi.fn(async () => ({ hypothesisId: 'hypothesis-1', created: true })),
}));

const expectedSchemas = {
  record_observation: {
    properties: [
      'idempotencyKey',
      'summary',
      'type',
      'sourceConversationRef',
      'sourceMessageRef',
      'sourceQuote',
      'observedAt',
      'proposedProjectId',
      'assignmentConfidence',
      'assignmentRationale',
    ],
    required: [
      'idempotencyKey',
      'summary',
      'type',
      'sourceConversationRef',
      'sourceMessageRef',
      'sourceQuote',
      'observedAt',
    ],
  },
  attach_observation_to_project: {
    properties: ['idempotencyKey', 'observationId', 'projectId', 'rationale', 'occurredAt'],
    required: ['idempotencyKey', 'observationId', 'projectId', 'rationale', 'occurredAt'],
  },
  record_project_event: {
    properties: [
      'idempotencyKey',
      'projectId',
      'evidenceObservationIds',
      'rationale',
      'occurredAt',
      'eventType',
      'payload',
    ],
    required: [
      'idempotencyKey',
      'projectId',
      'evidenceObservationIds',
      'rationale',
      'occurredAt',
      'eventType',
      'payload',
    ],
  },
  upsert_project_hypothesis: {
    properties: [
      'idempotencyKey',
      'stableKey',
      'title',
      'explanation',
      'observationIds',
      'signalIds',
    ],
    required: ['idempotencyKey', 'stableKey', 'title', 'explanation'],
  },
  suggest_decision: {
    properties: ['idempotencyKey', 'projectId', 'question', 'evidenceObservationIds', 'rationale'],
    required: ['idempotencyKey', 'projectId', 'question', 'evidenceObservationIds', 'rationale'],
  },
} as const;

const observedAt = '2026-06-13T10:00:00.000Z';

describe('Projects Community MCP', () => {
  it('advertises complete Hermes V2 write tool schemas through tools/list', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'projects-community-test', version: '1.0.0' });
    const server = createProjectsCommunityServer();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map(({ name }) => name)).toEqual(Object.keys(expectedSchemas));
    for (const tool of tools) {
      const expected = expectedSchemas[tool.name as keyof typeof expectedSchemas];
      const properties = tool.inputSchema.properties ?? {};

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Object.keys(properties)).toEqual(expected.properties);
      expect(tool.inputSchema.required).toEqual(expected.required);
      for (const definition of Object.values(properties)) {
        expect(definition).not.toEqual({});
      }
    }

    const listedTools = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(listedTools.record_observation.inputSchema.properties).toMatchObject({
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
      type: { type: 'string', enum: expect.arrayContaining(['progress', 'project_signal']) },
      assignmentConfidence: { type: 'integer', minimum: 0, maximum: 100 },
    });
    expect(listedTools.attach_observation_to_project.inputSchema.properties).toMatchObject({
      occurredAt: { type: 'string', format: 'date-time' },
    });
    expect(listedTools.record_project_event.inputSchema.properties).toMatchObject({
      evidenceObservationIds: { type: 'array', minItems: 1, maxItems: 100 },
      eventType: { type: 'string', enum: expect.arrayContaining(['lifecycle_inferred']) },
      payload: { anyOf: expect.arrayContaining([expect.objectContaining({ type: 'object' })]) },
    });
    expect(listedTools.upsert_project_hypothesis.inputSchema.properties).toMatchObject({
      explanation: { type: 'string', minLength: 1, maxLength: 2000 },
      observationIds: { type: 'array', maxItems: 100 },
    });
    expect(listedTools.suggest_decision.inputSchema.properties).toMatchObject({
      question: { type: 'string', minLength: 1, maxLength: 1000 },
      evidenceObservationIds: { type: 'array', minItems: 1, maxItems: 100 },
    });
  });

  it.each([
    {
      name: 'an incomplete proposed assignment',
      tool: 'record_observation',
      arguments: {
        idempotencyKey: 'hermes:invalid-assignment',
        summary: 'This observation has only assignment confidence.',
        type: 'progress',
        sourceConversationRef: 'hermes:conversation-1',
        sourceMessageRef: 'hermes:message-1',
        sourceQuote: 'The assignment is incomplete.',
        observedAt,
        assignmentConfidence: 90,
      },
      expectedError: '"assignmentConfidence"',
    },
    {
      name: 'an event payload that does not match its event type',
      tool: 'record_project_event',
      arguments: {
        idempotencyKey: 'hermes:invalid-event-payload',
        projectId: 'project-1',
        evidenceObservationIds: ['observation-1'],
        rationale: 'The payload shape belongs to a different event type.',
        occurredAt: observedAt,
        eventType: 'progress_recorded',
        payload: { obstacle: 'This is not a progress summary.' },
      },
      expectedError: '"summary"',
    },
    {
      name: 'a hypothesis without evidence',
      tool: 'upsert_project_hypothesis',
      arguments: {
        idempotencyKey: 'hermes:hypothesis-without-evidence',
        stableKey: 'hypothesis:without-evidence',
        title: 'Unsupported hypothesis',
        explanation: 'This hypothesis has no observation or signal evidence.',
      },
      expectedError: 'At least one observation or signal evidence ID is required',
    },
  ])(
    'rejects wire-schema-valid but semantically invalid $name',
    async ({ tool, arguments: toolArguments, expectedError }) => {
      const result = await callTool(tool, toolArguments);

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({ type: 'text', text: expect.stringContaining(expectedError) }),
      ]);
    },
  );
});

async function callTool(name: string, arguments_: Record<string, unknown>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'projects-community-test', version: '1.0.0' });
  const server = createProjectsCommunityServer();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    return await client.callTool({ name, arguments: arguments_ });
  } finally {
    await client.close();
  }
}
