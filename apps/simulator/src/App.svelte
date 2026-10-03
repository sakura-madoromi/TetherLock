<script lang="ts">
 import {onMount} from 'svelte';import {Channel,invoke} from '@tauri-apps/api/core';
 import StatusBadge from './StatusBadge.svelte';import {readTheme,saveTheme,resolvedTheme,remainingTime,controlLabel} from './theme';import type {ThemePreference} from './theme';
 import {LockScene} from './scene';import Logs from './Logs.svelte';import type {Action,Display,LogEntry,Snapshot} from './types';
 let renderReady=$state(false);
 let theme=$state<ThemePreference>(readTheme()),systemDark=$state(false),reducedMotion=$state(false),themeError=$state('');
 let tab=$state('overview');const tabs=[['overview','概览'],['debug','调试'],['connection','连接'],['logs','日志']];
 const currentTheme=$derived(resolvedTheme(theme,systemDark));
 $effect(()=>{document.documentElement.dataset.theme=currentTheme;scene?.setTheme(currentTheme==='dark');});
 $effect(()=>{scene?.setReducedMotion(reducedMotion);});
 function changeTheme(){themeError=saveTheme(theme)?'':'外观偏好无法保存，当前主题仍然生效。';}
 function switchTab(value:string){release();tab=value;}
 function tabKey(event:KeyboardEvent,index:number){let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();switchTab(tabs[next][0]);document.getElementById(`tab-${tab}`)?.focus();}
 let snapshot=$state<Snapshot|null>(null),logs=$state<LogEntry[]>([]),error=$state(''),renderError=$state(''),hint=$state('正在加载 CAD…');
 let viewport:HTMLDivElement;let scene:LockScene|null=null;let renderGeneration=0;let epoch:number|null=null;let subscriptionGeneration=0;let disposed=false;
 let serial=$state('SIM-001'),host=$state('127.0.0.1'),port=$state(1883),namespace=$state('tetherlock/v1'),tls=$state(false),username=$state(''),password=$state(''),publicKey=$state(''),cards=$state(3);
 let connectedBusy=$state(false),busy=$state(false),transparent=$state(false),split=$state(60),resetConfirmation=$state('');
 let jammed=$state(false),automatic=$state(true),lidOverride=$state('auto'),retractedOverride=$state('auto'),extendedOverride=$state('auto');
 let manualLid=$state(false),manualRetracted=$state(true),manualExtended=$state(false);
 let metrics=$state('');const latencies:number[]=[];let buttonQueue=Promise.resolve();let localPressed=false;let intendedLid=105;
 const bool=(value:string)=>value==='auto'?null:value==='true';
 async function operate(action:Action){const start=performance.now();try{await invoke('operate',{action});error='';}catch(e){error=String(e);}finally{latencies.push(performance.now()-start);if(latencies.length>1000)latencies.shift();}}
 async function submit(action:Action){if(busy)return;busy=true;try{await operate(action);}finally{busy=false;}}
 function button(pressed:boolean){if(localPressed===pressed)return;localPressed=pressed;buttonQueue=buttonQueue.then(()=>operate({type:'button',pressed}));}
 function release(){button(false);scene?.release();}
 async function lid(angle:number){intendedLid=angle;await submit({type:'lid',angle});}
 async function subscribe(){
  if(disposed)return;const generation=++subscriptionGeneration;
  if(epoch!==null)await invoke('unsubscribe',{epoch}).catch(()=>{});
  if(disposed||generation!==subscriptionGeneration)return;
  const channel=new Channel<Display>();let session='',sequence=-1;
  channel.onmessage=message=>{
   if(disposed||generation!==subscriptionGeneration)return;const next=message.snapshot;if(next.version!==2)return;
   if(session!==next.session_id){session=next.session_id;sequence=-1;intendedLid=next.physical.lid_target;serial=next.state.serial;cards=next.state.emergency.total;jammed=next.physical.jammed;automatic=next.physical.automatic;lidOverride=next.physical.lid_override===null?'auto':String(next.physical.lid_override);retractedOverride=next.physical.retracted_override===null?'auto':String(next.physical.retracted_override);extendedOverride=next.physical.extended_override===null?'auto':String(next.physical.extended_override);manualLid=next.physical.manual_inputs.lid_closed;manualRetracted=next.physical.manual_inputs.retracted;manualExtended=next.physical.manual_inputs.extended;}
   if(next.sequence<=sequence)return;sequence=next.sequence;snapshot=next;scene?.update(next);
   if(message.logs)logs=message.logs;
   void invoke('acknowledge',{epoch:message.subscription,sequence:next.sequence}).catch(()=>{});
  };
  const subscribed=await invoke<number>('subscribe',{channel});
  if(disposed||generation!==subscriptionGeneration){void invoke('unsubscribe',{epoch:subscribed});return;}epoch=subscribed;
 }
 async function connect(){
  if(connectedBusy)return;connectedBusy=true;
  try{const key=JSON.parse(publicKey);if(key.d||key.private_jwk)throw Error('模拟器只接受公钥');
   await invoke('connect',{config:{serial,broker_host:host,broker_port:port,namespace,tls,username:username||null,password:password||null,public_jwk:key},initialCards:cards});password='';await subscribe();error='';
  }catch(e){error=String(e);}finally{connectedBusy=false;}
 }
 async function disconnect(){try{await invoke('disconnect');error='';}catch(e){error=String(e);}}
 async function reload(){
  if(disposed)return;
  const generation=++renderGeneration;scene?.dispose();scene=null;renderReady=false;renderError='';hint='正在加载 CAD…';
  let next:LockScene|null=null;
  try{
   next=new LockScene(viewport,button,()=>void lid(intendedLid===0?105:0),text=>{if(generation===renderGeneration)hint=text;},text=>{if(generation===renderGeneration)renderError=text;});
   scene=next;next.setTheme(currentTheme==='dark');next.setReducedMotion(reducedMotion);next.setTransparent(transparent);if(snapshot)next.update(snapshot);await next.load();
   if(disposed||generation!==renderGeneration){next.dispose();return;}
   if(snapshot)next.update(snapshot);renderReady=true;
  }catch(e){next?.dispose();if(generation===renderGeneration){scene=null;renderError=String(e);}}
 }
 function keyboard(event:KeyboardEvent,pressed:boolean){
  const target=event.target as HTMLElement;if(target.closest('input,textarea,select,button,[contenteditable=true]'))return;
  if(event.code==='Space'){event.preventDefault();if(!event.repeat)button(pressed);}
 }
 function drag(event:PointerEvent){
  const divider=event.currentTarget as HTMLElement;divider.setPointerCapture(event.pointerId);
  const move=(e:PointerEvent)=>split=Math.max(28,Math.min(72,e.clientX/window.innerWidth*100));
  const stop=()=>{divider.removeEventListener('pointermove',move);divider.removeEventListener('pointerup',stop);divider.removeEventListener('pointercancel',stop);};
  divider.addEventListener('pointermove',move);divider.addEventListener('pointerup',stop);divider.addEventListener('pointercancel',stop);
 }
 function faults(){void submit({type:'faults',jammed,automatic,lid:bool(lidOverride),retracted:bool(retractedOverride),extended:bool(extendedOverride)});}
 function measure(){const p95=(values:number[])=>values.length?[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*.95)].toFixed(1):'—';metrics=`帧间隔 P95 ${p95(scene?.intervals??[])} ms · 操作往返 P95 ${p95(latencies)} ms`;}
 onMount(()=>{
  disposed=false;
  const media=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const updateTheme=()=>systemDark=media.matches,updateMotion=()=>reducedMotion=motion.matches;updateTheme();updateMotion();media.addEventListener('change',updateTheme);motion.addEventListener('change',updateMotion);
  void (async()=>{try{const settings=await invoke<Record<string,unknown>|null>('settings');if(settings){serial=String(settings.serial);host=String(settings.broker_host);port=Number(settings.broker_port);namespace=String(settings.namespace);tls=settings.tls===true;username=String(settings.username??'');publicKey=JSON.stringify(settings.public_jwk,null,2);}await subscribe();if(snapshot){jammed=snapshot.physical.jammed;automatic=snapshot.physical.automatic;}}catch(e){error=String(e);}await reload();})();
  const blur=()=>release(),hidden=()=>{if(document.hidden)release();},down=(e:KeyboardEvent)=>keyboard(e,true),up=(e:KeyboardEvent)=>keyboard(e,false);
  window.addEventListener('blur',blur);window.addEventListener('pagehide',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('keydown',down);window.addEventListener('keyup',up);
  return()=>{media.removeEventListener('change',updateTheme);motion.removeEventListener('change',updateMotion);disposed=true;++renderGeneration;++subscriptionGeneration;release();scene?.dispose();if(epoch!==null)void invoke('unsubscribe',{epoch});window.removeEventListener('blur',blur);window.removeEventListener('pagehide',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
 });
</script>
<svelte:head><title>TetherLock Linux 模拟器</title></svelte:head>
<header>
 <div class="brand"><span class="brand-mark" aria-hidden="true">T</span><div><strong>TetherLock</strong><span class="brand-subtitle">设备实验室</span></div></div>
 <div class="header-status"><span class="serial">{snapshot?.state.serial??serial}</span><StatusBadge label={snapshot?.mqtt==='connected'?'已连接':snapshot?.mqtt==='disconnected'?'未连接':snapshot?.mqtt??'启动中'} tone={snapshot?.mqtt==='connected'?'success':'neutral'}/></div>
 <label class="theme-switch"><span class="sr-only">外观主题</span><select aria-label="外观主题" bind:value={theme} onchange={changeTheme}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
</header>
<main style:--split={`${split}%`}>
 <section class="model" aria-label={renderReady?'三维模型 · 已加载':'三维模型 · 正在加载'}>
  <nav aria-label="模型工具">{#each [['iso','等轴'],['front','正视'],['mechanism','机构']] as [id,label]}<button onclick={()=>scene?.preset(id)}>{label}</button>{/each}<button onclick={()=>scene?.fit()}>适配视图</button><label class="check"><input type="checkbox" bind:checked={transparent} onchange={()=>scene?.setTransparent(transparent)}>透明外壳</label><button onclick={()=>void reload()}>重载三维</button></nav>
  <div class="viewport" role="img" aria-label="TetherLock 三维模型。拖动旋转，滚轮缩放；实体操作请使用下方按钮。" bind:this={viewport}></div>
  {#if renderError}<div class="render-error" role="alert">三维渲染失败：{renderError}<button onclick={()=>void reload()}>重新加载</button></div>{/if}
  <div class="physical-controls" aria-label="实体操作"><div class="buttons"><button disabled={busy} onclick={()=>void lid(0)}>关闭盖板</button><button disabled={busy} onclick={()=>void lid(105)}>打开盖板</button>
   <button aria-pressed={snapshot?.physical.button_pressed??false} class:pressed={snapshot?.physical.button_pressed} onpointerdown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);button(true);}} onpointerup={release} onpointercancel={release} onlostpointercapture={release} onkeydown={(e)=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)button(true);}}} onkeyup={release} onblur={release}>按住实体按钮 · 10 秒</button></div>
</div>
  <footer><span role="status">{hint}</span><details><summary>性能信息</summary><button onclick={measure}>性能采样</button><span>{metrics}</span></details></footer>
 </section>
 <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
 <div class="divider" role="separator" aria-label="调整面板宽度" aria-orientation="vertical" aria-valuemin="28" aria-valuemax="72" aria-valuenow={split} tabindex="0" onpointerdown={drag} onkeydown={(e)=>{if(e.key==='ArrowLeft')split=Math.max(28,split-2);if(e.key==='ArrowRight')split=Math.min(72,split+2);}}></div>
 <aside>
  <div class="workspace-heading"><p class="eyebrow">TETHERLOCK SIMULATOR</p><h1>设备工作台</h1><p class="muted">观察设备，验证每一次操作。</p></div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if themeError}<p class="error" role="alert">{themeError}</p>{/if}
  <div class="tabs" role="tablist" aria-label="工作台面板">{#each tabs as [id,label],index}<button id={`tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`panel-${id}`} tabindex={tab===id?0:-1} onclick={()=>switchTab(id)} onkeydown={(event)=>tabKey(event,index)}>{label}</button>{/each}</div>
  <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" tabindex="0" hidden={tab!=='overview'}>
   <section class="panel hero"><p class="eyebrow">当前锁状态</p><h2 class="lock-state">{snapshot?controlLabel(snapshot.state.control_state):'正在加载'}</h2>
    <StatusBadge label={snapshot?.state.fault_code??(snapshot?.paused?'模拟已暂停':'模拟运行中')} tone={snapshot?.state.fault_code?'error':snapshot?.paused?'warning':'success'}/>
    {#if snapshot?.state.remaining_seconds!=null}<div class="countdown">{remainingTime(snapshot.state.remaining_seconds)}</div><p class="muted">剩余锁定时间 · 以设备状态为准</p>{/if}
    <p class="screen">{snapshot?.physical.screen_text??'等待设备启动'}</p><progress aria-label="设备操作进度" max="100" value={snapshot?.physical.screen_progress??0}></progress>
   </section>
   <section class="panel"><h2>设备状态</h2><dl><dt>控制阶段</dt><dd>{snapshot?.state.control_state??'—'}</dd><dt>当前任务</dt><dd>{snapshot?.state.task?.task_id??'无'}</dd><dt>电机</dt><dd>{snapshot?.physical.motor_target??'停止'}</dd><dt>卡数</dt><dd>{snapshot?.state.emergency.remaining??'—'} / {snapshot?.state.emergency.total??'—'} {snapshot?.state.emergency.reserved?'（已预约）':''}</dd><dt>盖板 / 插销</dt><dd>{snapshot?.physical.lid_angle.toFixed(1)}° / {snapshot?.physical.bolt_position.toFixed(2)} mm</dd><dt>模拟时间</dt><dd>{((snapshot?.simulation_ms??0)/1000).toFixed(2)} s</dd><dt>传感器</dt><dd>盖 {snapshot?.physical.inputs.lid_closed?'●':'○'} · 退 {snapshot?.physical.inputs.retracted?'●':'○'} · 伸 {snapshot?.physical.inputs.extended?'●':'○'}</dd><dt>实体按钮</dt><dd>{snapshot?.physical.button_pressed?'按下':'释放'}</dd><dt>故障</dt><dd>{snapshot?.state.fault_code??'无'}</dd></dl></section>
   <section class="panel"><h2>模拟时间</h2><p class="muted">暂停冻结模拟时间，MQTT 连接和心跳继续运行。</p>   <div class="buttons time-controls"><button disabled={busy} onclick={()=>void submit({type:'pause',paused:!snapshot?.paused})}>{snapshot?.paused?'继续':'暂停'}</button><button disabled={busy} onclick={()=>void submit({type:'step'})}>单步 100 ms</button>{#each [[10000,'+10 秒'],[60000,'+1 分钟'],[3600000,'+1 小时']] as [ms,label]}<button disabled={busy} onclick={()=>void submit({type:'advance',ms:Number(ms)})}>{label}</button>{/each}<button disabled={busy} onclick={()=>void submit({type:'time',utc:Math.floor(Date.now()/1000)})}>校准 UTC</button></div></section>
  </div>
  <div id="panel-debug" role="tabpanel" aria-labelledby="tab-debug" tabindex="0" hidden={tab!=='debug'}>
   <section class="panel"><h2>故障与传感器</h2><p class="muted">覆盖物理输入，验证异常状态下的设备行为。</p>   <label><input type="checkbox" bind:checked={jammed}>卡栓</label><label><input type="checkbox" bind:checked={automatic}>自动传感器</label>
   <div class="grid"><label>盖板覆盖<select bind:value={lidOverride}><option value="auto">自动</option><option value="true">触发</option><option value="false">未触发</option></select></label><label>退栓覆盖<select bind:value={retractedOverride}><option value="auto">自动</option><option value="true">触发</option><option value="false">未触发</option></select></label><label>伸栓覆盖<select bind:value={extendedOverride}><option value="auto">自动</option><option value="true">触发</option><option value="false">未触发</option></select></label></div><button disabled={busy} onclick={faults}>应用故障与传感器模式</button>
   {#if !automatic}<div><label><input type="checkbox" bind:checked={manualLid}>盖闭</label><label><input type="checkbox" bind:checked={manualRetracted}>退栓</label><label><input type="checkbox" bind:checked={manualExtended}>伸栓</label><button onclick={()=>void submit({type:'inputs',inputs:{lid_closed:manualLid,retracted:manualRetracted,extended:manualExtended}})}>提交手动输入</button></div>{/if}
  </section><details class="danger-zone"><summary>重置设备</summary><label>输入当前序列号确认<input bind:value={resetConfirmation}></label><button class="danger" disabled={busy} onclick={()=>void submit({type:'reset',confirmation:resetConfirmation})}>确认重置任务和卡数</button></details>
  </div>
  <div id="panel-connection" role="tabpanel" aria-labelledby="tab-connection" tabindex="0" hidden={tab!=='connection'}><section class="panel"><h2>连接与手动配对</h2><div class="grid"><label>序列号<input bind:value={serial}></label><label>Broker<input bind:value={host}></label><label>端口<input type="number" bind:value={port} min="1" max="65535"></label><label>命名空间<input bind:value={namespace}></label><label>用户名<input bind:value={username} autocomplete="off"></label><label>密码<input type="password" bind:value={password} autocomplete="off" placeholder="留空读取 Secret Service"></label><label>初始紧急卡数<input type="number" bind:value={cards} min="0" max="255"></label><label><input type="checkbox" bind:checked={tls}>TLS</label></div><label>APP 授权公钥 JWK<textarea bind:value={publicKey} rows="5" spellcheck="false" placeholder="粘贴 EC P-256 公钥 JSON"></textarea></label><div class="buttons form-actions"><button class="primary" disabled={connectedBusy} onclick={()=>void connect()}>保存并连接</button><button disabled={connectedBusy} onclick={()=>void disconnect()}>断开</button></div><p class="muted">初始卡数只用于新的数据目录。复制 APP 的公钥后，在 APP 中填写相同序列号与 Broker。</p></section></div>
  <div id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" tabindex="0" hidden={tab!=='logs'}>
   <section class="panel"><h2>设备日志 <small>{logs.length} / 1000</small></h2><p class="muted">按模拟时间记录最近的设备事件。</p>{#if logs.length===0}<p class="empty">暂无日志，设备事件将在这里显示。</p>{/if}<Logs entries={logs}/></section>
  </div>
 </aside>
</main>
<style>
 header{min-height:80px;padding:16px 24px;display:flex;gap:24px;align-items:center;border-bottom:1px solid var(--border)}.brand{display:flex;gap:12px;align-items:center}.brand-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--primary);color:var(--on-primary);font-size:24px;font-weight:700}.brand strong{display:block;font-size:20px;letter-spacing:-.5px}.brand-subtitle{font-size:12px;color:var(--muted)}.header-status{margin-left:auto;display:flex;align-items:center;gap:12px}.serial{font:12px ui-monospace,monospace;color:var(--muted)}.theme-switch select{margin:0;width:120px;background:var(--surface)}
 main{display:grid;grid-template-columns:minmax(0,var(--split)) 8px minmax(0,1fr);height:calc(100dvh - 89px)}.model{position:relative;display:flex;flex-direction:column;min-width:0;padding:16px}nav{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.check{display:flex;align-items:center;min-height:48px;padding:0 8px}.check input{margin-top:0}.viewport{flex:1;min-height:200px;overflow:hidden}.physical-controls{border-top:1px solid var(--border);padding:16px 0 8px}.divider{background:var(--border);cursor:col-resize;touch-action:none;border:3px solid var(--background)}.divider:hover{background:var(--primary)}aside{overflow:auto;padding:24px;min-width:0}.workspace-heading h1{font-size:28px;line-height:1.25;margin:8px 0;font-weight:600;letter-spacing:-.6px}.eyebrow{font-size:12px;letter-spacing:1.5px;color:var(--muted);margin:0}.workspace-heading{margin-bottom:24px}.tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px;margin-bottom:24px;background:var(--primary-soft);border-radius:14px}.tabs button{background:transparent;border-color:transparent;padding:8px;min-width:0}.tabs button[aria-selected=true]{background:var(--surface);color:var(--primary);box-shadow:0 2px 6px #00000008;font-weight:600}.panel,.danger-zone{background:var(--surface);padding:24px;margin-bottom:16px;border:1px solid var(--border);border-radius:var(--radius-panel)}.hero .lock-state{font-size:28px;color:var(--primary);margin:12px 0 16px}.countdown{font-size:40px;line-height:1.2;font-variant-numeric:tabular-nums;margin-top:24px;overflow-wrap:anywhere}.screen{background:var(--primary-soft);color:var(--primary);padding:16px;border-radius:10px;margin:24px 0 12px;overflow-wrap:anywhere}progress{width:100%;accent-color:var(--primary);height:6px}dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:16px;margin:0}dt{color:var(--muted);font-size:12px}dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.form-actions{margin-top:24px}.danger-zone{border-color:var(--error);color:var(--error)}.danger-zone label{margin:16px 0}.error,.render-error{color:var(--error);background:var(--error-soft);padding:16px;border-radius:10px;overflow-wrap:anywhere}.render-error{position:absolute;top:80px;left:24px;right:24px}footer{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:8px 0}footer details{text-align:right}footer button{display:block;margin:8px 0}summary{cursor:pointer;min-height:24px}.empty{padding:24px;text-align:center;color:var(--muted)}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 @media(max-width:999px){main{height:auto;min-height:calc(100dvh - 89px);display:flex;flex-direction:column}.model{height:65dvh;min-height:460px}.divider{display:none}aside{overflow:visible}.workspace-heading{display:none}.tabs{position:sticky;top:8px;z-index:1}.header-status .serial{display:none}}
 @media(max-width:700px){header{padding:12px 16px;gap:12px}.brand-subtitle{display:none}.brand-mark{display:none}.brand strong{font-size:18px}.header-status{gap:0}.theme-switch select{width:105px}aside{padding:16px}.panel{padding:20px}.grid{gap:12px}}
</style>
