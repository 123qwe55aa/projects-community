'use client';

import { useState } from 'react';
import { NewProjectForm } from './new-project-form';
import { ProjectsListClient } from './projects-list-client';

export default function ProjectsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleProjectChange() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">Organize your research around meaningful goals</p>
        </div>
        <NewProjectForm onProjectCreated={handleProjectChange} />
      </div>

      <ProjectsListClient refreshKey={refreshKey} />
    </div>
  );
}
