import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface CompleteSortHttpController {
  snapshot(): unknown;
  focus(): Promise<unknown>;
  refreshAndPreview(settings: unknown): Promise<unknown>;
  run(): Promise<unknown>;
  stop(): unknown;
}

export function createCompleteSortOperatorServer(parameters: {
  controller: CompleteSortHttpController;
  token: string;
}) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        return send(response, 200, "text/html; charset=utf-8", html(parameters.token));
      }
      if (request.method === "GET" && request.url === "/api/status") {
        return json(response, 200, parameters.controller.snapshot());
      }
      requireToken(request, parameters.token);
      if (request.method === "POST" && request.url === "/api/preview") {
        return json(response, 200, await parameters.controller.refreshAndPreview(await body(request)));
      }
      if (request.method === "POST" && request.url === "/api/focus") {
        return json(response, 200, await parameters.controller.focus());
      }
      if (request.method === "POST" && request.url === "/api/run") {
        return json(response, 200, await parameters.controller.run());
      }
      if (request.method === "POST" && request.url === "/api/stop") {
        return json(response, 200, parameters.controller.stop());
      }
      return json(response, 404, { error: "not-found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown-error";
      return json(response, message === "operator-busy" ? 409 : 400, { error: message });
    }
  });
}

async function body(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
    if (text.length > 128 * 1024) throw new Error("request-too-large");
  }
  return text ? JSON.parse(text) : {};
}

function requireToken(request: IncomingMessage, token: string) {
  if (request.headers["x-operator-token"] !== token) throw new Error("invalid-operator-token");
}

function json(response: ServerResponse, status: number, value: unknown) {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function send(response: ServerResponse, status: number, contentType: string, value: string) {
  response.writeHead(status, {
    "content-type": contentType, "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'"
  });
  response.end(value);
}

function html(token: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Complete Stash Sort</title>
<style>:root{font:15px system-ui;color:#eee;background:#0c0e11}body{max-width:1200px;margin:auto;padding:24px}fieldset,section{border:1px solid #3b4049;border-radius:9px;padding:16px;margin:12px 0}label{margin:7px;display:inline-block}button,select,input{padding:8px;margin:4px;background:#20242a;color:#eee;border:1px solid #59606b;border-radius:5px}.run{border-color:#a66;color:#ffd5b0}pre{white-space:pre-wrap;max-height:260px;overflow:auto}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pages{display:flex;flex-wrap:wrap;gap:12px}.page{width:180px;padding:8px;border:1px solid #2b3038;border-radius:7px;background:#15191f}.page h4{margin:4px 0}.page small{display:block;min-height:32px;color:#adb4bf}.page.quarantined-unknown-items{border-color:#c8873d;background:#241b12}.page.disabled{opacity:.62}.grid{position:relative;width:180px;height:300px;background:repeating-linear-gradient(90deg,#303640 0 1px,transparent 1px 15px),repeating-linear-gradient(#303640 0 1px,transparent 1px 15px);border:1px solid #59606b}.item{position:absolute;box-sizing:border-box;border:1px solid #101216;border-radius:2px;opacity:.9}.gear{background:#5577a9}.weapon{background:#a75f50}.jewelry{background:#9b6cab}.currency,.currency-container{background:#aa9145}.utility{background:#4d956e}.misc{background:#777}@media(max-width:800px){.comparison{grid-template-columns:1fr}}</style>
<h1>Complete Stash Sort</h1><fieldset><legend>Preparation</legend><label>Packing <select id="mode"><option value="compact-top-left">Compact top-left</option><option value="category-rows">Category rows</option></select></label><label>Speed <select id="speed"><option>balanced</option><option>fast</option><option>reliable</option><option>custom</option></select></label><details><summary>Custom timing (milliseconds)</summary><label>Pointer settle <input data-timing="pointerSettleMilliseconds" type="number" value="50"></label><label>Click hold <input data-timing="clickHoldMilliseconds" type="number" value="30"></label><label>Post click <input data-timing="postClickMilliseconds" type="number" value="150"></label><label>Tab settle <input data-timing="tabSettleMilliseconds" type="number" value="250"></label><label>Drag duration <input data-timing="dragDurationMilliseconds" type="number" value="350"></label><label>Post drag <input data-timing="postDragMilliseconds" type="number" value="150"></label></details><div id="tabs"></div><button id="preview">Refresh and Preview</button></fieldset>
<section><h2>Stash layout preview</h2><p>Each rectangle is the item's real grid footprint. Orange pages contain unknown metadata and are automatically excluded from this run.</p><div class="comparison"><div><h3>Before refresh snapshot</h3><div class="pages" id="before"></div></div><div><h3>Calculated after</h3><div class="pages" id="after"></div></div></div><h3>Status and diagnostics</h3><pre id="status">Loading…</pre><button id="focus">Bring game to front</button><button class="run" id="run" disabled>Run Sort</button><button id="stop">Stop</button></section>
<script>const token=${JSON.stringify(token)},q=id=>document.getElementById(id),cats=['gear','weapon','jewelry','currency','currency-container','utility','misc'];async function api(path,method='GET',value){const r=await fetch(path,{method,headers:method==='POST'?{'x-operator-token':token,'content-type':'application/json'}:{},body:value===undefined?undefined:JSON.stringify(value)}),v=await r.json();if(!r.ok)throw Error(v.error||r.statusText);return v}function settings(){return{mode:q('mode').value,speed:q('speed').value,custom:Object.fromEntries([...document.querySelectorAll('[data-timing]')].map(e=>[e.dataset.timing,Number(e.value)])),tabs:[...document.querySelectorAll('[data-tab]')].map(e=>({tabIndex:Number(e.dataset.tab),enabled:e.querySelector('[name=enabled]').checked,allowedCategories:[...e.querySelectorAll('[name=category]:checked')].map(x=>x.value)}))}}function renderTabs(s){if(q('tabs').children.length||!s.tabs)return;q('tabs').innerHTML=s.tabs.map(t=>'<fieldset data-tab="'+t.tabIndex+'"><legend>Tab '+(t.tabIndex+1)+'</legend><label><input name="enabled" type="checkbox" '+(t.enabled?'checked':'')+'>enabled</label>'+cats.map(c=>'<label><input name="category" type="checkbox" value="'+c+'" '+(t.allowedCategories.includes(c)?'checked':'')+'>'+c+'</label>').join('')+'</fieldset>').join('')}function renderPreview(id,pages){q(id).innerHTML=(pages||[]).map(p=>'<div class="page '+p.status+'"><h4>Tab '+(p.tabIndex+1)+' · '+p.itemCount+' known items</h4><small>'+p.status+(p.unsupportedItemCount?' · '+p.unsupportedItemCount+' unknown item(s), page skipped':'')+'</small><div class="grid">'+(p.placements||[]).map(v=>'<i class="item '+v.category+'" title="'+v.category+' · '+v.width+'×'+v.height+'" style="left:'+v.x*15+'px;top:'+v.y*15+'px;width:'+v.width*15+'px;height:'+v.height*15+'px"></i>').join('')+'</div></div>').join('')}function draw(s){renderTabs(s);renderPreview('before',s.before);renderPreview('after',s.after);q('status').textContent=JSON.stringify({...s,before:s.before?.map(({placements,...p})=>p),after:s.after?.map(({placements,...p})=>p)},null,2);const busy=s.phase==='refreshing'||s.phase==='running';q('focus').disabled=busy;q('preview').disabled=busy;q('run').disabled=s.phase!=='ready';q('stop').disabled=!busy}async function poll(){try{draw(await api('/api/status'))}catch(e){q('status').textContent=e.message}}q('focus').onclick=async()=>{q('status').textContent='Bringing game to front…';try{draw(await api('/api/focus','POST',{}))}catch(e){q('status').textContent='Focus failed: '+e.message}};q('preview').onclick=async()=>{q('status').textContent='Refreshing game state and preparing preview…';q('preview').disabled=true;try{draw(await api('/api/preview','POST',settings()))}catch(e){q('status').textContent='Preview failed: '+e.message}finally{poll()}};q('run').onclick=async()=>{if(!confirm('Run the complete prepared plan once? No automatic retry.'))return;q('status').textContent='Running prepared sort…';try{draw(await api('/api/run','POST',{}))}catch(e){q('status').textContent='Run failed: '+e.message}finally{poll()}};q('stop').onclick=async()=>{try{draw(await api('/api/stop','POST',{}))}catch(e){q('status').textContent='Stop failed: '+e.message}};poll();setInterval(poll,1000);</script>`;
}
