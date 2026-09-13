CREATE TABLE IF NOT EXISTS landsight_predictions (
    project_id text NOT NULL,
    model_version text NOT NULL,
    input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
    prediction jsonb NOT NULL CHECK (jsonb_typeof(prediction) = 'object'),
    source text NOT NULL DEFAULT 'Synthetic' CHECK (source = 'Synthetic'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, model_version)
);
