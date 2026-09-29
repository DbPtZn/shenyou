-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'reviewing', 'published', 'offline');

-- CreateEnum
CREATE TYPE "AudioTrackType" AS ENUM ('narration', 'ambient', 'music', 'mixed');

-- CreateEnum
CREATE TYPE "AudioAssetStatus" AS ENUM ('processing', 'ready');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "coverUrl" TEXT,
    "tags" TEXT[],
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "trackType" "AudioTrackType" NOT NULL,
    "mixPreset" TEXT NOT NULL DEFAULT 'default',
    "objectKey" TEXT NOT NULL,
    "durationSec" INTEGER,
    "sizeBytes" INTEGER,
    "status" "AudioAssetStatus" NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackHistory" (
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackHistory_pkey" PRIMARY KEY ("userId","chapterId")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","journeyId")
);

-- CreateIndex
CREATE INDEX "Journey_status_createdAt_idx" ON "Journey"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Chapter_journeyId_idx" ON "Chapter"("journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_journeyId_index_key" ON "Chapter"("journeyId", "index");

-- CreateIndex
CREATE INDEX "AudioAsset_chapterId_status_idx" ON "AudioAsset"("chapterId", "status");

-- CreateIndex
CREATE INDEX "PlaybackHistory_userId_updatedAt_idx" ON "PlaybackHistory"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioAsset" ADD CONSTRAINT "AudioAsset_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackHistory" ADD CONSTRAINT "PlaybackHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackHistory" ADD CONSTRAINT "PlaybackHistory_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
