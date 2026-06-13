import { asc, desc } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { projectEvents, projectionCheckpoints, projects } from '@/db/schema';
import { PROJECT_PROJECTION_VERSION, projectProject } from './project';

export const PROJECT_PROJECTION_CHECKPOINT = 'project-projections';

export async function rebuildAllProjectProjections() {
  writeCheckpoint({ status: 'running', error: null });

  try {
    const projectIds = getDatabase()
      .db.select({ id: projects.id })
      .from(projects)
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all();

    for (const { id } of projectIds) {
      await projectProject(id);
    }

    const newestEvent = getDatabase()
      .db.select({ id: projectEvents.id })
      .from(projectEvents)
      .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.createdAt), desc(projectEvents.id))
      .get();
    writeCheckpoint({ status: 'completed', lastEventId: newestEvent?.id ?? null, error: null });
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
