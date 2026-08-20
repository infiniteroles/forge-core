-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resourceType" TEXT,
    "resourceId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "workSessionId" TEXT,
    "currentStage" TEXT,
    "progressPercent" INTEGER,
    "summary" TEXT,
    "error" TEXT,
    "input" JSONB,
    "result" JSONB,
    "metadata" JSONB,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_type_idx" ON "JobRun"("type");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE INDEX "JobRun_resourceType_resourceId_idx" ON "JobRun"("resourceType", "resourceId");

-- AlterTable (ProductionPromotion.jobRunId)
ALTER TABLE "ProductionPromotion" ADD COLUMN "jobRunId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPromotion_jobRunId_key" ON "ProductionPromotion"("jobRunId");

-- AddForeignKey
ALTER TABLE "ProductionPromotion" ADD CONSTRAINT "ProductionPromotion_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
