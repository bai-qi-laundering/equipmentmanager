import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'equipment-manager-api' });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

app.get('/api/layout', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, type, kind, x, z, rotation_y FROM equipment ORDER BY id'
  );
  res.json({ positions: rows });
});

app.put('/api/layout', async (req, res) => {
  const positions = Array.isArray(req.body?.positions) ? req.body.positions : null;
  if (!positions) return res.status(400).json({ error: 'positions must be an array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of positions) {
      if (!item?.id || typeof item.x !== 'number' || typeof item.z !== 'number') continue;
      await client.query(
        `INSERT INTO equipment (id, name, type, kind, x, z, rotation_y)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name,
           type=EXCLUDED.type,
           kind=EXCLUDED.kind,
           x=EXCLUDED.x,
           z=EXCLUDED.z,
           rotation_y=EXCLUDED.rotation_y,
           updated_at=NOW()`,
        [
          String(item.id),
          String(item.name || ''),
          String(item.type || ''),
          String(item.kind || ''),
          item.x,
          item.z,
          typeof item.rotationY === 'number' ? item.rotationY : 0
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: positions.length });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'layout_save_failed' });
  } finally {
    client.release();
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`equipment-manager-api listening on :${port}`);
});
