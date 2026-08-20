-- CreateTable
CREATE TABLE "ProductionReadinessReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "workSessionId" TEXT,
    "previewDeploymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recommendation" TEXT,
    "riskLevel" TEXT,
    "summary" TEXT,
    "blockingReasons" JSONB,
    "checksSummary" JSONB,
    "previewSummary" JSONB,
    "prSummary" JSONB,
    "filesSummary" JSONB,
    "humanNotes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionReadinessReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionReadinessReview_projectId_idx" ON "ProductionReadinessReview"("projectId");

-- CreateIndex
CREATE INDEX "ProductionReadinessReview_taskId_idx" ON "ProductionReadinessReview"("taskId");

-- CreateIndex
CREATE INDEX "ProductionReadinessReview_workSessionId_idx" ON "ProductionReadinessReview"("workSessionId");

-- CreateIndex
CREATE INDEX "ProductionReadinessReview_previewDeploymentId_idx" ON "ProductionReadinessReview"("previewDeploymentId");

-- AddForeignKey
ALTER TABLE "ProductionReadinessReview" ADD CONSTRAINT "ProductionReadinessReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionReadinessReview" ADD CONSTRAINT "ProductionReadinessReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionReadinessReview" ADD CONSTRAINT "ProductionReadinessReview_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionReadinessReview" ADD CONSTRAINT "ProductionReadinessReview_previewDeploymentId_fkey" FOREIGN KEY ("previewDeploymentId") REFERENCES "PreviewDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
