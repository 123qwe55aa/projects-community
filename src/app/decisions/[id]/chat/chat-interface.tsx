'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface DecisionData {
  id: string;
  question: string;
  state: string;
  scope: string;
  dimensions: string | null;
  weights: string | null;
  projectId: string | null;
}

interface CandidateData {
  id: string;
  name: string;
  currentFormSummary: string | null;
  decisionId: string;
}

interface MessageData {
  id: string;
  role: string;
  content: string;
  createdAt: string | null;
}

interface ChatInterfaceProps {
  decisionId: string;
  decision: DecisionData;
  candidates: CandidateData[];
  conversationId: string;
  initialMessages: MessageData[];
  activeCandidateId: string | null;
}

export function ChatInterface({
  decisionId,
  decision,
  candidates,
  conversationId,
  initialMessages,
  activeCandidateId,
}: ChatInterfaceProps) {
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: '/api/chat',
      body: {
        decisionId,
        candidateId: activeCandidateId,
      },
      initialMessages: initialMessages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeCandidate = candidates.find((c) => c.id === activeCandidateId);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Candidate Sidebar */}
      {candidates.length > 0 && (
        <div
          className={`shrink-0 border-r border-zinc-800 bg-zinc-950 transition-all duration-200 ${
            showSidebar ? 'w-56' : 'w-0 overflow-hidden'
          }`}
        >
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Candidates
              </h3>
            </div>

            {/* Decision-level chat link */}
            <Link
              href={`/decisions/${decisionId}/chat`}
              className={`block rounded-md px-3 py-2 text-sm transition ${
                !activeCandidateId
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              All candidates
            </Link>

            {candidates.map((c) => (
              <Link
                key={c.id}
                href={`/decisions/${decisionId}/chat?candidate=${c.id}`}
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  activeCandidateId === c.id
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span className="truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Toggle sidebar button */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 shrink-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            {showSidebar ? '◀ Hide sidebar' : '▶ Show sidebar'}
          </button>
          {activeCandidate && (
            <span className="text-xs text-zinc-500">
              Focus: <span className="text-zinc-300">{activeCandidate.name}</span>
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-600 text-sm">
                Ask a question about this decision to get started.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-900/50 text-blue-100 border border-blue-800/50'
                    : 'bg-zinc-800/80 text-zinc-200 border border-zinc-700/50'
                }`}
              >
                {/* Render content preserving line breaks */}
                {m.content.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < m.content.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start">
              <div className="bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm">
                <span className="inline-flex gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-100">●</span>
                  <span className="animate-pulse delay-200">●</span>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-900/30 border border-red-800/50 text-red-300 rounded-lg px-4 py-2.5 text-sm">
                Error: {error.message || 'Something went wrong'}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 p-4 max-w-4xl mx-auto"
          >
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about this decision..."
                rows={1}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}