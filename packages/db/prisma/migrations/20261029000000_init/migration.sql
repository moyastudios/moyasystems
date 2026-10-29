-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('WARN', 'KICK', 'SERVERBAN', 'TIMEBAN', 'GAMEBAN');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('DISCORD', 'IN_GAME', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "LoaStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('OAUTH_STATE', 'CLAIM', 'PASSKEY_REGISTER', 'PASSKEY_LOGIN', 'STEP_UP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "roblox_id" BIGINT,
    "roblox_username" TEXT,
    "linked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_codes" (
    "code_hash" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_codes_pkey" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "ranks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "discord_role_id" TEXT,
    "roblox_group_rank" INTEGER,

    CONSTRAINT "ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rank_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "command" TEXT NOT NULL,
    "min_rank_id" TEXT NOT NULL,
    "max_duration" INTEGER,
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("command")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "case_no" SERIAL NOT NULL,
    "type" "CaseType" NOT NULL,
    "target_roblox_id" BIGINT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_url" TEXT,
    "duration" INTEGER,
    "expires_at" TIMESTAMP(3),
    "server_job_id" TEXT,
    "source" "CaseSource" NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_calls" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "requester_roblox_id" BIGINT NOT NULL,
    "server_job_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "counted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "help_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_rules" (
    "id" TEXT NOT NULL,
    "rank_id" TEXT NOT NULL,
    "min_help_calls" INTEGER NOT NULL,
    "min_actions" INTEGER NOT NULL,
    "min_events" INTEGER NOT NULL,
    "min_call_seconds" INTEGER NOT NULL,
    "repeat_cap" INTEGER NOT NULL,

    CONSTRAINT "quota_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loa" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "starts" TIMESTAMP(3) NOT NULL,
    "ends" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LoaStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "config_versions" (
    "version" SERIAL NOT NULL,
    "changed_by" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "rolled_back_from" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "nickname" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "ip" TEXT,
    "mirrored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_sessions" (
    "id_hash" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "passkey_verified_at" TIMESTAMP(3),
    "step_up_at" TIMESTAMP(3),
    "csrf_secret" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "dashboard_sessions_pkey" PRIMARY KEY ("id_hash")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "discord_id" TEXT,
    "challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_invites" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "for_discord_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "place_id" BIGINT NOT NULL,
    "key_ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_nonces" (
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "connectivity_checks" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "detail" TEXT,

    CONSTRAINT "connectivity_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discord_id_key" ON "users"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_roblox_id_key" ON "users"("roblox_id");

-- CreateIndex
CREATE UNIQUE INDEX "link_codes_discord_id_key" ON "link_codes"("discord_id");

-- CreateIndex
CREATE INDEX "link_codes_expires_at_idx" ON "link_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ranks_name_key" ON "ranks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ranks_order_key" ON "ranks"("order");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_no_key" ON "cases"("case_no");

-- CreateIndex
CREATE INDEX "cases_target_roblox_id_created_at_idx" ON "cases"("target_roblox_id", "created_at");

-- CreateIndex
CREATE INDEX "cases_moderator_id_created_at_idx" ON "cases"("moderator_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "help_calls_external_id_key" ON "help_calls"("external_id");

-- CreateIndex
CREATE INDEX "help_calls_staff_id_accepted_at_idx" ON "help_calls"("staff_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "quota_rules_rank_id_key" ON "quota_rules"("rank_id");

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "passkeys_discord_id_idx" ON "passkeys"("discord_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_mirrored_at_idx" ON "audit_log"("mirrored_at");

-- CreateIndex
CREATE INDEX "dashboard_sessions_discord_id_idx" ON "dashboard_sessions"("discord_id");

-- CreateIndex
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_invites_token_hash_key" ON "owner_invites"("token_hash");

-- CreateIndex
CREATE INDEX "game_sessions_job_id_idx" ON "game_sessions"("job_id");

-- CreateIndex
CREATE INDEX "game_sessions_expires_at_idx" ON "game_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "request_nonces_expires_at_idx" ON "request_nonces"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "ranks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_min_rank_id_fkey" FOREIGN KEY ("min_rank_id") REFERENCES "ranks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_calls" ADD CONSTRAINT "help_calls_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_rules" ADD CONSTRAINT "quota_rules_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "ranks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loa" ADD CONSTRAINT "loa_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loa" ADD CONSTRAINT "loa_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

