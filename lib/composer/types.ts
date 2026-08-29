// Fase 6.0 — Chat Composer types.

export type ComposerRole = "user" | "assistant";

export type ComposerMessageKind =
  | "text"
  | "logo"
  | "spec"
  | "proposal"
  | "plan"
  | "system";

export type ComposerMessage = {
  id: string;
  role: ComposerRole;
  kind: ComposerMessageKind;
  content: string;
  createdAt: string;
};

export type ComposerSpec = {
  name: string;
  purpose: string;
  /** "none" | "new" | repository URL */
  repo?: string;
  /** "none" | "single_user" | "multi_user" */
  auth?: string;
  authProvider?: string;
  audience?: string;
  /** "shadcn" | "material3" | "other" */
  uiLibrary?: string;
  palette?: string[];
  logoStyle?: {
    hasLogo: boolean;
    dominantColors: string[];
    notes?: string;
  };
};

export type ComposerProposal = {
  summary: string;
  stack: {
    frontend: string;
    backend: string;
    database: string;
    auth: string;
    hosting: string;
  };
  structure?: string[];
  openQuestions?: string[];
};

export type ComposerPlan = {
  summary: string;
  phases: string[];
  tasks: {
    title: string;
    description: string;
    kind: string;
    phase?: string;
    /** Perfil de agente asignado: planner | dev | infra | qa */
    agent?: string;
  }[];
  testStrategy: string;
  risks?: string[];
};

export type ComposerStatus =
  | "discovering"
  | "proposal"
  | "planning"
  | "building"
  | "preview"
  | "done"
  | "blocked";

export type ComposerTurnResult = {
  reply: string;
  kind: ComposerMessageKind;
  spec?: ComposerSpec | null;
  status: ComposerStatus;
  /** Clickable options for closed questions (optional). */
  options?: string[];
};
