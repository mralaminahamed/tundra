CREATE TABLE plugin_github_installations (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id            uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    installation_id      bigint NOT NULL UNIQUE,
    account_login        text NOT NULL,
    account_type         text NOT NULL CHECK (account_type IN ('User','Organization')),
    account_avatar_url   text,
    repository_selection text NOT NULL,
    permissions          jsonb NOT NULL DEFAULT '{}'::jsonb,
    events               text[] NOT NULL DEFAULT '{}',
    suspended_at         timestamptz,
    installed_by         uuid REFERENCES operators(id) ON DELETE SET NULL,
    installed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_github_repositories (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_id bigint NOT NULL REFERENCES plugin_github_installations(id) ON DELETE CASCADE,
    github_id       bigint NOT NULL,
    full_name       text NOT NULL,
    name            text NOT NULL,
    description     text,
    is_private      boolean NOT NULL DEFAULT false,
    default_branch  text NOT NULL DEFAULT 'main',
    language        text,
    topics          text[],
    pushed_at       timestamptz,
    last_synced_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (installation_id, github_id)
);

CREATE INDEX idx_github_repos_search ON plugin_github_repositories
    USING GIN (to_tsvector('simple', full_name || ' ' || coalesce(description, '')));

CREATE TABLE plugin_github_webhooks (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id     uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    delivery_id   text NOT NULL UNIQUE,
    event         text NOT NULL,
    payload       jsonb NOT NULL,
    received_at   timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz,
    handler_outcome text,
    error         text
);

CREATE INDEX idx_github_webhooks_unprocessed ON plugin_github_webhooks(received_at)
    WHERE processed_at IS NULL;

CREATE TABLE plugin_github_pr_previews (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    repository_id   bigint NOT NULL REFERENCES plugin_github_repositories(id) ON DELETE CASCADE,
    pr_number       int NOT NULL,
    head_sha        text NOT NULL,
    preview_site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
    preview_url     text,
    status          text NOT NULL CHECK (status IN ('building','live','failed','closed')),
    opened_at       timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,
    UNIQUE (site_id, pr_number)
);
