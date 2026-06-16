'use server';

import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDatabase } from '@/db';
import {
  adoptionSnapshots,
  candidates,
  decisions,
  projects,
} from '@/db/schema';
import { createProjectFromGitHub } from '@/lib/statistics/service';
import { getCurrentProjectSnapshot } from '@/lib/v2/projection/project';

export async function adoptCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const candidateId = formData.get('candidateId') as string;
  const candidateSummary = formData.get('candidateSummary') as string | null;
  const reasoning = formData.get('reasoning') as string | null;

  if (!decisionId || !candidateId || !reasoning?.trim()) {
    throw new Error('Decision ID, candidate ID, and reasoning are required');
  }

  const { sqlite } = getDatabase();

  const result = sqlite.transaction(function () {
    // 1. Fetch the candidate to get its summary
    const candidateRow = sqlite
      .prepare('SELECT id, name, current_form_summary FROM candidates WHERE id = ?')
      .get(candidateId) as { id: string; name: string; current_form_summary: string | null } | undefined;

    if (!candidateRow) {
      throw new Error('Candidate not found');
    }

    // 2. Fetch the decision to get projectId
    const decisionRow = sqlite
      .prepare('SELECT id, project_id, state FROM decisions WHERE id = ?')
      .get(decisionId) as { id: string; project_id: string | null; state: string } | undefined;

    if (!decisionRow) {
      throw new Error('Decision not found');
    }

    const summary = candidateSummary?.trim() || candidateRow.current_form_summary || candidateRow.name;

    // 3. Find any current adoption for this decision
    const currentAdoption = sqlite
      .prepare('SELECT id FROM adoption_snapshots WHERE decision_id = ? AND is_current = 1 LIMIT 1')
      .get(decisionId) as { id: string } | undefined;

    // 4. Create new adoption snapshot
    const newSnapshotId = nanoid();
    sqlite
      .prepare(
        `INSERT INTO adoption_snapshots (id, decision_id, candidate_id, project_id, candidate_summary, reasoning, is_current, adopted_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      )
      .run(newSnapshotId, decisionId, candidateId, decisionRow.project_id, summary, reasoning.trim());

    // 5. If there's a previous current adoption, supersede it
    if (currentAdoption) {
      sqlite
        .prepare('UPDATE adoption_snapshots SET is_current = 0, superseded_by_id = ? WHERE id = ?')
        .run(newSnapshotId, currentAdoption.id);
    }

    // 6. Set decision state to 'decided'
    sqlite
      .prepare("UPDATE decisions SET state = 'decided', updated_at = datetime('now') WHERE id = ?")
      .run(decisionId);

    // 7. Advance project growthStage based on number of decided decisions
    if (decisionRow.project_id) {
      const projectDecisions = sqlite
        .prepare("SELECT state FROM decisions WHERE project_id = ?")
        .all(decisionRow.project_id) as { state: string }[];

      // Count currently decided (including the one we just set)
      const decidedCount =
        projectDecisions.filter((d: { state: string }) => d.state === 'decided').length + 1;

      const stages = ['seed', 'seedling', 'growing', 'thriving', 'mature'];
      let newStage = 'seed';
      if (decidedCount >= 10) newStage = 'mature';
      else if (decidedCount >= 6) newStage = 'thriving';
      else if (decidedCount >= 3) newStage = 'growing';
      else if (decidedCount >= 1) newStage = 'seedling';

      // Only advance (never go backwards)
      const currentProject = sqlite
        .prepare('SELECT growth_stage FROM projects WHERE id = ?')
        .get(decisionRow.project_id) as { growth_stage: string } | undefined;

      const currentIdx = stages.indexOf(currentProject?.growth_stage ?? 'seed');
      const newIdx = stages.indexOf(newStage);
      if (newIdx > currentIdx) {
        sqlite
          .prepare("UPDATE projects SET growth_stage = ?, updated_at = datetime('now') WHERE id = ?")
          .run(newStage, decisionRow.project_id);
      }
    }

    return { snapshotId: newSnapshotId };
  }) as unknown as { snapshotId: string };

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);
  revalidatePath('/projects');
  revalidatePath('/map');

  return result;
}

export async function addCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const name = formData.get('name') as string;
  const summary = formData.get('summary') as string | null;

  if (!decisionId || !name.trim()) {
    throw new Error('Decision ID and candidate name are required');
  }

  const { db } = getDatabase();

  const id = nanoid();
  db.insert(candidates)
    .values({
      id,
      decisionId,
      name: name.trim(),
      currentFormSummary: summary?.trim() || null,
    })
    .run();

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);

  return { id };
}



export async function createProjectAction(formData: FormData) {
  const background = formData.get('background') as string | null;
  const buildingStyle = formData.get('buildingStyle') as string | null;
  const imageUrl = formData.get('imageUrl') as string | null;
  const deployUrl = formData.get('deployUrl') as string | null;
  if (!background?.trim()) throw new Error('Background is required');

  const { db } = getDatabase();
  const projectId = nanoid();

  db.insert(projects).values({
    id: projectId,
    background: background.trim(),
    summary: background.trim().slice(0, 120),
    imageUrl: imageUrl?.trim() || null,
    deployUrl: deployUrl?.trim() || null,
    buildingStyle: buildingStyle || 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  }).run();

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { projectId };
}

export async function importGitHubAction(formData: FormData) {
  const repoUrl = formData.get('repoUrl') as string | null;
  if (!repoUrl?.trim()) throw new Error('GitHub repo URL is required');

  // Parse owner/repo from URL
  const match = repoUrl.trim().match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!match) throw new Error('Invalid GitHub repo URL. Expected format: https://github.com/owner/repo');
  const repoPath = match[1].replace(/\.git$/, '');

  // Fetch README
  const readmeUrl = `https://raw.githubusercontent.com/${repoPath}/main/README.md`;
  let background = `Imported from GitHub: ${repoUrl.trim()}\n\n`;
  try {
    const res = await fetch(readmeUrl);
    if (res.ok) {
      background += await res.text();
    } else {
      // Try master branch
      const masterUrl = `https://raw.githubusercontent.com/${repoPath}/master/README.md`;
      const res2 = await fetch(masterUrl);
      if (res2.ok) {
        background += await res2.text();
      } else {
        background += 'No README found.';
      }
    }
  } catch {
    background += 'Failed to fetch README.';
  }

  // Truncate very long backgrounds
  if (background.length > 5000) {
    background = background.slice(0, 5000) + '\n\n...(truncated)';
  }

  const summary = repoPath.split('/')[1]?.replace(/[-_]/g, ' ') || repoPath;

  const { db } = getDatabase();
  const projectId = nanoid();
  db.insert(projects).values({
    id: projectId,
    background,
    summary: summary.slice(0, 120),
    deployUrl: repoUrl.trim(),
    buildingStyle: 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  }).run();

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { projectId };
}

export async function listUserReposAction() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'projects-community',
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const repos = (await res.json()) as Array<{
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    language: string | null;
    topics: string[];
    owner: { avatar_url: string };
    homepage: string | null;
    fork: boolean;
    archived: boolean;
  }>;

  return repos
    .filter((r) => !r.fork && !r.archived)
    .map((r) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description || '',
      htmlUrl: r.html_url,
      language: r.language || '',
      topics: r.topics || [],
      avatarUrl: r.owner.avatar_url,
      homepage: r.homepage || '',
    }));
}

export async function importOneClickRepoAction(formData: FormData) {
  const fullName = formData.get('fullName') as string | null;
  if (!fullName?.trim()) throw new Error('Repo full name is required');

  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) throw new Error('Invalid repo full name');

  const token = process.env.GITHUB_TOKEN;
  const authHeaders: Record<string, string> = {
    'User-Agent': 'projects-community',
  };
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;

  // Fetch README (try main, then master)
  let readmeText = '';
  for (const branch of ['main', 'master']) {
    const r = await fetch(
      `https://api.github.com/repos/${fullName}/readme`,
      { headers: { ...authHeaders, Accept: 'application/vnd.github.raw' } },
    );
    if (r.ok) { readmeText = await r.text(); break; }
  }

  // Fetch repo metadata for description
  const repoRes = await fetch(`https://api.github.com/repos/${fullName}`, { headers: authHeaders });
  const repoData = repoRes.ok ? (await repoRes.json()) as Record<string, unknown> : {};
  const description = (repoData.description as string) || repo;
  const topics = Array.isArray(repoData.topics)
    ? repoData.topics.filter((topic): topic is string => typeof topic === 'string')
    : [];
  const language = (repoData.language as string) || '';
  const avatarUrl = repoData.owner && typeof repoData.owner === 'object'
    ? ((repoData.owner as Record<string, unknown>).avatar_url as string | undefined) ?? null
    : null;
  const homepage = (repoData.homepage as string | undefined) || '';

  const { projectId } = await createProjectFromGitHub({
    repoFullName: fullName,
    metadata: {
      description,
      topics,
      language,
      readmeText,
      homepage,
      avatarUrl,
    },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { projectId };
}

export async function importObsidianAction(formData: FormData) {
  const noteContent = formData.get('noteContent') as string | null;
  if (!noteContent?.trim()) throw new Error('Note content is required');

  const lines = noteContent.trim().split('\n');
  const firstLine = lines[0]?.replace(/^#+\s*/, '').trim() || 'Imported from Obsidian';
  const background = noteContent.trim().slice(0, 5000);

  const { db } = getDatabase();
  const projectId = nanoid();
  db.insert(projects).values({
    id: projectId,
    background,
    summary: firstLine.slice(0, 120),
    buildingStyle: 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  }).run();

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { projectId };
}

export async function createDecisionAction(formData: FormData) {
  const question = formData.get('question') as string | null;
  const scope = formData.get('scope') as string | null;
  const projectId = formData.get('projectId') as string | null;
  if (!question?.trim()) throw new Error('Question is required');

  const { db } = getDatabase();
  const decisionId = nanoid();

  db.insert(decisions).values({
    id: decisionId,
    question: question.trim(),
    state: 'researching',
    scope: scope || 'project',
    projectId: projectId || null,
  }).run();

  revalidatePath('/projects');
  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
  return { decisionId };
}

export async function updateDecisionStateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const newState = formData.get('state') as string;
  if (!decisionId || !newState) throw new Error('Decision ID and new state are required');

  const validStates = ['researching', 'deferred', 'decided', 'archived'];
  if (!validStates.includes(newState)) throw new Error('Invalid state');

  const { db } = getDatabase();
  db.update(decisions).set({ state: newState, updatedAt: new Date() }).where(eq(decisions.id, decisionId)).run();

  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
}

export async function deleteProjectAction(projectId: string) {
  const { sqlite } = getDatabase();
  sqlite.transaction(function () {
    const decisionRows = sqlite.prepare('SELECT id FROM decisions WHERE project_id = ?').all(projectId) as { id: string }[];
    for (const row of decisionRows) {
      sqlite.prepare('DELETE FROM candidates WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM participants WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM adoption_snapshots WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM decision_links WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM recommendations WHERE decision_id = ?').run(row.id);
    }
    sqlite.prepare('DELETE FROM decisions WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM participants WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM adoption_snapshots WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  })();
  revalidatePath('/projects');
  revalidatePath('/map');
  return { redirectTo: '/projects' };
}

export async function deleteDecisionAction(decisionId: string) {
  const { sqlite } = getDatabase();
  sqlite.transaction(function () {
    sqlite.prepare('DELETE FROM candidates WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM participants WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM adoption_snapshots WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM decision_links WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM recommendations WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM decisions WHERE id = ?').run(decisionId);
  })();
  revalidatePath('/decisions');
  revalidatePath('/projects');
  revalidatePath('/map');
  return { redirectTo: '/decisions' };
}

export async function pingAction() {
  return { ok: true };
}

export async function fetchGitHubRepoAction(formData: FormData) {
  const url = formData.get('url') as string | null;
  if (!url?.trim()) throw new Error('GitHub repo URL is required');

  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|$|#|\?)/);
  if (!match) throw new Error('Invalid GitHub repo URL. Expected format: https://github.com/owner/repo');

  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, '');

  // Fetch repo metadata
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
    headers: { 'User-Agent': 'projects-community' },
  });
  if (!repoRes.ok) throw new Error(`GitHub API error: ${repoRes.status} ${repoRes.statusText}`);
  const repoData = await repoRes.json() as Record<string, unknown>;

  // Fetch README
  const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`, {
    headers: { 'User-Agent': 'projects-community', Accept: 'application/vnd.github.raw+json' },
  });
  let readmeText = '';
  if (readmeRes.ok) {
    readmeText = await readmeRes.text() as string;
  }

  // Map language to building style
  const lang = (repoData.language as string || '').toLowerCase();
  const styleMap: Record<string, string> = {
    python: 'workshop', javascript: 'studio', typescript: 'studio',
    rust: 'workshop', go: 'workshop', java: 'workshop', ruby: 'workshop',
    c: 'workshop', 'c++': 'workshop', 'c#': 'studio', swift: 'studio',
    kotlin: 'studio', php: 'workshop', shell: 'data-center', dockerfile: 'data-center',
    html: 'studio', css: 'studio', 'jupyter notebook': 'data-center',
  };
  const buildingStyle = styleMap[lang] || 'workshop';

  const description = (repoData.description as string || '') || cleanRepo;
  const topics = (repoData.topics as string[] || []).join(', ');
  const background = `[GitHub] ${owner}/${cleanRepo}
${description}
${topics ? `Topics: ${topics}` : ''}
${readmeText ? `\n${readmeText.slice(0, 1800)}` : ''}`.trim();
  const imageUrl = repoData.owner && typeof repoData.owner === 'object'
    ? ((repoData.owner as Record<string, unknown>).avatar_url as string || '')
    : '';
  const deployUrl = (repoData.homepage as string || '') || `https://github.com/${owner}/${cleanRepo}`;

  return {
    summary: description.slice(0, 120),
    background: background.slice(0, 2000),
    buildingStyle,
    imageUrl: imageUrl || null,
    deployUrl,
  };
}

export async function getObsidianProjectsAction() {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const yamlStr = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'obsidian-projects.yaml'),
      'utf-8',
    );
    const { parse } = await import('yaml');
    const data = parse(yamlStr) as { projects: Array<Record<string, unknown>> };
    return {
      projects: (data.projects || []).map((p: Record<string, unknown>) => ({
        key: p.key as string,
        summary: p.summary as string,
        background: (p.background as string || '').slice(0, 200),
        lifecycleState: (p.lifecycleState as string) || 'active',
        buildingStyle: (p.buildingStyle as string) || 'workshop',
        imageUrl: (p.image_url as string) || null,
        deployUrl: (p.deploy_url as string) || null,
      })),
    };
  } catch {
    return { projects: [] };
  }
}

export async function batchImportObsidianProjectsAction(formData: FormData) {
  const keysJson = formData.get('keys') as string | null;
  if (!keysJson) throw new Error('No project keys provided');

  const keys: string[] = JSON.parse(keysJson);
  const fs = await import('node:fs');
  const path = await import('node:path');
  const yamlStr = fs.readFileSync(
    path.join(process.cwd(), 'templates', 'obsidian-projects.yaml'),
    'utf-8',
  );
  const { parse } = await import('yaml');
  const yamlData = parse(yamlStr) as { projects: Array<Record<string, unknown>> };

  const { db } = getDatabase();
  let count = 0;

  for (const entry of (yamlData.projects || [])) {
    if (!keys.includes(entry.key as string)) continue;
    const projectId = nanoid();
    db.insert(projects).values({
      id: projectId,
      summary: (entry.summary as string || '').slice(0, 120),
      background: (entry.background as string || '').slice(0, 2000),
      imageUrl: (entry.image_url as string) || null,
      deployUrl: (entry.deploy_url as string) || null,
      buildingStyle: (entry.buildingStyle as string) || 'workshop',
      growthStage: 'seed',
      visibility: 'private',
    }).run();
    count++;
  }

  revalidatePath('/projects');
  return { count };
}
