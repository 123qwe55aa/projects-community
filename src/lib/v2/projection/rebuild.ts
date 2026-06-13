import { asc } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { projectEvents, projectionCheckpoints, projects } from '@/db/schema';
import { PROJECT_PROJECTION_VERSION, projectProject } from './project';

export const PROJECT_PROJECTION_CHECKPOINT = 'project-projections';

export async function rebuildAllProjectProjections() {
  writeCheckpoint({ status: 'running', error: null });

  try {
    const sourceEvents = getDatabase()
      .db.select({ id: projectEvents.id })
      .from(projectEvents)
      .orderBy(asc(projectEvents.occurredAt), asc(projectEvents.createdAt), asc(projectEvents.id))
      .all();
    const sourceEventIds = new Set(sourceEvents.map(({ id }) => id));
    const boundaryEvent = sourceEvents.at(-1);
    const projectIds = getDatabase()
      .db.select({ id: projects.id })
      .from(projects)
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all();

    for (const { id } of projectIds) {
      await projectProject(id, sourceEventIds);
    }

    writeCheckpoint({ status: 'completed', lastEventId: boundaryEvent?.id ?? null, error: null });
  } catch (error) {
    writeCheckpoint({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function writeCheckpoint(input: {
  status: 'running' | 'completed' | 'failed';
  lastEventId?: string | null;
  error: string | null;
}) {
  getDatabase()
    .db.insert(projectionCheckpoints)
    .values({
      name: PROJECT_PROJECTION_CHECKPOINT,
      projectionVersion: PROJECT_PROJECTION_VERSION,
      updatedAt: new Date(),
      ...input,
    })
    .onConflictDoUpdate({
      target: projectionCheckpoints.name,
      set: {
        projectionVersion: PROJECT_PROJECTION_VERSION,
        updatedAt: new Date(),
        ...input,
      },
    })
    .run();
}
