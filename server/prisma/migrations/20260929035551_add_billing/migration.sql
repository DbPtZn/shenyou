-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'expired',
    "environment" TEXT,
    "store" TEXT,
    "productId" TEXT,
    "periodType" TEXT,
    "willRenew" BOOLEAN NOT NULL DEFAULT true,
    "expirationAt" TIMESTAMP(3),
    "originalTransactionId" TEXT,
    "latestEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEventLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_key" ON "Entitlement"("userId");

-- CreateIndex
CREATE INDEX "Entitlement_status_expirationAt_idx" ON "Entitlement"("status", "expirationAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEventLog_eventId_key" ON "BillingEventLog"("eventId");

-- CreateIndex
CREATE INDEX "BillingEventLog_environment_createdAt_idx" ON "BillingEventLog"("environment", "createdAt");

-- CreateIndex
CREATE INDEX "BillingEventLog_eventType_createdAt_idx" ON "BillingEventLog"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
