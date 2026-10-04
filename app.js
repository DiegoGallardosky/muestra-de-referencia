(() => {
  const SEED = window.MR_SEED;
  const STORE_KEY = "mr_reference_data_v1";
  const HISTORY_KEY = "mr_reference_history_v1";
  const DB_NAME = "muestra_referencia_media";
  const DB_STORE = "files";

  let data = loadData();
  // Completa códigos CD en campos existentes sin cambiar sus contenidos.
  try{
    data.fields.forEach(f=>{
      if(f.catalog_code)return;
      const p=data.pieces.find(x=>x.id===f.piece_id);
      const item=data.options?.campoCatalogoPorForma?.[p?.forma]?.find(c=>c.nombre===f.nombre);
      if(item)f.catalog_code=item.codigo;
    });
    localStorage.setItem(STORE_KEY,JSON.stringify(data));
  }catch(e){}
  let currentViewMode = "pieces";
  let selectedPieceId = data.pieces[0]?.id || "";
  let selectedDesignId = data.designs[0]?.id || "";
  let audioEngine = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  const nowIso = () => new Date().toISOString();

  function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

  function migrateData(raw){
    const d=raw||{};
    d.pieces=Array.isArray(d.pieces)?d.pieces:[];
    d.designs=Array.isArray(d.designs)?d.designs:[];
    d.fields=Array.isArray(d.fields)?d.fields:[];
    // Mantener los registros cargados, pero actualizar catálogos/opciones del esquema.
    // Esto evita que una base guardada en una versión anterior quede sin los campos
    // predeterminados incorporados posteriormente.
    const savedOptions=d.options||{};
    d.options={
      ...deepClone(SEED.options||{}),
      ...savedOptions,
      campoCatalogoPorForma:deepClone(SEED.options?.campoCatalogoPorForma||{}),
      camposPorForma:deepClone(SEED.options?.camposPorForma||{}),
      camposGenerales:deepClone(SEED.options?.camposGenerales||[])
    };

    d.fields.forEach(f=>{
      if(!("nombre" in f)) f.nombre=f.campo_decorativo||"";
      if(!("nombre_otro" in f)) f.nombre_otro=f.campo_otro||"";
      if(!("observaciones" in f)) f.observaciones="";
      if(!("catalog_code" in f)) f.catalog_code="";
      if(!Array.isArray(f.tecnicas)) f.tecnicas=[];
      if(!("tecnica_otro" in f)) f.tecnica_otro="";
      if(!Array.isArray(f.esquemas)) f.esquemas=[];
      if(!("clase_simetria" in f)) f.clase_simetria="";
      if(!("colores" in f)) f.colores="";
      if(!("design_id" in f)) f.design_id="";
    });

    const nextFieldId=()=>{
      const max=Math.max(0,...d.fields.map(f=>parseInt(String(f.id||"").replace("MR-C",""),10)||0));
      return "MR-C"+String(max+1).padStart(4,"0");
    };

    // Migración no destructiva: los campos que ya estaban escritos dentro de
    // los diseños se convierten en entidades de campo decorativo, sin borrar
    // ninguna variable anterior.
    const byKey=new Map();
    d.fields.forEach(f=>byKey.set([f.piece_id,f.nombre,f.nombre_otro].join("||"),f));
    d.designs.forEach(des=>{
      if(!("field_id" in des)) des.field_id="";
      if(Array.isArray(des.field_ids) && des.field_ids.length){
        if(!des.field_id) des.field_id=des.field_ids[0];
        if(des.field_ids.length>1 && !Array.isArray(des.legacy_field_ids)) des.legacy_field_ids=[...des.field_ids];
      }
      if(!des.field_id && des.piece_id && des.campo_decorativo){
        const key=[des.piece_id,des.campo_decorativo,des.campo_otro||""].join("||");
        let f=byKey.get(key);
        if(!f){
          f={id:nextFieldId(),piece_id:des.piece_id,nombre:des.campo_decorativo,nombre_otro:des.campo_otro||"",catalog_code:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],clase_simetria:"",colores:"",design_id:"",updated_at:des.updated_at||""};
          d.fields.push(f);byKey.set(key,f);
        }
        des.field_id=f.id;
      }
      if(des.field_id){
        const f=d.fields.find(x=>x.id===des.field_id);
        if(f){
          if(!f.design_id) f.design_id=des.id;
          if((!f.tecnicas||!f.tecnicas.length) && Array.isArray(des.tecnicas)) f.tecnicas=[...des.tecnicas];
          if(!f.tecnica_otro && des.tecnica_otro) f.tecnica_otro=des.tecnica_otro;
          if((!f.esquemas||!f.esquemas.length) && des.esquema) f.esquemas=[des.esquema];
          if(!f.clase_simetria && des.clase_simetria) f.clase_simetria=des.clase_simetria;
          if(!f.colores && des.colores) f.colores=des.colores;
        }
      }
    });
    // Normalización segura de relaciones. No elimina registros ni archivos.
    d.fields.forEach(f=>{
      const linked=d.designs.filter(des=>des.field_id===f.id);
      if(linked.length===1){
        f.design_id=linked[0].id;
        if(linked[0].piece_id!==f.piece_id) linked[0].piece_id=f.piece_id;
      }else if(linked.length===0 && f.design_id && !d.designs.some(des=>des.id===f.design_id)){
        f.design_id="";
      }
    });
    d.designs.forEach(des=>{
      if(des.field_id){
        const f=d.fields.find(x=>x.id===des.field_id);
        if(f && des.piece_id!==f.piece_id) des.piece_id=f.piece_id;
      }
    });

    d.schema_version=5;
    return d;
  }

  function loadData(){
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved?.pieces && saved?.designs){
        const migrated=migrateData(saved);
        localStorage.setItem(STORE_KEY,JSON.stringify(migrated));
        return migrated;
      }
    } catch(e){}
    const d = migrateData(deepClone(SEED));
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    return d;
  }
  function saveData(){
    try{
      const previous=localStorage.getItem(STORE_KEY);
      if(previous){
        const history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
        history.unshift({saved_at:nowIso(),data:JSON.parse(previous)});
        localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,10)));
      }
    }catch(e){}
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

  function pastedImageFile(e, baseName){
    const items=[...(e.clipboardData?.items||[])];
    const item=items.find(x=>x.kind==="file" && x.type && (x.type.startsWith("image/") || x.type==="image/svg+xml"));
    if(!item) return null;
    const blob=item.getAsFile(); if(!blob)return null;
    const ext=blob.type==="image/svg+xml"?"svg":blob.type==="image/jpeg"?"jpg":blob.type==="image/webp"?"webp":"png";
    return new File([blob], baseName+"."+ext, {type:blob.type||"image/png", lastModified:Date.now()});
  }

  function bindPasteZone(el, baseName, onFile){
    if(!el)return;
    // La misma zona de vista previa se reutiliza al cambiar de pieza/diseño.
    // Actualizamos siempre el destino y el callback para evitar que una imagen
    // se guarde accidentalmente en el registro seleccionado anteriormente.
    el.dataset.pasteName=baseName;
    el._mrPasteHandler=onFile;
    if(el.dataset.pasteBound==="1")return;
    el.dataset.pasteBound="1";
    el.addEventListener("click",()=>el.focus());
    el.addEventListener("paste",async e=>{
      const file=pastedImageFile(e, el.dataset.pasteName||"imagen-pegada");
      if(!file){toast("El portapapeles no contiene una imagen");return;}
      e.preventDefault();
      el.classList.add("paste-saving");
      try{
        if(typeof el._mrPasteHandler==="function"){
          await el._mrPasteHandler(file);
        }
      }catch(err){
        console.error("Error al guardar imagen pegada",err);
        toast("No se pudo guardar la imagen. Volvé a intentar.");
      }finally{
        el.classList.remove("paste-saving");
      }
    });
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
    if($("statFields")) $("statFields").textContent=data.fields.length;
    $("statDesigns").textContent=data.designs.length;
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
        const f=data.fields.find(x=>x.id===item.field_id);
        const schemes=(f?.esquemas&&f.esquemas.length)?f.esquemas.join(" | "):(item.esquema||"");
        const symmetry=f?.clase_simetria||item.clase_simetria||"";
        const fieldName=f?fieldLabel(f):(item.campo_decorativo||"");
        body.innerHTML=`<span class="card-id">${esc(item.id)}</span><h3>${esc(schemes||"Esquema por identificar")}</h3><p>${esc(item.piece_id||"Sin pieza vinculada")}${p?.forma?' · '+esc(p.forma):''}</p><div class="chips">${symmetry?'<span class="chip">'+esc(symmetry)+'</span>':''}${fieldName?'<span class="chip">'+esc(fieldName)+'</span>':''}</div>`;
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
    const fs=data.fields.filter(f=>f.piece_id===id);
    const u=await mediaUrl("piece:"+id);

    const fieldCards=fs.map((f,index)=>{
      const linked=ds.filter(d=>d.field_id===f.id);
      const design=linked[0]||null;
      const techs=(f.tecnicas&&f.tecnicas.length)?f.tecnicas:(design?.tecnicas||[]);
      const syms=f.clase_simetria||design?.clase_simetria||"";
      const schemes=(f.esquemas&&f.esquemas.length)?f.esquemas:(design?.esquema?[design.esquema]:[]);
      return '<article class="piece-field-summary"><div class="piece-field-number">'+(index+1)+'</div><div><div class="piece-field-title"><strong>'+esc(f.id)+'</strong><span>'+esc(fieldLabel(f))+'</span></div><dl><dt>Dibujo</dt><dd>'+esc(design?.id||f.design_id||"—")+'</dd><dt>Técnica(s)</dt><dd>'+esc(techs.join(", ")||"—")+'</dd><dt>Clase de simetría</dt><dd>'+esc(syms||"—")+'</dd><dt>Esquema(s)</dt><dd>'+esc(schemes.join(", ")||"—")+'</dd><dt>Colores</dt><dd>'+esc(f.colores||design?.colores||"—")+'</dd></dl></div></article>';
    });

    const designCards=[];
    for(const d of ds){
      const du=await mediaUrl("design:"+d.id);
      designCards.push(`<article class="linked-design-card">
        <div class="linked-design-media paste-target" tabindex="0" role="button" data-modal-paste-design="${esc(d.id)}">${du?'<img src="'+du+'" alt="Dibujo '+esc(d.id)+'">':'<span class="linked-design-empty">Dibujo no adjuntado · clic y Ctrl+V</span>'}</div>
        <div class="linked-design-info">
          <div><strong>${esc(d.id)}</strong><span><b>Campo:</b> ${esc((()=>{const f=data.fields.find(x=>x.id===d.field_id);return f?fieldLabel(f):(d.field_id||"sin vincular");})())}</span><span>Esquema: ${esc(d.esquema||"pendiente")}</span><span><b>Clase de simetría:</b> ${esc(d.clase_simetria||"pendiente")}</span></div>
          <div class="linked-design-actions">
            <button type="button" class="mini design-view-btn" data-design-id="${esc(d.id)}">Ver ficha</button>
            <label class="design-upload-btn">${du?"Reemplazar dibujo":"Adjuntar dibujo"}<input type="file" accept="image/*,.svg" data-design-upload="${esc(d.id)}"></label>
          </div>
        </div>
      </article>`);
    }

    $("dialogContent").innerHTML=`<div class="detail-grid"><div><div class="detail-media">${u?'<img src="'+u+'">':'<span class="placeholder">'+esc(id)+'</span>'}</div>${p.fotogrametria_url?'<iframe class="embed-frame" src="'+esc(p.fotogrametria_url)+'" allowfullscreen loading="lazy"></iframe>':''}</div><div class="detail-data"><span class="card-id">${esc(id)}</span><h2>${esc(p.forma||"Pieza sin clasificar")}</h2><dl class="detail-list"><dt>Sigla</dt><dd>${esc(p.sigla||"—")}</dd><dt>Sitio</dt><dd>${esc(p.sitio||"—")}</dd><dt>Colección</dt><dd>${esc(p.coleccion||"—")}</dd><dt>Integridad</dt><dd>${esc(p.integridad||"—")}</dd><dt>Publicación</dt><dd>${esc(p.publicacion||"—")}</dd><dt>Página</dt><dd>${esc(p.pagina||"—")}</dd><dt>Observaciones</dt><dd>${esc(p.observaciones||"—")}</dd><dt>Campos decorados</dt><dd>${fs.length}</dd><dt>Clase(s) de simetría</dt><dd>${esc([...new Set(fs.map(f=>f.clase_simetria).filter(Boolean))].join(", ")||"—")}</dd></dl><div class="field-summary-section"><h3>Campos / sectores decorados</h3><p class="design-list-help">Cada campo es una unidad fundamental de la muestra de referencia y puede compartir un mismo dibujo con otros campos.</p>${fieldCards.length?fieldCards.join(""):'<p>Sin campos decorativos registrados.</p>'}</div><div class="design-list-detail"><h3>Dibujos / diseños vinculados</h3><p class="design-list-help">Cada diseño puede adjuntar o reemplazar su dibujo directamente desde esta ficha.</p>${ds.length?designCards.join(""):'<p>Sin diseños vinculados.</p>'}</div></div></div>`;

    $("dialogContent").querySelectorAll("[data-modal-paste-design]").forEach(zone=>{
      const designId=zone.dataset.modalPasteDesign;
      bindPasteZone(zone,designId+"-diseno",async file=>{
        await putFile("design:"+designId,file);
        const d=data.designs.find(x=>x.id===designId);
        if(d){d.design_file_name=file.name;d.updated_at=nowIso();}
        saveData();toast("Dibujo pegado en "+designId);
        await openPieceDetail(id);
      });
    });

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
    const d=data.designs.find(x=>x.id===id); if(!d)return;
    const p=data.pieces.find(x=>x.id===d.piece_id);
    const f=data.fields.find(x=>x.id===d.field_id);
    const schemes=(f?.esquemas&&f.esquemas.length)?f.esquemas.join(" | "):(d.esquema||"");
    const techniques=(f?.tecnicas&&f.tecnicas.length)?f.tecnicas:(d.tecnicas||[]);
    const symmetry=f?.clase_simetria||d.clase_simetria||"";
    const colors=f?.colores||d.colores||"";
    const u=await mediaUrl("design:"+id);
    $("dialogContent").innerHTML=`<div class="detail-grid"><div class="detail-media" style="background:#f0ecdf">${u?'<img src="'+u+'">':'<span class="placeholder">'+esc(id)+'</span>'}</div><div class="detail-data"><span class="card-id">${esc(id)}</span><h2>${esc(schemes||"Esquema por identificar")}</h2><dl class="detail-list"><dt>Ref. original</dt><dd>${esc(d.ref_original||"—")}</dd><dt>Pieza</dt><dd>${esc(d.piece_id||"—")}</dd><dt>Forma</dt><dd>${esc(p?.forma||"—")}</dd><dt>Campo</dt><dd>${esc(f?f.id+" · "+fieldLabel(f):(d.campo_decorativo||"—"))}</dd><dt>Técnica(s)</dt><dd>${esc(techniques.join(", ")||"—")}</dd><dt>Simetría</dt><dd>${esc(symmetry||"—")}</dd><dt>Esquema(s)</dt><dd>${esc(schemes||"—")}</dd><dt>Colores</dt><dd>${esc(colors||"—")}</dd><dt>Observaciones</dt><dd>${esc(d.observaciones||f?.observaciones||"—")}</dd></dl></div></div>`;
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
    const techOther=[...document.querySelectorAll('#techniqueChecks input:checked')].some(x=>x.value==="Otro");
    $("d_tecnica_otro_wrap").classList.toggle("hidden",!techOther);
  }
  $("p_forma").onchange=()=>{setOtherVisibility();renderPieceFieldsEditor(selectedPieceId);};

  function loadPieceForm(id){
    const p=data.pieces.find(x=>x.id===id); if(!p)return; selectedPieceId=id;
    $("pieceFormTitle").textContent=p.id;$("p_id").value=p.id;$("p_caja").value=p.caja||"";$("p_sigla").value=p.sigla||"";$("p_sitio").value=p.sitio||"";$("p_coleccion").value=p.coleccion||"";$("p_publicacion").value=p.publicacion||"";$("p_pagina").value=p.pagina||"";$("p_forma").value=p.forma||"";$("p_forma_otro").value=p.forma_otro||"";$("p_integridad").value=p.integridad||"";$("p_fotogrametria").value=p.fotogrametria_url||"";$("p_observaciones").value=p.observaciones||"";
    setOtherVisibility();previewFile("piece:"+id,"piecePhotoPreview");renderPieceList();renderPieceFieldsEditor(id);renderPieceLinkedDesignsEditor(id);
    bindPasteZone($("piecePhotoPreview"),id+"-foto",async file=>{
      await putFile("piece:"+id,file);
      p.photo_file_name=file.name;p.updated_at=nowIso();saveData();
      await previewFile("piece:"+id,"piecePhotoPreview");
      toast("Fotografía pegada en "+id);
    });
  }
  function fieldLabel(f){
    if(!f) return "Campo sin definir";
    const base=f.nombre==="Otro"?(f.nombre_otro||"Otro"):(f.nombre||"Campo sin definir");
    return f.catalog_code ? f.catalog_code+" · "+base : base;
  }

  function fieldCatalogForPiece(pieceId){
    const p=data.pieces.find(x=>x.id===pieceId);
    return (p?.forma && data.options.campoCatalogoPorForma?.[p.forma]) || [];
  }

  function fieldOptionsForPiece(pieceId){
    const catalog=fieldCatalogForPiece(pieceId);
    return [...catalog.map(x=>x.nombre),"Otro"];
  }

  function refreshDesignFieldSelect(pieceId,current=""){
    const el=$("d_field"); if(!el)return;
    const fields=data.fields.filter(f=>f.piece_id===pieceId);
    el.innerHTML="";
    const blank=document.createElement("option");
    blank.value="";blank.textContent=fields.length?"Seleccionar campo…":"Primero registrá los campos decorativos de la pieza";
    el.appendChild(blank);
    fields.forEach((f,index)=>{
      const o=document.createElement("option");
      o.value=f.id;o.textContent="Campo "+(index+1)+" · "+f.id+" · "+fieldLabel(f);
      el.appendChild(o);
    });
    el.value=fields.some(f=>f.id===current)?current:"";
  }

  function renderFieldPresetSelector(pieceId){
    const box=$("fieldPresetSelector"); if(!box)return;
    const p=data.pieces.find(x=>x.id===pieceId);
    const catalog=fieldCatalogForPiece(pieceId);
    if(!p?.forma){
      box.innerHTML='<p class="design-list-help">Seleccioná primero la forma primaria de la pieza para ver sus campos decorativos posibles.</p>';
      return;
    }
    if(!catalog.length){
      box.innerHTML='<p class="design-list-help">No hay campos predeterminados para esta forma. Podés usar “+ Otro campo”.</p>';
      return;
    }
    const existing=data.fields.filter(f=>f.piece_id===pieceId);
    box.innerHTML='<div class="field-preset-title">Campos posibles para <strong>'+esc(p.forma)+'</strong></div><div class="field-preset-grid">'+catalog.map(c=>{
      const checked=existing.some(f=>f.catalog_code===c.codigo || (f.nombre===c.nombre && !f.nombre_otro));
      return '<label class="field-preset-chip"><input type="checkbox" data-field-preset="'+esc(c.codigo)+'" '+(checked?'checked':'')+'> <span><b>'+esc(c.codigo)+'</b>'+esc(c.nombre)+'</span></label>';
    }).join("")+'</div>';
    box.querySelectorAll("[data-field-preset]").forEach(input=>input.addEventListener("change",()=>{
      const item=catalog.find(c=>c.codigo===input.dataset.fieldPreset);if(!item)return;
      const existingField=data.fields.find(f=>f.piece_id===pieceId && (f.catalog_code===item.codigo || (f.nombre===item.nombre && !f.nombre_otro)));
      if(input.checked){
        if(!existingField){
          const id=nextId("MR-C",data.fields);
          data.fields.push({id,piece_id:pieceId,catalog_code:item.codigo,nombre:item.nombre,nombre_otro:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],clase_simetria:"",colores:"",design_id:"",updated_at:nowIso()});
          saveData();toast(item.codigo+" agregado");
        }else if(!existingField.catalog_code){
          existingField.catalog_code=item.codigo;existingField.updated_at=nowIso();saveData();
        }
      }else{
        if(existingField){
          if(data.designs.some(d=>d.field_id===existingField.id)){
            input.checked=true;toast("No se puede quitar: hay diseños vinculados");
            return;
          }
          data.fields=data.fields.filter(f=>f.id!==existingField.id);saveData();toast(item.codigo+" quitado");
        }
      }
      renderPieceFieldsEditor(pieceId);
    }));
  }

  async function renderPieceFieldsEditor(pieceId){
    const box=$("pieceFieldsEditor"); if(!box)return;
    renderFieldPresetSelector(pieceId);
    const fields=data.fields.filter(f=>f.piece_id===pieceId);
    box.innerHTML="";
    if(!fields.length){
      box.innerHTML='<p class="design-list-help">Marcá arriba los campos que realmente estén decorados en esta pieza.</p>';
      return;
    }
    const allowed=fieldOptionsForPiece(pieceId);
    fields.forEach(f=>{
      const row=document.createElement("article");row.className="field-row";
      const options=["",...allowed].filter((v,i,a)=>a.indexOf(v)===i).map(v=>'<option value="'+esc(v)+'" '+(v===f.nombre?'selected':'')+'>'+(v||"Seleccionar…")+'</option>').join("");
      const linked=data.designs.filter(d=>d.field_id===f.id);
      row.innerHTML=`
        <div class="field-row-head">
          <div><strong>${esc(f.id)}${f.catalog_code?" · "+esc(f.catalog_code):""}</strong>${linked.length?'<small class="field-linked-ids">Dibujo: '+esc(linked[0].id)+'</small>':""}</div>
          <div class="field-row-head-actions"><span>${linked.length?"1 dibujo vinculado":"Sin dibujo"}</span><button type="button" class="mini" data-create-design-for-field="${esc(f.id)}">${linked.length?"Editar dibujo":"+ Crear dibujo"}</button></div>
        </div>
        <div class="field-row-grid">
          <label>Sector / campo<select data-field-name="${esc(f.id)}">${options}</select></label>
          <label class="${f.nombre==="Otro"?"":"hidden"}" data-field-other-wrap="${esc(f.id)}">Otro campo<input data-field-other="${esc(f.id)}" value="${esc(f.nombre_otro||"")}"></label>
          <label class="field-notes">Observaciones<input data-field-notes="${esc(f.id)}" value="${esc(f.observaciones||"")}"></label>
          <button type="button" class="danger-link field-delete" data-field-delete="${esc(f.id)}">Eliminar campo</button>
        </div>`;
      box.appendChild(row);
    });

    box.querySelectorAll("[data-field-name]").forEach(el=>el.addEventListener("change",()=>{
      const f=data.fields.find(x=>x.id===el.dataset.fieldName);if(!f)return;
      f.nombre=el.value;if(f.nombre!=="Otro")f.nombre_otro="";
      const catalog=fieldCatalogForPiece(pieceId).find(c=>c.nombre===f.nombre);
      f.catalog_code=catalog?.codigo||"";
      f.updated_at=nowIso();
      data.designs.filter(d=>d.field_id===f.id).forEach(d=>{d.campo_decorativo=f.nombre;d.campo_otro=f.nombre_otro||"";d.piece_id=f.piece_id;});
      saveData();renderPieceFieldsEditor(pieceId);
    }));
    box.querySelectorAll("[data-field-other]").forEach(el=>el.addEventListener("change",()=>{
      const f=data.fields.find(x=>x.id===el.dataset.fieldOther);if(!f)return;
      f.nombre_otro=el.value.trim();f.catalog_code="";f.updated_at=nowIso();
      data.designs.filter(d=>d.field_id===f.id).forEach(d=>{d.campo_decorativo=f.nombre;d.campo_otro=f.nombre_otro||"";});
      saveData();
    }));
    box.querySelectorAll("[data-field-notes]").forEach(el=>el.addEventListener("change",()=>{
      const f=data.fields.find(x=>x.id===el.dataset.fieldNotes);if(!f)return;
      f.observaciones=el.value.trim();f.updated_at=nowIso();saveData();
    }));
    box.querySelectorAll("[data-create-design-for-field]").forEach(btn=>btn.addEventListener("click",()=>{
      const fieldId=btn.dataset.createDesignForField;
      const f=data.fields.find(x=>x.id===fieldId);if(!f)return;
      let d=data.designs.find(x=>x.field_id===fieldId);
      if(!d){
        const id=nextId("MR-D",data.designs);
        d={
          id,
          ref_original:"",
          piece_id:pieceId,
          field_id:f.id,
          campo_decorativo:f.nombre||"",
          campo_otro:f.nombre_otro||"",
          tecnicas:[...(f.tecnicas||[])],
          tecnica_otro:f.tecnica_otro||"",
          esquema:(f.esquemas||[]).join(" | "),
          clase_simetria:f.clase_simetria||"",
          colores:f.colores||"",
          observaciones:"",
          design_file_name:"",
          updated_at:nowIso()
        };
        data.designs.push(d);f.design_id=id;saveData();
        toast("Dibujo creado y vinculado: "+id);
      }
      selectedDesignId=d.id;
      $("editDesignTab").click();
      loadDesignForm(d.id);
    }));
    box.querySelectorAll("[data-field-delete]").forEach(btn=>btn.addEventListener("click",()=>{
      const id=btn.dataset.fieldDelete;
      if(data.designs.some(d=>d.field_id===id)){toast("No se puede eliminar: hay diseños vinculados");return;}
      data.fields=data.fields.filter(f=>f.id!==id);saveData();renderPieceFieldsEditor(pieceId);toast("Campo decorativo eliminado");
    }));
  }

  $("addFieldBtn").onclick=()=>{
    const pieceId=selectedPieceId;if(!pieceId)return;
    const id=nextId("MR-C",data.fields);
    data.fields.push({id,piece_id:pieceId,catalog_code:"",nombre:"Otro",nombre_otro:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],clase_simetria:"",colores:"",design_id:"",updated_at:nowIso()});
    saveData();renderPieceFieldsEditor(pieceId);toast("Nuevo campo creado: "+id);
  };

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
        <div class="piece-linked-design-thumb paste-target" tabindex="0" role="button" data-paste-design="${esc(d.id)}">${url?'<img src="'+url+'" alt="Dibujo '+esc(d.id)+'">':'<span>Sin dibujo · clic y Ctrl+V</span>'}</div>
        <div class="piece-linked-design-meta">
          <strong>${esc(d.id)}</strong>
          <small>${(()=>{const f=data.fields.find(x=>x.id===d.field_id);const es=(f?.esquemas&&f.esquemas.length)?f.esquemas.join(" | "):(d.esquema||"esquema pendiente");const si=f?.clase_simetria||d.clase_simetria||"simetría pendiente";return esc(es+" · "+si);})()}</small>
          <div class="piece-linked-design-actions">
            <label class="design-upload-btn">${file?"Reemplazar dibujo":"Adjuntar dibujo"}<input type="file" accept="image/*,.svg" data-editor-design-upload="${esc(d.id)}"></label>
            <button type="button" class="mini" data-edit-design="${esc(d.id)}">Editar datos del diseño</button>
            ${file?'<button type="button" class="danger-link" data-remove-design-image="'+esc(d.id)+'">Quitar dibujo</button>':''}
          </div>
        </div>`;
      box.appendChild(row);
      if(url){const img=row.querySelector("img");img.onload=()=>URL.revokeObjectURL(url);}
    }
    box.querySelectorAll("[data-paste-design]").forEach(zone=>{
      const designId=zone.dataset.pasteDesign;
      bindPasteZone(zone,designId+"-diseno",async file=>{
        await putFile("design:"+designId,file);
        const d=data.designs.find(x=>x.id===designId);
        if(d){d.design_file_name=file.name;d.updated_at=nowIso();}
        saveData();toast("Dibujo pegado en "+designId);
        await renderPieceLinkedDesignsEditor(pieceId);
      });
    });
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

  function loadDesignForm(id){
    const d=data.designs.find(x=>x.id===id);if(!d)return;selectedDesignId=id;
    const field=data.fields.find(f=>f.id===d.field_id);
    refreshPieceSelect();$("designFormTitle").textContent=d.id;$("d_id").value=d.id;$("d_ref").value=d.ref_original||"";$("d_piece").value=d.piece_id||"";refreshDesignFieldSelect(d.piece_id,d.field_id||"");$("d_simetria").value=field?.clase_simetria||d.clase_simetria||"";$("d_esquema").value=(field?.esquemas&&field.esquemas.length)?field.esquemas.join(" | "):(d.esquema||"");$("d_colores").value=field?.colores||d.colores||"";$("d_observaciones").value=d.observaciones||"";$("d_tecnica_otro").value=field?.tecnica_otro||d.tecnica_otro||"";renderTechniqueChecks((field?.tecnicas&&field.tecnicas.length)?field.tecnicas:(d.tecnicas||[]));$("d_campo_legacy").value=d.campo_decorativo?([d.campo_decorativo,d.campo_otro].filter(Boolean).join(" · ")):"";$("d_campo_legacy_wrap").classList.toggle("hidden",!!d.field_id||!d.campo_decorativo);setOtherVisibility();previewFile("design:"+id,"designImagePreview");renderDesignList();
    bindPasteZone($("designImagePreview"),id+"-diseno",async file=>{
      await putFile("design:"+id,file);
      d.design_file_name=file.name;d.updated_at=nowIso();saveData();
      await previewFile("design:"+id,"designImagePreview");
      toast("Dibujo pegado en "+id);
    });
  }
  $("d_piece").onchange=()=>refreshDesignFieldSelect($("d_piece").value,"");
  $("designForm").onsubmit=async e=>{
    e.preventDefault();const d=data.designs.find(x=>x.id===selectedDesignId);if(!d)return;
    const selectedField=data.fields.find(f=>f.id===$("d_field").value);
    if(!selectedField){toast("Seleccioná un campo decorativo");return;}
    const duplicate=data.designs.find(x=>x.id!==d.id && x.field_id===selectedField.id);
    if(duplicate){toast("Ese campo ya tiene el dibujo "+duplicate.id);return;}
    const techniques=[...document.querySelectorAll('#techniqueChecks input:checked')].map(x=>x.value);
    const schemes=$("d_esquema").value.split("|").map(x=>x.trim()).filter(Boolean);
    Object.assign(selectedField,{
      design_id:d.id,
      tecnicas:techniques,
      tecnica_otro:$("d_tecnica_otro").value.trim(),
      esquemas:schemes,
      clase_simetria:$("d_simetria").value,
      colores:$("d_colores").value.trim(),
      updated_at:nowIso()
    });
    Object.assign(d,{
      ref_original:$("d_ref").value.trim(),
      piece_id:$("d_piece").value,
      field_id:selectedField.id,
      campo_decorativo:selectedField.nombre||"",
      campo_otro:selectedField.nombre_otro||"",
      clase_simetria:selectedField.clase_simetria,
      tecnicas:[...selectedField.tecnicas],
      tecnica_otro:selectedField.tecnica_otro,
      esquema:selectedField.esquemas.join(" | "),
      colores:selectedField.colores,
      observaciones:$("d_observaciones").value.trim(),
      updated_at:nowIso()
    });
    const f=$("d_image").files[0];if(f){await putFile("design:"+d.id,f);d.design_file_name=f.name;$("d_image").value="";}
    saveData();renderDesignList();await previewFile("design:"+d.id,"designImagePreview");toast("Diseño guardado");
  };
  $("removeDesignImage").onclick=async()=>{await deleteFile("design:"+selectedDesignId);const d=data.designs.find(x=>x.id===selectedDesignId);if(d)d.design_file_name="";saveData();previewFile("design:"+selectedDesignId,"designImagePreview");toast("Archivo eliminado");};
  $("newDesignBtn").onclick=()=>{
    const id=nextId("MR-D",data.designs);data.designs.push({id,ref_original:"",piece_id:"",field_id:"",campo_decorativo:"",campo_otro:"",tecnicas:[],tecnica_otro:"",esquema:"",clase_simetria:"",colores:"",observaciones:"",design_file_name:"",updated_at:""});selectedDesignId=id;saveData();renderDesignList();loadDesignForm(id);toast("Nuevo diseño creado: "+id);
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
  if($("exportFields")) $("exportFields").onclick=()=>download("muestra_referencia_campos.csv",toCsv(data.fields,[
    {key:"id",label:"ID_CAMPO"},{key:"piece_id",label:"ID_PIEZA"},{key:"catalog_code",label:"CODIGO_SECTOR"},{key:"nombre",label:"SECTOR_CAMPO"},{key:"nombre_otro",label:"CAMPO_OTRO"},{key:"design_id",label:"ID_DISENO"},{get:r=>(r.tecnicas||[]).join("|"),label:"TECNICAS"},{key:"tecnica_otro",label:"TECNICA_OTRO"},{get:r=>(r.esquemas||[]).join("|"),label:"ESQUEMAS"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  $("exportDesigns").onclick=()=>download("muestra_referencia_dibujos.csv",toCsv(data.designs,[
    {key:"id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},{key:"piece_id",label:"ID_PIEZA"},{key:"field_id",label:"ID_CAMPO"},{key:"campo_decorativo",label:"CAMPO_DECORATIVO"},{key:"campo_otro",label:"CAMPO_OTRO"},{get:r=>(r.tecnicas||[]).join("|"),label:"TECNICAS"},{key:"tecnica_otro",label:"TECNICA_OTRO"},{key:"esquema",label:"ESQUEMA"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"},{key:"design_file_name",label:"DISENO_ARCHIVO"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  $("exportSpss").onclick=()=>{
    const techs=data.options.tecnicas.filter(x=>x!=="Otro");
    const rows=data.fields.map(f=>{
      const p=data.pieces.find(x=>x.id===f.piece_id)||{};
      const d=data.designs.find(x=>x.field_id===f.id)||{};
      return {
        ...f,
        design_id:d.id||f.design_id||"",
        ref_original:d.ref_original||"",
        esquemas_txt:(f.esquemas||[]).join("|"),
        ...Object.fromEntries(Object.entries(p).map(([k,v])=>["p_"+k,v])),
        ...Object.fromEntries(techs.map(t=>["tec_"+slug(t),(f.tecnicas||[]).includes(t)?1:0])),
        tec_otro:(f.tecnicas||[]).includes("Otro")?1:0
      };
    });
    const cols=[
      {key:"id",label:"ID_CAMPO"},{key:"piece_id",label:"ID_PIEZA"},{key:"design_id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},{key:"catalog_code",label:"CODIGO_SECTOR"},
      {key:"nombre",label:"SECTOR_CAMPO"},{key:"nombre_otro",label:"CAMPO_OTRO"},
      {key:"p_sitio",label:"SITIO"},{key:"p_coleccion",label:"COLECCION"},{key:"p_sigla",label:"SIGLA"},{key:"p_forma",label:"FORMA"},{key:"p_integridad",label:"INTEGRIDAD"},
      ...techs.map(t=>({key:"tec_"+slug(t),label:"TEC_"+slug(t).toUpperCase()})),{key:"tec_otro",label:"TEC_OTRO"},
      {key:"esquemas_txt",label:"ESQUEMAS"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"}
    ];
    download("muestra_referencia_matriz_spss.csv",toCsv(rows,cols));
  };
  function slug(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
  $("exportDictionary").onclick=()=>{
    const rows=[
      ["ID_PIEZA","Cadena","Identificador único e inmutable de la pieza","MR-Pxxxx"],
      ["ID_CAMPO","Cadena","Identificador único del campo decorativo; unidad de análisis","MR-Cxxxx"],
      ["ID_DISENO","Cadena","Identificador único del dibujo que representa un campo decorativo","MR-Dxxxx"],
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
    try{const obj=JSON.parse(await f.text());if(!obj.pieces||!obj.designs)throw new Error("Formato inválido");data=migrateData(obj);saveData();refreshPieceSelect();renderPieceList();renderDesignList();renderCatalog();toast("Respaldo importado y actualizado");}catch(err){alert("No se pudo importar el archivo: "+err.message);}e.target.value="";
  };

  function auditDatabase(){
    const issues=[];
    const warnings=[];
    const pieceIds=new Set();
    const fieldIds=new Set();
    const designIds=new Set();

    data.pieces.forEach(p=>{
      if(pieceIds.has(p.id)) issues.push("ID de pieza duplicado: "+p.id);
      pieceIds.add(p.id);
      if(!p.id?.match(/^MR-P\d{4,}$/)) warnings.push("ID de pieza fuera del patrón: "+(p.id||"(vacío)"));
    });

    data.fields.forEach(f=>{
      if(fieldIds.has(f.id)) issues.push("ID de campo duplicado: "+f.id);
      fieldIds.add(f.id);
      const p=data.pieces.find(x=>x.id===f.piece_id);
      if(!p) issues.push(f.id+" apunta a una pieza inexistente: "+(f.piece_id||"(vacío)"));
      if(!f.catalog_code && f.nombre!=="Otro") warnings.push(f.id+" no tiene código de sector CD");
      if(f.catalog_code && data.fields.some(x=>x.id!==f.id && x.piece_id===f.piece_id && x.catalog_code===f.catalog_code)) issues.push(f.piece_id+" tiene el sector "+f.catalog_code+" repetido");
      if(p && f.catalog_code){
        const allowed=data.options.campoCatalogoPorForma?.[p.forma]||[];
        const match=allowed.find(x=>x.codigo===f.catalog_code);
        if(!match) issues.push(f.id+" usa "+f.catalog_code+" incompatible con la forma "+(p.forma||"(sin forma)"));
        else if(match.nombre!==f.nombre) warnings.push(f.id+" tiene código "+f.catalog_code+" pero sector '"+f.nombre+"'");
      }
      const linked=data.designs.filter(d=>d.field_id===f.id);
      if(linked.length>1) issues.push(f.id+" tiene más de un dibujo vinculado: "+linked.map(d=>d.id).join(", "));
      if(linked.length===0) warnings.push(f.id+" todavía no tiene dibujo MR-D");
      if(!f.clase_simetria) warnings.push(f.id+" sin clase de simetría");
      if(!(f.esquemas||[]).length) warnings.push(f.id+" sin esquema registrado");
      if(!(f.tecnicas||[]).length) warnings.push(f.id+" sin técnica registrada");
    });

    data.designs.forEach(d=>{
      if(designIds.has(d.id)) issues.push("ID de dibujo duplicado: "+d.id);
      designIds.add(d.id);
      const f=data.fields.find(x=>x.id===d.field_id);
      if(d.field_id && !f) issues.push(d.id+" apunta a un campo inexistente: "+d.field_id);
      if(f && d.piece_id!==f.piece_id) issues.push(d.id+" y "+f.id+" no apuntan a la misma pieza");
      if(!d.field_id && (d.design_file_name||d.esquema||d.clase_simetria||(d.tecnicas||[]).length)) warnings.push(d.id+" tiene información pero no está vinculado a un campo");
    });

    return {issues,warnings};
  }

  if($("runAudit")) $("runAudit").onclick=()=>{
    const r=auditDatabase();
    const box=$("auditSummary");
    box.innerHTML='<strong>'+r.issues.length+' problema(s) crítico(s)</strong><span>'+r.warnings.length+' advertencia(s)</span>'+
      (r.issues.length?'<details><summary>Ver problemas</summary><ul>'+r.issues.slice(0,50).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></details>':'')+
      (r.warnings.length?'<details><summary>Ver advertencias</summary><ul>'+r.warnings.slice(0,50).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></details>':'')+
      (!r.issues.length?'<em>Las relaciones estructurales principales son coherentes.</em>':'');
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