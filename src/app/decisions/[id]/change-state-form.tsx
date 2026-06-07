'use client';

import { useRef, useState } from 'react';
import { updateDecisionStateAction } from '@/app/actions';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const stateOptions = [
  { value: 'researching', label: 'Researching' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'decided', label: 'Decided' },
  { value: 'archived', label: 'Archived' },
];

const stateDescriptions: Record<string, string> = {
  deferred: 'This decision will be set aside for now. You can reopen it later.',
  archived: 'This decision will be archived and hidden from active views.',
  researching: 'This decision will be moved back to active research.',
  decided: 'Mark this decision as decided. Consider adopting a candidate instead.',
};

export function ChangeStateForm({
  decisionId,
  currentState,
}: {
  decisionId: string;
  currentState: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [selectValue, setSelectValue] = useState(currentState);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    if (newState === currentState) return;
    setPendingState(newState);
  };

  const handleConfirm = async () => {
    if (!pendingState) return;
    const formData = new FormData();
    formData.set('decisionId', decisionId);
    formData.set('state', pendingState);
    setSelectValue(pendingState);
    setPendingState(null);
    await updateDecisionStateAction(formData);
  };

  const handleCancel = () => {
    setPendingState(null);
  };

  const pendingOption = stateOptions.find((o) => o.value === pendingState);

  return (
    <>
      <form ref={formRef} className="flex items-center gap-2">
        <select
          name="state"
          value={selectValue}
          onChange={handleChange}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-white focus:outline-none"
        >
          {stateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </form>

      <ConfirmDialog
        open={pendingState !== null}
        title={`Change state to "${pendingOption?.label ?? pendingState}"?`}
        description={pendingState ? stateDescriptions[pendingState] : undefined}
        confirmLabel="Change State"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}