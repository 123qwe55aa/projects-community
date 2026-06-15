'use client';

import { ObsidianImportFlow } from './obsidian-import-flow';

export function ImportObsidianModal({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900">
        <ObsidianImportFlow onDone={onDone} onBack={onCancel} />
      </div>
    </div>
  );
}
