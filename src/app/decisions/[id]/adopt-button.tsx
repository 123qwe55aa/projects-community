'use client';

import { useState, useRef } from 'react';
import { adoptCandidateAction } from '@/app/actions';

export function AdoptButton({
  decisionId,
  candidateId,
  candidateName,
  candidateSummary,
  decisionState,
}: {
  decisionId: string;
  candidateId: string;
  candidateName: string;
  candidateSummary: string | null;
  decisionState: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleAdopt = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    try {
      await adoptCandidateAction(formData);
      setSuccess(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to adopt candidate');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="shrink-0 rounded-full border border-green-700 bg-green-900/40 px-3 py-1 text-xs text-green-400">
        Adopted
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={decisionState === 'archived'}
        className="shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Adopt
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Adopt &ldquo;{candidateName}&rdquo;
            </h2>
            <p className="text-sm text-zinc-400">
              You are adopting this candidate as the decision for this question. The decision state
              will be set to &ldquo;decided&rdquo;.
            </p>

            <form
              ref={formRef}
              action={handleAdopt}
              className="space-y-4"
            >
              <input type="hidden" name="decisionId" value={decisionId} />
              <input type="hidden" name="candidateId" value={candidateId} />
              <input type="hidden" name="candidateSummary" value={candidateSummary || ''} />

              <div className="space-y-1">
                <label htmlFor="reasoning" className="text-sm text-zinc-400">
                  Reasoning (why this candidate?)
                </label>
                <textarea
                  id="reasoning"
                  name="reasoning"
                  rows={4}
                  required
                  placeholder="Explain why you chose this candidate..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(null); }}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Adopting...' : 'Adopt Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}