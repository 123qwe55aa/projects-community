'use client';

import { useState, useRef } from 'react';
import { createProjectAction } from '@/app/actions';
import { PROJECT_TEMPLATES, type ProjectTemplate, type BuildingStyle } from './templates';

type Step = 'picker' | 'form';

const STYLE_LABELS: Record<BuildingStyle, string> = {
  workshop: '🔨 Workshop',
  'data-center': '📊 Data Center',
  studio: '🎨 Studio',
  'community-hall': '🏛️ Community Hall',
};

const TEMPLATE_ICONS: Record<string, string> = {
  'tech-stack-decision': '⚡',
  'tool-evaluation': '🔍',
  'framework-comparison': '⚖️',
  'architecture-design': '🏗️',
  'vendor-assessment': '🤝',
  'learning-path': '📚',
};

export function NewProjectForm({ onProjectCreated }: { onProjectCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('picker');
  const [background, setBackground] = useState('');
  const [buildingStyle, setBuildingStyle] = useState<BuildingStyle>('workshop');
  const [imageUrl, setImageUrl] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  function handleOpen() {
    setStep('picker');
    setBackground('');
    setBuildingStyle('workshop');
    setImageUrl('');
    setDeployUrl('');
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  function handlePickTemplate(template: ProjectTemplate) {
    setBackground(template.background);
    setBuildingStyle(template.buildingStyle);
    setStep('form');
  }

  function handleScratch() {
    setBackground('');
    setBuildingStyle('workshop');
    setStep('form');
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition"
      >
        + New Project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900"
            style={{ maxWidth: step === 'picker' ? '640px' : '448px' }}
          >
            {/* ── Template Picker ── */}
            {step === 'picker' && (
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">Start with a template</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Choose a template to pre-fill the form, or start from scratch.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PROJECT_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handlePickTemplate(t)}
                      className="group text-left rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-1 hover:border-zinc-500 hover:bg-zinc-750 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                      style={{ backgroundColor: undefined }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{TEMPLATE_ICONS[t.id] ?? '📋'}</span>
                        <span className="font-medium text-white text-sm group-hover:text-zinc-100">
                          {t.name}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-snug">{t.description}</p>
                      <span className="inline-block mt-1 text-xs text-zinc-600">
                        {STYLE_LABELS[t.buildingStyle]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                  <button
                    onClick={handleScratch}
                    className="text-sm text-zinc-400 hover:text-white transition"
                  >
                    Start from scratch →
                  </button>
                  <button
                    onClick={handleClose}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Project Form ── */}
            {step === 'form' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep('picker')}
                    className="text-zinc-500 hover:text-white transition text-sm"
                    aria-label="Back to templates"
                  >
                    ←
                  </button>
                  <h2 className="text-lg font-semibold text-white">New Project</h2>
                </div>

                <form
                  ref={formRef}
                  action={async (formData) => {
                    await createProjectAction(formData);
                    setOpen(false);
                    onProjectCreated?.();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label htmlFor="background" className="text-sm text-zinc-400">
                      Background &amp; Purpose
                    </label>
                    <textarea
                      id="background"
                      name="background"
                      required
                      rows={5}
                      value={background}
                      onChange={(e) => setBackground(e.target.value)}
                      placeholder="What is this project about?"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="buildingStyle" className="text-sm text-zinc-400">
                      Building Style
                    </label>
                    <select
                      id="buildingStyle"
                      name="buildingStyle"
                      value={buildingStyle}
                      onChange={(e) => setBuildingStyle(e.target.value as BuildingStyle)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-white focus:outline-none"
                    >
                      <option value="workshop">🔨 Workshop</option>
                      <option value="data-center">📊 Data Center</option>
                      <option value="studio">🎨 Studio</option>
                      <option value="community-hall">🏛️ Community Hall</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="imageUrl" className="text-sm text-zinc-400">
                      Image URL
                    </label>
                    <input
                      id="imageUrl"
                      name="imageUrl"
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/project-preview.png"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="deployUrl" className="text-sm text-zinc-400">
                      Deploy URL
                    </label>
                    <input
                      id="deployUrl"
                      name="deployUrl"
                      type="url"
                      value={deployUrl}
                      onChange={(e) => setDeployUrl(e.target.value)}
                      placeholder="https://my-project.vercel.app"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
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
            )}
          </div>
        </div>
      )}
    </>
  );
}