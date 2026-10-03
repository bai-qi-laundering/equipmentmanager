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
  commissioned_date DATE,
  cleaning_last_date DATE,
  cleaning_cycle_days INTEGER NOT NULL DEFAULT 30,
  maintenance_last_date DATE,
  maintenance_cycle_days INTEGER NOT NULL DEFAULT 180,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS equipment_type_idx ON equipment(type);


CREATE TABLE IF NOT EXISTS routine_checklist_records (
  id BIGSERIAL PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  equipment_name TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  check_date DATE,
  operator TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS routine_checklist_equipment_idx ON routine_checklist_records(equipment_id,saved_at DESC);
