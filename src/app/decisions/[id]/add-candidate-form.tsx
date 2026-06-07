'use client';

import { useState, useRef } from 'react';
import { addCandidateAction } from '@/app/actions';

export function AddCandidateForm({ decisionId }: { decisionId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
      >
        + Add Candidate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Add Candidate</h2>
            <form
              ref={formRef}
              action={async (formData) => {
                formData.set('decisionId', decisionId);
                await addCandidateAction(formData);
                setOpen(false);
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm text-zinc-400">
                  Candidate Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Option A, Alternative X..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="summary" className="text-sm text-zinc-400">
                  Summary (optional)
                </label>
                <textarea
                  id="summary"
                  name="summary"
                  rows={3}
                  placeholder="Brief description of this candidate..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                />
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
                  Add Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}