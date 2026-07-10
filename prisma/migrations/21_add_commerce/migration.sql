-- AlterTable
ALTER TABLE "revenue" ALTER COLUMN "session_id" DROP NOT NULL;
ALTER TABLE "revenue" ALTER COLUMN "event_id" DROP NOT NULL;
ALTER TABLE "revenue" ADD COLUMN "provider" VARCHAR(50) NOT NULL DEFAULT 'web';
ALTER TABLE "revenue" ADD COLUMN "provider_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "revenue_website_id_provider_provider_id_key" ON "revenue"("website_id", "provider", "provider_id");

-- CreateTable
CREATE TABLE "commerce_integration" (
    "integration_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "credentials" TEXT,
    "webhook_secret" VARCHAR(500),
    "provider_account_id" VARCHAR(255),
    "last_event_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "commerce_integration_pkey" PRIMARY KEY ("integration_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commerce_integration_website_id_provider_key" ON "commerce_integration"("website_id", "provider");

-- CreateIndex
CREATE INDEX "commerce_integration_website_id_idx" ON "commerce_integration"("website_id");

-- CreateTable
CREATE TABLE "commerce_event" (
    "commerce_event_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "integration_id" UUID,
    "provider" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "provider_transaction_id" VARCHAR(255) NOT NULL,
    "provider_customer_id" VARCHAR(255),
    "provider_subscription_id" VARCHAR(255),
    "customer_email_hash" VARCHAR(255),
    "product_id" VARCHAR(255),
    "product_name" VARCHAR(500),
    "quantity" INTEGER,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "attribution" VARCHAR(50) NOT NULL DEFAULT 'none',
    "session_id" UUID,
    "visit_id" UUID,
    "revenue_id" UUID,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_event_pkey" PRIMARY KEY ("commerce_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commerce_event_website_id_provider_provider_event_id_key" ON "commerce_event"("website_id", "provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "commerce_event_website_id_idx" ON "commerce_event"("website_id");

-- CreateIndex
CREATE INDEX "commerce_event_website_id_created_at_idx" ON "commerce_event"("website_id", "created_at");

-- CreateIndex
CREATE INDEX "commerce_event_website_id_provider_created_at_idx" ON "commerce_event"("website_id", "provider", "created_at");

-- CreateIndex
CREATE INDEX "commerce_event_website_id_provider_customer_id_idx" ON "commerce_event"("website_id", "provider_customer_id");

-- CreateIndex
CREATE INDEX "commerce_event_session_id_idx" ON "commerce_event"("session_id");
