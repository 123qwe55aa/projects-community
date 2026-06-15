import { Suspense } from 'react';
import { NewProjectForm } from './new-project-form';
import { ProjectsListClient } from './projects-list-client';

export const metadata = {
  title: 'Projects',
};

export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">Organize your research around meaningful goals</p>
        </div>
        <NewProjectForm />
      </div>

      <ProjectsListClient />
    </div>
  );
}
