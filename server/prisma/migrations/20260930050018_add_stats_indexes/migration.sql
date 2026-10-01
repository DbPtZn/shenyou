-- CreateIndex
CREATE INDEX "PlaybackHistory_chapterId_idx" ON "PlaybackHistory"("chapterId");

-- CreateIndex
CREATE INDEX "PlaybackHistory_updatedAt_idx" ON "PlaybackHistory"("updatedAt");

-- CreateIndex
CREATE INDEX "User_subscriptionStatus_idx" ON "User"("subscriptionStatus");
