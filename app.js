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
  const CENTRAL_DB_READ = {
    url:"https://flgphfyywoflvlvkeewe.supabase.co",
    publishableKey:"sb_publishable_s71OVIx3xZ_AEAGg0D97nw_2TQrj9T5",
    bucket:"reference-media"
  };
  let centralMode=false;
  let editorMode=false;
  let centralSyncTimer=null;
  const centralMediaByLocalKey=new Map();
  const supabaseClient=window.supabase?.createClient
    ? window.supabase.createClient(CENTRAL_DB_READ.url,CENTRAL_DB_READ.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
    : null;

  function setEditingEnabled(enabled){
    editorMode=!!enabled;
    const editNav=document.querySelector('[data-nav="editar"]');
    if(editNav){
      editNav.disabled=!editorMode;
      editNav.title=editorMode?"Editar base central":"Iniciá sesión con una cuenta autorizada para editar";
    }
    document.querySelectorAll("#pieceForm input,#pieceForm select,#pieceForm textarea,#pieceForm button,#designForm input,#designForm select,#designForm textarea,#designForm button,#newPieceBtn,#newDesignBtn,#movePieceBtn,#addFieldBtn").forEach(el=>{
      el.disabled=!editorMode;
    });
    const p=document.querySelector("#editar .section-head p");
    if(p)p.textContent=editorMode
      ?"Edición central activa: cada guardado se sincroniza con Supabase."
      :"La base central está en modo consulta. Iniciá sesión para editar.";
    if($("authButton"))$("authButton").textContent=editorMode?"Editor activo":"Iniciar sesión";
  }

  async function cleanupApprovedObsoleteDrawings(){
    if(!centralMode||!editorMode)return;
    const targets=[
      {id:"MR-D0047",uid:"DUID-000006"},
      {id:"MR-D0048",uid:"DUID-000023"}
    ];
    for(const target of targets){
      const d=data.designs.find(x=>x.uid===target.uid && x.id===target.id);
      if(d) await deleteDrawingRecord(target.id);
    }
  }

  async function refreshAuthUI(){
    if(!supabaseClient)return;
    const {data:{session}}=await supabaseClient.auth.getSession();
    const logged=!!session?.user;
    $("authLoggedOut")?.classList.toggle("hidden",logged);
    $("authLoggedIn")?.classList.toggle("hidden",!logged);
    if(!logged){setEditingEnabled(false);return;}
    if($("authUserLabel"))$("authUserLabel").textContent=session.user.email||"Sesión activa";
    const {data:row}=await supabaseClient.from("editors").select("user_id").eq("user_id",session.user.id).maybeSingle();
    const isEditor=!!row;
    setEditingEnabled(isEditor);
    if(isEditor) await cleanupApprovedObsoleteDrawings();
    if($("authEditorState"))$("authEditorState").textContent=isEditor
      ?"Cuenta autorizada para editar la base central."
      :"La cuenta está autenticada, pero todavía no tiene permiso de edición.";
    $("editorClaimBox")?.classList.toggle("hidden",isEditor);
  }

  function centralPieceRowLive(p){
    return {
      uid:p.uid,visible_id:p.id,legacy_id:p.legacy_id||null,id_history:p.id_history||[],
      created_order:p.created_order??null,display_order:p.display_order??null,reference_order:p.reference_order??null,sample_group:p.sample_group||null,
      caja:p.caja||null,sigla:p.sigla||null,sitio:p.sitio||null,coleccion:p.coleccion||null,
      publicacion:p.publicacion||null,pagina:p.pagina||null,forma:p.forma||null,forma_otro:p.forma_otro||null,
      integridad:p.integridad||null,atmosfera_coccion:p.atmosfera_coccion||null,pintura:p.pintura||null,fotogrametria_url:p.fotogrametria_url||null,observaciones:p.observaciones||null,
      photo_path:p.photo_path||null,updated_at:p.updated_at||nowIso(),source_record:p
    };
  }
  function centralFieldRowLive(f){
    return {
      uid:f.uid,visible_id:f.id,legacy_id:f.legacy_id||null,id_history:f.id_history||[],
      piece_uid:f.piece_uid||data.pieces.find(p=>p.id===f.piece_id)?.uid||null,
      source_type:f.source_type||((f.piece_uid||f.piece_id)?"piece":"independent"),
      form_inferred:f.form_inferred||null,site_reference:f.site_reference||null,
      publication_reference:f.publication_reference||null,page_reference:f.page_reference||null,
      certainty:f.certainty||null,
      catalog_code:f.catalog_code||null,nombre:f.nombre||null,nombre_otro:f.nombre_otro||null,
      tecnicas:f.tecnicas||[],tecnica_otro:f.tecnica_otro||null,esquemas:f.esquemas||[],
      esquemas_normalizados:f.esquemas_normalizados||[],esquemas_codigos:f.esquemas_codigos||[],
      clase_simetria:f.clase_simetria||null,colores:f.colores||null,observaciones:f.observaciones||null,
      created_order:f.created_order??null,updated_at:f.updated_at||nowIso(),source_record:f
    };
  }
  function centralDrawingRowLive(d){
    return {
      uid:d.uid,visible_id:d.id,legacy_id:d.legacy_id||null,id_history:d.id_history||[],
      piece_uid:d.piece_uid||data.pieces.find(p=>p.id===d.piece_id)?.uid||null,
      field_uid:d.field_uid||data.fields.find(f=>f.id===d.field_id)?.uid||null,
      ref_original:d.ref_original||null,drawing_path:d.drawing_path||null,observaciones:d.observaciones||null,
      created_order:d.created_order??null,reference_order:d.reference_order??null,updated_at:d.updated_at||nowIso(),source_record:d
    };
  }

  async function syncAllCentral(){
    if(!centralMode||!editorMode||!supabaseClient)return;
    try{
      const pieceRows=data.pieces.map(centralPieceRowLive);
      const fieldRows=data.fields.map(centralFieldRowLive);
      const drawingRows=data.designs.filter(d=>!d._draft).map(centralDrawingRowLive);
      let r=await supabaseClient.from("pieces").upsert(pieceRows,{onConflict:"uid"});if(r.error)throw r.error;
      r=await supabaseClient.from("fields").upsert(fieldRows,{onConflict:"uid"});if(r.error)throw r.error;
      r=await supabaseClient.from("drawings").upsert(drawingRows,{onConflict:"uid"});if(r.error)throw r.error;

      if($("authButton"))$("authButton").title="Última sincronización: "+new Date().toLocaleTimeString();
    }catch(err){
      console.error("Error de sincronización central",err);
      toast("No se pudo sincronizar con la base central");
    }
  }
  function scheduleCentralSync(){
    if(!centralMode||!editorMode)return;
    clearTimeout(centralSyncTimer);
    centralSyncTimer=setTimeout(syncAllCentral,500);
  }

  async function deleteCentralDrawingRow(d){
    if(!centralMode||!editorMode||!supabaseClient||!d?.uid)return;
    const r=await supabaseClient.from("drawings").delete().eq("uid",d.uid);
    if(r.error)throw r.error;
  }
  async function deleteCentralFieldRow(f){
    if(!centralMode||!editorMode||!supabaseClient||!f?.uid)return;
    const r=await supabaseClient.from("fields").delete().eq("uid",f.uid);
    if(r.error)throw r.error;
  }

  async function uploadCentralLiveMedia(key,file){
    if(!centralMode||!editorMode||!supabaseClient)return false;
    const [kind,id]=String(key).split(":");
    const rec=kind==="piece"?data.pieces.find(p=>p.id===id):data.designs.find(d=>d.id===id);
    if(!rec?.uid)return false;

    // Antes de registrar el archivo, garantizar que el registro padre exista
    // en Supabase. Esto evita errores de FK cuando se pega/sube una imagen
    // inmediatamente después de crear una pieza, campo o dibujo nuevo.
    if(kind==="piece"){
      const pr=await supabaseClient.from("pieces").upsert([centralPieceRowLive(rec)],{onConflict:"uid"});
      if(pr.error)throw pr.error;
    }else{
      const field=data.fields.find(f=>f.id===rec.field_id || (rec.field_uid&&f.uid===rec.field_uid));
      const piece=data.pieces.find(p=>p.id===rec.piece_id || (rec.piece_uid&&p.uid===rec.piece_uid));
      if(piece){
        const pr=await supabaseClient.from("pieces").upsert([centralPieceRowLive(piece)],{onConflict:"uid"});
        if(pr.error)throw pr.error;
      }
      if(field){
        const fr=await supabaseClient.from("fields").upsert([centralFieldRowLive(field)],{onConflict:"uid"});
        if(fr.error)throw fr.error;
      }
      const dr=await supabaseClient.from("drawings").upsert([centralDrawingRowLive(rec)],{onConflict:"uid"});
      if(dr.error)throw dr.error;
    }

    const folder=kind==="piece"?"pieces":"drawings";
    const safe=(file.name||"archivo").replace(/[^a-zA-Z0-9._-]/g,"_");
    const path="live/"+folder+"/"+rec.uid+"/"+safe;
    const {error}=await supabaseClient.storage.from(CENTRAL_DB_READ.bucket).upload(path,file,{upsert:true,contentType:file.type||undefined});
    if(error)throw error;
    const role=kind==="piece"?"piece_photo":"drawing_file";
    const row={role,original_filename:file.name||safe,mime_type:file.type||null,byte_size:file.size||null,storage_path:path,source_local_key:key,metadata:{live:true}};
    if(kind==="piece")row.piece_uid=rec.uid;else row.drawing_uid=rec.uid;
    const up=await supabaseClient.from("media_assets").upsert(row,{onConflict:"storage_path"});
    if(up.error)throw up.error;
    centralMediaByLocalKey.set(key,path);
    if(kind==="piece"){rec.photo_path=path;rec.photo_file_name=file.name;}
    else{rec.drawing_path=path;rec.design_file_name=file.name;}
    scheduleCentralSync();
    return true;
  }

  async function deleteCentralLiveMedia(key){
    if(!centralMode||!editorMode||!supabaseClient)return false;
    const path=centralMediaByLocalKey.get(key);
    if(path){
      const r=await supabaseClient.storage.from(CENTRAL_DB_READ.bucket).remove([path]);
      if(r.error)throw r.error;
      await supabaseClient.from("media_assets").delete().eq("storage_path",path);
      centralMediaByLocalKey.delete(key);
    }
    return true;
  }

  async function centralFetch(path){
    const res=await fetch(CENTRAL_DB_READ.url+"/rest/v1/"+path,{
      headers:{apikey:CENTRAL_DB_READ.publishableKey}
    });
    if(!res.ok)throw new Error(await res.text());
    return res.json();
  }

  function storagePublicUrl(path){
    return CENTRAL_DB_READ.url+"/storage/v1/object/public/"+CENTRAL_DB_READ.bucket+"/"+path;
  }

  async function loadCentralData(){
    try{
      if(!supabaseClient) throw new Error("Cliente Supabase no disponible");
      const [pr,fr,dr,mr,ar]=await Promise.all([
        supabaseClient.from("pieces").select("*").order("display_order",{ascending:true}),
        supabaseClient.from("fields").select("*"),
        supabaseClient.from("drawings").select("*"),
        supabaseClient.from("media_assets").select("source_local_key,storage_path"),
        supabaseClient.from("app_meta").select("value").eq("key","canonical_migration")
      ]);
      const firstError=pr.error||fr.error||dr.error||mr.error||ar.error;
      if(firstError) throw firstError;
      const pieces=pr.data||[],fields=fr.data||[],drawings=dr.data||[],media=mr.data||[],meta=ar.data||[];
      const m=meta?.[0]?.value;
      if(!m?.verified || !pieces.length) return false;

      centralMediaByLocalKey.clear();
      media.forEach(x=>{if(x.source_local_key&&x.storage_path)centralMediaByLocalKey.set(x.source_local_key,x.storage_path);});

      const pByUid=new Map(pieces.map(p=>[p.uid,p]));
      const fByUid=new Map(fields.map(f=>[f.uid,f]));
      const dByUid=new Map(drawings.map(d=>[d.uid,d]));

      const central={
        version:"central-1",
        options:deepClone(SEED.options||{}),
        pieces:pieces.map(p=>({
          ...(p.source_record||{}),
          id:p.visible_id,uid:p.uid,legacy_id:p.legacy_id||"",id_history:p.id_history||[],
          created_order:p.created_order,display_order:p.display_order,reference_order:p.reference_order??null,sample_group:p.sample_group||"sin_clasificar",
          caja:p.caja||"",sigla:p.sigla||"",sitio:p.sitio||"",coleccion:p.coleccion||"",
          publicacion:p.publicacion||"",pagina:p.pagina||"",forma:p.forma||"",forma_otro:p.forma_otro||"",
          integridad:p.integridad||"",atmosfera_coccion:p.atmosfera_coccion||"",pintura:p.pintura||"",fotogrametria_url:p.fotogrametria_url||"",observaciones:p.observaciones||"",
          photo_path:p.photo_path||"",updated_at:p.updated_at
        })),
        fields:fields.map(f=>({
          ...(f.source_record||{}),
          id:f.visible_id,uid:f.uid,legacy_id:f.legacy_id||"",id_history:f.id_history||[],
          piece_uid:f.piece_uid||"",piece_id:pByUid.get(f.piece_uid)?.visible_id||f.source_record?.piece_id||"",
          source_type:f.source_type|| (f.piece_uid?"piece":"independent"),
          form_inferred:f.form_inferred||"",site_reference:f.site_reference||"",
          publication_reference:f.publication_reference||"",page_reference:f.page_reference||"",
          certainty:f.certainty||"",
          catalog_code:f.catalog_code||"",nombre:f.nombre||"",nombre_otro:f.nombre_otro||"",
          tecnicas:f.tecnicas||[],tecnica_otro:f.tecnica_otro||"",esquemas:f.esquemas||[],
          esquemas_normalizados:f.esquemas_normalizados||[],esquemas_codigos:f.esquemas_codigos||[],
          clase_simetria:f.clase_simetria||"",colores:f.colores||"",observaciones:f.observaciones||"",
          created_order:f.created_order,updated_at:f.updated_at
        })),
        designs:drawings.map(d=>({
          ...(d.source_record||{}),
          id:d.visible_id,uid:d.uid,legacy_id:d.legacy_id||"",id_history:d.id_history||[],
          piece_uid:d.piece_uid||"",piece_id:pByUid.get(d.piece_uid)?.visible_id||d.source_record?.piece_id||"",
          field_uid:d.field_uid||"",field_id:fByUid.get(d.field_uid)?.visible_id||d.source_record?.field_id||"",
          ref_original:d.ref_original||"",drawing_path:d.drawing_path||"",observaciones:d.observaciones||"",
          created_order:d.created_order,reference_order:d.reference_order??null,updated_at:d.updated_at
        }))
      };
      central.fields.forEach(f=>{
        if(!f.design_id){
          const d=central.designs.find(x=>x.field_uid&&x.field_uid===f.uid);
          if(d)f.design_id=d.id;
        }
      });
      const localBeforeCentral=deepClone(data||{pieces:[],fields:[],designs:[]});
      const previousSelectedDesignId=selectedDesignId;
      data=migrateData(central);

      // Recuperación no destructiva de cambios locales que todavía no llegaron
      // a Supabase. Si un registro local no existe en la base central, se conserva.
      // Si existe en ambos lados, se mantiene la versión con updated_at más reciente.
      const newerLocal=(localRow,centralRow)=>{
        if(!centralRow)return true;
        const lt=Date.parse(localRow?.updated_at||"")||0;
        const ct=Date.parse(centralRow?.updated_at||"")||0;
        return lt>ct;
      };
      const mergeUnsynced=(target,localRows)=>{
        const byUid=new Map(target.filter(x=>x?.uid).map(x=>[x.uid,x]));
        for(const localRow of (localRows||[])){
          if(localRow?._draft){
            if(!target.some(x=>(localRow.uid&&x.uid===localRow.uid)||x.id===localRow.id)) target.push(localRow);
            continue;
          }
          const centralRow=localRow?.uid?byUid.get(localRow.uid):target.find(x=>x.id===localRow.id);
          if(!centralRow){
            target.push(localRow);
          }else if(newerLocal(localRow,centralRow)){
            Object.assign(centralRow,localRow);
          }
        }
      };
      mergeUnsynced(data.pieces,localBeforeCentral.pieces);
      mergeUnsynced(data.fields,localBeforeCentral.fields);
      mergeUnsynced(data.designs,localBeforeCentral.designs);

      centralMode=true;
      selectedPieceId=data.pieces[0]?.id||"";
      selectedDesignId=data.designs.some(d=>d.id===previousSelectedDesignId)?previousSelectedDesignId:(data.designs[0]?.id||"");
      localStorage.setItem(STORE_KEY,JSON.stringify(data));
      return true;
    }catch(err){
      console.error("No se pudo cargar la base central",err);
      const el=document.getElementById("centralStatusCounts");
      if(el)el.textContent="Error al cargar la base central";
      return false;
    }
  }


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
      if(!("legacy_id" in f)) f.legacy_id="";
      if(!("created_order" in f)) f.created_order=0;
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
    d.designs.forEach((des,index)=>{
      if(!("field_id" in des)) des.field_id="";
      if(!("legacy_id" in des)) des.legacy_id="";
      if(!("created_order" in des)) des.created_order=index+1;
      if(Array.isArray(des.field_ids) && des.field_ids.length){
        if(!des.field_id) des.field_id=des.field_ids[0];
        if(des.field_ids.length>1 && !Array.isArray(des.legacy_field_ids)) des.legacy_field_ids=[...des.field_ids];
      }
      if(!des.field_id && des.piece_id && des.campo_decorativo){
        const key=[des.piece_id,des.campo_decorativo,des.campo_otro||""].join("||");
        let f=byKey.get(key);
        if(!f){
          f={id:nextFieldId(),piece_id:des.piece_id,nombre:des.campo_decorativo,nombre_otro:des.campo_otro||"",catalog_code:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],esquemas_normalizados:[],esquemas_codigos:[],clase_simetria:"",colores:"",design_id:"",updated_at:des.updated_at||""};
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
    d.pieces.forEach((p,index)=>{
      if(!("legacy_id" in p)) p.legacy_id="";
      if(!("created_order" in p)) p.created_order=index+1;
    });
    d.fields.forEach((f,index)=>{ if(!f.created_order) f.created_order=index+1; });

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

    // Los dibujos sin pieza/campo pueden ser referencias independientes legítimas.
    // Nunca se eliminan automáticamente por estar incompletos.
    d.schema_version=5;
    return window.MR_MIGRATIONS?.upgrade ? window.MR_MIGRATIONS.upgrade(d) : d;
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
    scheduleCentralSync();
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
  async function putLocalFile(key,file){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).put(file,key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  async function deleteLocalFile(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
    });
  }
  async function putFile(key,file){
    if(centralMode&&editorMode){
      await uploadCentralLiveMedia(key,file);
      return;
    }
    return putLocalFile(key,file);
  }
  async function getFile(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(DB_STORE,"readonly").objectStore(DB_STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
    });
  }
  async function deleteFile(key){
    if(centralMode&&editorMode){
      await deleteCentralLiveMedia(key);
      return;
    }
    return deleteLocalFile(key);
  }
  async function moveFileKey(oldKey,newKey){
    if(oldKey===newKey)return;
    const file=await getFile(oldKey);
    if(!file)return;
    await putFile(newKey,file);
    await deleteFile(oldKey);
  }
  async function getAllMediaEntries(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readonly");
      const store=tx.objectStore(DB_STORE);
      const req=store.openCursor();
      const out=[];
      req.onsuccess=e=>{
        const cur=e.target.result;
        if(!cur){resolve(out);return;}
        out.push([cur.key,cur.value]);
        cur.continue();
      };
      req.onerror=()=>reject(req.error);
    });
  }

  function blobToDataUrl(blob){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function dataUrlToFile(dataUrl,name,type){
    const [meta,b64]=String(dataUrl).split(",");
    const mime=type || (meta.match(/data:([^;]+)/)?.[1]||"application/octet-stream");
    const bin=atob(b64||"");
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    return new File([bytes],name||"archivo",{type:mime});
  }
  async function previewFile(key, containerId){
    const box=$(containerId); if(!box) return;
    box.innerHTML='<span class="placeholder">Sin archivo</span>';
    if(centralMode && centralMediaByLocalKey.has(key)){
      const img=document.createElement("img");
      img.src=storagePublicUrl(centralMediaByLocalKey.get(key));img.alt="archivo";
      box.innerHTML="";box.appendChild(img);return;
    }
    const file=await getFile(key); if(!file) return;
    const url=URL.createObjectURL(file);
    const img=document.createElement("img");
    img.src=url; img.alt=file.name||"archivo";
    img.onload=()=>URL.revokeObjectURL(url);
    box.innerHTML=""; box.appendChild(img);
  }
  async function mediaUrl(key){
    if(centralMode && centralMediaByLocalKey.has(key)) return storagePublicUrl(centralMediaByLocalKey.get(key));
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
  if($("p_group")){
    $("p_group").innerHTML="";
    (window.MR_MIGRATIONS?.groups||[{value:"sin_clasificar",label:"Sin clasificar"}]).forEach(g=>{
      const o=document.createElement("option");o.value=g.value;o.textContent=g.label;$("p_group").appendChild(o);
    });
  }

  function orderedPieces(){
    return [...data.pieces].sort((a,b)=>(+a.display_order||999999)-(+b.display_order||999999) || numericId(a.id,"MR-P")-numericId(b.id,"MR-P"));
  }

  function nextReferenceOrder(){
    const nums=[
      ...data.pieces.map(p=>+p.reference_order||0),
      ...data.designs.filter(d=>!d.piece_id).map(d=>+d.reference_order||0)
    ];
    return Math.max(0,...nums)+1;
  }

  function referenceLabel(item){
    const n=+item?.reference_order||0;
    return n ? "REF. "+String(n).padStart(3,"0") : "";
  }

  function refreshPieceSelect(){
    const el=$("d_piece"); const val=el.value;
    fillSelect(el,orderedPieces().map(p=>p.id),"Sin pieza vinculada");
    if([...el.options].some(o=>o.value===val)) el.value=val;
  }
  refreshPieceSelect();
  if($("d_forma_inferida")) fillSelect($("d_forma_inferida"),data.options.formas||[],"Indeterminada");

  function refreshStats(){
    $("statPieces").textContent=data.pieces.length;
    if($("statFields")) $("statFields").textContent=data.fields.length;
    $("statDesigns").textContent=data.designs.length;
    if($("centralStatusCounts")) $("centralStatusCounts").textContent=data.pieces.length+" piezas · "+data.fields.length+" campos · "+data.designs.length+" dibujos";
  }
  refreshStats();

  function pieceLabel(p){
    return [p.forma||"Forma pendiente",p.sitio||p.coleccion||""].filter(Boolean).join(" · ");
  }
  function designLabel(d){
    if(d?._draft && d.design_file_name) return "Captura pegada · pendiente de guardar";
    if(isEmptyDrawingDraft(d)) return "Borrador vacío";
    return [d.esquema||"Esquema pendiente",d.clase_simetria||""].filter(Boolean).join(" · ");
  }

  function isEmptyDrawingDraft(d){
    if(!d)return false;
    return !d.piece_id && !d.piece_uid && !d.field_id && !d.field_uid &&
      !d.reference_order && !d.ref_original && !d.drawing_path && !d.design_file_name &&
      !d.esquema && !d.clase_simetria && !d.colores && !d.observaciones &&
      !d.campo_decorativo && !d.campo_otro && !d.tecnica_otro &&
      !(d.tecnicas||[]).length;
  }

  function isVisibleDrawing(d){
    if(!d || d._draft)return false;
    const validField=!!(d.field_id && data.fields.some(f=>f.id===d.field_id));
    return validField || !!(
      d.design_file_name || d.esquema || d.clase_simetria || d.colores ||
      d.observaciones || d.campo_decorativo || d.campo_otro ||
      d.tecnica_otro || (d.tecnicas||[]).length
    );
  }

  // Catalog
  $("showPiecesBtn").onclick=()=>{currentViewMode="pieces";$("showPiecesBtn").classList.add("active");$("showDesignsBtn").classList.remove("active");renderCatalog();};
  $("showDesignsBtn").onclick=()=>{currentViewMode="designs";$("showDesignsBtn").classList.add("active");$("showPiecesBtn").classList.remove("active");renderCatalog();};
  ["searchInput","filterForm","filterSite"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderCatalog));

  function updateCatalogFilters(){
    const independentFields=data.fields.filter(f=>f.source_type==="independent" || (!f.piece_id&&!f.piece_uid));
    const forms=[...new Set([...data.pieces.map(p=>p.forma),...independentFields.map(f=>f.form_inferred)].filter(Boolean))].sort();
    const sites=[...new Set([...data.pieces.map(p=>p.sitio),...independentFields.map(f=>f.site_reference)].filter(Boolean))].sort();
    const formVal=$("filterForm").value,siteVal=$("filterSite").value;
    fillSelect($("filterForm"),forms,"Todas las formas");$("filterForm").value=forms.includes(formVal)?formVal:"";
    fillSelect($("filterSite"),sites,"Todos los sitios");$("filterSite").value=sites.includes(siteVal)?siteVal:"";
  }

  async function renderCatalog(){
    updateCatalogFilters();
    const grid=$("catalogGrid"); grid.innerHTML="";
    const q=$("searchInput").value.trim().toLowerCase();
    const ff=$("filterForm").value, fs=$("filterSite").value;
    const items=currentViewMode==="pieces"
      ? [
          ...orderedPieces().map(x=>({...x,_catalogType:"piece"})),
          ...data.designs.filter(d=>!d.piece_id && isVisibleDrawing(d)).map(x=>({...x,_catalogType:"independent_design"}))
        ].sort((a,b)=>(+a.reference_order||999999)-(+b.reference_order||999999) || String(a.id).localeCompare(String(b.id)))
      : data.designs.filter(isVisibleDrawing).sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D")).map(x=>({...x,_catalogType:"design"}));
    const filtered=items.filter(item=>{
      let hay="";
      if(currentViewMode==="pieces"){
        if(item._catalogType==="independent_design"){
          const f=data.fields.find(x=>x.id===item.field_id);
          const form=f?.form_inferred||item.form_inferred||"";
          const site=f?.site_reference||"";
          hay=[item.id,item.ref_original,item.esquema,item.clase_simetria,item.campo_otro,form,site,f?.publication_reference].join(" ").toLowerCase();
          if(ff && form!==ff)return false;if(fs && site!==fs)return false;
        }else{
          hay=[item.id,item.sigla,item.sitio,item.coleccion,item.forma,item.publicacion].join(" ").toLowerCase();
          if(ff && item.forma!==ff) return false; if(fs && item.sitio!==fs) return false;
        }
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
        if(item._catalogType==="independent_design"){
          const f=data.fields.find(x=>x.id===item.field_id);
          const schemes=(f?.esquemas&&f.esquemas.length)?f.esquemas.join(" | "):(item.esquema||"");
          const form=f?.form_inferred||item.form_inferred||"Forma indeterminada";
          const fieldName=f?.nombre_otro||item.campo_otro||"Campo indeterminado";
          body.innerHTML=`<span class="card-id card-reference-id">${esc(referenceLabel(item))}${referenceLabel(item)?" · ":""}${esc(item.id)}</span><h3>${esc(schemes||"Esquema por identificar")}</h3><p>Dibujo de referencia · ${esc(form)}</p><div class="chips"><span class="chip">Referencia independiente</span>${fieldName?'<span class="chip">'+esc(fieldName)+'</span>':''}</div>`;
          const u=await mediaUrl("design:"+item.id);if(u){media.innerHTML='<img alt="">';media.querySelector("img").src=u;}
          card.onclick=()=>openDesignDetail(item.id);
        }else{
          body.innerHTML=`<span class="reference-order">${esc(referenceLabel(item))}</span><span class="card-id">${esc(item.id)}</span><h3>${esc(item.forma||"Pieza sin clasificar")}</h3><p>${esc(item.sitio||item.coleccion||"Procedencia pendiente")}</p><div class="chips">${item.integridad?'<span class="chip">'+esc(item.integridad)+'</span>':''}<span class="chip">${data.designs.filter(d=>d.piece_id===item.id).length} diseño(s)</span></div>`;
          const u=await mediaUrl("piece:"+item.id); if(u){media.innerHTML='<img alt="">';media.querySelector("img").src=u;}
          card.onclick=()=>openPieceDetail(item.id);
        }
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

  async function deleteDrawingRecord(designId){
    const d=data.designs.find(x=>x.id===designId);
    if(!d)return false;
    const field=data.fields.find(f=>f.id===d.field_id);
    if(field?.design_id===designId) field.design_id="";
    await deleteFile("design:"+designId);
    await deleteCentralDrawingRow(d);
    data.designs=data.designs.filter(x=>x.id!==designId);
    if(field?.source_type==="independent" && !data.designs.some(x=>x.field_id===field.id)){
      await deleteCentralFieldRow(field);
      data.fields=data.fields.filter(f=>f.id!==field.id);
    }
    if(selectedDesignId===designId) selectedDesignId=data.designs[0]?.id||"";
    saveData();
    if(centralMode&&editorMode) await syncAllCentral();
    renderDesignList();
    renderCatalog();
    refreshStats();
    return true;
  }

  function armDeleteDrawingButton(btn,designId,onDeleted){
    if(btn.dataset.armed==="1")return;
    btn.dataset.armed="1";
    const wrap=document.createElement("span");
    wrap.className="confirm-delete-inline";
    wrap.innerHTML='<span>¿Seguro?</span><button type="button" class="danger-confirm-yes">Sí</button><button type="button" class="mini danger-confirm-no">No</button>';
    btn.replaceWith(wrap);
    wrap.querySelector(".danger-confirm-no").onclick=()=>onDeleted?.(false);
    wrap.querySelector(".danger-confirm-yes").onclick=async()=>{
      await deleteDrawingRecord(designId);
      toast("Dibujo "+designId+" eliminado");
      onDeleted?.(true);
    };
  }

  async function openPieceDetail(id){
    const p=data.pieces.find(x=>x.id===id); if(!p)return;
    const fs=data.fields.filter(f=>f.piece_id===id);
    const validFieldIds=new Set(fs.map(f=>f.id));
    const ds=data.designs.filter(d=>d.field_id && validFieldIds.has(d.field_id));
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
            <button type="button" class="danger-link delete-design-record" data-delete-design-record="${esc(d.id)}">Borrar registro</button>
          </div>
        </div>
      </article>`);
    }

    $("dialogContent").innerHTML=`<div class="detail-grid"><div><div class="detail-media">${u?'<img src="'+u+'">':'<span class="placeholder">'+esc(id)+'</span>'}</div>${p.fotogrametria_url?'<iframe class="embed-frame" src="'+esc(p.fotogrametria_url)+'" allowfullscreen loading="lazy"></iframe>':''}</div><div class="detail-data"><span class="card-id">${esc(id)}</span><h2>${esc(p.forma||"Pieza sin clasificar")}</h2><dl class="detail-list"><dt>Sigla</dt><dd>${esc(p.sigla||"—")}</dd><dt>Sitio</dt><dd>${esc(p.sitio||"—")}</dd><dt>Colección</dt><dd>${esc(p.coleccion||"—")}</dd><dt>Integridad</dt><dd>${esc(p.integridad||"—")}</dd><dt>Publicación</dt><dd>${esc(p.publicacion||"—")}</dd><dt>Página</dt><dd>${esc(p.pagina||"—")}</dd><dt>Observaciones</dt><dd>${esc(p.observaciones||"—")}</dd><dt>Campos decorados</dt><dd>${fs.length}</dd><dt>Clase(s) de simetría</dt><dd>${esc([...new Set(fs.map(f=>f.clase_simetria).filter(Boolean))].join(", ")||"—")}</dd></dl><div class="field-summary-section"><h3>Campos / sectores decorados</h3><p class="design-list-help">Cada campo es una unidad fundamental de la muestra de referencia y posee su propio dibujo de referencia.</p>${fieldCards.length?fieldCards.join(""):'<p>Sin campos decorativos registrados.</p>'}</div><div class="design-list-detail"><h3>Dibujos / diseños vinculados</h3><p class="design-list-help">Cada diseño puede adjuntar o reemplazar su dibujo directamente desde esta ficha.</p>${ds.length?designCards.join(""):'<p>Sin diseños vinculados.</p>'}</div></div></div>`;

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
    $("dialogContent").querySelectorAll("[data-delete-design-record]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const designId=btn.dataset.deleteDesignRecord;
        armDeleteDrawingButton(btn,designId,async deleted=>{
          await openPieceDetail(id);
        });
      });
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
    orderedPieces().filter(p=>[p.id,p.sigla,p.sitio,p.forma,p.sample_group].join(" ").toLowerCase().includes(q)).forEach(p=>{
      const row=document.createElement("div");row.className="record-row"+(p.id===selectedPieceId?" active":"");
      row.innerHTML=`<strong>${esc(p.id)}</strong><small>${esc(pieceLabel(p)||"pendiente")}</small>`;row.onclick=()=>{selectedPieceId=p.id;renderPieceList();loadPieceForm(p.id);};box.appendChild(row);
    });
  }
  $("pieceSearch").addEventListener("input",renderPieceList);

  function renderDesignList(){
    const q=$("designSearch").value?.toLowerCase()||"";const box=$("designList");box.innerHTML="";
    const rows=[...data.designs].sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D"))
      .filter(d=>[d.id,d.ref_original,d.piece_id,d.esquema,d.clase_simetria,isEmptyDrawingDraft(d)?"borrador vacío":""].join(" ").toLowerCase().includes(q));
    rows.forEach(d=>{
      const draft=!!d._draft || isEmptyDrawingDraft(d);
      const row=document.createElement("div");
      row.className="record-row"+(d.id===selectedDesignId?" active":"")+(draft?" draft-row":"");
      row.dataset.designId=d.id;
      row.innerHTML=`<strong>${esc(d.id)}</strong><small>${draft?'<span class="draft-badge">'+esc(designLabel(d))+'</span>':esc(designLabel(d)||d.ref_original||"pendiente")}</small>`;
      row.onclick=()=>{selectedDesignId=d.id;renderDesignList();loadDesignForm(d.id);};
      box.appendChild(row);
    });
    requestAnimationFrame(()=>{
      const active=box.querySelector('[data-design-id="'+CSS.escape(selectedDesignId)+'"]');
      active?.scrollIntoView({block:"nearest"});
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
    $("pieceFormTitle").textContent=p.id;$("p_id").value=p.id;$("p_caja").value=p.caja||"";$("p_sigla").value=p.sigla||"";$("p_sitio").value=p.sitio||"";$("p_coleccion").value=p.coleccion||"";$("p_publicacion").value=p.publicacion||"";$("p_pagina").value=p.pagina||"";$("p_forma").value=p.forma||"";$("p_forma_otro").value=p.forma_otro||"";$("p_integridad").value=p.integridad||"";$("p_atmosfera").value=p.atmosfera_coccion||"";$("p_pintura").value=p.pintura||"";if($("p_group"))$("p_group").value=p.sample_group||"sin_clasificar";if($("p_order"))$("p_order").value=p.display_order||"";$("p_fotogrametria").value=p.fotogrametria_url||"";$("p_observaciones").value=p.observaciones||"";
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

  function independentFieldForDrawing(d){
    if(!d?.field_id)return null;
    const f=data.fields.find(x=>x.id===d.field_id);
    return f && (!f.piece_id && (f.source_type==="independent" || !f.piece_uid)) ? f : null;
  }

  function toggleIndependentDrawingFields(d){
    const independent=!($("d_piece")?.value);
    $("independentDrawingFields")?.classList.toggle("hidden",!independent);
    if($("d_field")) $("d_field").disabled=independent;
    const f=independentFieldForDrawing(d);
    if(independent){
      $("d_forma_inferida").value=f?.form_inferred||d?.form_inferred||"";
      $("d_campo_inferido").value=f?.nombre_otro||d?.campo_otro||"";
      $("d_sitio_referencia").value=f?.site_reference||"";
      $("d_publicacion_referencia").value=f?.publication_reference||d?.ref_original||"";
      $("d_pagina_referencia").value=f?.page_reference||"";
      $("d_certeza").value=f?.certainty||"";
    }
  }

  function ensureIndependentField(d){
    let f=independentFieldForDrawing(d);
    if(!f){
      const id=nextId("MR-C",data.fields);
      f={
        id,
        uid:window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("field",data):"",
        piece_id:"",piece_uid:"",source_type:"independent",
        catalog_code:"",nombre:"Otro",nombre_otro:"",
        form_inferred:"",site_reference:"",publication_reference:"",page_reference:"",certainty:"",
        observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],esquemas_normalizados:[],esquemas_codigos:[],clase_simetria:"",colores:"",
        design_id:d.id,updated_at:nowIso(),
        created_order:Math.max(0,...data.fields.map(x=>+x.created_order||0))+1
      };
      data.fields.push(f);
    }
    return f;
  }

  function refreshDesignFieldSelect(pieceId,current=""){
    const el=$("d_field"); if(!el)return;
    el.innerHTML="";
    const blank=document.createElement("option");
    blank.value="";
    if(!pieceId){
      blank.textContent="Referencia independiente · campo analítico propio";
      el.appendChild(blank);
      el.value="";
      return;
    }
    const fields=data.fields.filter(f=>f.piece_id===pieceId && (f.source_type||"piece")==="piece");
    blank.textContent=fields.length?"Seleccionar campo…":"Primero registrá los campos decorativos de la pieza";
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
    box.querySelectorAll("[data-field-preset]").forEach(input=>input.addEventListener("change",async()=>{
      const item=catalog.find(c=>c.codigo===input.dataset.fieldPreset);if(!item)return;
      const existingField=data.fields.find(f=>f.piece_id===pieceId && (f.catalog_code===item.codigo || (f.nombre===item.nombre && !f.nombre_otro)));
      if(input.checked){
        if(!existingField){
          const id=nextId("MR-C",data.fields);
          data.fields.push({id,uid:window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("field",data):"",piece_id:pieceId,piece_uid:data.pieces.find(p=>p.id===pieceId)?.uid||"",catalog_code:item.codigo,nombre:item.nombre,nombre_otro:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],esquemas_normalizados:[],esquemas_codigos:[],clase_simetria:"",colores:"",design_id:"",updated_at:nowIso()});
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
          await deleteCentralFieldRow(existingField);data.fields=data.fields.filter(f=>f.id!==existingField.id);saveData();toast(item.codigo+" quitado");
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
          uid:window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("design",data):"",
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
    box.querySelectorAll("[data-field-delete]").forEach(btn=>btn.addEventListener("click",async()=>{
      const id=btn.dataset.fieldDelete;
      if(data.designs.some(d=>d.field_id===id)){toast("No se puede eliminar: hay diseños vinculados");return;}
      const field=data.fields.find(f=>f.id===id);if(field)await deleteCentralFieldRow(field);data.fields=data.fields.filter(f=>f.id!==id);saveData();renderPieceFieldsEditor(pieceId);toast("Campo decorativo eliminado");
    }));
  }

  $("addFieldBtn").onclick=()=>{
    const pieceId=selectedPieceId;if(!pieceId)return;
    const id=nextId("MR-C",data.fields);
    data.fields.push({id,uid:window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("field",data):"",piece_id:pieceId,piece_uid:data.pieces.find(p=>p.id===pieceId)?.uid||"",catalog_code:"",nombre:"Otro",nombre_otro:"",observaciones:"",tecnicas:[],tecnica_otro:"",esquemas:[],esquemas_normalizados:[],esquemas_codigos:[],clase_simetria:"",colores:"",design_id:"",updated_at:nowIso()});
    saveData();renderPieceFieldsEditor(pieceId);toast("Nuevo campo creado: "+id);
  };

  async function renderPieceLinkedDesignsEditor(pieceId){
    const box=$("pieceLinkedDesignsEditor"); if(!box)return;
    const validFieldIds=new Set(data.fields.filter(f=>f.piece_id===pieceId).map(f=>f.id));
    const ds=data.designs.filter(d=>d.field_id && validFieldIds.has(d.field_id));
    if(!ds.length){box.innerHTML='<p class="design-list-help">Esta pieza todavía no tiene dibujos vinculados a campos decorativos.</p>';return;}
    box.innerHTML="";
    for(const d of ds){
      const url=await mediaUrl("design:"+d.id);
      const file=centralMode?null:await getFile("design:"+d.id);
      const row=document.createElement("article");
      row.className="piece-linked-design-row";
      row.innerHTML=`
        <div class="piece-linked-design-thumb paste-target" tabindex="0" role="button" data-paste-design="${esc(d.id)}">${url?'<img src="'+url+'" alt="Dibujo '+esc(d.id)+'">':'<span>Sin dibujo · clic y Ctrl+V</span>'}</div>
        <div class="piece-linked-design-meta">
          <strong>${esc(d.id)}</strong>
          <small>${(()=>{const f=data.fields.find(x=>x.id===d.field_id);const es=(f?.esquemas&&f.esquemas.length)?f.esquemas.join(" | "):(d.esquema||"esquema pendiente");const si=f?.clase_simetria||d.clase_simetria||"simetría pendiente";return esc(es+" · "+si);})()}</small>
          <div class="piece-linked-design-actions">${centralMode?'<span class="chip">Lectura central</span>':''}
            <label class="design-upload-btn">${file?"Reemplazar dibujo":"Adjuntar dibujo"}<input type="file" accept="image/*,.svg" data-editor-design-upload="${esc(d.id)}"></label>
            <button type="button" class="mini" data-edit-design="${esc(d.id)}">Editar datos del dibujo</button>
            ${file?'<button type="button" class="danger-link" data-remove-design-image="'+esc(d.id)+'">Quitar imagen</button>':''}
            <button type="button" class="danger-link" data-delete-design-record="${esc(d.id)}">Borrar registro</button>
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
    box.querySelectorAll("[data-delete-design-record]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const designId=btn.dataset.deleteDesignRecord;
        armDeleteDrawingButton(btn,designId,async deleted=>{
          await renderPieceLinkedDesignsEditor(pieceId);
          renderPieceFieldsEditor(pieceId);
        });
      });
    });
  }

  $("pieceForm").onsubmit=async e=>{
    e.preventDefault();const p=data.pieces.find(x=>x.id===selectedPieceId);if(!p)return;
    Object.assign(p,{caja:$("p_caja").value.trim(),sigla:$("p_sigla").value.trim(),sitio:$("p_sitio").value.trim(),coleccion:$("p_coleccion").value.trim(),publicacion:$("p_publicacion").value.trim(),pagina:$("p_pagina").value.trim(),forma:$("p_forma").value,forma_otro:$("p_forma_otro").value.trim(),integridad:$("p_integridad").value,atmosfera_coccion:$("p_atmosfera").value,pintura:$("p_pintura").value,sample_group:$("p_group")?.value||p.sample_group||"sin_clasificar",fotogrametria_url:$("p_fotogrametria").value.trim(),observaciones:$("p_observaciones").value.trim(),updated_at:nowIso()});
    const f=$("p_photo").files[0];if(f){await putFile("piece:"+p.id,f);p.photo_file_name=f.name;$("p_photo").value="";}
    saveData();renderPieceList();refreshPieceSelect();await previewFile("piece:"+p.id,"piecePhotoPreview");toast("Pieza guardada");
  };
  $("removePiecePhoto").onclick=async()=>{await deleteFile("piece:"+selectedPieceId);const p=data.pieces.find(x=>x.id===selectedPieceId);if(p)p.photo_file_name="";saveData();previewFile("piece:"+selectedPieceId,"piecePhotoPreview");toast("Fotografía eliminada");};

  function nextId(prefix,arr){
    const max=Math.max(0,...arr.map(x=>parseInt(x.id.replace(prefix,""),10)||0));return prefix+String(max+1).padStart(4,"0");
  }
  $("newPieceBtn").onclick=()=>{
    const id=nextId("MR-P",data.pieces);
    const uid=window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("piece",data):"";
    const display_order=Math.max(0,...data.pieces.map(p=>+p.display_order||0))+1;
    const reference_order=nextReferenceOrder();
    data.pieces.push({id,uid,caja:"",sigla:"",sitio:"",coleccion:"",publicacion:"",pagina:"",forma:"",forma_otro:"",integridad:"",atmosfera_coccion:"",pintura:"",sample_group:"sin_clasificar",display_order,reference_order,observaciones:"",fotogrametria_url:"",photo_file_name:"",updated_at:""});selectedPieceId=id;saveData();refreshPieceSelect();renderPieceList();loadPieceForm(id);toast("Nueva pieza creada: "+id);
  };

  function renderTechniqueChecks(selected=[]){
    const box=$("techniqueChecks");box.innerHTML="";
    data.options.tecnicas.forEach(t=>{
      const lab=document.createElement("label");
      lab.innerHTML=`<input type="checkbox" value="${esc(t)}"> ${esc(t)}`;
      const input=lab.querySelector("input");
      input.checked=selected.includes(t);
      input.onchange=()=>{
        setOtherVisibility();
        autosaveCurrentFieldAnalysis();
      };
      box.appendChild(lab);
    });
  }

  function normalizeSchemeEntry(raw){
    const original=String(raw||"").trim();
    if(!original)return null;
    const amb=original.match(/^\s*(?:esquema\s*|e\s*)(\d+)\s+y\/o\s+(\d+)(.*)$/i);
    if(amb)return {codigo:null,codigos_posibles:["E"+amb[1],"E"+amb[2]],variante:null,estado:"ambiguo",original};
    const direct=original.match(/^\s*(?:esquema\s*|e\s*)(\d+)\s*(.*)$/i);
    if(direct){
      const variante=(direct[2]||"").replace(/^[\s,;:\-()]+|[\s,;:\-()]+$/g,"").trim()||null;
      return {codigo:"E"+direct[1],codigos_posibles:[],variante,estado:"seguro",original};
    }
    const ref=original.match(/(?:esquema\s*|e\s*)(\d+)/i);
    if(ref)return {codigo:null,codigos_posibles:["E"+ref[1]],variante:null,estado:"provisional",original};
    return {codigo:null,codigos_posibles:[],variante:null,estado:"revisar",original};
  }
  function normalizeSchemes(list){
    const normalizados=(list||[]).map(normalizeSchemeEntry).filter(Boolean);
    const codigos=[...new Set(normalizados.filter(x=>x.estado==="seguro"&&x.codigo).map(x=>x.codigo))];
    return {normalizados,codigos};
  }

  function writeFieldAnalysisFromForm(field, design=null){
    if(!field)return;
    const techniques=[...document.querySelectorAll('#techniqueChecks input:checked')].map(x=>x.value);
    const schemes=$("d_esquema").value.split("|").map(x=>x.trim()).filter(Boolean);
    const normalized=normalizeSchemes(schemes);
    Object.assign(field,{
      tecnicas:techniques,
      tecnica_otro:$("d_tecnica_otro").value.trim(),
      esquemas:schemes,
      esquemas_normalizados:normalized.normalizados,
      esquemas_codigos:normalized.codigos,
      clase_simetria:$("d_simetria").value,
      colores:$("d_colores").value.trim(),
      updated_at:nowIso()
    });
    if(design){
      Object.assign(design,{
        campo_decorativo:field.nombre||"",
        campo_otro:field.nombre_otro||"",
        clase_simetria:field.clase_simetria,
        tecnicas:[...field.tecnicas],
        tecnica_otro:field.tecnica_otro,
        esquema:field.esquemas.join(" | "),
        colores:field.colores,
        updated_at:nowIso()
      });
    }
  }

  function loadFieldAnalysisIntoControls(field, design=null){
    const symmetry=String(field?.clase_simetria||design?.clase_simetria||"").trim();
    if(symmetry && ![...$("d_simetria").options].some(o=>o.value===symmetry)){
      const o=document.createElement("option");o.value=symmetry;o.textContent=symmetry;$("d_simetria").appendChild(o);
    }
    $("d_simetria").value=symmetry;
    $("d_esquema").value=(field?.esquemas&&field.esquemas.length)?field.esquemas.join(" | "):(design?.esquema||"");
    $("d_colores").value=field?.colores||design?.colores||"";
    $("d_tecnica_otro").value=field?.tecnica_otro||design?.tecnica_otro||"";
    renderTechniqueChecks((field?.tecnicas&&field.tecnicas.length)?field.tecnicas:(design?.tecnicas||[]));
    setOtherVisibility();
  }

  function autosaveCurrentFieldAnalysis(){
    const d=data.designs.find(x=>x.id===selectedDesignId);
    const fieldId=$("d_field")?.dataset.currentFieldId || d?.field_id || "";
    const field=data.fields.find(f=>f.id===fieldId);
    if(!field)return;
    writeFieldAnalysisFromForm(field,d&&d.field_id===field.id?d:null);
    saveData();
  }

  function loadDesignForm(id){
    const d=data.designs.find(x=>x.id===id);if(!d)return;selectedDesignId=id;
    const field=data.fields.find(f=>f.id===d.field_id);
    refreshPieceSelect();
    $("designFormTitle").textContent=d.id;
    $("d_id").value=d.id;
    $("d_ref").value=d.ref_original||"";
    $("d_piece").value=d.piece_id||"";
    refreshDesignFieldSelect(d.piece_id,d.field_id||"");
    $("d_field").dataset.currentFieldId=d.field_id||"";
    loadFieldAnalysisIntoControls(field,d);
    toggleIndependentDrawingFields(d);
    $("d_observaciones").value=d.observaciones||"";
    $("d_campo_legacy").value=d.campo_decorativo?([d.campo_decorativo,d.campo_otro].filter(Boolean).join(" · ")):"";
    $("d_campo_legacy_wrap").classList.toggle("hidden",!!d.field_id||!d.campo_decorativo);
    previewFile("design:"+id,"designImagePreview");
    renderDesignList();
    bindPasteZone($("designImagePreview"),id+"-diseno",async file=>{
      if(d._draft){
        await putLocalFile("design:"+id,file);
        d.design_file_name=file.name;
        d._staged_media=true;
        d.updated_at=nowIso();
        saveData();
        renderDesignList();
        await previewFile("design:"+id,"designImagePreview");
        toast("Captura pegada en "+id+" · se subirá al guardar");
        return;
      }
      await putFile("design:"+id,file);
      d.design_file_name=file.name;d.updated_at=nowIso();saveData();
      await previewFile("design:"+id,"designImagePreview");
      toast("Dibujo pegado en "+id);
    });
  }

  $("d_piece").onchange=()=>{
    const d=data.designs.find(x=>x.id===selectedDesignId);
    const currentField=data.fields.find(f=>f.id===d?.field_id);
    if(d?.field_id && currentField && (currentField.source_type||"piece")==="piece"){
      $("d_piece").value=d.piece_id||"";
      toast("La pieza se define por el campo decorativo vinculado");
      return;
    }
    refreshDesignFieldSelect($("d_piece").value,"");
    $("d_field").dataset.currentFieldId=$("d_piece").value?"":(d?.field_id||"");
    loadFieldAnalysisIntoControls(currentField,d);
    toggleIndependentDrawingFields(d);
  };

  $("d_field").onchange=()=>{
    const d=data.designs.find(x=>x.id===selectedDesignId);if(!d)return;
    const newFieldId=$("d_field").value;
    const previousFieldId=$("d_field").dataset.currentFieldId || d.field_id || "";

    // Guardar primero los valores del campo que se estaba editando.
    if(previousFieldId){
      const previousField=data.fields.find(f=>f.id===previousFieldId);
      if(previousField){
        writeFieldAnalysisFromForm(previousField,d.field_id===previousFieldId?d:null);
        saveData();
      }
    }

    if(!newFieldId){
      $("d_field").dataset.currentFieldId="";
      loadFieldAnalysisIntoControls(null,d);
      return;
    }

    const newField=data.fields.find(f=>f.id===newFieldId);
    if(!newField)return;

    const linkedDrawing=data.designs.find(x=>x.field_id===newFieldId);
    if(linkedDrawing && linkedDrawing.id!==d.id){
      selectedDesignId=linkedDrawing.id;
      loadDesignForm(linkedDrawing.id);
      toast("Se abrió "+linkedDrawing.id+" · "+fieldLabel(newField));
      return;
    }

    // Un MR-D ya vinculado a un campo no se reutiliza para otro campo.
    if(d.field_id && d.field_id!==newFieldId){
      $("d_field").value=d.field_id;
      $("d_field").dataset.currentFieldId=d.field_id;
      const originalField=data.fields.find(f=>f.id===d.field_id);
      loadFieldAnalysisIntoControls(originalField,d);
      toast("Cada MR-D representa un solo campo. Creá/abrí el dibujo del otro campo.");
      return;
    }

    $("d_field").dataset.currentFieldId=newFieldId;
    loadFieldAnalysisIntoControls(newField,d);
  };

  $("d_simetria").onchange=autosaveCurrentFieldAnalysis;
  $("d_esquema").onblur=autosaveCurrentFieldAnalysis;
  $("d_colores").onblur=autosaveCurrentFieldAnalysis;
  $("d_tecnica_otro").onblur=autosaveCurrentFieldAnalysis;
  $("designForm").onsubmit=async e=>{
    e.preventDefault();
    const d=data.designs.find(x=>x.id===selectedDesignId);if(!d)return;
    const wasDraft=!!d._draft;
    const stagedFile=wasDraft ? await getFile("design:"+d.id) : null;
    const pieceId=$("d_piece").value;

    if(!pieceId){
      const independentField=ensureIndependentField(d);
      const previousFieldId=d.field_id||"";
      independentField.source_type="independent";
      independentField.piece_id="";
      independentField.piece_uid="";
      independentField.catalog_code="";
      independentField.nombre="Otro";
      independentField.nombre_otro=$("d_campo_inferido").value.trim();
      independentField.form_inferred=$("d_forma_inferida").value;
      independentField.site_reference=$("d_sitio_referencia").value.trim();
      independentField.publication_reference=$("d_publicacion_referencia").value.trim();
      independentField.page_reference=$("d_pagina_referencia").value.trim();
      independentField.certainty=$("d_certeza").value;
      independentField.design_id=d.id;
      if(!d.reference_order) d.reference_order=nextReferenceOrder();
      writeFieldAnalysisFromForm(independentField,d);
      Object.assign(d,{
        ref_original:$("d_ref").value.trim() || independentField.publication_reference,
        piece_id:"",piece_uid:"",
        field_id:independentField.id,field_uid:independentField.uid,
        campo_decorativo:independentField.nombre||"Otro",
        campo_otro:independentField.nombre_otro||"",
        form_inferred:independentField.form_inferred||"",
        observaciones:$("d_observaciones").value.trim(),
        updated_at:nowIso()
      });
      $("d_field").dataset.currentFieldId=independentField.id;
      if(previousFieldId && previousFieldId!==independentField.id){
        const old=data.fields.find(f=>f.id===previousFieldId);
        if(old?.design_id===d.id)old.design_id="";
      }
    }else{
      const selectedField=data.fields.find(f=>f.id===$("d_field").value);
      if(!selectedField){toast("Seleccioná un campo decorativo de la pieza");return;}
      const duplicate=data.designs.find(x=>x.id!==d.id && x.field_id===selectedField.id);
      if(duplicate){toast("Ese campo ya tiene el dibujo "+duplicate.id);return;}
      const previousFieldId=d.field_id||"";
      selectedField.design_id=d.id;
      writeFieldAnalysisFromForm(selectedField,d);
      Object.assign(d,{
        ref_original:$("d_ref").value.trim(),
        reference_order:null,
        piece_id:selectedField.piece_id,
        piece_uid:selectedField.piece_uid||data.pieces.find(p=>p.id===selectedField.piece_id)?.uid||"",
        field_id:selectedField.id,
        field_uid:selectedField.uid||"",
        campo_decorativo:selectedField.nombre||"",
        campo_otro:selectedField.nombre_otro||"",
        observaciones:$("d_observaciones").value.trim(),
        updated_at:nowIso()
      });
      $("d_field").dataset.currentFieldId=selectedField.id;
      if(previousFieldId && previousFieldId!==selectedField.id){
        const previousField=data.fields.find(f=>f.id===previousFieldId);
        if(previousField?.design_id===d.id) previousField.design_id="";
        if(previousField?.source_type==="independent" && !data.designs.some(x=>x.id!==d.id&&x.field_id===previousField.id)){
          data.fields=data.fields.filter(f=>f.id!==previousField.id);
        }
      }
    }
    d._draft=false;
    saveData();
    const selectedFile=$("d_image").files[0]||null;
    if(centralMode&&editorMode&&(wasDraft||selectedFile||stagedFile)) await syncAllCentral();
    const file=selectedFile||stagedFile;
    if(file){
      await putFile("design:"+d.id,file);
      d.design_file_name=file.name;
      d._staged_media=false;
      $("d_image").value="";
      if(stagedFile) await deleteLocalFile("design:"+d.id);
      saveData();
    }
    renderDesignList();renderCatalog();await previewFile("design:"+d.id,"designImagePreview");
    toast(d.piece_id?"Diseño guardado":"Referencia independiente guardada");
  };
  $("removeDesignImage").onclick=async()=>{
    const d=data.designs.find(x=>x.id===selectedDesignId);
    if(d?._draft) await deleteLocalFile("design:"+selectedDesignId);
    else await deleteFile("design:"+selectedDesignId);
    if(d){d.design_file_name="";d._staged_media=false;}
    saveData();renderDesignList();previewFile("design:"+selectedDesignId,"designImagePreview");toast("Archivo eliminado");
  };
  $("newDesignBtn").onclick=()=>{
    const reusable=[...data.designs].filter(isEmptyDrawingDraft).sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D"))[0];
    if(reusable){
      selectedDesignId=reusable.id;renderDesignList();loadDesignForm(reusable.id);
      toast("Borrador disponible: "+reusable.id+" · completalo y guardá");
      return;
    }
    const id=nextId("MR-D",data.designs);
    data.designs.push({id,uid:window.MR_MIGRATIONS?.newUid?window.MR_MIGRATIONS.newUid("design",data):"",_draft:true,ref_original:"",piece_id:"",piece_uid:"",field_id:"",field_uid:"",campo_otro:"",form_inferred:"",reference_order:null,tecnicas:[],tecnica_otro:"",esquema:"",clase_simetria:"",colores:"",observaciones:"",design_file_name:"",updated_at:""});
    selectedDesignId=id;renderDesignList();loadDesignForm(id);toast("Nuevo dibujo en borrador: "+id+" · no se guarda en la base hasta confirmar");
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
    {key:"reference_order",label:"ORDEN_REFERENCIA"},{key:"id",label:"ID_PIEZA"},{key:"uid",label:"UID_INTERNO"},{key:"sample_group",label:"GRUPO_MUESTRA"},{key:"display_order",label:"ORDEN_MUESTRA"},{key:"caja",label:"CAJA"},{key:"sigla",label:"SIGLA"},{key:"sitio",label:"SITIO"},{key:"coleccion",label:"COLECCION"},{key:"publicacion",label:"PUBLICACION"},{key:"pagina",label:"PAGINA_LAMINA"},{key:"forma",label:"FORMA"},{key:"forma_otro",label:"FORMA_OTRO"},{key:"integridad",label:"INTEGRIDAD"},{key:"atmosfera_coccion",label:"ATMOSFERA_COCCION"},{key:"pintura",label:"PINTURA"},{get:r=>r.pintura==="Sí"?"PINTADA":(r.atmosfera_coccion==="Reductora"&&r.pintura==="No"?"GRIS_REDUCTORA_NO_PINTADA":"OTRO_INDETERMINADO"),label:"GRUPO_ANALITICO"},{key:"fotogrametria_url",label:"FOTOGRAMETRIA_URL"},{key:"photo_file_name",label:"FOTO_ARCHIVO"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  if($("exportFields")) $("exportFields").onclick=()=>{
    const schemeNums=schemeNumbers();
    const rows=data.fields.map(f=>{
      const p=data.pieces.find(x=>x.id===f.piece_id)||{};
      return {
        ...f,
        forma_analitica:analyticalForm(f,p),
        tipo_fuente:analyticalSource(f),
        estados_esquema:schemeReviewStates(f).join("|")||"sin_esquema",
        requiere_revision_esquema:schemeNeedsReview(f),
        ...schemeBinaryValues(f,schemeNums)
      };
    });
    const cols=[
      {key:"id",label:"ID_CAMPO"},{key:"piece_id",label:"ID_PIEZA"},{key:"source_type",label:"SOURCE_TYPE"},{key:"tipo_fuente",label:"TIPO_FUENTE"},
      {key:"forma_analitica",label:"FORMA_ANALITICA"},{key:"form_inferred",label:"FORMA_INFERIDA"},
      {key:"catalog_code",label:"CODIGO_SECTOR"},{key:"nombre",label:"SECTOR_CAMPO"},{key:"nombre_otro",label:"CAMPO_OTRO"},{key:"design_id",label:"ID_DISENO"},
      {get:r=>(r.tecnicas||[]).join("|"),label:"TECNICAS"},{key:"tecnica_otro",label:"TECNICA_OTRO"},
      {get:r=>(r.esquemas||[]).join("|"),label:"ESQUEMAS_ORIGINAL"},
      {get:r=>(r.esquemas_codigos||[]).join("|"),label:"ESQUEMAS_CODIGOS"},
      {get:r=>JSON.stringify(r.esquemas_normalizados||[]),label:"ESQUEMAS_NORMALIZADOS"},
      {key:"estados_esquema",label:"ESTADOS_ESQUEMA"},{key:"requiere_revision_esquema",label:"REQUIERE_REVISION_ESQUEMA"},
      ...schemeNums.map(n=>({key:"E"+n,label:"E"+n})),
      {key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"},{key:"observaciones",label:"OBSERVACIONES"}
    ];
    download("muestra_referencia_campos.csv",toCsv(rows,cols));
  };
  $("exportDesigns").onclick=()=>download("muestra_referencia_dibujos.csv",toCsv(data.designs,[
    {key:"reference_order",label:"ORDEN_REFERENCIA"},{key:"id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},{key:"piece_id",label:"ID_PIEZA"},{key:"field_id",label:"ID_CAMPO"},{key:"campo_decorativo",label:"CAMPO_DECORATIVO"},{key:"campo_otro",label:"CAMPO_OTRO"},{get:r=>(r.tecnicas||[]).join("|"),label:"TECNICAS"},{key:"tecnica_otro",label:"TECNICA_OTRO"},{key:"esquema",label:"ESQUEMA"},{key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"},{key:"design_file_name",label:"DISENO_ARCHIVO"},{key:"observaciones",label:"OBSERVACIONES"}
  ]));
  $("exportSpss").onclick=()=>{
    const techs=data.options.tecnicas.filter(x=>x!=="Otro");
    const schemeNums=schemeNumbers();
    const rows=data.fields.map(f=>{
      const p=data.pieces.find(x=>x.id===f.piece_id)||{};
      const d=data.designs.find(x=>x.field_id===f.id)||{};
      return {
        ...f,
        design_id:d.id||f.design_id||"",
        ref_original:d.ref_original||"",
        forma_analitica:analyticalForm(f,p),
        tipo_fuente:analyticalSource(f),
        estados_esquema:schemeReviewStates(f).join("|")||"sin_esquema",
        requiere_revision_esquema:schemeNeedsReview(f),
        esquemas_txt:(f.esquemas||[]).join("|"),
        esquemas_codigos_txt:(f.esquemas_codigos||[]).join("|"),
        esquemas_variantes_txt:(f.esquemas_normalizados||[]).map(x=>[x.codigo||"",x.variante||"",x.estado||""].filter(Boolean).join(":")).join("|"),
        grupo_analitico:p.pintura==="Sí"?"PINTADA":(p.atmosfera_coccion==="Reductora"&&p.pintura==="No"?"GRIS_REDUCTORA_NO_PINTADA":"OTRO_INDETERMINADO"),
        ...Object.fromEntries(Object.entries(p).map(([k,v])=>["p_"+k,v])),
        ...Object.fromEntries(techs.map(t=>["tec_"+slug(t),(f.tecnicas||[]).includes(t)?1:0])),
        tec_otro:(f.tecnicas||[]).includes("Otro")?1:0,
        ...schemeBinaryValues(f,schemeNums)
      };
    });
    const cols=[
      {key:"id",label:"ID_CAMPO"},{key:"piece_id",label:"ID_PIEZA"},{key:"design_id",label:"ID_DISENO"},{key:"ref_original",label:"REF_ORIGINAL"},
      {key:"tipo_fuente",label:"TIPO_FUENTE"},{key:"forma_analitica",label:"FORMA_ANALITICA"},
      {key:"catalog_code",label:"CODIGO_SECTOR"},{key:"nombre",label:"SECTOR_CAMPO"},{key:"nombre_otro",label:"CAMPO_OTRO"},
      {key:"p_sitio",label:"SITIO"},{key:"p_coleccion",label:"COLECCION"},{key:"p_sigla",label:"SIGLA"},{key:"p_forma",label:"FORMA_PIEZA"},{key:"form_inferred",label:"FORMA_INFERIDA"},{key:"p_integridad",label:"INTEGRIDAD"},
      {key:"p_atmosfera_coccion",label:"ATMOSFERA_COCCION"},{key:"p_pintura",label:"PINTURA"},{key:"grupo_analitico",label:"GRUPO_ANALITICO"},
      ...techs.map(t=>({key:"tec_"+slug(t),label:"TEC_"+slug(t).toUpperCase()})),{key:"tec_otro",label:"TEC_OTRO"},
      {key:"esquemas_txt",label:"ESQUEMAS_ORIGINAL"},{key:"esquemas_codigos_txt",label:"ESQUEMAS_CODIGOS"},{key:"esquemas_variantes_txt",label:"ESQUEMAS_VARIANTES_ESTADO"},
      {key:"estados_esquema",label:"ESTADOS_ESQUEMA"},{key:"requiere_revision_esquema",label:"REQUIERE_REVISION_ESQUEMA"},
      ...schemeNums.map(n=>({key:"E"+n,label:"E"+n})),
      {key:"clase_simetria",label:"CLASE_SIMETRIA"},{key:"colores",label:"COLORES"}
    ];
    download("muestra_referencia_matriz_spss.csv",toCsv(rows,cols));
  };
  function slug(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
  function analyticalForm(field,piece){
    return (field?.source_type==="independent" || (!field?.piece_id&&!field?.piece_uid))
      ? (field?.form_inferred||"INDETERMINADA")
      : (piece?.forma||"INDETERMINADA");
  }
  function analyticalSource(field){
    return (field?.source_type==="independent" || (!field?.piece_id&&!field?.piece_uid))
      ? "REFERENCIA_INDEPENDIENTE"
      : "PIEZA_OBSERVADA";
  }
  function schemeReviewStates(field){
    return [...new Set((field?.esquemas_normalizados||[]).map(x=>x?.estado).filter(Boolean))];
  }
  function schemeNeedsReview(field){
    return schemeReviewStates(field).some(x=>x!=="seguro")?1:0;
  }
  function schemeNumbers(){
    const nums=[];
    for(const f of data.fields){
      for(const code of (f.esquemas_codigos||[])){
        const m=String(code).match(/^E(\d+)$/i); if(m)nums.push(+m[1]);
      }
      for(const item of (f.esquemas_normalizados||[])){
        for(const code of (item?.codigos_posibles||[])){
          const m=String(code).match(/^E(\d+)$/i); if(m)nums.push(+m[1]);
        }
      }
    }
    const max=Math.max(36,...nums,0);
    return Array.from({length:max},(_,i)=>i+1);
  }
  function schemeBinaryValues(field,nums){
    const present=new Set((field?.esquemas_codigos||[]).map(x=>String(x).toUpperCase()));
    return Object.fromEntries(nums.map(n=>["E"+n,present.has("E"+n)?1:0]));
  }

  $("exportDictionary").onclick=()=>{
    const rows=[
      ["ID_PIEZA","Cadena","Identificador visible y renumerable según el orden de la muestra","MR-Pxxxx"],
      ["UID_INTERNO","Cadena","Identificador interno estable; no cambia al reordenar","PUID-xxxxxx"],
      ["ID_CAMPO","Cadena","Identificador único del campo decorativo; unidad de análisis","MR-Cxxxx"],
      ["ID_DISENO","Cadena","Identificador único del dibujo que representa un campo decorativo","MR-Dxxxx"],
      ["REF_ORIGINAL","Cadena","Número o referencia del archivo maestro de Inkscape","Texto"],
      ["FORMA","Nominal","Forma primaria de la pieza","Lista cerrada + Otro"],
      ["ATMOSFERA_COCCION","Nominal","Atmósfera de cocción de la pieza","Reductora; Oxidante; Mixta; Indeterminada"],
      ["PINTURA","Nominal","Presencia de pintura en la pieza","Sí; No; Indeterminada"],
      ["GRUPO_ANALITICO","Nominal derivada","Grupo para comparar esquemas según tratamiento tecnológico/decorativo","GRIS_REDUCTORA_NO_PINTADA; PINTADA; OTRO_INDETERMINADO"],
      ["TIPO_FUENTE","Nominal derivada","Origen analítico del campo","PIEZA_OBSERVADA; REFERENCIA_INDEPENDIENTE"],
      ["FORMA_ANALITICA","Nominal derivada","Forma usada en análisis: forma observada de la pieza o forma inferida en referencias independientes","Lista de formas; INDETERMINADA"],
      ["CAMPO_DECORATIVO","Nominal","Sector de la pieza donde se registra el diseño","Lista condicionada por forma + Otro"],
      ["TECNICA_*","Dicotómica","Presencia/ausencia de cada técnica en matriz SPSS","0=ausente; 1=presente"],
      ["ESQUEMAS_ORIGINAL","Texto","Registro original de esquema(s), preservado sin cambios","Texto libre"],
      ["ESQUEMAS_CODIGOS","Nominal múltiple","Códigos base seguros derivados para análisis","E1|E2|..."],
      ["ESQUEMAS_NORMALIZADOS","Estructurada","Código base, variante, estado y texto original por esquema","JSON; estado=seguro/ambiguo/provisional/revisar"],
      ["REQUIERE_REVISION_ESQUEMA","Dicotómica derivada","Indica si algún esquema del campo es ambiguo, provisional o requiere revisión","0=no; 1=sí"],
      ["E1...E36","Dicotómicas derivadas","Presencia/ausencia de cada esquema seguro por campo; se amplía automáticamente si aparecen códigos mayores","0=ausente; 1=presente"],
      ["CLASE_SIMETRIA","Nominal","Clase de simetría registrada","Lista controlada"],
      ["COLORES","Texto","Descripción de colores empleados","Texto libre"]
    ];
    download("muestra_referencia_diccionario.csv",["VARIABLE,TIPO,DESCRIPCION,CODIFICACION",...rows.map(r=>r.map(csvEsc).join(","))].join("\n"));
  };
  $("exportJson").onclick=()=>download("muestra_referencia_respaldo.json",JSON.stringify(data,null,2),"application/json;charset=utf-8");

  if($("exportFullBackup")) $("exportFullBackup").onclick=async()=>{
    const status=$("fullBackupStatus"); if(status)status.textContent="Preparando fotografías y dibujos…";
    try{
      const entries=await getAllMediaEntries();
      const media=[];
      for(const [key,file] of entries){
        media.push({key,name:file.name||"archivo",type:file.type||"",data:await blobToDataUrl(file)});
      }
      const payload={format:"muestra-referencia-full-backup",version:1,created_at:nowIso(),data,media};
      download("muestra_referencia_respaldo_completo.json",JSON.stringify(payload),"application/json;charset=utf-8");
      if(status)status.textContent="Respaldo completo creado: "+media.length+" archivo(s).";
    }catch(err){
      console.error(err); if(status)status.textContent="No se pudo crear el respaldo completo.";
    }
  };


  const CENTRAL_DB = {
    url:"https://flgphfyywoflvlvkeewe.supabase.co",
    publishableKey:"sb_publishable_s71OVIx3xZ_AEAGg0D97nw_2TQrj9T5",
    batchId:"61def823-6e99-437e-8ed6-94cf7c544610",
    backupSha256:"51e5b1ec7acade4e769b64e9f27ec53c2848fb92b9272a92d94433ddbcc66ccf"
  };

  async function sha256Hex(text){
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function centralHeaders(migrationKey,extra={}){
    return {
      "apikey":CENTRAL_DB.publishableKey,
      "Content-Type":"application/json",
      "x-migration-key":migrationKey,
      ...extra
    };
  }

  async function centralRest(path,{method="GET",migrationKey="",body=null,prefer=""}={}){
    const headers=centralHeaders(migrationKey);
    if(prefer)headers["Prefer"]=prefer;
    const res=await fetch(CENTRAL_DB.url+"/rest/v1/"+path,{
      method,headers,body:body==null?null:JSON.stringify(body)
    });
    const txt=await res.text();
    if(!res.ok)throw new Error(txt||("HTTP "+res.status));
    return txt?JSON.parse(txt):null;
  }

  function centralPieceRow(p){
    return {
      uid:p.uid,visible_id:p.id,legacy_id:p.legacy_id||null,id_history:p.id_history||[],
      created_order:p.created_order??null,display_order:p.display_order??null,sample_group:p.sample_group||null,
      caja:p.caja||null,sigla:p.sigla||null,sitio:p.sitio||null,coleccion:p.coleccion||null,
      publicacion:p.publicacion||null,pagina:p.pagina||null,forma:p.forma||null,forma_otro:p.forma_otro||null,
      integridad:p.integridad||null,fotogrametria_url:p.fotogrametria_url||null,observaciones:p.observaciones||null,
      photo_path:p.photo_file_name?("migration-"+CENTRAL_DB.batchId+"/pieces/"+p.uid+"/"+p.photo_file_name):null,
      updated_at:p.updated_at||nowIso(),source_record:p,migration_batch_id:CENTRAL_DB.batchId
    };
  }

  function centralFieldRow(f){
    return {
      uid:f.uid,visible_id:f.id,legacy_id:f.legacy_id||null,id_history:f.id_history||[],
      piece_uid:f.piece_uid,catalog_code:f.catalog_code||null,nombre:f.nombre||null,nombre_otro:f.nombre_otro||null,
      tecnicas:f.tecnicas||[],tecnica_otro:f.tecnica_otro||null,esquemas:f.esquemas||[],
      clase_simetria:f.clase_simetria||null,colores:f.colores||null,observaciones:f.observaciones||null,
      created_order:f.created_order??null,updated_at:f.updated_at||nowIso(),source_record:f,
      migration_batch_id:CENTRAL_DB.batchId
    };
  }

  function centralDrawingRow(d){
    return {
      uid:d.uid,visible_id:d.id,legacy_id:d.legacy_id||null,id_history:d.id_history||[],
      piece_uid:d.piece_uid||null,field_uid:d.field_uid||null,ref_original:d.ref_original||null,
      drawing_path:d.design_file_name?("migration-"+CENTRAL_DB.batchId+"/drawings/"+d.uid+"/"+d.design_file_name):null,
      observaciones:d.observaciones||null,created_order:d.created_order??null,
      updated_at:d.updated_at||nowIso(),source_record:d,migration_batch_id:CENTRAL_DB.batchId
    };
  }

  async function uploadCentralMedia(item,payload,migrationKey){
    const [kind,visibleId]=String(item.key||"").split(":");
    const record=kind==="piece"
      ? payload.data.pieces.find(p=>p.id===visibleId)
      : payload.data.designs.find(d=>d.id===visibleId);
    if(!record)throw new Error("No se encontró el registro para "+item.key);
    const folder=kind==="piece"?"pieces":"drawings";
    const uid=record.uid;
    const name=item.name||visibleId;
    const storagePath="migration-"+CENTRAL_DB.batchId+"/"+folder+"/"+uid+"/"+name;
    const m=String(item.data||"").match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s);
    if(!m)throw new Error("Archivo inválido: "+item.key);
    const bin=atob(m[2]),bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);

    const res=await fetch(CENTRAL_DB.url+"/storage/v1/object/reference-media/"+storagePath,{
      method:"POST",
      headers:{
        "apikey":CENTRAL_DB.publishableKey,
        "x-upsert":"true",
        "x-migration-key":migrationKey,
        "Content-Type":item.type||m[1]||"application/octet-stream"
      },
      body:bytes
    });
    const txt=await res.text();
    if(!res.ok)throw new Error("No se pudo subir "+item.key+": "+txt);

    const raw=await crypto.subtle.digest("SHA-256",bytes);
    const hash=[...new Uint8Array(raw)].map(b=>b.toString(16).padStart(2,"0")).join("");
    const mediaRow={
      role:kind==="piece"?"piece_photo":"drawing_file",
      original_filename:item.name||null,mime_type:item.type||m[1]||null,byte_size:bytes.length,
      sha256:hash,storage_path:storagePath,source_local_key:item.key,
      original_last_modified:item.lastModified||null,metadata:{backup_name:item.name||null},
      migration_batch_id:CENTRAL_DB.batchId
    };
    if(kind==="piece")mediaRow.piece_uid=uid;else mediaRow.drawing_uid=uid;
    await centralRest("media_assets?on_conflict=storage_path",{
      method:"POST",migrationKey,body:[mediaRow],prefer:"resolution=merge-duplicates"
    });
  }

  async function countCentral(table,migrationKey){
    const res=await fetch(CENTRAL_DB.url+"/rest/v1/"+table+"?select=uid&migration_batch_id=eq."+CENTRAL_DB.batchId,{
      headers:{
        "apikey":CENTRAL_DB.publishableKey,
        "x-migration-key":migrationKey,
        "Prefer":"count=exact",
        "Range":"0-0"
      }
    });
    if(!res.ok)throw new Error(await res.text());
    const range=res.headers.get("content-range")||"";
    const n=parseInt(range.split("/")[1],10);
    return Number.isFinite(n)?n:0;
  }

  if($("centralBackupFile")) $("centralBackupFile").onchange=e=>{
    const f=e.target.files?.[0];
    const box=$("centralBackupName");
    if(box){
      if(f){
        box.textContent="Archivo seleccionado: "+f.name+" · "+(f.size/1024/1024).toFixed(1)+" MB";
        box.classList.add("has-file");
      }else{
        box.textContent="Ningún archivo seleccionado";
        box.classList.remove("has-file");
      }
    }
    const status=$("centralMigrationStatus");
    if(status) status.textContent=f?"Respaldo listo para verificar y migrar.":"";
  };

  if($("migrateCentralBtn")) $("migrateCentralBtn").onclick=async()=>{
    const file=$("centralBackupFile")?.files?.[0];
    const key=$("centralMigrationKey")?.value?.trim();
    const status=$("centralMigrationStatus"),progress=$("centralMigrationProgress");
    if(!file){if(status)status.textContent="Seleccioná el respaldo maestro.";return;}
    if(!key){if(status)status.textContent="Ingresá la clave de migración.";return;}
    try{
      if(status)status.textContent="Verificando respaldo maestro…";
      const rawText=await file.text();
      const hash=await sha256Hex(rawText.replace(/^\uFEFF/,""));
      if(hash!==CENTRAL_DB.backupSha256)throw new Error("Este archivo no coincide con el respaldo maestro auditado.");
      const payload=JSON.parse(rawText.replace(/^\uFEFF/,""));
      if(payload?.format!=="muestra-referencia-full-backup")throw new Error("El archivo no es un respaldo completo válido.");
      if((payload.data?.pieces||[]).length!==40 || (payload.data?.fields||[]).length!==56 || (payload.data?.designs||[]).length!==55 || (payload.media||[]).length!==95){
        throw new Error("Los conteos no coinciden con el respaldo maestro auditado (40/56/55/95).");
      }

      if(status)status.textContent="Cargando 40 piezas…";
      await centralRest("pieces?on_conflict=uid",{method:"POST",migrationKey:key,body:payload.data.pieces.map(centralPieceRow),prefer:"resolution=merge-duplicates"});
      if(status)status.textContent="Cargando 56 campos…";
      await centralRest("fields?on_conflict=uid",{method:"POST",migrationKey:key,body:payload.data.fields.map(centralFieldRow),prefer:"resolution=merge-duplicates"});
      if(status)status.textContent="Cargando 55 dibujos…";
      await centralRest("drawings?on_conflict=uid",{method:"POST",migrationKey:key,body:payload.data.designs.map(centralDrawingRow),prefer:"resolution=merge-duplicates"});

      if(progress){progress.max=payload.media.length;progress.value=0;progress.classList.remove("hidden");}
      let done=0;
      for(const item of payload.media){
        if(status)status.textContent="Subiendo fotografías y dibujos: "+done+"/"+payload.media.length+"…";
        await uploadCentralMedia(item,payload,key);
        done++;
        if(progress)progress.value=done;
      }

      if(status)status.textContent="Verificando la base central…";
      const counts={
        pieces:await countCentral("pieces",key),
        fields:await countCentral("fields",key),
        drawings:await countCentral("drawings",key),
        media:await countCentral("media_assets",key)
      };
      const ok=counts.pieces===40&&counts.fields===56&&counts.drawings===55&&counts.media===95;
      if(!ok)throw new Error("La verificación final no coincide: "+JSON.stringify(counts));
      if(status)status.textContent="✓ Migración verificada: 40 piezas · 56 campos · 55 dibujos · 95 archivos.";
      toast("Base central migrada y verificada");
    }catch(err){
      console.error(err);
      if(status)status.textContent="Error de migración: "+err.message;
    }
  };

  if($("importFullBackup")) $("importFullBackup").onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    const status=$("fullBackupStatus"); if(status)status.textContent="Importando respaldo…";
    try{
      const payload=JSON.parse(await f.text());
      if(payload?.format!=="muestra-referencia-full-backup" || !payload.data) throw new Error("Formato de respaldo completo inválido");
      data=migrateData(payload.data);
      for(const item of payload.media||[]){
        await putFile(item.key,dataUrlToFile(item.data,item.name,item.type));
      }
      saveData();refreshPieceSelect();renderPieceList();renderDesignList();renderCatalog();
      if(selectedPieceId && data.pieces.some(p=>p.id===selectedPieceId))loadPieceForm(selectedPieceId);
      else if(data.pieces[0])loadPieceForm(data.pieces[0].id);
      if(status)status.textContent="Importación completa: "+(payload.media||[]).length+" archivo(s).";
      toast("Respaldo completo importado");
    }catch(err){
      console.error(err);if(status)status.textContent="Error: "+err.message;
    }
    e.target.value="";
  };

  $("importJson").onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{const obj=JSON.parse(await f.text());if(!obj.pieces||!obj.designs)throw new Error("Formato inválido");data=migrateData(obj);saveData();refreshPieceSelect();renderPieceList();renderDesignList();renderCatalog();toast("Respaldo importado y actualizado");}catch(err){alert("No se pudo importar el archivo: "+err.message);}e.target.value="";
  };

  async function renumberDrawingsOnly(){
    const pieceRank=new Map(orderedPieces().map((p,i)=>[p.uid||p.id,i]));
    const fieldRank=new Map();
    [...data.fields]
      .sort((a,b)=>{
        const pa=pieceRank.get(a.piece_uid||data.pieces.find(p=>p.id===a.piece_id)?.uid||a.piece_id)??999999;
        const pb=pieceRank.get(b.piece_uid||data.pieces.find(p=>p.id===b.piece_id)?.uid||b.piece_id)??999999;
        if(pa!==pb)return pa-pb;
        const ca=+(String(a.catalog_code||"").match(/\d+/)?.[0]||999);
        const cb=+(String(b.catalog_code||"").match(/\d+/)?.[0]||999);
        if(ca!==cb)return ca-cb;
        return numericId(a.id,"MR-C")-numericId(b.id,"MR-C");
      })
      .forEach((f,i)=>fieldRank.set(f.uid||f.id,i));

    const ordered=[...data.designs].sort((a,b)=>{
      const fa=data.fields.find(f=>f.id===a.field_id || (a.field_uid&&f.uid===a.field_uid));
      const fb=data.fields.find(f=>f.id===b.field_id || (b.field_uid&&f.uid===b.field_uid));
      const ra=fa?(fieldRank.get(fa.uid||fa.id)??999999):999999;
      const rb=fb?(fieldRank.get(fb.uid||fb.id)??999999):999999;
      if(ra!==rb)return ra-rb;
      return (a.created_order||numericId(a.id,"MR-D"))-(b.created_order||numericId(b.id,"MR-D"));
    });

    const map=new Map();
    ordered.forEach((d,i)=>map.set(d.id,"MR-D"+String(i+1).padStart(4,"0")));
    const moves=[];
    data.designs.forEach(d=>{
      const old=d.id,newId=map.get(old);
      if(old!==newId){
        moves.push([old,newId]);
        d.id_history=Array.isArray(d.id_history)?d.id_history:[];
        if(!d.id_history.includes(old))d.id_history.push(old);
        if(!d.legacy_id)d.legacy_id=old;
      }
    });

    for(const [oldId] of moves) await moveFileKey("design:"+oldId,"tmp-design:"+oldId);
    data.designs.forEach(d=>{d.id=map.get(d.id)||d.id;});
    data.fields.forEach(f=>{if(f.design_id)f.design_id=map.get(f.design_id)||f.design_id;});
    for(const [oldId,newId] of moves) await moveFileKey("tmp-design:"+oldId,"design:"+newId);

    data.designs.sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D"));
    selectedDesignId=map.get(selectedDesignId)||selectedDesignId;
    saveData();
    renderDesignList();
    renderCatalog();
    return moves.length;
  }

  async function movePieceToPosition(pieceId,targetPosition){
    const ordered=orderedPieces();
    const piece=ordered.find(p=>p.id===pieceId);if(!piece)return false;
    const target=Math.max(1,Math.min(ordered.length,parseInt(targetPosition,10)||1));
    const rest=ordered.filter(p=>p.uid!==piece.uid);
    rest.splice(target-1,0,piece);
    rest.forEach((p,i)=>p.display_order=i+1);
    await repairIdSequences();
    selectedPieceId=data.pieces.find(p=>p.uid===piece.uid)?.id||selectedPieceId;
    loadPieceForm(selectedPieceId);
    return true;
  }

  if($("movePieceBtn")) $("movePieceBtn").onclick=async()=>{
    const p=data.pieces.find(x=>x.id===selectedPieceId);if(!p)return;
    // Save the group choice before moving.
    p.sample_group=$("p_group")?.value||p.sample_group||"sin_clasificar";
    const target=$("p_order")?.value;
    if(!target){toast("Indicá una posición");return;}
    await movePieceToPosition(p.id,target);
    toast("Pieza movida a la posición "+target+"; IDs relacionados actualizados");
  };

  async function applyPendingCommands(){
    const pending=data.meta?.pending_commands||[];
    if(!pending.length)return;
    for(const cmd of [...pending]){
      try{
        if(cmd.type==="move_piece"){
          let p=data.pieces.find(x=>x.id===cmd.piece || x.uid===cmd.piece || (x.id_history||[]).includes(cmd.piece) || x.legacy_id===cmd.piece);
          if(p){
            if(cmd.group)p.sample_group=cmd.group;
            await movePieceToPosition(p.id,cmd.position||p.display_order||1);
          }
        }else if(cmd.type==="set_piece_group"){
          const p=data.pieces.find(x=>x.id===cmd.piece || x.uid===cmd.piece || (x.id_history||[]).includes(cmd.piece) || x.legacy_id===cmd.piece);
          if(p && cmd.group){p.sample_group=cmd.group;saveData();}
        }else if(cmd.type==="reindex_ids"){
          await repairIdSequences();
        }else if(cmd.type==="renumber_drawings"){
          await renumberDrawingsOnly();
        }else if(cmd.type==="cleanup_renumber_drawings"){
          await cleanupEmptyOrphanDrawings();
          await renumberDrawingsOnly();
        }
        data.meta.applied_commands=data.meta.applied_commands||[];
        if(!data.meta.applied_commands.includes(cmd.id))data.meta.applied_commands.push(cmd.id);
        data.meta.pending_commands=data.meta.pending_commands.filter(x=>x.id!==cmd.id);
        saveData();
      }catch(err){
        console.error("No se pudo aplicar comando",cmd,err);
      }
    }
  }

  async function cleanupEmptyOrphanDrawings(){
    const keep=[];
    let removed=0;
    for(const d of data.designs){
      const linkedField=data.fields.find(f=>f.id===d.field_id);
      if(linkedField){ keep.push(d); continue; }
      const hasFile=!!(await getFile("design:"+d.id));
      const hasData=!!(
        d.design_file_name || d.esquema || d.clase_simetria ||
        d.colores || d.observaciones || d.campo_decorativo || d.campo_otro ||
        d.tecnica_otro || (d.tecnicas||[]).length || hasFile
      );
      if(hasData){ keep.push(d); continue; }
      removed++;
    }
    if(removed){
      data.designs=keep;
      saveData();
      renderDesignList();
      refreshStats();
    }
    return removed;
  }

  function numericId(id,prefix){
    const n=parseInt(String(id||"").replace(prefix,""),10);
    return Number.isFinite(n)?n:999999;
  }

  function idSequenceProblems(){
    const problems=[];
    const pieceSorted=[...data.pieces].sort((a,b)=>numericId(a.id,"MR-P")-numericId(b.id,"MR-P"));
    pieceSorted.forEach((p,i)=>{
      const expected="MR-P"+String(i+1).padStart(4,"0");
      if(p.id!==expected) problems.push("Piezas: se esperaba "+expected+" y existe "+p.id);
    });

    const fieldSorted=[...data.fields].sort((a,b)=>numericId(a.id,"MR-C")-numericId(b.id,"MR-C"));
    fieldSorted.forEach((f,i)=>{
      const expected="MR-C"+String(i+1).padStart(4,"0");
      if(f.id!==expected) problems.push("Campos: se esperaba "+expected+" y existe "+f.id);
    });

    const drawingSorted=[...data.designs].sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D"));
    drawingSorted.forEach((d,i)=>{
      const expected="MR-D"+String(i+1).padStart(4,"0");
      if(d.id!==expected) problems.push("Dibujos: se esperaba "+expected+" y existe "+d.id);
    });
    return problems;
  }

  async function repairIdSequences(){
    // Un único reindexado controlado: preserva el ID anterior en legacy_id
    // y mueve también las imágenes guardadas en IndexedDB.
    const pieceOrder=[...data.pieces].sort((a,b)=>(+a.display_order||999999)-(+b.display_order||999999) || (a.created_order||numericId(a.id,"MR-P"))-(b.created_order||numericId(b.id,"MR-P")));
    const pieceMap=new Map();
    pieceOrder.forEach((p,i)=>pieceMap.set(p.id,"MR-P"+String(i+1).padStart(4,"0")));

    const fieldOrder=[...data.fields].sort((a,b)=>{
      const pa=pieceOrder.findIndex(p=>p.id===a.piece_id), pb=pieceOrder.findIndex(p=>p.id===b.piece_id);
      if(pa!==pb)return pa-pb;
      const ca=String(a.catalog_code||"").match(/\d+/)?.[0]||999;
      const cb=String(b.catalog_code||"").match(/\d+/)?.[0]||999;
      if(+ca!==+cb)return +ca-+cb;
      return (a.created_order||numericId(a.id,"MR-C"))-(b.created_order||numericId(b.id,"MR-C"));
    });
    const fieldMap=new Map();
    fieldOrder.forEach((f,i)=>fieldMap.set(f.id,"MR-C"+String(i+1).padStart(4,"0")));

    const drawingOrder=[...data.designs].sort((a,b)=>{
      const fa=fieldOrder.findIndex(f=>f.id===a.field_id), fb=fieldOrder.findIndex(f=>f.id===b.field_id);
      const aLinked=fa>=0, bLinked=fb>=0;
      // Los dibujos realmente vinculados a campos de la muestra ocupan primero
      // la secuencia MR-D. Los registros históricos/no vinculados quedan después.
      if(aLinked!==bLinked)return aLinked?-1:1;
      if(aLinked && fa!==fb)return fa-fb;
      return (a.created_order||numericId(a.id,"MR-D"))-(b.created_order||numericId(b.id,"MR-D"));
    });
    const drawingMap=new Map();
    drawingOrder.forEach((d,i)=>drawingMap.set(d.id,"MR-D"+String(i+1).padStart(4,"0")));

    // Save old references before mutation.
    const pieceMediaMoves=[];
    const drawingMediaMoves=[];
    data.pieces.forEach(p=>{
      const old=p.id,newId=pieceMap.get(old);
      if(old!==newId) pieceMediaMoves.push([old,newId]);
      if(old!==newId){
        if(!p.legacy_id) p.legacy_id=old;
        p.id_history=Array.isArray(p.id_history)?p.id_history:[];
        if(!p.id_history.includes(old))p.id_history.push(old);
      }
      p.id=newId;
      p.display_order=pieceOrder.findIndex(x=>x.uid===p.uid)+1;
    });
    data.fields.forEach(f=>{
      const old=f.id,newId=fieldMap.get(old);
      if(old!==newId){
        if(!f.legacy_id) f.legacy_id=old;
        f.id_history=Array.isArray(f.id_history)?f.id_history:[];
        if(!f.id_history.includes(old))f.id_history.push(old);
      }
      f.id=newId;
      f.piece_id=pieceMap.get(f.piece_id)||f.piece_id;
      f.piece_uid=data.pieces.find(p=>p.id===f.piece_id)?.uid||f.piece_uid||"";
      if(f.design_id) f.design_id=drawingMap.get(f.design_id)||f.design_id;
    });
    data.designs.forEach(d=>{
      const old=d.id,newId=drawingMap.get(old);
      if(old!==newId) drawingMediaMoves.push([old,newId]);
      if(old!==newId){
        if(!d.legacy_id) d.legacy_id=old;
        d.id_history=Array.isArray(d.id_history)?d.id_history:[];
        if(!d.id_history.includes(old))d.id_history.push(old);
      }
      d.id=newId;
      d.piece_id=pieceMap.get(d.piece_id)||d.piece_id;
      d.field_id=fieldMap.get(d.field_id)||d.field_id;
      d.piece_uid=data.pieces.find(p=>p.id===d.piece_id)?.uid||d.piece_uid||"";
      d.field_uid=data.fields.find(f=>f.id===d.field_id)?.uid||d.field_uid||"";
    });

    // Move media via temporary keys to avoid collisions.
    for(const [oldId] of pieceMediaMoves) await moveFileKey("piece:"+oldId,"tmp-piece:"+oldId);
    for(const [oldId] of drawingMediaMoves) await moveFileKey("design:"+oldId,"tmp-design:"+oldId);
    for(const [oldId,newId] of pieceMediaMoves) await moveFileKey("tmp-piece:"+oldId,"piece:"+newId);
    for(const [oldId,newId] of drawingMediaMoves) await moveFileKey("tmp-design:"+oldId,"design:"+newId);

    data.pieces.sort((a,b)=>numericId(a.id,"MR-P")-numericId(b.id,"MR-P"));
    data.fields.sort((a,b)=>numericId(a.id,"MR-C")-numericId(b.id,"MR-C"));
    data.designs.sort((a,b)=>numericId(a.id,"MR-D")-numericId(b.id,"MR-D"));
    selectedPieceId=pieceMap.get(selectedPieceId)||data.pieces[0]?.id||"";
    selectedDesignId=drawingMap.get(selectedDesignId)||data.designs[0]?.id||"";
    saveData();
    refreshPieceSelect();
    renderPieceList();
    renderDesignList();
    renderCatalog();
    if(selectedPieceId) loadPieceForm(selectedPieceId);
    return {pieces:pieceMediaMoves.length,fields:[...fieldMap].filter(([a,b])=>a!==b).length,drawings:drawingMediaMoves.length};
  }

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
      if(!p.uid) issues.push(p.id+" no tiene UID interno estable");
      if(!p.display_order) warnings.push(p.id+" no tiene posición de muestra");
      if(!p.sample_group) warnings.push(p.id+" no tiene grupo de muestra");
    });

    data.fields.forEach(f=>{
      if(fieldIds.has(f.id)) issues.push("ID de campo duplicado: "+f.id);
      fieldIds.add(f.id);
      const independent=(f.source_type==="independent" || (!f.piece_id&&!f.piece_uid));
      const p=data.pieces.find(x=>x.id===f.piece_id);
      if(!independent && !p) issues.push(f.id+" apunta a una pieza inexistente: "+(f.piece_id||"(vacío)"));
      if(independent && (f.piece_id||f.piece_uid)) issues.push(f.id+" es independiente pero conserva vínculo de pieza");
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

    const seq=idSequenceProblems();
    seq.forEach(x=>warnings.push("Secuencia ID: "+x));
    return {issues,warnings};
  }

  if($("runAudit")) $("runAudit").onclick=async()=>{
    const r=auditDatabase();
    const drafts=data.designs.filter(isEmptyDrawingDraft).length;
    const box=$("auditSummary");
    box.innerHTML='<em>Auditoría de solo lectura: no elimina ni renumera registros.</em>'+
      '<strong>'+r.issues.length+' problema(s) crítico(s)</strong><span>'+r.warnings.length+' advertencia(s) · '+drafts+' borrador(es) vacío(s)</span>'+
      (r.issues.length?'<details><summary>Ver problemas</summary><ul>'+r.issues.slice(0,80).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></details>':'')+
      (r.warnings.length?'<details><summary>Ver advertencias</summary><ul>'+r.warnings.slice(0,80).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></details>':'')+
      (!r.issues.length?'<em>Las relaciones estructurales principales son coherentes.</em>':'');
  };

  if($("repairIds")) $("repairIds").onclick=()=>{
    const seq=idSequenceProblems();
    const box=$("auditSummary");
    if(!seq.length){toast("Los IDs ya son correlativos");return;}
    box.innerHTML='<em>Vista previa solamente. No se modificó ningún ID.</em><strong>'+seq.length+' diferencia(s) de secuencia</strong><details open><summary>Ver diferencias</summary><ul>'+seq.slice(0,120).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></details>';
    toast("Se preparó la vista previa; no se renumeró nada");
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

  if($("authButton"))$("authButton").onclick=()=>{$("authDialog")?.showModal();refreshAuthUI();};
  if($("closeAuthDialog"))$("closeAuthDialog").onclick=()=>$("authDialog")?.close();
  if($("loginBtn"))$("loginBtn").onclick=async()=>{
    const email=$("authEmail").value.trim(),password=$("authPassword").value;
    const st=$("authStatus");if(st)st.textContent="Iniciando sesión…";
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error){if(st)st.textContent=error.message;return;}
    if(st)st.textContent="";await refreshAuthUI();
  };
  if($("signupBtn"))$("signupBtn").onclick=async()=>{
    const email=$("authEmail").value.trim(),password=$("authPassword").value;
    const st=$("authStatus");if(st)st.textContent="Creando cuenta…";
    const {data:sign,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
    if(error){if(st)st.textContent=error.message;return;}
    if(st)st.textContent=sign.session?"Cuenta creada.":"Cuenta creada. Revisá tu email para confirmar y después iniciá sesión.";
    await refreshAuthUI();
  };
  if($("claimEditorBtn"))$("claimEditorBtn").onclick=async()=>{
    const code=$("editorSetupCode").value.trim();
    const {data:ok,error}=await supabaseClient.rpc("claim_editor",{setup_code:code});
    if(error){$("authEditorState").textContent=error.message;return;}
    if(ok){$("editorSetupCode").value="";await refreshAuthUI();toast("Edición central activada");}
  };
  if($("logoutBtn"))$("logoutBtn").onclick=async()=>{await supabaseClient.auth.signOut();await refreshAuthUI();};
  supabaseClient?.auth.onAuthStateChange(()=>setTimeout(refreshAuthUI,0));

  async function initApp(){
    const loaded=await loadCentralData();
    if(loaded){
      setEditingEnabled(false);
      await refreshAuthUI();
    }
    refreshStats();
    renderPieceList();renderDesignList();loadPieceForm(selectedPieceId);renderCatalog();
    if(!loaded)applyPendingCommands();
  }
  // Initial render
  initApp();
})();