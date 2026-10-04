(() => {
  const SEED = window.MR_SEED;
  const STORE_KEY = "mr_reference_data_v1";
  const DB_NAME = "muestra_referencia_media";
  const DB_STORE = "files";

  let data = loadData();
  let currentViewMode = "pieces";
  let selectedPieceId = data.pieces[0]?.id || "";
  let selectedDesignId = data.designs[0]?.id || "";
  let audioEngine = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  const nowIso = () => new Date().toISOString();

  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
  function loadData(){
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved?.pieces && saved?.designs) return saved;
    } catch(e){}
    const d = deepClone(SEED);
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    return d;
  }
  function saveData(){
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    refreshStats();
  }
  function toast(msg){
    const el=$("toast"); el.textContent=msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200);
  }

  // IndexedDB media storage
  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function putFile(key,file){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).put(file,key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  async function getFile(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(DB_STORE,"readonly").objectStore(DB_STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
    });
  }
  async function deleteFile(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  async function previewFile(key, containerId){
    const box=$(containerId); if(!box) return;
    box.innerHTML='<span class="placeholder">Sin archivo</span>';
    const file=await getFile(key); if(!file) return;
    const url=URL.createObjectURL(file);
    const img=document.createElement("img");
    img.src=url; img.alt=file.name||"archivo";
    img.onload=()=>URL.revokeObjectURL(url);
    box.innerHTML=""; box.appendChild(img);
  }
  async function mediaUrl(key){
    const file=await getFile(key); if(!file) return null;
    return URL.createObjectURL(file);
  }

  function setView(id){
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
    document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===id && b.classList.contains("nav-btn")));
    history.replaceState(null,"","#"+id);
    if(id==="muestra") renderCatalog();
    if(id==="editar") { renderPieceList(); renderDesignList(); loadPieceForm(selectedPieceId); }
  }
  document.querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();setView(el.dataset.nav);}));
  const initialHash=location.hash.replace("#",""); if(["inicio","muestra","editar","exportar"].includes(initialHash)) setView(initialHash);

  function fillSelect(el, values, blankLabel=null){
    el.innerHTML="";
    if(blankLabel!==null){ const o=document.createElement("option");o.value="";o.textContent=blankLabel;el.appendChild(o); }
    values.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o);});
  }
  fillSelect($("p_forma"),data.options.formas,"Seleccionar…");
  fillSelect($("p_integridad"),data.options.integridad,"Seleccionar…");
  fillSelect($("d_simetria"),data.options.simetrias,"Seleccionar…");

  function refreshPieceSelect(){
    const el=$("d_piece"); const val=el.value;
    fillSelect(el,data.pieces.map(p=>p.id),"Sin pieza vinculada");
    if([...el.options].some(o=>o.value===val)) el.value=val;
  }
  refreshPieceSelect();

  function refreshStats(){
    $("statPieces").textContent=data.pieces.length;
    $("statDesigns").textContent=data.designs.length;
    $("statLinked").textContent=data.designs.filter(d=>d.piece_id).length;
  }
  refreshStats();

  function pieceLabel(p){
    return [p.forma||"Forma pendiente",p.sitio||p.coleccion||""].filter(Boolean).join(" · ");
  }
  function designLabel(d){
    return [d.esquema||"Esquema pendiente",d.clase_simetria||""].filter(Boolean).join(" · ");
  }

  // Catalog
  $("showPiecesBtn").onclick=()=>{currentViewMode="pieces";$("showPiecesBtn").classList.add("active");$("showDesignsBtn").classList.remove("active");renderCatalog();};
  $("showDesignsBtn").onclick=()=>{currentViewMode="designs";$("showDesignsBtn").classList.add("active");$("showPiecesBtn").classList.remove("active");renderCatalog();};
  ["searchInput","filterForm","filterSite"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderCatalog));

  function updateCatalogFilters(){
    const forms=[...new Set(data.pieces.map(p=>p.forma).filter(Boolean))].sort();
    const sites=[...new Set(data.pieces.map(p=>p.sitio).filter(Boolean))].sort();
    const formVal=$("filterForm").value,siteVal=$("filterSite").value;
    fillSelect($("filterForm"),forms,"Todas las formas");$("filterForm").value=forms.includes(formVal)?formVal:"";
    fillSelect($("filterSite"),sites,"Todos los sitios");$("filterSite").value=sites.includes(siteVal)?siteVal:"";
  }

  async function renderCatalog(){
    updateCatalogFilters();
    const grid=$("catalogGrid"); grid.innerHTML="";
    const q=$("searchInput").value.trim().toLowerCase();
    const ff=$("filterForm").value, fs=$("filterSite").value;
    const items=currentViewMode==="pieces"?data.pieces:data.designs;
    const filtered=items.filter(item=>{
      let hay="";
      if(currentViewMode==="pieces"){
        hay=[item.id,item.sigla,item.sitio,item.coleccion,item.forma,item.publicacion].join(" ").toLowerCase();
        if(ff && item.forma!==ff) return false; if(fs && item.sitio!==fs) return false;
      }else{
        const p=data.pieces.find(x=>x.id===item.piece_id)||{};
        hay=[item.id,item.ref_original,item.esquema,item.clase_simetria,item.campo_decorativo,item.piece_id,p.sitio,p.forma,item.colores].join(" ").toLowerCase();
        if(ff && p.forma!==ff) return false; if(fs && p.sitio!==fs) return false;
      }
      return !q || hay.includes(q);
    });
    for(const item of filtered){
      const card=document.createElement("article");card.className="card";
      const media=document.createElement("div");media.className="card-media";media.innerHTML='<span class="placeholder">'+esc(item.id)+'</span>';
      card.appendChild(media);
      const body=document.createElement("div");body.className="card-body";
      if(currentViewMode==="pieces"){
        body.innerHTML=`<span class="card-id">${esc(item.id)}</span><h3>${esc(item.forma||"Pieza sin clasificar")}</h3><p>${esc(item.sitio||item.coleccion||"Procedencia pendiente")}</p><div class="chips">${item.integridad?'<span class="chip">'+esc(item.integridad)+'</span>':''}<span class="chip">${data.designs.filter(d=>d.piece_id===item.id).length} diseño(s)</span></div>`;
        const u=await mediaUrl("piece:"+item.id); if(u){media.innerHTML='<img alt="">';media.querySelector("img").src=u;}
        card.onclick=()=>openPieceDetail(item.id);
      }else{
        const p=data.pieces.find(x=>x.id===item.piece_id);
        body.innerHTML=`<span class="card-id">${esc(item.id)}</span><h3>${esc(item.esquema||"Esquema por identificar")}</h3><p>${esc(item.piece_id||"Sin pieza vinculada")}${p?.forma?' · '+esc(p.forma):''}</p><div class="chips">${item.clase_simetria?'<span class="chip">'+esc(item.clase_simetria)+'</span>':''}${item.campo_decorativo?'<span class="chip">'+esc(item.campo_decorativo)+'</span>':''}</div>`;
        const u=await mediaUrl("design:"+item.id); if(u){media.innerHTML='<img alt="">';media.querySelector("img").src=u;}
        card.onclick=()=>openDesignDetail(item.id);
      }
      card.appendChild(body);grid.appendChild(card);
    }
    if(!filtered.length) grid.innerHTML='<p style="color:var(--muted)">No hay registros que coincidan con los filtros.</p>';
  }

  async function openPieceDetail(id){
    const p=data.pieces.find(x=>x.id===id); if(!p)return;
    const ds=data.designs.filter(d=>d.piece_id===id);
    const u=await mediaUrl("piece:"+id);

    const designCards=[];
    for(const d of ds){
      const du=await mediaUrl("design:"+d.id);
      designCards.push(`<article class="linked-design-card">
        <div class="linked-design-media">${du?'<img src="'+du+'" alt="Dibujo '+esc(d.id)+'">':'<span class="linked-design-empty">Dibujo no adjuntado</span>'}</div>
        <div class="linked-design-info">
          <div><strong>${esc(d.id)}</strong><span>${esc(d.esquema||"esquema pendiente")} · ${esc(d.clase_simetria||"simetría pendiente")}</span></div>
          <div class="linked-design-actions">
            <button type="button" class="mini design-view-btn" data-design-id="${esc(d.id)}">Ver ficha</button>
            <label class="design-upload-btn">${du?"Reemplazar dibujo":"Adjuntar dibujo"}<input type="file" accept="image/*,.svg" data-design-upload="${esc(d.id)}"></label>
          </div>
        </div>
      </article>`);
    }

    $("dialogContent").innerHTML=`<div class="detail-grid"><div><div class="detail-media">${u?'<img src="'+u+'">':'<span class="placeholder">'+esc(id)+'</span>'}</div>${p.fotogrametria_url?'<iframe class="embed-frame" src="'+esc(p.fotogrametria_url)+'" allowfullscreen loading="lazy"></iframe>':''}</div><div class="detail-data"><span class="card-id">${esc(id)}</span><h2>${esc(p.forma||"Pieza sin clasificar")}</h2><dl class="detail-list"><dt>Sigla</dt><dd>${esc(p.sigla||"—")}</dd><dt>Sitio</dt><dd>${esc(p.sitio||"—")}</dd><dt>Colección</dt><dd>${esc(p.coleccion||"—")}</dd><dt>Integridad</dt><dd>${esc(p.integridad||"—")}</dd><dt>Publicación</dt><dd>${esc(p.publicacion||"—")}</dd><dt>Página</dt><dd>${esc(p.pagina||"—")}</dd><dt>Observaciones</dt><dd>${esc(p.observaciones||"—")}</dd></dl><div class="design-list-detail"><h3>Diseños vinculados</h3><p class="design-list-help">Cada diseño puede adjuntar o reemplazar su dibujo directamente desde esta ficha.</p>${ds.length?designCards.join(""):'<p>Sin diseños vinculados.</p>'}</div></div></div>`;

    $("dialogContent").querySelectorAll("[data-design-upload]").forEach(input=>{
      input.addEventListener("change",async e=>{
        const file=e.target.files?.[0]; if(!file)return;
        const designId=e.target.dataset.designUpload;
        await putFile("design:"+designId,file);
        const d=data.designs.find(x=>x.id===designId);
        if(d){d.design_file_name=file.name;d.updated_at=nowIso();}
        saveData();
        toast("Dibujo guardado en "+designId);
        await openPieceDetail(id);
      });
    });

    $("dialogContent").querySelectorAll(".design-view-btn").forEach(btn=>{
      btn.addEventListener("click",()=>openDesignDetail(btn.dataset.designId));
    });

    if(!$("detailDialog").open) $("detailDialog").showModal();
  }
  async function openDesignDetail(id){
    const d=data.designs.find(x=>x.id===id); if(!d)return; const p=data.pieces.find(x=>x.id===d.piece_id);
    const u=await mediaUrl("design:"+id);
    $("dialogContent").innerHTML=`<div class="detail-grid"><div class="detail-media" style="background:#f0ecdf">${u?'<img src="'+u+'">':'<span class="placeholder">'+esc(id)+'</span>'}</div><div class="detail-data"><span class="card-id">${esc(id)}</span><h2>${esc(d.esquema||"Esquema por identificar")}</h2><dl class="detail-list"><dt>Ref. original</dt><dd>${esc(d.ref_original||"—")}</dd><dt>Pieza</dt><dd>${esc(d.piece_id||"—")}</dd><dt>Forma</dt><dd>${esc(p?.forma||"—")}</dd><dt>Campo</dt><dd>${esc(d.campo_decorativo||"—")}</dd><dt>Técnica(s)</dt><dd>${esc((d.tecnicas||[]).join(", ")||"—")}</dd><dt>Simetría</dt><dd>${esc(d.clase_simetria||"—")}</dd><dt>Colores</dt><dd>${esc(d.colores||"—")}</dd><dt>Observaciones</dt><dd>${esc(d.observaciones||"—")}</dd></dl></div></div>`;
    $("detailDialog").showModal();
  }
  $("closeDialog").onclick=()=>$("detailDialog").close();

  // Editor tabs
  $("editPieceTab").onclick=()=>{$("pieceEditor").classList.remove("hidden");$("designEditor").classList.add("hidden");$("editPieceTab").classList.add("active");$("editDesignTab").classList.remove("active");loadPieceForm(selectedPieceId);};
  $("editDesignTab").onclick=()=>{$("designEditor").classList.remove("hidden");$("pieceEditor").classList.add("hidden");$("editDesignTab").classList.add("active");$("editPieceTab").classList.remove("active");loadDesignForm(selectedDesignId);};

  function renderPieceList(){
    const q=$("pieceSearch").value?.toLowerCase()||"";const box=$("pieceList");box.innerHTML="";
    data.pieces.filter(p=>[p.id,p.sigla,p.sitio,p.forma].join(" ").toLowerCase().includes(q)).forEach(p=>{
      const row=document.createElement("div");row.className="record-row"+(p.id===selectedPieceId?" active":"");
      row.innerHTML=`<strong>${esc(p.id)}</strong><small>${esc(pieceLabel(p)||"pendiente")}</small>`;row.onclick=()=>{selectedPieceId=p.id;renderPieceList();loadPieceForm(p.id);};box.appendChild(row);
    });
  }
  $("pieceSearch").addEventListener("input",renderPieceList);

  function renderDesignList(){
    const q=$("designSearch").value?.toLowerCase()||"";const box=$("designList");box.innerHTML="";
    data.designs.filter(d=>[d.id,d.ref_original,d.piece_id,d.esquema,d.clase_simetria].join(" ").toLowerCase().includes(q)).forEach(d=>{
      const row=document.createElement("div");row.className="record-row"+(d.id===selectedDesignId?" active":"");
      row.innerHTML=`<strong>${esc(d.id)}</strong><small>${esc(designLabel(d)||d.ref_original||"pendiente")}</small>`;row.onclick=()=>{selectedDesignId=d.id;renderDesignList();loadDesignForm(d.id);};box.appendChild(row);
    });
  }
  $("designSearch").addEventListener("input",renderDesignList);

  function setOtherVisibility(){
    $("p_forma_otro_wrap").classList.toggle("hidden",$("p_forma").value!=="Otro");
    $("d_campo_otro_wrap").classList.toggle("hidden",$("d_campo").value!=="Otro");
    const techOther=[...document.querySelectorAll('#techniqueChecks input:checked')].some(x=>x.value==="Otro");
    $("d_tecnica_otro_wrap").classList.toggle("hidden",!techOther);
  }
  $("p_forma").onchange=()=>{setOtherVisibility();};
  $("d_campo").onchange=setOtherVisibility;

  function loadPieceForm(id){
    const p=data.pieces.find(x=>x.id===id); if(!p)return; selectedPieceId=id;
    $("pieceFormTitle").textContent=p.id;$("p_id").value=p.id;$("p_caja").value=p.caja||"";$("p_sigla").value=p.sigla||"";$("p_sitio").value=p.sitio||"";$("p_coleccion").value=p.coleccion||"";$("p_publicacion").value=p.publicacion||"";$("p_pagina").value=p.pagina||"";$("p_forma").value=p.forma||"";$("p_forma_otro").value=p.forma_otro||"";$("p_integridad").value=p.integridad||"";$("p_fotogrametria").value=p.fotogrametria_url||"";$("p_observaciones").value=p.observaciones||"";
    setOtherVisibility();previewFile("piece:"+id,"piecePhotoPreview");renderPieceList();renderPieceLinkedDesignsEditor(id);
  }
  async function renderPieceLinkedDesignsEditor(pieceId){
    const box=$("pieceLinkedDesignsEditor"); if(!box)return;
    const ds=data.designs.filter(d=>d.piece_id===pieceId);
    if(!ds.length){box.innerHTML='<p class="design-list-help">Esta pieza todavía no tiene diseños vinculados.</p>';return;}
    box.innerHTML="";
    for(const d of ds){
      const file=await getFile("design:"+d.id);
      const url=file?URL.createObjectURL(file):null;
      const row=document.createElement("article");
      row.className="piece-linked-design-row";
      row.innerHTML=`
        <div class="piece-linked-design-thumb">${url?'<img src="'+url+'" alt="Dibujo '+esc(d.id)+'">':'<span>Sin dibujo</span>'}</div>
        <div class="piece-linked-design-meta">
          <strong>${esc(d.id)}</strong>
          <small>${esc(d.esquema||"esquema pendiente")} · ${esc(d.clase_simetria||"simetría pendiente")}</small>
          <div class="piece-linked-design-actions">
            <label class="design-upload-btn">${file?"Reemplazar dibujo":"Adjuntar dibujo"}<input type="file" accept="image/*,.svg" data-editor-design-upload="${esc(d.id)}"></label>
            <button type="button" class="mini" data-edit-design="${esc(d.id)}">Editar datos del diseño</button>
            ${file?'<button type="button" class="danger-link" data-remove-design-image="'+esc(d.id)+'">Quitar dibujo</button>':''}
          </div>
        </div>`;
      box.appendChild(row);
      if(url){const img=row.querySelector("img");img.onload=()=>URL.revokeObjectURL(url);}
    }
    box.querySelectorAll("[data-editor-design-upload]").forEach(input=>{
      input.addEventListener("change",async e=>{
        const file=e.target.files?.[0];if(!file)return;
        const designId=e.target.dataset.editorDesignUpload;
        await putFile("design:"+designId,file);
        const d=data.designs.find(x=>x.id===designId);
        if(d){d.design_file_name=file.name;d.updated_at=nowIso();}
        saveData();toast("Dibujo guardado en "+designId);await renderPieceLinkedDesignsEditor(pieceId);
      });
    });
    box.querySelectorAll("[data-remove-design-image]").forEach(btn=>{
      btn.addEventListener("click",async()=>{
        const designId=btn.dataset.removeDesignImage;
        await deleteFile("design:"+designId);
        const d=data.designs.find(x=>x.id===designId);if(d)d.design_file_name="";
        saveData();toast("Dibujo eliminado de "+designId);await renderPieceLinkedDesignsEditor(pieceId);
      });
    });
    box.querySelectorAll("[data-edit-design]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        selectedDesignId=btn.dataset.editDesign;
        $("editDesignTab").click();
        loadDesignForm(selectedDesignId);
      });
    });
  }

  $("pieceForm").onsubmit=async e=>{
    e.preventDefault();const p=data.pieces.find(x=>x.id===selectedPieceId);if(!p)return;
    Object.assign(p,{caja:$("p_caja").value.trim(),sigla:$("p_sigla").value.trim(),sitio:$("p_sitio").value.trim(),coleccion:$("p_coleccion").value.trim(),publicacion:$("p_publicacion").value.trim(),pagina:$("p_pagina").value.trim(),forma:$("p_forma").value,forma_otro:$("p_forma_otro").value.trim(),integridad:$("p_integridad").value,fotogrametria_url:$("p_fotogrametria").value.trim(),observaciones:$("p_observaciones").value.trim(),updated_at:nowIso()});
    const f=$("p_photo").files[0];if(f){await putFile("piece:"+p.id,f);p.photo_file_name=f.name;$("p_photo").value="";}
    saveData();renderPieceList();refreshPieceSelect();await previewFile("piece:"+p.id,"piecePhotoPreview");toast("Pieza guardada");
  };
  $("removePiecePhoto").onclick=async()=>{await deleteFile("piece:"+selectedPieceId);const p=data.pieces.find(x=>x.id===selectedPieceId);if(p)p.photo_file_name="";saveData();previewFile("piece:"+selectedPieceId,"piecePhotoPreview");toast("Fotografía eliminada");};

  function nextId(prefix,arr){
    const max=Math.max(0,...arr.map(x=>parseInt(x.id.replace(prefix,""),10)||0));return prefix+String(max+1).padStart(4,"0");
  }
  $("newPieceBtn").onclick=()=>{
    const id=nextId("MR-P",data.pieces);data.pieces.push({id,caja:"",sigla:"",sitio:"",coleccion:"",publicacion:"",pagina:"",forma:"",forma_otro:"",integridad:"",observaciones:"",fotogrametria_url:"",photo_file_name:"",updated_at:""});selectedPieceId=id;saveData();refreshPieceSelect();renderPieceList();loadPieceForm(id);toast("Nueva pieza creada: "+id);
  };

  function renderTechniqueChecks(selected=[]){
    const box=$("techniqueChecks");box.innerHTML="";
    data.options.tecnicas.forEach(t=>{const lab=document.createElement("label");lab.innerHTML=`<input type="checkbox" value="${esc(t)}"> ${esc(t)}`;const input=lab.querySelector("input");input.checked=selected.includes(t);input.onchange=setOtherVisibility;box.appendChild(lab);});
  }
  function refreshCampoOptions(pieceId,current=""){
    const p=data.pieces.find(x=>x.id===pieceId);const forma=p?.forma;
    const vals=(forma&&data.options.camposPorForma[forma])||data.options.camposGenerales;
    fillSelect($("d_campo"),vals,"Seleccionar…");$("d_campo").value=vals.includes(current)?current:"";
  }
  function loadDesignForm(id){
    const d=data.designs.find(x=>x.id===id);if(!d)return;selectedDesignId=id;
    refreshPieceSelect();$("designFormTitle").textContent=d.id;$("d_id").value=d.id;$("d_ref").value=d.ref_original||"";$("d_piece").value=d.piece_id||"";refreshCampoOptions(d.piece_id,d.campo_decorativo);$("d_campo_otro").value=d.campo_otro||"";$("d_simetria").value=d.clase_simetria||"";$("d_esquema").value=d.esquema||"";$("d_colores").value=d.colores||"";$("d_observaciones").value=d.observaciones||"";$("d_tecnica_otro").value=d.tecnica_otro||"";renderTechniqueChecks(d.tecnicas||[]);setOtherVisibility();previewFile("design:"+id,"designImagePreview");renderDesignList();
  }
  $("d_piece").onchange=()=>refreshCampoOptions($("d_piece").value,"");
  $("designForm").onsubmit=async e=>{
    e.preventDefault();const d=data.designs.find(x=>x.id===selectedDesignId);if(!d)return;
    Object.assign(d,{ref_original:$("d_ref").value.trim(),piece_id:$("d_piece").value,campo_decorativo:$("d_campo").value,campo_otro:$("d_campo_otro").value.trim(),clase_simetria:$("d_simetria").value,tecnicas:[...document.querySelectorAll('#techniqueChecks input:checked')].map(x=>x.value),tecnica_otro:$("d_tecnica_otro").value.trim(),esquema:$("d_esquema").value.trim(),colores:$("d_colores").value.trim(),observaciones:$("d_observaciones").value.trim(),updated_at:nowIso()});
    const f=$("d_image").files[0];if(f){await putFile("design:"+d.id,f);d.design_file_name=f.name;$("d_image").value="";}
    saveData();renderDesignList();await previewFile("design:"+d.id,"designImagePreview");toast("Diseño guardado");
  };
  $("removeDesignImage").onclick=async()=>{await deleteFile("design:"+selectedDesignId);const d=data.designs.find(x=>x.id===selectedDesignId);if(d)d.design_file_name="";saveData();previewFile("design:"+selectedDesignId,"designImagePreview");toast("Archivo eliminado");};
  $("newDesignBtn").onclick=()=>{
    const id=nextId("MR-D",data.designs);data.designs.push({id,ref_original:"",piece_id:"",campo_decorativo:"",campo_otro:"",tecnicas:[],tecnica_otro:"",esquema:"",clase_simetria:"",colores:"",observaciones:"",design_file_name:"",updated_at:""});selectedDesignId=id;saveData();renderDesignList();loadDesignForm(id);toast("Nuevo diseño creado: "+id);
  };

  // CSV/SPSS exports
  const csvEsc=v=>'"'+String(v??"").replaceAll('"','""')+'"';
  function download(name,text,type="text/csv;charset=utf-8"){
    const blob=new Blob(["\ufeff"+text],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function toCsv(rows,cols){
    return [cols.map(c=>csvEsc(c.label)).join(","),...rows.map(r=>cols.map(c=>csvEsc(typeof c.get==="function"?c.get(r):r[c.key])).join(","))].join("\n");
  }
  $("exportPieces").onclick=()=>download("muestra_referencia_piezas.csv",toCsv(data.pieces,[
    {key:"id",label:"ID_PIEZA"},{key:"caja",label:"CAJA"},{key:"sigla",label:"SIGLA"},{key:"sitio",label:"SITIO"},{key:"coleccion",label:"COLECCION"},{key:"publicacion",label:"PUBLICACION"},{key:"pagina",label:"PAGINA_LAMINA"},{key:"forma",label:"FORMA"},{key:"forma_otro",label:"FORMA_OTRO"},{key:"integridad",label:"INTEGRIDAD"},{key:"fotogrametria_url",label:"FOTOGRAMETRIA_URL"},{key:"photo_file_name",label:"FOTO_ARCHIVO"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  $("exportDesigns").onclick=()=>download("muestra_referencia_disenos.csv",toCsv(data.designs,[
    {key:"id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},{key:"piece_id",label:"ID_PIEZA"},{key:"campo_decorativo",label:"CAMPO_DECORATIVO"},{key:"campo_otro",label:"CAMPO_OTRO"},{get:r=>(r.tecnicas||[]).join("|"),label:"TECNICAS"},{key:"tecnica_otro",label:"TECNICA_OTRO"},{key:"esquema",label:"ESQUEMA"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"},{key:"design_file_name",label:"DISENO_ARCHIVO"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  $("exportSpss").onclick=()=>{
    const techs=data.options.tecnicas.filter(x=>x!=="Otro");
    const rows=data.designs.map(d=>{const p=data.pieces.find(x=>x.id===d.piece_id)||{};return {...d,...Object.fromEntries(Object.entries(p).map(([k,v])=>["p_"+k,v])),...Object.fromEntries(techs.map(t=>["tec_"+slug(t),(d.tecnicas||[]).includes(t)?1:0])),tec_otro:(d.tecnicas||[]).includes("Otro")?1:0};});
    const cols=[
      {key:"id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},{key:"piece_id",label:"ID_PIEZA"},
      {key:"p_sitio",label:"SITIO"},{key:"p_coleccion",label:"COLECCION"},{key:"p_sigla",label:"SIGLA"},{key:"p_forma",label:"FORMA"},{key:"p_integridad",label:"INTEGRIDAD"},
      {key:"campo_decorativo",label:"CAMPO_DECORATIVO"},{key:"campo_otro",label:"CAMPO_OTRO"},
      ...techs.map(t=>({key:"tec_"+slug(t),label:"TEC_"+slug(t).toUpperCase()})),{key:"tec_otro",label:"TEC_OTRO"},
      {key:"esquema",label:"ESQUEMA"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"}
    ];
    download("muestra_referencia_matriz_spss.csv",toCsv(rows,cols));
  };
  function slug(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
  $("exportDictionary").onclick=()=>{
    const rows=[
      ["ID_PIEZA","Cadena","Identificador único e inmutable de la pieza","MR-Pxxxx"],
      ["ID_DISENO","Cadena","Identificador único e inmutable del diseño","MR-Dxxxx"],
      ["REF_ORIGINAL","Cadena","Número o referencia del archivo maestro de Inkscape","Texto"],
      ["FORMA","Nominal","Forma primaria de la pieza","Lista cerrada + Otro"],
      ["CAMPO_DECORATIVO","Nominal","Sector de la pieza donde se registra el diseño","Lista condicionada por forma + Otro"],
      ["TECNICA_*","Dicotómica","Presencia/ausencia de cada técnica en matriz SPSS","0=ausente; 1=presente"],
      ["ESQUEMA","Nominal abierta","Nombre analítico del esquema identificado","Texto libre"],
      ["CLASE_SIMETRIA","Nominal","Clase de simetría registrada","Lista controlada"],
      ["COLORES","Texto","Descripción de colores empleados","Texto libre"]
    ];
    download("muestra_referencia_diccionario.csv",["VARIABLE,TIPO,DESCRIPCION,CODIFICACION",...rows.map(r=>r.map(csvEsc).join(","))].join("\n"));
  };
  $("exportJson").onclick=()=>download("muestra_referencia_respaldo.json",JSON.stringify(data,null,2),"application/json;charset=utf-8");
  $("importJson").onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{const obj=JSON.parse(await f.text());if(!obj.pieces||!obj.designs)throw new Error("Formato inválido");data=obj;saveData();refreshPieceSelect();renderPieceList();renderDesignList();renderCatalog();toast("Respaldo importado");}catch(err){alert("No se pudo importar el archivo: "+err.message);}e.target.value="";
  };

  // Procedural jungle ambience, user initiated
  function createJungleAudio(){
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return null;
    const ctx=new AC();const master=ctx.createGain();master.gain.value=.12;master.connect(ctx.destination);
    const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const ch=noiseBuffer.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*.22;
    const noise=ctx.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=900;const ng=ctx.createGain();ng.gain.value=.18;noise.connect(filter).connect(ng).connect(master);noise.start();
    const drone=ctx.createOscillator();drone.type="sine";drone.frequency.value=110;const dg=ctx.createGain();dg.gain.value=.018;drone.connect(dg).connect(master);drone.start();
    let timer=null;
    function chirp(){
      if(ctx.state!=="running")return;
      const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";const t=ctx.currentTime;o.frequency.setValueAtTime(1300+Math.random()*900,t);o.frequency.exponentialRampToValueAtTime(2200+Math.random()*1200,t+.12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.025,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g).connect(master);o.start(t);o.stop(t+.2);timer=setTimeout(chirp,1800+Math.random()*5200);
    }
    chirp();
    return {ctx,master,noise,drone,stop(){clearTimeout(timer);try{noise.stop();drone.stop();ctx.close();}catch(e){}}};
  }
  $("jungleToggle").onclick=async()=>{
    const b=$("jungleToggle");
    if(!audioEngine){audioEngine=createJungleAudio();if(!audioEngine){toast("Audio no disponible en este navegador");return;}b.setAttribute("aria-pressed","true");b.textContent="◉ Selva activa";toast("Ambiente sonoro activado");}
    else {audioEngine.stop();audioEngine=null;b.setAttribute("aria-pressed","false");b.textContent="◉ Selva";toast("Ambiente sonoro desactivado");}
  };

  // Initial render
  renderPieceList();renderDesignList();loadPieceForm(selectedPieceId);renderCatalog();
})();