-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "excerpt" VARCHAR(160) NOT NULL,
    "content" TEXT NOT NULL,
    "thumbnail_url" VARCHAR(500),
    "author_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    -- HAND-EDITED, do not regenerate this file.
    -- Prisma cannot express GENERATED ALWAYS AS, so it emitted a plain
    -- "tsvector" column here. The generated expression below is what makes
    -- the Portuguese full-text search work without a trigger: Postgres keeps
    -- the vector in sync with title/excerpt/content on every write.
    --
    -- The ::regconfig casts are required: the one-argument to_tsvector(text)
    -- is STABLE, not IMMUTABLE, and Postgres rejects it in a generated
    -- column. setweight A/B/C makes a title match outrank a body match in
    -- ts_rank. 'portuguese' is a built-in configuration — no extension.
    "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese'::regconfig, coalesce("title", '')),   'A') ||
        setweight(to_tsvector('portuguese'::regconfig, coalesce("excerpt", '')), 'B') ||
        setweight(to_tsvector('portuguese'::regconfig, coalesce("content", '')), 'C')
    ) STORED,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "post_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_created_at_id_idx" ON "posts"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "likes_user_id_idx" ON "likes"("user_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
