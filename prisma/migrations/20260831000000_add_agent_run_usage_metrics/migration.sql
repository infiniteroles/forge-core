-- Fase 4.5 — LLM usage metrics for AgentRun.
-- prompt/completion/total tokens, estimated cost (USD) and provider, plus a
-- small JSONB metadata bucket (used to store e.g. PR head SHA for review reuse).

ALTER TABLE "AgentRun" ADD COLUMN "promptTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "completionTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "totalTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION;
ALTER TABLE "AgentRun" ADD COLUMN "provider" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "metadata" JSONB;
