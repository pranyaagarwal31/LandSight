BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS landsight_projects (
    id text PRIMARY KEY,
    name text NOT NULL,
    state text NOT NULL,
    district text NOT NULL,
    type text NOT NULL CHECK (type IN ('Highway','Railway','Irrigation','Power','Industrial','Road infrastructure')),
    complexity integer NOT NULL CHECK (complexity BETWEEN 1 AND 5),
    landowners integer NOT NULL CHECK (landowners >= 0),
    expected_completion date NOT NULL,
    agency text NOT NULL,
    location geometry(Point,4326) NOT NULL CHECK (ST_X(location) BETWEEN -180 AND 180 AND ST_Y(location) BETWEEN -90 AND 90),
    source text NOT NULL DEFAULT 'Synthetic' CHECK (source = 'Synthetic'),
    snapshot_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The source supplies aggregate counts, not parcel boundaries, payments or case identities.
CREATE TABLE IF NOT EXISTS landsight_acquisition (
    project_id text PRIMARY KEY,
    total_parcels integer NOT NULL CHECK (total_parcels > 0),
    acquired_parcels integer NOT NULL CHECK (acquired_parcels BETWEEN 0 AND total_parcels)
);
CREATE TABLE IF NOT EXISTS landsight_compensation (
    project_id text PRIMARY KEY,
    paid_percent double precision NOT NULL CHECK (paid_percent BETWEEN 0 AND 100),
    budget_cr double precision NOT NULL CHECK (budget_cr >= 0 AND budget_cr < 'Infinity'::double precision)
);
CREATE TABLE IF NOT EXISTS landsight_legal_cases (
    project_id text PRIMARY KEY,
    pending_count integer NOT NULL CHECK (pending_count >= 0)
);
CREATE TABLE IF NOT EXISTS landsight_approvals (
    project_id text PRIMARY KEY,
    processing_days integer NOT NULL CHECK (processing_days BETWEEN 0 AND 180),
    pending_count integer NOT NULL CHECK (pending_count >= 0),
    clearance_status text NOT NULL
);
CREATE TABLE IF NOT EXISTS landsight_predictions (
    project_id text NOT NULL,
    model_version text NOT NULL,
    input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
    prediction jsonb NOT NULL CHECK (jsonb_typeof(prediction) = 'object'),
    generated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, model_version)
);
CREATE INDEX IF NOT EXISTS landsight_projects_location_gist ON landsight_projects USING gist (location);
CREATE TABLE IF NOT EXISTS landsight_schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO landsight_schema_migrations (version) VALUES (5) ON CONFLICT (version) DO NOTHING;

COMMIT;
