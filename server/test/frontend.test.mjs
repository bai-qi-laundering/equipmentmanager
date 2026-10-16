import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const rules=await readFile(new URL('../inspection-rules.mjs',import.meta.url),'utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
async function setup(manager=false){
 const dom=new JSDOM(html,{url:'https://bai-qi-laundering.github.io/equipmentmanager/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],remote=[];
 w.Headers=Headers;w.AbortController=AbortController;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;
 w.indexedDB=new IDBFactory();w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.setInterval=()=>0;w.setTimeout=()=>0;
 const vp=w.document.getElementById('flatViewport');Object.defineProperty(vp,'clientWidth',{value:390});Object.defineProperty(vp,'clientHeight',{value:550});
 if(manager)w.localStorage.setItem('equipment_api_access_v1','a'.repeat(64));
 else w.localStorage.setItem('baiqiPushMemberV2',JSON.stringify({id:'memberone',name:'測試員工',deviceToken:'b'.repeat(64)}));
 w.fetch=async(url,opts={})=>{
  const path=new URL(url).pathname,method=opts.method||'GET';calls.push({path,method,headers:opts.headers,body:opts.body});
  if(path.endsWith('layout'))return Response.json({syncVersion:2,repairVersion:1,positions:[{id:'VERT-01',name:'NAS 洗衣機',type:'洗衣設備',kind:'vertical',x:193,z:-101,status:'正常',cleaning_cycle_days:7,notes:'',version:'1',repairs:[]}]});
  if(path.endsWith('inspection-sync')){
   if(method==='POST'){const c=JSON.parse(opts.body),entity={kind:c.kind,id:c.id,data:c.data,revision:'1'};remote.push(entity);return Response.json({ok:true,inspectionVersion:1,entity});}
   return Response.json({inspectionVersion:1,entities:[{kind:'meta',id:'baseline',data:{date:'2026-10-01'},revision:'1'},...remote]});
  }
  throw Error('unexpected request '+path);
 };
 const context=dom.getInternalVMContext();
 const m=new vm.SourceTextModule(source+`\nglobalThis.hooks={groups,view,canManage,loadRemoteLayout,openPanel,openInspection,editInspection,syncInspectionNas,apiFetch,renderMapStatus,activateManagementKey,getState:()=>inspectionState};`,{context});
 await m.link(()=>new vm.SourceTextModule(rules,{context}));await m.evaluate();
 return {dom,w,h:w.hooks,calls,remote};
}

test('employee interface preserves map, disables equipment edits and submits through scoped route',async()=>{
 const {dom,w,h,calls,remote}=await setup();
 try{
  assert.equal(w.document.querySelectorAll('.map-hotspot').length,41);
  assert.equal(h.view.scale,Math.min(370/1024,530/1536));
  assert.equal(await h.loadRemoteLayout(),true);assert.equal(h.groups.get('VERT-01').userData.name,'NAS 洗衣機');
  h.openPanel(h.groups.get('VERT-01'));assert.equal(w.document.getElementById('eqName').disabled,true);assert.equal(w.document.getElementById('saveEqBtn').disabled,true);assert.equal(w.document.getElementById('addRepairBtn').disabled,true);
  h.openInspection('VERT-01','weekly');assert.ok(w.document.getElementById('inspectionForm'));assert.equal(w.document.querySelector('[data-ia="schedule"]'),null);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  assert.equal(h.editInspection(s=>s.records.push({id:'front-record',machineId:'VERT-01',machineName:'NAS 洗衣機',date:today,operator:'員工',createdAt:new Date().toISOString(),items:[{taskId:'test',item:'測試查檢',result:'abnormal',note:'皮帶鬆弛'}]})),true);
  assert.equal(w.document.querySelector('[data-equipment-id="VERT-01"]').dataset.state,'issue');
  await h.syncInspectionNas();assert.equal(remote.length,1);assert.equal(calls.filter(c=>c.method==='POST')[0].path,'/api/device-inspection-sync');
  assert.equal(calls.some(c=>c.method==='POST'&&JSON.parse(c.body).kind!=='record'),false);
  assert.equal(Object.keys(h.getState().nasSync.pending).length,0);
  assert.equal(w.document.getElementById('flatImage').getAttribute('src'),'factory-map-clean-v13.svg');
 }finally{dom.window.close();}
});

test('manager retains equipment and schedule controls',async()=>{
 const {dom,w,h,calls}=await setup(true);
 try{
  await h.loadRemoteLayout();h.openPanel(h.groups.get('VERT-01'));assert.equal(w.document.getElementById('eqName').disabled,false);
  h.openInspection('VERT-01','weekly');assert.ok(w.document.querySelector('[data-ia="schedule"]'));
  await h.syncInspectionNas();assert.ok(calls.some(c=>c.path==='/api/inspection-sync'));
 }finally{dom.window.close();}
});


test('a phone only unlocks management after the gateway accepts the existing key',async()=>{
 const {dom,w,h,calls}=await setup();
 try{
  h.openPanel(h.groups.get('VERT-01'));assert.equal(w.document.getElementById('eqVendor').disabled,true);
  const normalFetch=w.fetch;
  w.fetch=async()=>Response.json({error:'access_required'},{status:401});
  await assert.rejects(h.activateManagementKey('c'.repeat(64)),/金鑰無效/);
  assert.equal(w.localStorage.getItem('equipment_api_access_v1'),null);
  assert.equal(w.document.getElementById('eqVendor').disabled,true);
  w.fetch=normalFetch;
  await h.activateManagementKey('a'.repeat(64));
  assert.equal(w.localStorage.getItem('equipment_api_access_v1'),'a'.repeat(64));
  assert.equal(w.document.getElementById('eqVendor').disabled,false);
  assert.equal(w.document.getElementById('addRepairBtn').disabled,false);
  assert.ok(calls.some(c=>c.path==='/api/layout'&&c.headers.Authorization==='Bearer '+'a'.repeat(64)));
 }finally{dom.window.close();}
});
