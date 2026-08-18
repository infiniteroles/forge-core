-- CreateTable
CREATE TABLE "SessionCheck" (
    "id" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "exitCode" INTEGER,
    "summary" TEXT,
    "stdoutTail" TEXT,
    "stderrTail" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionCheck_workSessionId_idx" ON "SessionCheck"("workSessionId");

-- CreateIndex
CREATE INDEX "SessionCheck_projectId_idx" ON "SessionCheck"("projectId");

-- CreateIndex
CREATE INDEX "SessionCheck_taskId_idx" ON "SessionCheck"("taskId");

-- AddForeignKey
ALTER TABLE "SessionCheck" ADD CONSTRAINT "SessionCheck_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCheck" ADD CONSTRAINT "SessionCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCheck" ADD CONSTRAINT "SessionCheck_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
