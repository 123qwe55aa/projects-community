'use client';

import { useRef } from 'react';
import { updateDecisionStateAction } from '@/app/actions';

const stateOptions = [
  { value: 'researching', label: 'Researching' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'decided', label: 'Decided' },
  { value: 'archived', label: 'Archived' },
];

export function ChangeStateForm({
  decisionId,
  currentState,
}: {
  decisionId: string;
  currentState: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await updateDecisionStateAction(formData);
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="decisionId" value={decisionId} />
      <select
        name="state"
        defaultValue={currentState}
        onChange={(e) => {
          const form = formRef.current;
          if (form) form.requestSubmit();
        }}
        className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-white focus:outline-none"
      >
        {stateOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </form>
  );
}