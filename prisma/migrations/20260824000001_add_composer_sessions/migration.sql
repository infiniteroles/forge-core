-- Fase 6.0 — Composer Session (Chat Composer MVP).
-- Conversational discovery/proposal state for the chat-first creation flow.
-- messages/spec/proposal/plan are JSONB buckets.

CREATE TABLE "ComposerSession" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'discovering',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "spec" JSONB,
    "proposal" JSONB,
    "plan" JSONB,
    "projectId" TEXT,
    "logoUrl" TEXT,
    "stylePref" TEXT,
    "palette" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComposerSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComposerSession_projectId_idx" ON "ComposerSession"("projectId");

ALTER TABLE "ComposerSession"
    ADD CONSTRAINT "ComposerSession_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
