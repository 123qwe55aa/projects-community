'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDecisionAction, deleteProjectAction } from '@/app/actions';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface DeleteEntityButtonProps {
  entityId: string;
  entityName: string;
  entityType: 'project' | 'decision';
}

export function DeleteEntityButton({
  entityId,
  entityName,
  entityType,
}: DeleteEntityButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const label = entityType === 'project' ? 'Delete Project' : 'Delete Decision';
  const description =
    entityType === 'project'
      ? `Delete "${entityName}"? Its decisions will be preserved as independent decisions. This cannot be undone.`
      : `Delete "${entityName}" and all of its candidates, adoption history, and conversations? This cannot be undone.`;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const action = entityType === 'project' ? deleteProjectAction : deleteDecisionAction;
        const result = await action(entityId);
        router.push(result.redirectTo);
        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Delete failed');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-900/80 px-3 py-1.5 text-xs font-medium text-red-400 hover:border-red-700 hover:bg-red-950/40 transition"
      >
        {label}
      </button>

      <ConfirmDialog
        open={open}
        title={label}
        description={description}
        confirmLabel={isPending ? 'Deleting...' : label}
        confirmClassName="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 transition"
        confirmDisabled={isPending}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isPending) setOpen(false);
        }}
      />

      {error && <p className="max-w-sm text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
