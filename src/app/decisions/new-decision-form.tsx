'use client';

import { useState, useRef } from 'react';
import { createDecisionAction } from '@/app/actions';

interface Project {
  id: string;
  summary: string | null;
  background: string | null;
}

export function NewDecisionForm({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
      >
        + New Decision
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">New Decision</h2>
            <form
              ref={formRef}
              action={async (formData) => {
                await createDecisionAction(formData);
                setOpen(false);
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label htmlFor="question" className="text-sm text-zinc-400">
                  Decision Question
                </label>
                <input
                  id="question"
                  name="question"
                  type="text"
                  required
                  placeholder="What should we decide?"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="scope" className="text-sm text-zinc-400">
                  Scope
                </label>
                <select
                  id="scope"
                  name="scope"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-white focus:outline-none"
                >
                  <option value="independent">Independent — stands alone</option>
                  <option value="project">Project — tied to a specific project</option>
                  <option value="global">Global — affects all projects</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="projectId" className="text-sm text-zinc-400">
                  Project (optional)
                </label>
                <select
                  id="projectId"
                  name="projectId"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-white focus:outline-none"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.summary || p.background?.slice(0, 40) || p.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
                >
                  Create Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}