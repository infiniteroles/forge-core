-- AlterTable
ALTER TABLE "Project" ADD COLUMN "targetDevDomain" TEXT,
ADD COLUMN "preferredStack" TEXT,
ADD COLUMN "repositoryProvider" TEXT,
ADD COLUMN "repositoryFullName" TEXT,
ADD COLUMN "coolifyApplicationId" TEXT,
ADD COLUMN "coolifyProjectId" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);
