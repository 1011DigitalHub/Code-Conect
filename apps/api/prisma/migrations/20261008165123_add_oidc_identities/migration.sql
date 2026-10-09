-- AlterTable
-- `search_vector` is a generated column (DDL written by hand in the posts/comments/likes
-- migration, see schema.prisma) that `migrate dev`'s diff engine misreads as drift on every
-- unrelated migration since Prisma has no way to express GENERATED ALWAYS AS; the DROP DEFAULT
-- it generates here is invalid against a generated column and is removed by hand.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "oidc_identities" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_sub" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oidc_identities_user_id_idx" ON "oidc_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_identities_provider_provider_sub_key" ON "oidc_identities"("provider", "provider_sub");

-- AddForeignKey
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
