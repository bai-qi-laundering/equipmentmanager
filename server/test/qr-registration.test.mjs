import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1].replace('})();','window.qrHooks={enroll};})();');
function setup({canEdit=false,fail=false,version=1}={}){
 const dom=new JSDOM(html,{url:'https://bai-qi-laundering.github.io/equipmentmanager/',runScripts:'outside-only'}),w=dom.window,requests=[];
 w.matchMedia=()=>({matches:true});w.PushManager=class{};w.Notification={permission:'granted'};
 const subscription={toJSON:()=>({endpoint:'https://push.example/current',keys:{p256dh:'key',auth:'key'}})};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({pushManager:{getSubscription:async()=>subscription}})}});
 w.document.getElementById('pushMemberName').value='測試主管';
 w.localStorage.setItem('equipment_api_access_v1','a'.repeat(64));
 w.fetch=async(url,opts={})=>{
  const path=new URL(url).pathname;requests.push({path,body:opts.body});
  if(path==='/api/push-config')return Response.json({ready:true,publicKey:'public',enrollmentEditVersion:version});
  if(path==='/api/push-enrollments/redeem')return fail?Response.json({error:'edit_password_incorrect'},{status:403}):Response.json({memberId:'memberone',memberName:'測試主管',deviceToken:'b'.repeat(64),canEdit});
  throw Error(path);
 };
 new vm.Script(script).runInContext(dom.getInternalVMContext());
 return {dom,w,requests};
}

test('registration sends optional password once and remembers only the returned role/token',async()=>{
 const {dom,w,requests}=setup({canEdit:true});
 try{
  w.document.getElementById('pushEditPassword').value='654321';
  await w.qrHooks.enroll('c'.repeat(64));
  const sent=JSON.parse(requests.find(r=>r.path.endsWith('/redeem')).body);assert.equal(sent.editPassword,'654321');
  const saved=w.localStorage.getItem('baiqiPushMemberV2');assert.equal(JSON.parse(saved).canEdit,true);assert.equal(saved.includes('654321'),false);
  assert.equal(w.localStorage.getItem('equipment_api_access_v1'),null);assert.equal(w.document.getElementById('pushEditPassword').value,'');
  assert.equal(w.document.querySelector('[data-management-access]'),null);
 }finally{dom.window.close();}
});

test('blank-password registration removes old administrator key and cannot edit',async()=>{
 const {dom,w}=setup();
 try{await w.qrHooks.enroll('c'.repeat(64));assert.equal(JSON.parse(w.localStorage.getItem('baiqiPushMemberV2')).canEdit,false);assert.equal(w.localStorage.getItem('equipment_api_access_v1'),null);}finally{dom.window.close();}
});

test('incorrect password and old NAS do not silently register a phone with lesser rights',async()=>{
 for(const options of [{fail:true},{version:undefined}]){
  const {dom,w,requests}=setup(options.version===undefined&&!options.fail?{version:0}:options);
  try{w.document.getElementById('pushEditPassword').value='654321';await assert.rejects(w.qrHooks.enroll('c'.repeat(64)),/密碼不正確|NAS 尚未更新/);assert.equal(w.localStorage.getItem('baiqiPushMemberV2'),null);assert.equal(w.localStorage.getItem('equipment_api_access_v1'),'a'.repeat(64));if(options.fail!==true)assert.equal(requests.some(r=>r.path.endsWith('/redeem')),false);}finally{dom.window.close();}
 }
});
