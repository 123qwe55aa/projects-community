'use client';

import { useState, useRef } from 'react';
import { createProjectAction } from '@/app/actions';

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
      >
        + New Project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">New Project</h2>
            <form
              ref={formRef}
              action={async (formData) => {
                await createProjectAction(formData);
                setOpen(false);
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label htmlFor="background" className="text-sm text-zinc-400">
                  Background & Purpose
                </label>
                <textarea
                  id="background"
                  name="background"
                  required
                  rows={3}
                  placeholder="What is this project about?"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="buildingStyle" className="text-sm text-zinc-400">
                  Building Style
                </label>
                <select
                  id="buildingStyle"
                  name="buildingStyle"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-white focus:outline-none"
                >
                  <option value="workshop">🔨 Workshop</option>
                  <option value="data-center">📊 Data Center</option>
                  <option value="studio">🎨 Studio</option>
                  <option value="community-hall">🏛️ Community Hall</option>
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
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}