window.MR_SEED = (() => {
  const pieceDesignMap = {
    "MR-P0001":["MR-D0001"], "MR-P0002":["MR-D0005"], "MR-P0003":["MR-D0006"],
    "MR-P0004":["MR-D0023"], "MR-P0005":["MR-D0027"], "MR-P0006":["MR-D0028"],
    "MR-P0007":["MR-D0030"], "MR-P0008":["MR-D0031","MR-D0032"],
    "MR-P0009":["MR-D0034","MR-D0035"], "MR-P0010":["MR-D0037","MR-D0038","MR-D0039"],
    "MR-P0011":["MR-D0040"], "MR-P0012":["MR-D0041","MR-D0042","MR-D0043"],
    "MR-P0013":["MR-D0045","MR-D0046","MR-D0047"], "MR-P0014":["MR-D0051"],
    "MR-P0015":["MR-D0052"], "MR-P0016":["MR-D0053"], "MR-P0017":["MR-D0054"],
    "MR-P0018":["MR-D0055"], "MR-P0019":["MR-D0056"], "MR-P0020":["MR-D0058"],
    "MR-P0021":["MR-D0059","MR-D0060"], "MR-P0022":["MR-D0061"],
    "MR-P0023":["MR-D0062","MR-D0063"], "MR-P0024":["MR-D0064"],
    "MR-P0025":["MR-D0065"], "MR-P0026":["MR-D0070"], "MR-P0027":["MR-D0071"],
    "MR-P0028":["MR-D0072"], "MR-P0029":["MR-D0073"], "MR-P0030":["MR-D0074"]
  };

  const pieceForDesign = {};
  Object.entries(pieceDesignMap).forEach(([pieceId, designIds]) => {
    designIds.forEach(designId => pieceForDesign[designId] = pieceId);
  });

  function originalRef(n) {
    if (n <= 53) return String(n);
    if (n === 54) return "54-A";
    if (n === 55) return "54-B";
    if (n === 56) return "55";
    if (n === 57) return "56-A";
    if (n === 58) return "56-B";
    return String(n - 2);
  }

  const pieces = Array.from({length:30}, (_,i) => {
    const id = `MR-P${String(i+1).padStart(4,"0")}`;
    return {
      id,
      caja:"",
      sigla:"",
      sitio:"",
      coleccion:"",
      publicacion:"",
      pagina:"",
      forma:"",
      forma_otro:"",
      integridad:"",
      observaciones:"",
      fotogrametria_url:"",
      photo_file_name:"",
      updated_at:""
    };
  });

  const designs = Array.from({length:74}, (_,i) => {
    const n=i+1;
    const id=`MR-D${String(n).padStart(4,"0")}`;
    return {
      id,
      ref_original: originalRef(n),
      piece_id: pieceForDesign[id] || "",
      field_id:"",
      campo_decorativo:"",
      campo_otro:"",
      tecnicas:[],
      tecnica_otro:"",
      esquema:"",
      clase_simetria:"",
      colores:"",
      observaciones:"",
      design_file_name:"",
      updated_at:""
    };
  });

  return {
    version:"0.2.0",
    schema_version:2,
    pieces,
    fields:[],
    designs,
    options:{
      formas:["Escudilla","Botella","Cántaro ovoide","Olla","Cuenco-Puco","Vaso","Vaso anular","Pipa","Urna","Otro"],
      integridad:["Completa","Semicompleta","Otro"],
      camposPorForma:{
        "Escudilla":["Borde externo","Cuerpo externo","Borde interno","Base","Asa","Otro"],
        "Cuenco-Puco":["Asa externo","Cuerpo externo","Borde externo","Borde interno","Base","Otro"],
        "Vaso":["Cuerpo externo","Borde externo","Otro"],
        "Vaso anular":["Cuerpo externo","Sector superior","Otro"],
        "Botella":["Cuerpo superior","Asa","Cuerpo","Cuello","Otro"],
        "Cántaro ovoide":["Asa","Cuerpo superior","Cuerpo","Cuello","Otro"],
        "Urna":["Cuello","Cuello inferior","Cuerpo","Otro"],
        "Olla":["Asa","Cuerpo superior","Cuerpo","Cuello","Otro"],
        "Pipa":["Parte frontal superior - Hornillo","Parte media-baja - Casoleta","Rama horizontal","Otro"],
        "Otro":["Otro"]
      },
      camposGenerales:["Borde externo","Cuerpo externo","Borde interno","Base","Asa","Cuerpo superior","Cuello","Cuello inferior","Sector superior","Parte frontal superior - Hornillo","Parte media-baja - Casoleta","Rama horizontal","Otro"],
      tecnicas:["Incisión","Pintura o engobe monocromo","Pintura bicolor","Modelada","Impresa","Acanalada","Corrugada","Agregado al pastillaje","Pintura tricolor","Peinado inciso","Otro"],
      simetrias:["d1","d2","d3","d4","d5","d6","c1","c2","c3","c4","c5","c6","pmm2","pma2","pm11","p1m1","p1a1","p112","p111","cm","pm","pg","p1","pmm","cmm","pmg","pgg","p2","p4m","p4g","p4","p3m1","p31m","p3","p6m","p6","Otro"]
    }
  };
})();