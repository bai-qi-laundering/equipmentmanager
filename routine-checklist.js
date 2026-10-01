/* Routine Checklist UI - equipment manager */
(function(){
  'use strict';
  const API='https://fileserver.tailbb066f.ts.net';
  const JSON_URL='./routine-checklist.json';
  const LS='equipmentRoutineChecklistRecordsV1';
  let data=null, modal=null, current={id:'',name:'',schedule:'每週'};

  const css=`
  #routineModal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,5,12,.68);backdrop-filter:blur(10px)}
  #routineModal.open{display:flex}
  .routine-box{width:min(760px,100%);max-height:min(88vh,900px);overflow:auto;background:linear-gradient(180deg,#09213a,#061526);border:1px solid #2779a8;border-radius:22px;box-shadow:0 28px 80px rgba(0,0,0,.55);color:#fff}
  .routine-head{position:sticky;top:0;z-index:2;padding:18px 20px 12px;background:rgba(6,21,38,.96);border-bottom:1px solid #1b4969}
  .routine-head h2{margin:0 42px 4px 0;font-size:20px}.routine-muted{color:#91abc2;font-size:12px}
  .routine-close{position:absolute;right:14px;top:12px;width:42px;height:42px;border-radius:50%;font-size:23px}
  .routine-tabs{display:flex;gap:6px;overflow:auto;padding:12px 16px 8px;position:sticky;top:82px;z-index:2;background:rgba(6,21,38,.96)}
  .routine-tab{white-space:nowrap;padding:9px 12px;border-radius:12px;border:1px solid #245b88;background:#0a2744;color:#b9d7e9}
  .routine-tab.active{background:#087fbd;border-color:#49c7ff;color:#fff}
  .routine-body{padding:8px 18px 18px}.routine-card{border:1px solid #1b496e;border-radius:15px;background:#071b2e;padding:13px;margin:10px 0}
  .routine-item{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-bottom:1px solid rgba(55,112,151,.25)}
  .routine-item:last-child{border-bottom:0}.routine-item input[type=checkbox]{width:21px;height:21px;margin-top:1px;accent-color:#18a8e8}
  .routine-item label{font-size:14px;line-height:1.45;flex:1}.routine-empty{padding:28px;text-align:center;color:#91abc2}
  .routine-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.routine-field label{display:block;color:#9ec4dc;font-size:12px;margin:0 0 5px}
  .routine-field input,.routine-field textarea,.routine-field select{width:100%;background:#071a2d;border:1px solid #245b88;border-radius:9px;color:#fff;padding:10px}
  .routine-field textarea{min-height:86px;resize:vertical}.routine-actions{display:flex;gap:8px;margin-top:14px}.routine-actions button{flex:1;min-height:46px}
  .routine-primary{background:linear-gradient(180deg,#148ed3,#086eb1)!important;border-color:#45c6ff!important}
  .routine-history{font-size:12px;color:#a9c4d7;line-height:1.6}.routine-history strong{color:#fff}
  @media(max-width:700px){#routineModal{padding:8px;align-items:flex-end}.routine-box{width:100%;max-height:92vh;border-radius:18px 18px 0 0}.routine-tabs{top:76px}.routine-grid{grid-template-columns:1fr}.routine-body{padding:8px 12px 18px}}
  `;
  function inject(){
    const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    modal=document.createElement('div');modal.id='routineModal';
    modal.innerHTML=`<div class="routine-box">
      <div class="routine-head"><button class="routine-close">×</button><h2>📋 定期機器維修保養檢查</h2><div class="routine-muted" id="routineEq"></div></div>
      <div class="routine-tabs" id="routineTabs"></div>
      <div class="routine-body">
        <div id="routineList"></div>
        <div class="routine-card routine-grid">
          <div class="routine-field"><label>檢查日期</label><input id="routineDate" type="date"></div>
          <div class="routine-field"><label>執行人員／簽名</label><input id="routineOperator" placeholder="請輸入姓名"></div>
          <div class="routine-field" style="grid-column:1/-1"><label>處理情形</label><textarea id="routineAction" placeholder="請填寫異常、處理方式、零件更換或其他處理情形"></textarea></div>
          <div class="routine-field" style="grid-column:1/-1"><label>備註</label><textarea id="routineNote" placeholder="其他備註（可留白）"></textarea></div>
        </div>
        <div class="routine-actions"><button id="routineHistoryBtn">查看歷史</button><button class="routine-primary" id="routineSaveBtn">✓ 完成並儲存檢查</button></div>
        <div id="routineHistory" class="routine-card routine-history" hidden></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.routine-close').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('routineHistoryBtn').onclick=toggleHistory;
    document.getElementById('routineSaveBtn').onclick=save;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close();});
  }
  async function loadData(){
    if(data)return data;
    try{const r=await fetch(JSON_URL,{cache:'no-store'});if(!r.ok)throw Error();data=await r.json();return data;}
    catch(e){alert('無法載入 routine-checklist.json，請確認檔案與網站位於同一個系統。');return null;}
  }
  function norm(name){
    let n=String(name||'').trim().replace(/\s*#\d+$/,'');
    if(/^烘乾機/.test(n))return '烘乾機';
    if(/^直式洗衣機/.test(n)||n==='35kg'||n==='50kg')return '洗衣機';
    if(n==='錳砂過濾設備')return '錳砂';
    return n;
  }
  function schedulesFor(name){
    const n=norm(name), out={};
    if(!data?.schedules)return out;
    Object.entries(data.schedules).forEach(([s,map])=>{
      const items=map[n];
      if(items?.length)out[s]=items;
    });
    return out;
  }
  const order=['每週','每月','每季','每半年','每年'];
  function canonical(s){return s==='上半年／下半年'?'每半年':s;}
  function localRecords(){try{return JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){return[]}}
  function setLocal(a){localStorage.setItem(LS,JSON.stringify(a));}
  function selectedSchedule(){
    const tabs=modal.querySelectorAll('.routine-tab');
    return [...tabs].find(x=>x.classList.contains('active'))?.dataset.schedule||'每週';
  }
  function renderTabs(map){
    const tabs=document.getElementById('routineTabs');tabs.innerHTML='';
    const keys=order.filter(x=>Object.keys(map).some(k=>canonical(k)===x));
    if(!keys.length){tabs.innerHTML='<span class="routine-muted">此設備目前沒有對應的定期檢查項目</span>';return;}
    keys.forEach((s,i)=>{const b=document.createElement('button');b.className='routine-tab'+(i===0?' active':'');b.dataset.schedule=s;b.textContent=s;b.onclick=()=>{tabs.querySelectorAll('.routine-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderItems(map);};tabs.appendChild(b);});
    renderItems(map);
  }
  function renderItems(map){
    const wanted=selectedSchedule(), actual=Object.keys(map).find(k=>canonical(k)===wanted), list=actual?map[actual]:[];
    const wrap=document.getElementById('routineList');wrap.innerHTML='';
    if(!list?.length){wrap.innerHTML='<div class="routine-empty">這個週期沒有檢查項目</div>';return;}
    const card=document.createElement('div');card.className='routine-card';
    list.forEach((item,i)=>{const row=document.createElement('div');row.className='routine-item';row.innerHTML=`<input type="checkbox" id="ri-${i}"><label for="ri-${i}">${escapeHtml(item)}</label>`;card.appendChild(row);});
    wrap.appendChild(card);
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function open(){
    if(!modal)inject();
    const id=document.getElementById('eqId')?.textContent||'';
    const name=document.getElementById('eqName')?.value||document.getElementById('pn')?.textContent||'設備';
    if(!id||id==='—'){alert('請先選擇設備。');return;}
    const d=await loadData();if(!d)return;
    current={id,name,schedule:'每週'};
    document.getElementById('routineEq').textContent=name+'｜設備編號 '+id;
    document.getElementById('routineDate').value=new Date().toISOString().slice(0,10);
    document.getElementById('routineOperator').value='';
    document.getElementById('routineAction').value='';
    document.getElementById('routineNote').value='';
    document.getElementById('routineHistory').hidden=true;
    renderTabs(schedulesFor(name));modal.classList.add('open');
  }
  async function save(){
    const schedule=selectedSchedule(), list=[...modal.querySelectorAll('.routine-item')].map((row,i)=>({item:row.querySelector('label').textContent,checked:row.querySelector('input').checked}));
    const record={equipmentId:current.id,equipmentName:current.name,schedule,items:list,date:document.getElementById('routineDate').value,operator:document.getElementById('routineOperator').value.trim(),action:document.getElementById('routineAction').value.trim(),note:document.getElementById('routineNote').value.trim(),savedAt:new Date().toISOString()};
    if(!record.operator){alert('請填寫執行人員／簽名。');return;}
    const all=localRecords();all.unshift(record);setLocal(all.slice(0,500));
    try{
      const r=await fetch(API+'/api/checklists/'+encodeURIComponent(current.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
      if(!r.ok)throw Error();
      toast('定期檢查已儲存並同步 NAS');
    }catch(e){toast('已儲存在本機；NAS 暫時無法同步');}
    renderHistory(true);
  }
  async function getHistory(){
    try{const r=await fetch(API+'/api/checklists/'+encodeURIComponent(current.id),{cache:'no-store'});if(r.ok){const j=await r.json();if(Array.isArray(j.records))return j.records;}}catch(e){}
    return localRecords().filter(x=>x.equipmentId===current.id);
  }
  async function renderHistory(show){
    const box=document.getElementById('routineHistory');box.hidden=!show;if(!show)return;
    const rows=await getHistory();box.innerHTML=rows.length?'<strong>歷史檢查紀錄</strong><br>'+rows.slice(0,20).map(r=>`<div style="margin-top:9px;padding-top:8px;border-top:1px solid #21445e"><strong>${escapeHtml(r.date||'')}</strong>｜${escapeHtml(canonical(r.schedule)||'')}｜${escapeHtml(r.operator||'')}<br>完成 ${(r.items||[]).filter(x=>x.checked).length}/${(r.items||[]).length} 項<br>處理情形：${escapeHtml(r.action||'—')}<br>備註：${escapeHtml(r.note||'—')}</div>`).join(''):'尚無歷史紀錄。';
  }
  function toggleHistory(){const box=document.getElementById('routineHistory');renderHistory(box.hidden);}
  function close(){if(modal)modal.classList.remove('open');}
  function toast(msg){const t=document.getElementById('toast');if(t){t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}else alert(msg);}
  function addButton(){
    const card=[...document.querySelectorAll('#panel .card')].find(x=>x.textContent.includes('新增清潔紀錄'));
    if(!card||document.getElementById('routineChecklistBtn'))return;
    const b=document.createElement('button');b.id='routineChecklistBtn';b.textContent='📋 定期保養檢查清單';b.style.cssText='width:100%;margin:4px 0;background:linear-gradient(180deg,#148ed3,#086eb1);border-color:#45c6ff';
    b.onclick=open;card.insertBefore(b,card.firstChild);
  }
  inject();addButton();new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});
})();