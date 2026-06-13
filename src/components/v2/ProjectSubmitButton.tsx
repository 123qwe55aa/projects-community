'use client';

import { useFormStatus } from 'react-dom';

export function ProjectSubmitButton({
  label,
  pendingLabel,
  subdued = false,
}: {
  label: string;
  pendingLabel: string;
  subdued?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={[
        subdued
          ? 'border border-zinc-700 text-zinc-300 hover:border-zinc-500'
          : 'bg-white font-medium text-black hover:bg-zinc-200',
        'rounded-md px-3 py-2 text-sm transition disabled:cursor-wait disabled:opacity-60',
      ].join(' ')}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
