-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "PipelineStep" AS ENUM ('draft', 'tts', 'music', 'mix', 'upload');

-- CreateEnum
CREATE TYPE "PipelineJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'dead');

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "draftHash" TEXT,
ADD COLUMN     "draftStatus" "DraftStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "musicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "narrationText" TEXT,
ADD COLUMN     "voiceId" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "step" "PipelineStep" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resultAssetId" TEXT,
    "resultData" JSONB,
    "bullJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineJob_chapterId_step_idx" ON "PipelineJob"("chapterId", "step");

-- CreateIndex
CREATE INDEX "PipelineJob_status_idx" ON "PipelineJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJob_chapterId_step_contentHash_key" ON "PipelineJob"("chapterId", "step", "contentHash");

-- AddForeignKey
ALTER TABLE "PipelineJob" ADD CONSTRAINT "PipelineJob_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
