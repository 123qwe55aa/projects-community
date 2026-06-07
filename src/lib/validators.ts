import { z } from 'zod';

// ──────────────────────────────────────────────────
// Enum-like constants
// ──────────────────────────────────────────────────

const BuildingStyle = z.enum(['workshop', 'data-center', 'studio', 'community-hall']);
const DecisionState = z.enum(['researching', 'deferred', 'decided', 'archived']);
const DecisionScope = z.enum(['independent', 'project', 'global']);
const Visibility = z.enum(['private', 'public']);
const MessageRole = z.enum(['user', 'assistant']);
const ConversationContextType = z.enum(['project', 'decision', 'candidate']);
const ResearchJobStatus = z.enum(['pending', 'running', 'completed', 'failed']);

// ──────────────────────────────────────────────────
// Project
// ──────────────────────────────────────────────────

export const createProjectSchema = z.object({
  ownerId: z.string().optional().default('default'),
  background: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  buildingStyle: BuildingStyle.nullable().optional(),
  growthStage: z.string().nullable().optional(),
  visibility: Visibility.optional().default('private'),
});

export const updateProjectSchema = z.object({
  background: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  buildingStyle: BuildingStyle.nullable().optional(),
  growthStage: z.string().nullable().optional(),
  visibility: Visibility.optional(),
});

// ──────────────────────────────────────────────────
// Decision
// ──────────────────────────────────────────────────

export const createDecisionSchema = z.object({
  ownerId: z.string().optional().default('default'),
  question: z.string().min(1),
  state: DecisionState.optional().default('researching'),
  scope: DecisionScope.optional().default('independent'),
  dimensions: z.any().optional().nullable(), // JSON - validated at app layer
  weights: z.any().optional().nullable(),     // JSON - validated at app layer
  projectId: z.string().nullable().optional(),
  visibility: Visibility.optional().default('private'),
});

export const updateDecisionStateSchema = z.object({
  state: DecisionState,
});

// ──────────────────────────────────────────────────
// Candidate
// ──────────────────────────────────────────────────

export const createCandidateSchema = z.object({
  decisionId: z.string().min(1),
  name: z.string().min(1),
  currentFormSummary: z.string().nullable().optional(),
});

// ──────────────────────────────────────────────────
// Conversation
// ──────────────────────────────────────────────────

export const createConversationSchema = z.object({
  contextType: ConversationContextType,
  contextId: z.string().min(1),
});

// ──────────────────────────────────────────────────
// Message
// ──────────────────────────────────────────────────

export const createMessageSchema = z.object({
  conversationId: z.string().min(1),
  role: MessageRole,
  content: z.string().min(1),
  sourceLinks: z.any().optional().nullable(), // JSON - validated at app layer
});

// ──────────────────────────────────────────────────
// Recommendation
// ──────────────────────────────────────────────────

export const createRecommendationSchema = z.object({
  decisionId: z.string().min(1),
  candidateId: z.string().min(1),
  reasoning: z.string().min(1),
  sourceLinks: z.any().optional().nullable(),
});

// ──────────────────────────────────────────────────
// Adoption Snapshot
// ──────────────────────────────────────────────────

export const createAdoptionSchema = z.object({
  decisionId: z.string().min(1),
  candidateId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  candidateSummary: z.string().min(1),
  reasoning: z.string().min(1),
});

// ──────────────────────────────────────────────────
// Research Job
// ──────────────────────────────────────────────────

export const createResearchJobSchema = z.object({
  conversationId: z.string().min(1),
  query: z.string().min(1),
});

export const updateResearchJobStatusSchema = z.object({
  status: ResearchJobStatus,
  results: z.any().optional().nullable(),
  error: z.string().nullable().optional(),
});

// ──────────────────────────────────────────────────
// Inferred types
// ──────────────────────────────────────────────────

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionStateInput = z.infer<typeof updateDecisionStateSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;
export type CreateAdoptionInput = z.infer<typeof createAdoptionSchema>;
export type CreateResearchJobInput = z.infer<typeof createResearchJobSchema>;
export type UpdateResearchJobStatusInput = z.infer<typeof updateResearchJobStatusSchema>;