import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../src/db';
import { projectHypotheses, projects } from '../src/db/schema';
import {
  recordObservation,
  recordProjectEvent,
  upsertProjectHypothesis,
} from '../src/lib/v2/ingestion';
import { projectProject } from '../src/lib/v2/projection/project';

test('supports the Hermes-first observation and governance journey', async ({ page }) => {
  const fixture = await seedHermesFirstJourney();

  await page.goto('/');
  const currentProjects = page.getByLabel('Current Projects');
  await expect(
    currentProjects.getByRole('link', { name: fixture.currentProjectTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent Changes' }).locator('xpath=ancestor::section'),
  ).toContainText(fixture.highConfidenceSourceQuote);
  await expect(page.getByRole('heading', { name: /^Needs Attention \(\d+\)$/ })).toBeVisible();
  await expect(page.getByText(fixture.uncertainObservationSummary, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Review all' }).click();
  const uncertainObservation = page
    .getByRole('article')
    .filter({ hasText: fixture.uncertainObservationSummary });
  await expect(uncertainObservation).toContainText(fixture.uncertainSourceQuote);
  await uncertainObservation
    .getByRole('combobox')
    .selectOption({ label: fixture.currentProjectTitle });
  await uncertainObservation.getByRole('button', { name: 'Reassign' }).click();
  await expect(page.getByText(fixture.uncertainObservationSummary, { exact: true })).toHaveCount(0);

  await page.goto(`/projects/${fixture.existingProjectId}`);
  await page.getByLabel('Lifecycle state').selectOption('dormant');
  await page.getByLabel('Lifecycle rationale').fill(fixture.correctionRationale);
  await page.getByRole('button', { name: 'Update Lifecycle' }).click();

  const existingProjectTimeline = page.getByLabel('Evidence Timeline');
  await expect(existingProjectTimeline).toContainText('lifecycle corrected');
  await expect(existingProjectTimeline).toContainText(fixture.correctionRationale);
  await expect(existingProjectTimeline).toContainText(fixture.uncertainSourceQuote);
  await expect(existingProjectTimeline).toContainText(
    `Hermes source: ${fixture.uncertainConversationRef} / ${fixture.uncertainMessageRef}`,
  );

  await page.goto('/hypotheses');
  const hypothesis = page.getByRole('article').filter({ hasText: fixture.hypothesisTitle });
  await expect(hypothesis).toContainText('2 evidence items');
  await expect(hypothesis).toContainText(fixture.highConfidenceSourceQuote);
  await expect(hypothesis).toContainText(fixture.uncertainSourceQuote);
  await hypothesis.getByRole('button', { name: 'Promote to Project' }).click();
  await expect(page.getByRole('article').filter({ hasText: fixture.hypothesisTitle })).toHaveCount(0);

  const promotedProjectId = getPromotedProjectId(fixture.hypothesisId);
  await page.goto(`/projects/${promotedProjectId}`);
  await expect(page.getByRole('heading', { name: fixture.hypothesisTitle })).toBeVisible();
  const promotedProjectTimeline = page.getByLabel('Evidence Timeline');
  await expect(promotedProjectTimeline).toContainText('hypothesis promoted');
  await expect(promotedProjectTimeline).toContainText(fixture.highConfidenceSourceQuote);
  await expect(promotedProjectTimeline).toContainText(fixture.uncertainSourceQuote);
});

async function seedHermesFirstJourney() {
  const key = nanoid();
  const existingProjectId = nanoid();
  const existingProjectTitle = `Hermes Journey Project ${key}`;
  const highConfidenceChange = `Completed deterministic dashboard milestone ${key}`;
  const highConfidenceSourceQuote = `The dashboard milestone ${key} is complete.`;
  const uncertainObservationSummary = `Possible follow-up theme ${key}`;
  const uncertainSourceQuote = `I keep returning to the follow-up theme ${key}.`;
  const uncertainConversationRef = `hermes:e2e:conversation:${key}`;
  const uncertainMessageRef = `hermes:e2e:message:uncertain:${key}`;
  const hypothesisTitle = `Repeated Follow-up Theme ${key}`;
  const correctionRationale = `User correction for the deterministic Hermes journey ${key}.`;
  const observedAt = new Date().toISOString();

  getDatabase().db.insert(projects).values({
    id: existingProjectId,
    summary: existingProjectTitle,
    background: 'A formal Project that exists before Hermes records the test observations.',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();

  const highConfidenceObservation = await recordObservation({
    idempotencyKey: `e2e:v2:observation:high:${key}`,
    summary: highConfidenceChange,
    type: 'progress',
    sourceConversationRef: `hermes:e2e:conversation:${key}`,
    sourceMessageRef: `hermes:e2e:message:high:${key}`,
    sourceQuote: highConfidenceSourceQuote,
    proposedProjectId: existingProjectId,
    assignmentConfidence: 99,
    assignmentRationale: 'Hermes has an explicit Project reference and concrete progress language.',
    observedAt,
  });
  await recordProjectEvent({
    idempotencyKey: `e2e:v2:event:progress:${key}`,
    projectId: existingProjectId,
    eventType: 'progress_recorded',
    payload: { summary: highConfidenceChange },
    rationale: 'Hermes recorded a high-confidence Project change.',
    evidenceObservationIds: [highConfidenceObservation.observationId],
    occurredAt: observedAt,
  });

  const uncertainObservation = await recordObservation({
    idempotencyKey: `e2e:v2:observation:uncertain:${key}`,
    summary: uncertainObservationSummary,
    type: 'project_signal',
    sourceConversationRef: uncertainConversationRef,
    sourceMessageRef: uncertainMessageRef,
    sourceQuote: uncertainSourceQuote,
    proposedProjectId: existingProjectId,
    assignmentConfidence: 40,
    assignmentRationale: 'Hermes sees a possible connection but needs user confirmation.',
    observedAt,
  });
  const hypothesis = await upsertProjectHypothesis({
    idempotencyKey: `e2e:v2:hypothesis:${key}`,
    stableKey: `e2e:v2:repeated-theme:${key}`,
    title: hypothesisTitle,
    explanation: 'Hermes observed the same possible Project theme in repeated evidence.',
    observationIds: [
      highConfidenceObservation.observationId,
      uncertainObservation.observationId,
    ],
  });
  await projectProject(existingProjectId);

  return {
    existingProjectId,
    currentProjectTitle: highConfidenceChange,
    highConfidenceSourceQuote,
    uncertainObservationSummary,
    uncertainSourceQuote,
    uncertainConversationRef,
    uncertainMessageRef,
    hypothesisId: hypothesis.hypothesisId,
    hypothesisTitle,
    correctionRationale,
  };
}

function getPromotedProjectId(hypothesisId: string) {
  const hypothesis = getDatabase().db
    .select({ promotedProjectId: projectHypotheses.promotedProjectId })
    .from(projectHypotheses)
    .where(eq(projectHypotheses.id, hypothesisId))
    .get();
  if (!hypothesis?.promotedProjectId) {
    throw new Error(`Hypothesis was not promoted: ${hypothesisId}`);
  }
  return hypothesis.promotedProjectId;
}
