import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createProjectsCommunityServer } from './projects-community';

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
});
