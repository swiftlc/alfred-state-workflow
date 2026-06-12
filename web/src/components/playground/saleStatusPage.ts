export const SALE_STATUS_PAGE_NAME = 'SKU/SPU 上下架管理'
export const SALE_STATUS_PAGE_PROMPT = '展示 SPU/SKU 上下架状态树形结构，支持按渠道修改 sale_status，基于 diff 批量更新'

export const SALE_STATUS_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SKU/SPU 上下架管理</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif;background:#f8fafc}
.spin{display:inline-block;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.spu-card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05);position:relative}
.sku-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:8px}
.tree-line{border-left:2px solid #e2e8f0;margin-left:12px;padding-left:16px;margin-top:12px}
.ch-row{display:flex;align-items:center;gap:8px;padding:3px 0}
.ch-label{font-size:11px;color:#64748b;font-weight:500;min-width:72px}
.ch-select{font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;background:#fff;outline:none;cursor:pointer}
.ch-select:focus{border-color:#818cf8}
.ch-select.changed{background:#fef9c3;border-color:#fcd34d}
.diff-tag{font-size:10px;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;border-radius:4px;padding:1px 5px}
.sec-title{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:8px 18px;border-radius:8px;font-size:13px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
button{cursor:pointer;transition:all .1s}
button:active{transform:scale(.95)}
/* pill tag switch */
.sw-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;cursor:pointer;user-select:none;transition:background .15s,color .15s,border-color .15s;border:1px solid transparent}
.sw-pill.off{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0}
.sw-pill.on{background:#ede9fe;color:#6d28d9;border-color:#c4b5fd}
.sw-pill.changed{border-style:dashed;border-color:#f59e0b;background:#fef9c3;color:#b45309}
.sw-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
.rolling{animation:spin .5s linear infinite}
/* 任务状态卡片 */
.task-card{margin-top:12px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;font-size:12px}
.task-row{display:flex;gap:6px;margin-bottom:4px;align-items:flex-start}
.task-lbl{color:#94a3b8;font-weight:500;min-width:64px;flex-shrink:0}
.task-val{color:#334155;word-break:break-all}
.status-badge{display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600}
.status-running{background:#dbeafe;color:#1d4ed8}
.status-success{background:#dcfce7;color:#166534}
.status-fail{background:#fee2e2;color:#b91c1c}
.status-pending{background:#f1f5f9;color:#64748b}
.dl-btn{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;cursor:pointer;text-decoration:none}
.dl-btn:hover{background:#ddd6fe}
/* 换绑SKU卡片高亮 */
.sku-card.rebound{border-color:#fca5a5;background:#fff5f5}
/* 回滚按钮 */
.rollback-btn{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;cursor:pointer;user-select:none;transition:background .1s}
.rollback-btn:hover{background:#fecaca}
.rollback-btn:disabled{opacity:.5;cursor:not-allowed}
</style>
</head>
<body class="p-5">
<div class="toast" id="toast"></div>

<div class="flex items-center justify-between mb-5">
  <div>
    <h1 class="text-lg font-bold text-slate-800">SKU/SPU 上下架管理</h1>
    <p class="text-xs text-slate-400 mt-0.5">merchant_id: 1000338 · poi_id: 49870430</p>
  </div>
  <div class="flex items-center gap-2">
    <button id="refreshBtn" class="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50" onclick="loadData()">↻ 刷新</button>
    <span id="diffCount" class="text-xs text-amber-600 hidden"></span>
    <button id="saveBtn" class="text-xs text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-4 py-1.5 hidden" onclick="saveChanges()">保存修改</button>
    <button id="execRebindBtn" class="text-xs text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-1.5" onclick="submitRebindTask()">▶ 执行换绑</button>
  </div>
</div>

<div id="loadingEl" class="text-center py-16 text-slate-300">
  <div class="spin text-2xl mb-2">↻</div>
  <div class="text-sm">加载中…</div>
</div>
<div id="errorEl" class="hidden bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4"></div>
<div id="taskPanel" class="hidden task-card mb-3">
  <div class="flex items-center gap-2 mb-2">
    <span class="text-xs font-bold text-slate-600">换绑任务</span>
    <span id="taskStatusBadge" class="status-badge status-pending">-</span>
    <span id="taskPolling" class="hidden text-xs text-slate-400"><span class="spin">↻</span> 轮询中…</span>
  </div>
  <div class="task-row"><span class="task-lbl">Task ID</span><span class="task-val" id="taskIdVal">-</span></div>
  <div class="task-row"><span class="task-lbl">TraceId</span><span class="task-val" id="taskTraceVal">-</span></div>
  <div class="task-row"><span class="task-lbl">开始时间</span><span class="task-val" id="taskBeginVal">-</span></div>
  <div class="task-row"><span class="task-lbl">结束时间</span><span class="task-val" id="taskEndVal">-</span></div>
  <div class="task-row"><span class="task-lbl">数量统计</span><span class="task-val" id="taskNumVal">-</span></div>
  <div id="taskExcelRow" class="task-row hidden"><span class="task-lbl">结果文件</span><span class="task-val"><span id="taskExcelLink" class="dl-btn" onclick="$openUrl(this.dataset.url)">⬇ 下载 Excel</span></span></div>
</div>
<div id="treeEl" class="hidden"></div>

<script>
var CFG = {
  merchantId: '1000338',
  poiId: '49870430',
  skuIds: ['2064633193247629335','2063966223783256069'],
  spuIds: ['2064633193184702465','2063966223661621332'],
  channels: [100,200,0],
  skuToSpu: {
    '2064633193247629335':'2064633193184702465',
    '2063966223783256069':'2063966223661621332'
  }
};
var CH_NAME = {100:'外卖(100)',200:'团购(200)',0:'通用(0)'};
// 1:上架  2:自动下架  3:手动下架
var STATUS_OPTS = [[1,'上架'],[2,'自动下架'],[3,'手动下架']];
var SPU_DESC = {
  '2064633193184702465': '源spu1:灰色001',
  '2063966223661621332': '目标spu2:测试换绑003'
};
var SKU_DESC = {
  '2064633193247629335': '源sku1:灰色001',
  '2063966223783256069': '目标sku2:黑色xxs'
};
// pv 开关字段定义
var PV_SWITCHES = [
  {field:'enableSkuSaleStatus', label:'SKU规格上下架'},
  {field:'sellOutOffShelf',      label:'售罄不允许上架'}
];
var originalData = {};
var currentData  = {};
var skuRows=[], spuRows=[], onlineRows=[], skuBindRows=[];
// 换绑关系：{skuId: actualSpuId}，仅记录已换出的
var reboundMap = {};

function $ (id){ return document.getElementById(id); }
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }

async function loadData(){
  show('loadingEl'); hide('treeEl'); hide('errorEl');
  try{
    var skuIn = CFG.skuIds.map(function(s){ return "'"+s+"'"; }).join(',');
    var spuIn = CFG.spuIds.map(function(s){ return "'"+s+"'"; }).join(',');
    var ch = CFG.channels.join(',');
    var res = await Promise.all([
      $sql("select id,sku_id,channel_id,sale_status from dim_sku_channel_info where merchant_id="+CFG.merchantId+" and dim_id="+CFG.poiId+" and sku_id in ("+skuIn+") and sale_status is not null and valid=1 and channel_id in ("+ch+") order by sku_id asc"),
      $sql("select id,spu_id,channel_id,sale_status from dim_spu_channel_info where merchant_id="+CFG.merchantId+" and dim_id="+CFG.poiId+" and spu_id in ("+spuIn+") and valid=1 and sale_status is not null and channel_id in ("+ch+") order by spu_id asc"),
      $sql("select id,spu_id,pv from poi_spu_online_info where merchant_id="+CFG.merchantId+" and poi_id="+CFG.poiId+" and spu_id in ("+spuIn+") and valid=1"),
      $sql("select sku_id,spu_id from merchant_sku where merchant_id="+CFG.merchantId+" and sku_id in ("+skuIn+")")
    ]);
    skuRows=res[0]||[]; spuRows=res[1]||[]; onlineRows=res[2]||[]; skuBindRows=res[3]||[];
    buildState();
    renderTree();
    hide('loadingEl'); show('treeEl');
  } catch(e){
    hide('loadingEl');
    $('errorEl').textContent='加载失败：'+e.message;
    show('errorEl');
  }
}

function buildState(){
  originalData={};
  reboundMap={};
  spuRows.forEach(function(r){
    originalData['spu_'+r.spu_id+'_'+r.channel_id]={id:r.id, status:+r.sale_status};
  });
  skuRows.forEach(function(r){
    originalData['sku_'+r.sku_id+'_'+r.channel_id]={id:r.id, status:+r.sale_status};
  });
  onlineRows.forEach(function(r){
    try{
      var pv=typeof r.pv==='string'?JSON.parse(r.pv):r.pv;
      PV_SWITCHES.forEach(function(sw){
        if(pv && pv[sw.field]!=null){
          originalData['pv_'+r.spu_id+'_'+sw.field]={id:r.id, status:+pv[sw.field], pvField:sw.field};
        }
      });
    }catch(e){}
  });
  // 构建换绑映射
  skuBindRows.forEach(function(r){
    var skuId=String(r.sku_id);
    var actualSpu=String(r.spu_id);
    var originalSpu=CFG.skuToSpu[skuId];
    if(originalSpu && actualSpu !== originalSpu){
      reboundMap[skuId]=actualSpu;
    }
  });
  currentData=JSON.parse(JSON.stringify(originalData));
}

function getDiff(){
  return Object.keys(currentData).filter(function(k){
    return originalData[k] && currentData[k].status !== originalData[k].status;
  });
}

function updateDiffUI(){
  var diff=getDiff();
  var saveBtn=$('saveBtn'), dc=$('diffCount');
  if(diff.length>0){
    saveBtn.classList.remove('hidden');
    dc.classList.remove('hidden');
    dc.textContent=diff.length+' 处变更';
  } else {
    saveBtn.classList.add('hidden');
    dc.classList.add('hidden');
  }
}

function renderChannelSelects(prefix, entityId){
  return CFG.channels.map(function(ch){
    var key=prefix+'_'+entityId+'_'+ch;
    var d=currentData[key];
    if(!d) return '';
    var changed=originalData[key] && d.status!==originalData[key].status;
    var diffTag=changed?'<span class="diff-tag">'+STATUS_OPTS.find(function(s){return s[0]===originalData[key].status;})[1]+' → '+STATUS_OPTS.find(function(s){return s[0]===d.status;})[1]+'</span>':'';
    return '<div class="ch-row">'+
      '<span class="ch-label">'+(CH_NAME[ch]||('ch'+ch))+'</span>'+
      '<select class="ch-select'+(changed?' changed':'')+'" data-key="'+key+'"><'+'/select>'+
      diffTag+
    '</div>';
  }).join('');
}

function renderPvSwitches(sid){
  var items = PV_SWITCHES.map(function(sw){
    var key='pv_'+sid+'_'+sw.field;
    var d=currentData[key];
    if(!d) return null;
    var isOn=d.status===1;
    var orig=originalData[key];
    var changed=orig && d.status!==orig.status;
    var pillCls='sw-pill '+(changed?'changed':(isOn?'on':'off'));
    var diffTag=changed?'<span class="diff-tag">'+(orig.status===1?'开':'关')+' → '+(isOn?'开':'关')+'</span>':'';
    return '<div class="ch-row">'+
      '<span class="ch-label">'+sw.label+'</span>'+
      '<span class="'+pillCls+'" data-swkey="'+key+'">'+
        '<span class="sw-dot"></span>'+(isOn?'开启':'关闭')+
      '</span>'+
      diffTag+
    '</div>';
  }).filter(function(s){ return s!==null; });
  if(!items.length) return '';
  return '<div class="mt-3"><div class="sec-title">SPU 属性</div>'+items.join('')+'</div>';
}

function renderTree(){
  var el=$('treeEl');

  var html=CFG.spuIds.map(function(sid){
    var skus=CFG.skuIds.filter(function(kid){ return CFG.skuToSpu[kid]===sid; });
    var pvSection=renderPvSwitches(sid);
    var skuSection=skus.map(function(kid){
      var skuDesc=SKU_DESC[kid]||'';
      var isRebound=!!reboundMap[kid];
      return '<div class="sku-card'+(isRebound?' rebound':'')+'" id="sku-card-'+kid+'">'+
        '<div class="flex items-center gap-2 mb-2">'+
          '<span class="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-medium">SKU</span>'+
          (skuDesc?'<span class="text-sm font-semibold text-slate-700">'+skuDesc+'</span>':'')+
          '<span class="font-mono text-xs text-slate-400 ml-1">'+kid+'</span>'+
          (isRebound?'<span class="text-xs text-red-400 font-medium">↗ 已换绑</span><button class="rollback-btn" data-rebind-sku="'+kid+'" data-rebind-spu="'+CFG.skuToSpu[kid]+'">↩ 回滚绑定</button>':'')+
        '</div>'+
        '<div class="sec-title">上下架状态</div>'+
        renderChannelSelects('sku',kid)+
      '</div>';
    }).join('');
    var spuDesc=SPU_DESC[sid]||'';
    return '<div class="spu-card" id="spu-card-'+sid+'">'+
      '<div class="flex items-center gap-2 mb-3" id="spu-title-'+sid+'">'+
        '<span class="text-xs bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded font-medium">SPU</span>'+
        (spuDesc?'<span class="text-sm font-semibold text-slate-700">'+spuDesc+'</span>':'')+
        '<span class="font-mono text-xs text-slate-400 ml-1">'+sid+'</span>'+
      '</div>'+
      '<div class="sec-title">SPU 上下架状态</div>'+
      renderChannelSelects('spu',sid)+
      pvSection+
      (skuSection?'<div class="tree-line"><div class="sec-title mb-2">下属 SKU</div>'+skuSection+'</div>':'')+
    '</div>';
  }).join('');
  el.innerHTML=html;

  // 填充 select options
  el.querySelectorAll('select[data-key]').forEach(function(sel){
    var key=sel.getAttribute('data-key');
    var d=currentData[key];
    if(!d) return;
    STATUS_OPTS.forEach(function(o){
      var opt=document.createElement('option');
      opt.value=String(o[0]);
      opt.textContent=o[1];
      if(d.status==o[0]) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function(){
      currentData[key]=Object.assign({},currentData[key],{status:+sel.value});
      var changed=originalData[key] && currentData[key].status!==originalData[key].status;
      sel.className='ch-select'+(changed?' changed':'');
      var row=sel.parentElement;
      var existTag=row.querySelector('.diff-tag');
      if(changed){
        var fromLabel=STATUS_OPTS.find(function(s){return s[0]===originalData[key].status;});
        var toLabel=STATUS_OPTS.find(function(s){return s[0]===currentData[key].status;});
        var tag=existTag||document.createElement('span');
        tag.className='diff-tag';
        tag.textContent=(fromLabel?fromLabel[1]:'?')+' → '+(toLabel?toLabel[1]:'?');
        if(!existTag) row.appendChild(tag);
      } else if(existTag){
        existTag.remove();
      }
      updateDiffUI();
    });
  });

  // 绑定 pill switch 点击事件
  el.querySelectorAll('span[data-swkey]').forEach(function(pill){
    var key=pill.getAttribute('data-swkey');
    pill.style.cursor='pointer';
    pill.addEventListener('click', function(){
      var d=currentData[key];
      if(!d) return;
      var newVal=d.status===1?0:1;
      currentData[key]=Object.assign({},d,{status:newVal});
      var orig=originalData[key];
      var changed=orig && newVal!==orig.status;
      var isOn=newVal===1;
      pill.className='sw-pill '+(changed?'changed':(isOn?'on':'off'));
      var dot=pill.querySelector('.sw-dot');
      pill.textContent=isOn?'开启':'关闭';
      pill.insertBefore(dot, pill.firstChild);
      var row=pill.parentElement;
      var existTag=row.querySelector('.diff-tag');
      if(changed){
        var tag=existTag||document.createElement('span');
        tag.className='diff-tag';
        tag.textContent=(orig.status===1?'开':'关')+' → '+(isOn?'开':'关');
        if(!existTag) row.appendChild(tag);
      } else if(existTag){
        existTag.remove();
      }
      updateDiffUI();
    });
  });

  // 绑定回滚按钮点击事件
  el.querySelectorAll('button[data-rebind-sku]').forEach(function(btn){
    var skuId=btn.getAttribute('data-rebind-sku');
    var origSpu=btn.getAttribute('data-rebind-spu');
    btn.addEventListener('click',function(){
      if(btn.disabled) return;
      btn.disabled=true;
      btn.textContent='↻ 回滚中…';
      $sql("update merchant_sku set spu_id='"+origSpu+"' where sku_id='"+skuId+"' and merchant_id="+CFG.merchantId)
        .then(function(){
          showToast('✓ 回滚成功，SKU '+skuId+' 已绑回 '+origSpu, 3000);
          loadData();
        })
        .catch(function(err){
          btn.disabled=false;
          btn.textContent='↩ 回滚绑定';
          showToast('⚠ 回滚失败: '+err.message, 4000);
        });
    });
  });
}

async function saveChanges(){
  var diff=getDiff();
  if(!diff.length) return;
  var btn=$('saveBtn');
  btn.innerHTML='<span class="spin">↻</span> 保存中…';
  btn.disabled=true;
  var errs=[], ok=0;
  for(var i=0;i<diff.length;i++){
    var k=diff[i];
    var cur=currentData[k];
    try{
      if(k.startsWith('spu_')){
        await $sql("update dim_spu_channel_info set sale_status="+cur.status+" where id="+cur.id+"");
        ok++;
      } else if(k.startsWith('sku_')){
        await $sql("update dim_sku_channel_info set sale_status="+cur.status+" where id="+cur.id+"");
        ok++;
      } else if(k.startsWith('pv_')){
        var pvField=cur.pvField;
        await $sql('update poi_spu_online_info set pv=JSON_SET(pv, "$.'+pvField+'", '+cur.status+') where id='+cur.id+'');
        ok++;
      }
    }catch(e){ errs.push(k+': '+e.message); }
  }
  btn.textContent='保存修改';
  btn.disabled=false;
  if(errs.length){ showToast('⚠ 失败: '+errs[0], 4000); }
  else { showToast('✓ 已保存 '+ok+' 处变更', 2000); loadData(); }
}

function showToast(msg,ms){
  var t=$('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, ms||2000);
}

// ─── 换绑任务执行 ───────────────────────────────────────────────
var REBIND_CFG = {
  appkey:       'com.sankuai.sgshopmgmt.productbiz',
  swimlane:     'selftest-260511-105325-880',
  methodKeyword:'submitSkuRebindTask',
  previewTaskId:'4056319',
  userCtx: JSON.stringify({
    accountId:   83704,
    empId:       10048724,
    authProvider:'',
    cliPlugIn:   '',
    accountName: 'majian22',
    appId:       3,
    empName:     '\u9a6c\u5065',
    accountType: null,
    tenantId:    1000338,
    userAgent:   '',
    source:      null
  })
};
var _pollTimer = null;

var TASK_STATUS_MAP = {
  0: {label:'任务创建中', cls:'status-pending'},
  5: {label:'已驳回',    cls:'status-fail'},
  10:{label:'待执行',    cls:'status-pending'},
  20:{label:'执行中',    cls:'status-running'},
  21:{label:'执行等待中',cls:'status-running'},
  22:{label:'等待回调中',cls:'status-running'},
  30:{label:'执行成功',  cls:'status-success'},
  40:{label:'执行失败',  cls:'status-fail'}
};

async function submitRebindTask(){
  var btn=$('execRebindBtn');
  btn.disabled=true;
  btn.innerHTML='<span class="spin">↻</span> 提交中…';
  try{
    var body={
      appkey:       REBIND_CFG.appkey,
      swimlane:     REBIND_CFG.swimlane,
      methodKeyword:REBIND_CFG.methodKeyword,
      params:       [
        JSON.stringify({previewTaskId: REBIND_CFG.previewTaskId}),
        REBIND_CFG.userCtx
      ]
    };
    var json=await $octo(body);
    if(json.code!==0) throw new Error('octo 调用失败 code='+json.code+': '+(json.msg||JSON.stringify(json).slice(0,200)));
    var traceId=(json.data&&json.data.traceId)||'';
    var innerStr=(json.data&&json.data['return'])||'';
    var inner={};
    try{ inner=JSON.parse(innerStr); }catch(e2){ throw new Error('return 解析失败: '+innerStr.slice(0,200)); }
    if(inner.status&&inner.status.code!==0) throw new Error('换绑接口失败: '+(inner.status.msg||JSON.stringify(inner.status)));
    var taskId=(inner.data&&inner.data.taskId)||inner.taskId;
    if(!taskId) throw new Error('未获取到 taskId，响应: '+JSON.stringify(inner).slice(0,200));
    show('taskPanel');
    $('taskIdVal').textContent=taskId;
    $('taskTraceVal').textContent=traceId||'-';
    $('taskBeginVal').textContent='-';
    $('taskEndVal').textContent='-';
    $('taskNumVal').textContent='-';
    hide('taskExcelRow');
    showToast('✓ 换绑任务已提交，taskId='+taskId, 3000);
    startPollTask(taskId);
  }catch(e){
    showToast('⚠ 提交失败: '+e.message, 5000);
  }finally{
    btn.disabled=false;
    btn.textContent='▶ 执行换绑';
  }
}

function startPollTask(taskId){
  if(_pollTimer) clearInterval(_pollTimer);
  show('taskPolling');
  var attempts=0;
  var maxAttempts=60;
  function poll(){
    attempts++;
    if(attempts>maxAttempts){ clearInterval(_pollTimer); hide('taskPolling'); return; }
    $sql("select id,task_status,begin_time,end_time,total_num,success_num,failed_num,execute_result from task_info where id="+taskId)
      .then(function(rows){
        var row=rows&&rows[0];
        if(!row) return;
        var s=+row.task_status;
        var info=TASK_STATUS_MAP[s]||{label:'未知('+s+')',cls:'status-pending'};
        var badge=$('taskStatusBadge');
        badge.textContent=info.label;
        badge.className='status-badge '+info.cls;
        $('taskBeginVal').textContent=row.begin_time||'-';
        $('taskEndVal').textContent=row.end_time||'-';
        var totalN=row.total_num!=null?row.total_num:'-';
        var succN=row.success_num!=null?row.success_num:'-';
        var failN=row.failed_num!=null?row.failed_num:'-';
        $('taskNumVal').innerHTML='总计 <b>'+totalN+'</b> &nbsp;成功 <b style="color:#166534">'+succN+'</b> &nbsp;失败 <b style="color:#b91c1c">'+failN+'</b>';
        var isDone=(s===30||s===40||s===5);
        if(isDone){
          clearInterval(_pollTimer);
          hide('taskPolling');
          try{
            var result=typeof row.execute_result==='string'?JSON.parse(row.execute_result):row.execute_result;
            if(result&&result.resultFileUrl){
              var fname=result.resultFileName||'下载 Excel';
              var lnk=$('taskExcelLink');
              lnk.dataset.url=result.resultFileUrl;
              lnk.textContent='⬇ '+fname;
              show('taskExcelRow');
            }
          }catch(e2){ /* 无结果文件 */ }
          if(s===30) showToast('✅ 换绑任务执行成功', 3000);
          else       showToast('❌ 换绑任务'+info.label, 4000);
        }
      })
      .catch(function(){ /* 忽略单次轮询失败 */ });
  }
  poll();
  _pollTimer=setInterval(poll, 5000);
}

loadData();
<\/script>
</body>
</html>`
