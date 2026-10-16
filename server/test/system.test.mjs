import {test, mock, after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startReminderWorker, taipeiClock, dueMachines} from '../reminders.mjs';
import {addMonths,taskDue,machineTasks} from '../inspection-rules.mjs';
const db=new PGlite();
await db.exec(await readFile(new URL('../../db/init.sql',import.meta.url),'utf8'));
const query=async(sql,args)=>{const result=await db.query(sql,args);for(const row of result.rows)for(const [k,v]of Object.entries(row))if(v instanceof Uint8Array)row[k]=Buffer.from(v);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
class Pool{query=query;async connect(){return {query,release(){}};}}
mock.module('pg',{defaultExport:{Pool}});
process.env.NODE_ENV='test';
const {app,ready,migrateLegacyRepairs}=await import('../server.js');
await ready;
const api=app.listen(0,'127.0.0.1');await once(api,'listening');
const base='http://127.0.0.1:'+api.address().port;
const key='a'.repeat(64),device='b'.repeat(64),other='c'.repeat(64);
const digest=t=>createHash('sha256').update(t).digest('hex');
await query("INSERT INTO equipment(id,name,type,kind)VALUES('VERT-01','直式洗衣機 #8','洗衣設備','vertical')");
await query('INSERT INTO push_members(id,name,device_token_hash)VALUES($1,$2,$3),($4,$5,$6)', ['memberone','簡通延',digest(device),'membertwo','其他員工',digest(other)]);
const today=taipeiClock().date;
function record(){return {id:randomUUID(),machineId:'VERT-01',machineName:'直式洗衣機 #8',date:today,operator:'測試人員',createdAt:new Date().toISOString(),items:[{taskId:'CUSTOM-CLEAN',item:'機台清潔',period:'custom',cleaning:true,result:'normal',photos:[]}]};}
async function call(path,body,token=device,method='POST',root=base){const r=await fetch(root+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
let gateway;
after(async()=>{gateway?.kill();await new Promise(resolve=>api.close(resolve));await db.close();});

test('device writes are authenticated, append-only and retry-safe',async()=>{
 const data=record(),c={inspectionVersion:1,kind:'record',id:data.id,data,expectedRevision:null};
 assert.equal((await call('/api/device-inspection-sync',c,'d'.repeat(64))).status,403);
 const first=await call('/api/device-inspection-sync',c);assert.equal(first.status,200);assert.equal(first.body.entity.revision,'1');
 const retry=await call('/api/device-inspection-sync',c);assert.equal(retry.status,200);assert.equal(retry.body.entity.revision,'1');
 assert.equal((await query("SELECT count(*)::int AS n FROM inspection_sync_entities WHERE kind='record'")).rows[0].n,1);
 assert.equal((await call('/api/device-inspection-sync',c,other)).status,403);
 const changed={...c,expectedRevision:'1',data:{...data,operator:'改名字'}};
 assert.equal((await call('/api/device-inspection-sync',changed)).status,403);
 const setting={inspectionVersion:1,kind:'setting',id:'VERT-01',data:{dues:{weekly:today}},expectedRevision:null};
 assert.equal((await call('/api/device-inspection-sync',setting)).status,403);
 assert.equal((await call('/api/inspection-sync',setting)).status,200);
 const clean=(await query("SELECT cleaning_last_date::text AS date FROM equipment WHERE id='VERT-01'")).rows[0].date;
 assert.equal(clean,today);
 const read=await call('/api/device-inspection-sync',undefined,other,'GET');assert.equal(read.status,200);assert.ok(read.body.entities.some(e=>e.id===data.id));
});

test('photos: device upload, duplicate, another device read and unauthorized write',async()=>{
 const photo={id:randomUUID(),machineId:'VERT-01',taskId:'CUSTOM-CLEAN',name:'測試',width:1,height:1,full:Buffer.from([255,216,255,217]).toString('base64'),thumbnail:Buffer.from([255,216,255,217]).toString('base64')};
 assert.equal((await call('/api/device-checklist-photos',photo)).status,200);
 assert.equal((await call('/api/device-checklist-photos',photo)).status,200);
 assert.equal((await call('/api/device-checklist-photos',photo,other)).status,409);
 const r=await fetch(base+'/api/device-checklist-photos/'+photo.id+'/image',{headers:{Authorization:'Bearer '+other}});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from([255,216,255,217]));
});

test('repairs migrate without changing notes and append independently',async()=>{
 const legacy={id:'legacy-1',date:today,issue:'舊維修',cost:0};
 const notes='FACTORY_EQUIPMENT_METADATA_V1\n'+JSON.stringify({version:1,notes:'原備註',vendor:'原廠商',repairs:[legacy]});
 await query("UPDATE equipment SET notes=$1 WHERE id='VERT-01'",[notes]);await migrateLegacyRepairs();await migrateLegacyRepairs();
 const repair=()=>({id:randomUUID(),date:today,issue:'更換皮帶',parts:'皮帶',notes:'',vendor:'廠商',recorder:'管理員',cost:0,currency:'TWD',createdAt:new Date().toISOString()});
 const a=repair(),b=repair();
 const replies=await Promise.all([call('/api/repairs/VERT-01',a),call('/api/repairs/VERT-01',b)]);assert.ok(replies.every(r=>r.status===200));
 assert.equal((await call('/api/repairs/VERT-01',a)).status,200);assert.equal((await call('/api/repairs/VERT-01',{...a,cost:10})).status,409);
 const layout=await call('/api/device-layout',undefined,device,'GET');assert.equal(layout.body.positions[0].repairs.length,3);assert.equal(layout.body.positions[0].notes,notes);
});

test('shared schedule rules preserve month end, actual cleaning date and disabled machines',()=>{
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');
 const state={baseline:'2026-10-01',settings:{},records:[{machineId:'VERT-01',date:'2026-10-16',createdAt:'2026-10-16T01:00:00Z',items:[{taskId:'CUSTOM-CLEAN',due:'2026-10-20'}]}],reminder:{lead:1}};
 const m={id:'VERT-01',name:'洗衣機',cleaningCycleDays:7};
 const custom=machineTasks(m,state).find(t=>t.id==='CUSTOM-CLEAN');assert.equal(taskDue(m,custom,state),'2026-10-23');
 assert.equal(dueMachines([{...m,status:'停用'}],state,'2026-10-30').length,0);
 assert.deepEqual(taipeiClock(new Date('2026-10-15T16:01:00Z')),{date:'2026-10-16',time:'00:01'});
});

test('reminders go only to leader, after configured time, once per day',async()=>{
 await query("INSERT INTO inspection_sync_entities(kind,id,data)VALUES('meta','baseline',$1::jsonb),('meta','reminder',$2::jsonb)",[JSON.stringify({date:'2026-10-01'}),JSON.stringify({time:'08:00',lead:1,recipient:'簡通延'})]);
 await query('INSERT INTO push_subscriptions(endpoint,member_id,subscription)VALUES($1,$2,$3::jsonb),($4,$5,$6::jsonb)',['https://push.example/leader','memberone',JSON.stringify({endpoint:'leader'}),'https://push.example/other','membertwo',JSON.stringify({endpoint:'other'})]);
 const sent=[];const worker=startReminderWorker({pool:{query},webpush:{sendNotification:async(s,payload)=>sent.push({s,payload:JSON.parse(payload)})},enabled:true,startImmediately:false});
 try{
  await worker.tick(new Date('2026-11-01T23:00:00Z'));assert.equal(sent.length,0);
  await worker.tick(new Date('2026-11-02T00:00:00Z'));await worker.tick(new Date('2026-11-02T00:01:00Z'));
  assert.equal(sent.length,1);assert.equal(sent[0].s.endpoint,'leader');assert.match(sent[0].payload.body,/設備/);
  await worker.tick(new Date('2026-11-03T00:00:00Z'));assert.equal(sent.length,2);
 }finally{worker.stop();}
});

test('gateway forwards device tokens only to scoped endpoints; rejects layout and repairs',async()=>{
 const port=api.address().port+1;
 gateway=spawn(process.execPath,['../public-gateway.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,API_ACCESS_KEYS:key,API_HOST:'127.0.0.1',API_PORT:String(api.address().port),GATEWAY_PORT:String(port)},stdio:'pipe'});
 let started=false;const root='http://127.0.0.1:'+port;
 for(let i=0;i<40;i++){try{const r=await fetch(root+'/api/health');if(r.ok){started=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.equal(started,true);
 assert.equal((await call('/api/device-layout',undefined,device,'GET',root)).status,200);
 const data=record(),change={inspectionVersion:1,kind:'record',id:data.id,data,expectedRevision:null};
 assert.equal((await call('/api/device-inspection-sync',change,device,'POST',root)).status,200);
 assert.equal((await call('/api/layout',{},device,'PUT',root)).status,401);
 assert.equal((await call('/api/repairs/VERT-01',{},device,'POST',root)).status,401);
 assert.equal((await call('/api/layout',undefined,key,'GET',root)).status,200);
});
