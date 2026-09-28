CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  z DOUBLE PRECISION NOT NULL DEFAULT 0,
  rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT '正常',
  cleaning_last_date DATE,
  cleaning_cycle_days INTEGER NOT NULL DEFAULT 30,
  maintenance_last_date DATE,
  maintenance_cycle_days INTEGER NOT NULL DEFAULT 180,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS equipment_type_idx ON equipment(type);
