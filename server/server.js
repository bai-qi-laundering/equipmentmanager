import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json({ limit: '2mb' }));
const ensureSchema = async () => {
  await pool.query(`ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '正常',
    ADD COLUMN IF NOT EXISTS cleaning_last_date DATE,
    ADD COLUMN IF NOT EXISTS cleaning_cycle_days INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS maintenance_last_date DATE,
    ADD COLUMN IF NOT EXISTS maintenance_cycle_days INTEGER NOT NULL DEFAULT 180,
    ADD COLUMN IF NOT EXISTS commissioned_date DATE,
    ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE TABLE IF NOT EXISTS checklist_photos (id UUID PRIMARY KEY,equipment_id TEXT NOT NULL,task_id TEXT NOT NULL,name TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,image BYTEA NOT NULL,thumbnail BYTEA NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
};
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'equipment-manager-api',photoVersion:1 });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

app.get('/api/checklists/:equipmentId', async (req,res)=>{
  try{
    const {rows}=await pool.query('SELECT id,equipment_id,equipment_name,schedule,items,check_date,operator,action,note,saved_at FROM routine_checklist_records WHERE equipment_id=$1 ORDER BY saved_at DESC LIMIT 100',[String(req.params.equipmentId)]);
    res.json({records:rows});
  }catch(error){res.status(500).json({error:'checklist_load_failed'});}
});
app.put('/api/checklists/:equipmentId', async (req,res)=>{
  const r=req.body||{};
  if(!r.schedule||!Array.isArray(r.items))return res.status(400).json({error:'invalid_checklist'});
  try{
    await ensureSchema();
    const {rows}=await pool.query(
      `INSERT INTO routine_checklist_records
       (equipment_id,equipment_name,schedule,items,check_date,operator,action,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [String(req.params.equipmentId),String(r.equipmentName||''),String(r.schedule),JSON.stringify(r.items),r.date||null,String(r.operator||''),String(r.action||''),String(r.note||'')]
    );
    res.json({ok:true,id:rows[0].id});
  }catch(error){res.status(500).json({error:'checklist_save_failed'});}
});
// Compressed JPEGs are stored in PostgreSQL's persistent NAS volume.
const PHOTO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readPhotoJpeg(value,maxBytes){
 if(typeof value!=='string'||value.length>Math.ceil(maxBytes/3)*4||!/^\/[A-Za-z0-9+/]*={0,2}$/.test(value)||value.length%4!==0)return null;
 const bytes=Buffer.from(value,'base64');
 if(bytes.length<4||bytes.length>maxBytes||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217||bytes.toString('base64')!==value)return null;
 return bytes;
}
app.post('/api/checklist-photos',async(req,res)=>{
 const p=req.body||{},full=readPhotoJpeg(p.full,512*1024),thumb=readPhotoJpeg(p.thumbnail,80*1024);
 if(!PHOTO_ID.test(p.id||'')||!full||!thumb||typeof p.machineId!=='string'||!p.machineId.trim()||p.machineId.length>100||typeof p.taskId!=='string'||!p.taskId.trim()||p.taskId.length>100||!Number.isInteger(p.width)||p.width<1||p.width>1600||!Number.isInteger(p.height)||p.height<1||p.height>1600)return res.status(400).json({error:'invalid_compressed_photo'});
 try{
  const name=String(p.name||'照片').slice(0,200);
  const {rows}=await pool.query(`INSERT INTO checklist_photos (id,equipment_id,task_id,name,width,height,image,thumbnail)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING id`,[p.id,p.machineId,p.taskId,name,p.width,p.height,full,thumb]);
  if(!rows.length){const existing=await pool.query('SELECT equipment_id,task_id,image FROM checklist_photos WHERE id=$1',[p.id]);const row=existing.rows[0];if(!row||row.equipment_id!==p.machineId||row.task_id!==p.taskId||!row.image.equals(full))return res.status(409).json({error:'photo_id_conflict'});}
  res.json({ok:true,id:p.id,photoVersion:1});
 }catch(error){res.status(500).json({error:'photo_save_failed'});}
});
app.get('/api/checklist-photos/:id/:variant',async(req,res)=>{
 if(!PHOTO_ID.test(req.params.id)||!['thumbnail','image'].includes(req.params.variant))return res.status(400).json({error:'invalid_photo_request'});
 try{const column=req.params.variant==='thumbnail'?'thumbnail':'image';const {rows}=await pool.query(`SELECT ${column} AS bytes FROM checklist_photos WHERE id=$1`,[req.params.id]);if(!rows.length)return res.status(404).json({error:'photo_not_found'});
  res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','private, max-age=86400');res.setHeader('X-Content-Type-Options','nosniff');res.send(rows[0].bytes);
 }catch(error){res.status(500).json({error:'photo_load_failed'});}
});

app.get('/api/layout', async (_req, res) => {
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, name, type, kind, x, z, rotation_y, status,
              cleaning_last_date, cleaning_cycle_days,
              maintenance_last_date, maintenance_cycle_days, commissioned_date, notes, updated_at::text AS version
       FROM equipment ORDER BY id`
    );
    res.json({ syncVersion:2, positions: rows });
  } catch (error) {
    res.status(500).json({ error: 'layout_load_failed' });
  }
});
app.put('/api/layout', async (req, res) => {
  if(req.body?.syncVersion!==2)return res.status(428).json({error:'sync_upgrade_required'});
  const positions = Array.isArray(req.body?.positions) ? req.body.positions : null;
  if (!positions) return res.status(400).json({ error: 'positions must be an array' });
  const expected=req.body.expectedVersions;
  if(!expected||positions.some(p=>!p?.id||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Object.hasOwn(expected,String(p.id))||(expected[String(p.id)]!==null&&typeof expected[String(p.id)]!=='string'))||new Set(positions.map(p=>String(p.id))).size!==positions.length)
    return res.status(400).json({error:'invalid_versioned_positions'});
  const client = await pool.connect();
  try {
    await ensureSchema();
    await client.query('BEGIN');
    await client.query('LOCK TABLE equipment IN SHARE ROW EXCLUSIVE MODE');
    for(const item of positions){
      const {rows}=await client.query('SELECT updated_at::text AS version FROM equipment WHERE id=$1 FOR UPDATE',[String(item.id)]);
      if((rows[0]?.version??null)!==expected[String(item.id)]){
        await client.query('ROLLBACK');
        return res.status(409).json({error:'layout_conflict',id:String(item.id)});
      }
    }
    const versions={};
    for (const item of positions) {
      if (!item?.id || typeof item.x !== 'number' || typeof item.z !== 'number') continue;
      const {rows}=await client.query(
        `INSERT INTO equipment
          (id,name,type,kind,x,z,rotation_y,status,cleaning_last_date,cleaning_cycle_days,maintenance_last_date,maintenance_cycle_days,notes,commissioned_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name,type=EXCLUDED.type,kind=EXCLUDED.kind,
           x=EXCLUDED.x,z=EXCLUDED.z,rotation_y=EXCLUDED.rotation_y,
           status=EXCLUDED.status,cleaning_last_date=EXCLUDED.cleaning_last_date,
           cleaning_cycle_days=EXCLUDED.cleaning_cycle_days,
           maintenance_last_date=EXCLUDED.maintenance_last_date,
           maintenance_cycle_days=EXCLUDED.maintenance_cycle_days,
           commissioned_date=EXCLUDED.commissioned_date,notes=EXCLUDED.notes,updated_at=clock_timestamp() RETURNING id,updated_at::text AS version`,
        [
          String(item.id),String(item.name||''),String(item.type||''),String(item.kind||''),
          item.x,item.z,typeof item.rotationY==='number'?item.rotationY:0,
          String(item.status||'正常'),item.cleaningLastDate||null,Number(item.cleaningCycleDays||30),
          item.maintenanceLastDate||null,Number(item.maintenanceCycleDays||180),String(item.notes||''),item.commissionedDate||null
        ]
      );
      versions[String(item.id)]=rows[0].version;
    }
    await client.query('COMMIT');
    res.json({ ok:true,count:positions.length,versions });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error:'layout_save_failed' });
  } finally { client.release(); }
});
ensureSchema().then(()=>{
  app.listen(port,'0.0.0.0',()=>console.log(`equipment-manager-api listening on :${port}`));
}).catch(error=>{
  console.error('Database schema initialization failed',error);
  process.exit(1);
});

