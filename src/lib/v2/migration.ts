import { asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
import { projectEvents, projects } from '@/db/schema';
import { projectProjectInTransaction } from './projection/project';

export type V1ProjectImportResult = {
  projectsFound: number;
  eventsCreated: number;
  projectsProjected: number;
};

export async function importV1Projects(): Promise<V1ProjectImportResult> {
  const database = getDatabase().db;

  return database.transaction(
    (tx) => {
      const existingProjects = tx
        .select()
        .from(projects)
        .orderBy(asc(projects.createdAt), asc(projects.id))
        .all();
      let eventsCreated = 0;

      for (const project of existingProjects) {
        const idempotencyKey = `v2:legacy-import:${project.id}`;
        const existingEvent = tx
          .select({ id: projectEvents.id })
          .from(projectEvents)
          .where(eq(projectEvents.idempotencyKey, idempotencyKey))
          .get();
        if (existingEvent) continue;

        const occurredAt = project.updatedAt ?? project.createdAt ?? new Date();
        const payload = legacyPayload(project);
        tx.insert(projectEvents)
          .values({
            id: nanoid(),
            projectId: project.id,
            eventType: 'legacy_imported',
            payload: JSON.stringify(payload),
            rationale: 'Imported from the V1 project record.',
            actor: 'migration',
            idempotencyKey,
            occurredAt,
            createdAt: new Date(),
            schemaVersion: 1,
          })
          .run();
        projectProjectInTransaction(tx, project.id);
        eventsCreated += 1;
      }

      return {
        projectsFound: existingProjects.length,
        eventsCreated,
        projectsProjected: eventsCreated,
      };
    },
    { behavior: 'immediate' },
  );
}

function legacyPayload(project: typeof projects.$inferSelect) {
  const fallback = project.summary || project.background || `Legacy project ${project.id}`;
  return {
    summary: project.summary || fallback,
    background: project.background || fallback,
  };
}
