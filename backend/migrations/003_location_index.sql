CREATE INDEX IF NOT EXISTS landsight_projects_location_gist ON landsight_projects USING gist (location);
