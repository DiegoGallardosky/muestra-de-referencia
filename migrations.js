/* Versioned, non-destructive migrations for Muestra de referencia.
   Future instructions issued from ChatGPT can be encoded here as one-time
   commands. The application applies them to the user's local database on load. */
window.MR_MIGRATIONS = (() => {
  const CURRENT_SCHEMA = 6;

  const groups = [
    {value:"completa_accesible", label:"Completa / semicompleta y accesible"},
    {value:"otra_accesible", label:"Otra pieza con acceso directo"},
    {value:"solo_imagen", label:"Solo imagen / publicación"},
    {value:"sin_clasificar", label:"Sin clasificar"}
  ];

  // Future chat-directed operations are appended here.
  // Example:
  // {id:"move-piece-2026-10-04-01", type:"move_piece", piece:"MR-P0004", position:24}
  const commands = [
    {id:"reindex-linked-drawings-2026-10-04-01", type:"reindex_ids"},
    {id:"renumber-drawings-2026-10-06-01", type:"renumber_drawings"},
    {id:"cleanup-renumber-drawings-2026-10-06-02", type:"cleanup_renumber_drawings"}
  ];

  function numericSuffix(value){
    const m=String(value||"").match(/(\d+)$/);
    return m?parseInt(m[1],10):0;
  }

  function assignUid(records,prefix){
    let max=Math.max(0,...records.map(r=>numericSuffix(r.uid)));
    records.forEach(r=>{
      if(!r.uid){
        max+=1;
        r.uid=prefix+String(max).padStart(6,"0");
      }
    });
  }

  function upgrade(data){
    const d=data||{};
    d.pieces=Array.isArray(d.pieces)?d.pieces:[];
    d.fields=Array.isArray(d.fields)?d.fields:[];
    d.designs=Array.isArray(d.designs)?d.designs:[];
    d.meta=d.meta||{};
    d.meta.applied_commands=Array.isArray(d.meta.applied_commands)?d.meta.applied_commands:[];
    d.meta.pending_commands=Array.isArray(d.meta.pending_commands)?d.meta.pending_commands:[];

    assignUid(d.pieces,"PUID-");
    assignUid(d.fields,"CUID-");
    assignUid(d.designs,"DUID-");

    d.pieces.forEach((p,index)=>{
      if(!p.sample_group) p.sample_group="sin_clasificar";
      if(!Number.isFinite(+p.display_order) || +p.display_order<1) p.display_order=index+1;
      if(!Array.isArray(p.id_history)) p.id_history=p.legacy_id?[p.legacy_id]:[];
    });

    d.fields.forEach(f=>{
      const p=d.pieces.find(p=>p.id===f.piece_id || p.uid===f.piece_uid);
      if(p){
        f.piece_uid=p.uid;
        f.piece_id=p.id;
      }
      if(!Array.isArray(f.id_history)) f.id_history=f.legacy_id?[f.legacy_id]:[];
    });

    d.designs.forEach(des=>{
      const f=d.fields.find(f=>f.id===des.field_id || f.uid===des.field_uid);
      const p=f
        ? d.pieces.find(p=>p.uid===f.piece_uid || p.id===f.piece_id)
        : d.pieces.find(p=>p.id===des.piece_id || p.uid===des.piece_uid);
      if(f){
        des.field_uid=f.uid;
        des.field_id=f.id;
      }
      if(p){
        des.piece_uid=p.uid;
        des.piece_id=p.id;
      }
      if(!Array.isArray(des.id_history)) des.id_history=des.legacy_id?[des.legacy_id]:[];
    });

    for(const cmd of commands){
      if(!d.meta.applied_commands.includes(cmd.id) &&
         !d.meta.pending_commands.some(x=>x.id===cmd.id)){
        d.meta.pending_commands.push({...cmd});
      }
    }

    d.schema_version=Math.max(Number(d.schema_version)||0,CURRENT_SCHEMA);
    d.version="0.6.0";
    return d;
  }

  function newUid(kind,data){
    const map={piece:["PUID-",data.pieces||[]],field:["CUID-",data.fields||[]],design:["DUID-",data.designs||[]]};
    const [prefix,records]=map[kind]||["UID-",[]];
    const max=Math.max(0,...records.map(r=>numericSuffix(r.uid)));
    return prefix+String(max+1).padStart(6,"0");
  }

  return {CURRENT_SCHEMA,groups,commands,upgrade,newUid};
})();