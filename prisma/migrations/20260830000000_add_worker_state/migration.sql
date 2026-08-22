-- Fase 4.3 — Detached Job Runner
-- WorkerState: single-row (or few-row) liveness heartbeat for the detached
-- forge-worker process. The web uses it to know whether a worker is active
-- (for recovery dispatch and the UI "Worker expected / Runner" signal).

-- CreateTable
CREATE TABLE "WorkerState" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerState_pkey" PRIMARY KEY ("id")
);
