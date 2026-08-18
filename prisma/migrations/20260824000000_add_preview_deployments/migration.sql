-- CreateTable
CREATE TABLE "PreviewDeployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "workSessionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'coolify',
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "previewUrl" TEXT,
    "domain" TEXT,
    "branchName" TEXT,
    "repositoryFullName" TEXT,
    "pullRequestNumber" INTEGER,
    "coolifyApplicationUuid" TEXT,
    "coolifyDeploymentUuid" TEXT,
    "coolifyProjectUuid" TEXT,
    "coolifyServerUuid" TEXT,
    "commitSha" TEXT,
    "lastDeploymentStatus" TEXT,
    "lastDeploymentLogUrl" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "PreviewDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreviewDeployment_projectId_idx" ON "PreviewDeployment"("projectId");

-- CreateIndex
CREATE INDEX "PreviewDeployment_taskId_idx" ON "PreviewDeployment"("taskId");

-- CreateIndex
CREATE INDEX "PreviewDeployment_workSessionId_idx" ON "PreviewDeployment"("workSessionId");

-- AddForeignKey
ALTER TABLE "PreviewDeployment" ADD CONSTRAINT "PreviewDeployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewDeployment" ADD CONSTRAINT "PreviewDeployment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewDeployment" ADD CONSTRAINT "PreviewDeployment_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
