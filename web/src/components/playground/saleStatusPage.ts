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
.spu-card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
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
/* 换绑 tag */
.rebind-tag{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;cursor:pointer;position:relative;transition:background .1s}
.rebind-tag:hover{background:#fecaca}
.rebind-tip{display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:99;background:#1e293b;color:#f8fafc;font-size:11px;font-weight:400;padding:5px 9px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}
.rebind-tag:hover .rebind-tip{display:block}
.rolling{animation:spin .5s linear infinite}
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
  </div>
</div>

<div id="loadingEl" class="text-center py-16 text-slate-300">
  <div class="spin text-2xl mb-2">↻</div>
  <div class="text-sm">加载中…</div>
</div>
<div id="errorEl" class="hidden bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4"></div>
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
var STATUS_OPTS = [[1,'上架'],[2,'下架'],[3,'售罄下架']];
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
  spuRows.forEach(function(r){
    originalData['spu_'+r.spu_id+'_'+r.channel_id]={id:r.id, status:+r.sale_status};
  });
  skuRows.forEach(function(r){
    originalData['sku_'+r.sku_id+'_'+r.channel_id]={id:r.id, status:+r.sale_status};
  });
  onlineRows.forEach(function(r){
    try{
      var pv=typeof r.pv==='string'?JSON.parse(r.pv):r.pv;
      // 解析 pv 开关字段
      PV_SWITCHES.forEach(function(sw){
        if(pv && pv[sw.field]!=null){
          originalData['pv_'+r.spu_id+'_'+sw.field]={id:r.id, status:+pv[sw.field], pvField:sw.field};
        }
      });
    }catch(e){}
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

// 用 data-key 绑定，避免 inline onchange 的引号问题
function renderChannelSelects(prefix, entityId){
  return CFG.channels.map(function(ch){
    var key=prefix+'_'+entityId+'_'+ch;
    var d=currentData[key];
    if(!d) return '';
    var changed=originalData[key] && d.status!==originalData[key].status;
    var opts=STATUS_OPTS.map(function(s){
      return '<option value="'+s[0]+'"'+(d.status==s[0]?' selected':'')+'>'+s[1]+'</option>';
    }).join('');
    var diffTag=changed?'<span class="diff-tag">'+STATUS_OPTS.find(function(s){return s[0]===originalData[key].status;})[1]+' → '+STATUS_OPTS.find(function(s){return s[0]===d.status;})[1]+'</span>':'';
    return '<div class="ch-row">'+
      '<span class="ch-label">'+(CH_NAME[ch]||('ch'+ch))+'</span>'+
      '<select class="ch-select'+(changed?' changed':'')+'" data-key="'+key+'"><'+'/select>'+
      diffTag+
    '</div>';
    // select options 单独通过 JS 填入，避免引号问题
  }).join('');
}

// 渲染 pv 开关区块（pill tag 样式）
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
  // 构建 sku -> 当前实际 spu 映射
  var skuActualSpu={};
  skuBindRows.forEach(function(r){ skuActualSpu[String(r.sku_id)]=String(r.spu_id); });

  var html=CFG.spuIds.map(function(sid){
    var skus=CFG.skuIds.filter(function(kid){ return CFG.skuToSpu[kid]===sid; });
    var pvSection=renderPvSwitches(sid);
    var skuSection=skus.map(function(kid){
      var skuDesc=SKU_DESC[kid]||'';
      var actualSpu=skuActualSpu[kid];
      var isRebound=actualSpu && actualSpu!==sid;
      var rebindTag='';
      if(isRebound){
        var tipText='已换出，目标SPU: '+actualSpu+'  点击回滚';
        rebindTag='<span class="rebind-tag" data-rebind-sku="'+kid+'" data-rebind-spu="'+sid+'">'+
          '⚠ 已换绑'+
          '<span class="rebind-tip">'+tipText+'</span>'+
        '</span>';
      }
      return '<div class="sku-card">'+
        '<div class="flex items-center gap-2 mb-2">'+
          '<span class="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded font-medium">SKU</span>'+
          (skuDesc?'<span class="text-sm font-semibold text-slate-700">'+skuDesc+'</span>':'')+
          '<span class="font-mono text-xs text-slate-400 ml-1">'+kid+'</span>'+
          rebindTag+
        '</div>'+
        '<div class="sec-title">上下架状态</div>'+
        renderChannelSelects('sku',kid)+
      '</div>';
    }).join('');
    var spuDesc=SPU_DESC[sid]||'';
    return '<div class="spu-card">'+
      '<div class="flex items-center gap-2 mb-3">'+
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

  // 填充 select options（避免 HTML 拼接时的引号问题）
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
      // 更新 pill 样式和文字
      pill.className='sw-pill '+(changed?'changed':(isOn?'on':'off'));
      var dot=pill.querySelector('.sw-dot');
      pill.textContent=isOn?'开启':'关闭';
      pill.insertBefore(dot, pill.firstChild);
      // 更新 diff tag
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

  // 绑定换绑回滚点击
  el.querySelectorAll('span[data-rebind-sku]').forEach(function(tag){
    var skuId=tag.getAttribute('data-rebind-sku');
    var spuId=tag.getAttribute('data-rebind-spu');
    tag.addEventListener('click', function(e){
      e.stopPropagation();
      if(tag.classList.contains('rolling')) return;
      tag.innerHTML='<span class="rolling">↻</span> 回滚中…<span class="rebind-tip">处理中，请稍候</span>';
      $sql("update merchant_sku set spu_id='"+spuId+"' where sku_id='"+skuId+"' and merchant_id="+CFG.merchantId)
        .then(function(){
          showToast('✓ 回滚成功，SKU '+skuId+' 已绑回 '+spuId, 3000);
          loadData();
        })
        .catch(function(err){
          showToast('⚠ 回滚失败: '+err.message, 4000);
          tag.innerHTML='⚠ 已换绑<span class="rebind-tip">当前绑定已变更，点击重试</span>';
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
        // key 格式: pv_{spuId}_{pvField}
        // 用 JSON_SET 直接更新 pv 中的指定字段，避免整个 JSON 拼接带来的转义问题
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

loadData();
<\/script>
</body>
</html>`
