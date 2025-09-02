const API = {
  async uiConfig() { return fetch('/api/ui-config').then(r=>r.json()) },
  async health() { return fetch('/api/health').then(r=>r.json()) },
  async groups(q='') { return fetch('/api/groups' + (q?`?search=${encodeURIComponent(q)}`:'' )).then(r=>r.json()) },
  async projects(group_id=null, q='') {
    const params = new URLSearchParams();
    if (group_id) params.set('group_id', group_id);
    if (q) params.set('search', q);
    return fetch('/api/projects?' + params.toString()).then(r=>r.json())
  },
  async projectVars(pid) { return fetch(`/api/projects/${pid}/variables`).then(r=>r.json()) },
  async groupVars(gid) { return fetch(`/api/groups/${gid}/variables`).then(r=>r.json()) },
  async projectVarGet(pid, key, env) { return fetch(`/api/projects/${pid}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env||'*')}`).then(r=>r.json()) },
  async groupVarGet(gid, key, env) { return fetch(`/api/groups/${gid}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env||'*')}`).then(r=>r.json()) },
  async projectVarUpsert(pid, data) { return fetch(`/api/projects/${pid}/variables/upsert`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r=>r.json()) },
  async groupVarUpsert(gid, data) { return fetch(`/api/groups/${gid}/variables/upsert`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r=>r.json()) },
};

const State = {
  ctx: null,        // { kind:'project'|'group', id, name, parent_group_id?, parent_group_name? }
  group: null,      // { id, name }
  vars: [],
  editor: null,
  currentVar: null,
  refreshTimer: null,
  autoRefreshEnabled: true,
  autoRefreshSec: 15,   // секунды
};

const UI = {
  async init(){
    // config
    try {
      const cfg = await API.uiConfig();
      State.autoRefreshEnabled = !!cfg.auto_refresh_enabled;
      State.autoRefreshSec = parseInt(cfg.auto_refresh_sec || 15, 10);
    } catch {}

    // health
    try{
      const h=await API.health();
      const label = h?.user?.name || h?.user?.username || (h?.ok ? 'OK' : 'N/A');
      document.getElementById('authInfo').textContent = `Token OK: ${label}`;
    }catch{
      document.getElementById('authInfo').textContent='Token/connection error';
    }

    // lists
    UI.renderGroups(await API.groups());
    document.getElementById('groupSearch').addEventListener('input', UI.debounce(async e=>UI.renderGroups(await API.groups(e.target.value)), 250));
    document.getElementById('projectSearch').addEventListener('input', UI.debounce(async e=>{
      const gid = State.group?.id || null;
      UI.renderProjects(await API.projects(gid, e.target.value))
    }, 250));

    // buttons
    document.getElementById('btnCreateVar').addEventListener('click', ()=> UI.openModal({ key:'', environment_scope:'*', value:'', protected:false, masked:false, raw:false }, true));
    document.getElementById('btnRefresh').addEventListener('click', ()=> UI.refreshVars());

    // restore last context
    UI.restoreLastContext();
  },

  debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms) } },

  setContext(ctx){
    State.ctx = ctx;
    localStorage.setItem('lastCtx', JSON.stringify(ctx));
    document.getElementById('contextLabel').textContent = (ctx.kind==='project' ? 'Project: ' : 'Group: ') + ctx.name;

    document.getElementById('btnRefresh').classList.remove('hidden');
    const createBtn = document.getElementById('btnCreateVar');
    createBtn.classList.remove('btn-disabled');

    // автообновление
    UI.stopAutoRefresh();
    if (State.autoRefreshEnabled) {
      State.refreshTimer = setInterval(UI.refreshVars, Math.max(1, State.autoRefreshSec) * 1000);
    }
  },

  setGroup(group){
    State.group = group;
    document.getElementById('projectsHint').textContent = group ? `for: ${group.name}` : '';
  },

  clearContext(){
    State.ctx = null;
    State.group = null;
    localStorage.removeItem('lastCtx');
    document.getElementById('contextLabel').textContent = 'Select a group or project';
    document.getElementById('btnRefresh').classList.add('hidden');
    const createBtn = document.getElementById('btnCreateVar');
    createBtn.classList.add('btn-disabled');
    document.getElementById('projectsHint').textContent = '';
    UI.stopAutoRefresh();
  },

  async restoreLastContext(){
    try {
      const saved = JSON.parse(localStorage.getItem('lastCtx') || 'null');
      if (!saved) return;

      if (saved.kind === 'group') {
        UI.setGroup({ id: saved.id, name: saved.name });
        UI.setContext(saved);
        UI.renderProjects(await API.projects(saved.id));
        UI.renderVars(await API.groupVars(saved.id));
        return;
      }

      if (saved.kind === 'project') {
        if (saved.parent_group_id) {
          UI.setGroup({ id: saved.parent_group_id, name: saved.parent_group_name || '' });
          UI.renderProjects(await API.projects(saved.parent_group_id));
        } else {
          UI.setGroup(null);
          UI.renderProjects(await API.projects(null));
        }
        UI.setContext(saved);
        UI.renderVars(await API.projectVars(saved.id));
      }
    } catch {}
  },

  async renderGroups(groups){
    const ul=document.getElementById('groups'); ul.innerHTML='';
    groups.forEach(g=>{
      const li=document.createElement('li');
      li.innerHTML=`<button class="w-full text-left px-2 py-1 rounded-gl hover:bg-slate-100">${g.full_path}</button>`;
      li.querySelector('button').onclick=async()=>{
        UI.setGroup({id:g.id, name:g.full_path});
        UI.setContext({kind:'group', id:g.id, name:g.full_path});
        UI.renderProjects(await API.projects(g.id));
        UI.renderVars(await API.groupVars(g.id));
      };
      ul.appendChild(li);
    })
  },

  async renderProjects(projects){
    const ul=document.getElementById('projects'); ul.innerHTML='';
    projects.forEach(p=>{
      const li=document.createElement('li');
      const label=p.path_with_namespace||p.name;
      li.innerHTML=`<button class="w-full text-left px-2 py-1 rounded-gl hover:bg-slate-100">${label}</button>`;
      li.querySelector('button').onclick=async()=>{
        const ctx = { kind:'project', id:p.id, name:label };
        if (State.group?.id) {
          ctx.parent_group_id = State.group.id;
          ctx.parent_group_name = State.group.name;
        }
        UI.setContext(ctx);
        UI.renderVars(await API.projectVars(p.id));
      };
      ul.appendChild(li);
    })
  },

  async refreshVars(){
    if(!State.ctx) return;
    if(State.ctx.kind==='project') UI.renderVars(await API.projectVars(State.ctx.id));
    else UI.renderVars(await API.groupVars(State.ctx.id));
  },

  stopAutoRefresh(){
    if(State.refreshTimer){
      clearInterval(State.refreshTimer);
      State.refreshTimer = null;
    }
  },

  renderVars(vars){
    State.vars=vars;
    const tbody=document.getElementById('varsBody'); tbody.innerHTML='';
    if(!vars.length){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td class="py-3 px-3 text-slate-500" colspan="6">No file-variables</td>`;
      tbody.appendChild(tr);
      return;
    }
    vars.forEach(v=>{
      const expand = !(v.raw === true); // raw=false => expand
      const tr=document.createElement('tr');
      tr.className='border-t border-gl-border';
      tr.innerHTML=`
        <td class="py-2 px-3 font-mono text-xs">${v.key}</td>
        <td class="py-2 px-3">${v.environment_scope||'*'}</td>
        <td class="py-2 px-3">${v.protected?'✓':''}</td>
        <td class="py-2 px-3">${v.masked?'✓':''}</td>
        <td class="py-2 px-3">${expand?'✓':''}</td>
        <td class="py-2 px-3"><button class="btn btn-outline">Edit</button></td>
      `;
      tr.querySelector('button').onclick=async()=>{
        try{
          const detail = State.ctx.kind==='project'
            ? await API.projectVarGet(State.ctx.id, v.key, v.environment_scope)
            : await API.groupVarGet(State.ctx.id, v.key, v.environment_scope);
          UI.openModal(detail,false);
        }catch{
          alert('Failed to load variable');
        }
      };
      tbody.appendChild(tr);
    })
  },

  openModal(v,isCreate){
    // remember original identifiers (for rename)
    State.currentVar = {
      ...v,
      __originalKey: v.key || null,
      __originalEnv: (v.environment_scope || '*'),
    };

    document.getElementById('modalTitle').textContent=isCreate?'Create variable':`Edit ${v.key}`;
    document.getElementById('fieldKey').value=v.key||'';
    document.getElementById('fieldEnv').value=v.environment_scope||'*';
    document.getElementById('fieldProtected').checked=!!v.protected;
    // visibility radios (we only have API masked=true/false)
    const masked = !!v.masked;
    document.getElementById('visVisible').checked = !masked;
    document.getElementById('visMasked').checked = masked;
    document.getElementById('visMaskedHidden').checked = false; // API не различает, оставим пустым
    document.getElementById('fieldMasked').checked = masked; // hidden helper

    // Expand = !raw
    document.getElementById('fieldExpand').checked = !(v.raw === true);

    const el=document.getElementById('modal');
    el.classList.remove('hidden');

    // sync radios -> hidden checkbox (to reuse save logic)
    const syncMasked = () => {
      const isMasked = document.getElementById('visMasked').checked || document.getElementById('visMaskedHidden').checked;
      document.getElementById('fieldMasked').checked = isMasked;
    };
    document.getElementById('visVisible').onchange = syncMasked;
    document.getElementById('visMasked').onchange = syncMasked;
    document.getElementById('visMaskedHidden').onchange = syncMasked;

    require(["vs/editor/editor.main"], function(){
      const host=document.getElementById('editorHost'); host.innerHTML='';
      const editor = monaco.editor.create(host,{
        value: v.value||'',
        language:'shell',
        automaticLayout:true,
        minimap:{enabled:false},
        fontSize:13,
        wordWrap:'on'
      });
      State.editor=editor;
    });

    document.getElementById('btnCancel').onclick=()=>UI.closeModal();
    document.getElementById('btnSave').onclick=UI.saveModal;
  },

  async saveModal(){
    const payload={
      key: document.getElementById('fieldKey').value.trim(),
      environment_scope: document.getElementById('fieldEnv').value.trim()||'*',
      protected: document.getElementById('fieldProtected').checked,
      masked: document.getElementById('fieldMasked').checked,                 // из радиокнопок
      raw: !document.getElementById('fieldExpand').checked,                   // expand -> raw=false
      value: State.editor?.getValue()||'',
    };

    // pass original identifiers for rename flow
    if (State.currentVar && State.currentVar.__originalKey) {
      payload.original_key = State.currentVar.__originalKey;
      payload.original_environment_scope = State.currentVar.__originalEnv || '*';
    }

    if(!payload.key){ alert('KEY is required'); return; }
    try{
      if(State.ctx.kind==='project') await API.projectVarUpsert(State.ctx.id, payload);
      else await API.groupVarUpsert(State.ctx.id, payload);
      UI.closeModal();
      UI.refreshVars();
    }catch{
      alert('Save failed');
    }
  },

  closeModal(){
    document.getElementById('modal').classList.add('hidden');
    State.editor?.dispose?.();
    State.editor=null;
  },
};

window.addEventListener('load', UI.init);
