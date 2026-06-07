'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdoptButton } from '../adopt-button';

type Candidate = {
  id: string;
  name: string;
  currentFormSummary: string | null;
};

export function CompareInterface({
  decisionId,
  decisionQuestion,
  decisionState,
  candidates,
  dimensions,
}: {
  decisionId: string;
  decisionQuestion: string;
  decisionState: string;
  candidates: Candidate[];
  dimensions: string[] | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selected.size < 2) return;
    setSelectedIds(Array.from(selected));
    setComparing(true);
  };

  const comparedCandidates = comparing
    ? candidates.filter((c) => selectedIds.includes(c.id))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Compare Candidates</h1>
          <p className="text-sm text-zinc-400 mt-1">{decisionQuestion}</p>
        </div>
        <Link
          href={`/decisions/${decisionId}`}
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 transition"
        >
          Back to Decision
        </Link>
      </div>

      {candidates.length < 2 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-500">You need at least 2 candidates to compare.</p>
          <p className="text-sm text-zinc-600 mt-1">
            Add more candidates on the{' '}
            <Link href={`/decisions/${decisionId}`} className="text-blue-400 hover:underline">
              decision page
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/* Candidate selection grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Select Candidates to Compare</h2>
              <button
                onClick={handleCompare}
                disabled={selected.size < 2}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Compare {selected.size >= 2 ? `(${selected.size})` : '(select 2+)'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition ${
                    selected.has(c.id)
                      ? 'border-blue-500 bg-blue-950/30'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-blue-500"
                  />
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-white">{c.name}</h3>
                    {c.currentFormSummary && (
                      <p className="text-xs text-zinc-400 line-clamp-3">
                        {c.currentFormSummary}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Comparison results */}
          {comparing && comparedCandidates.length >= 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">
                Comparison: {comparedCandidates.map((c) => c.name).join(' vs ')}
              </h2>

              {dimensions && dimensions.length > 0 ? (
                /* Dimension-by-dimension comparison table */
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900">
                        <th className="px-4 py-3 text-left text-zinc-400 font-medium">
                          Dimension
                        </th>
                        {comparedCandidates.map((c) => (
                          <th
                            key={c.id}
                            className="px-4 py-3 text-left text-white font-semibold"
                          >
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dimensions.map((dim, i) => (
                        <tr
                          key={dim}
                          className={
                            i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'
                          }
                        >
                          <td className="px-4 py-3 text-zinc-300 font-medium">{dim}</td>
                          {comparedCandidates.map((c) => (
                            <td key={c.id} className="px-4 py-3 text-zinc-400">
                              —
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Simple text comparison */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comparedCandidates.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-2"
                    >
                      <h3 className="text-sm font-semibold text-white">{c.name}</h3>
                      {c.currentFormSummary ? (
                        <p className="text-sm text-zinc-400">{c.currentFormSummary}</p>
                      ) : (
                        <p className="text-sm text-zinc-600 italic">No summary available</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Adoption buttons for each compared candidate */}
              <div className="space-y-3">
                <h3 className="text-md font-semibold text-white">Adopt a Candidate</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comparedCandidates.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-white">{c.name}</h4>
                        {c.currentFormSummary && (
                          <p className="text-xs text-zinc-500 line-clamp-1">
                            {c.currentFormSummary}
                          </p>
                        )}
                      </div>
                      <AdoptButton
                        decisionId={decisionId}
                        candidateId={c.id}
                        candidateName={c.name}
                        candidateSummary={c.currentFormSummary}
                        decisionState={decisionState}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}