(() => {
  const source = {"url":"https://flgphfyywoflvlvkeewe.supabase.co","key":"sb_publishable_s71OVIx3xZ_AEAGg0D97nw_2TQrj9T5","bucket":"reference-media"};
  const $ = id => document.getElementById(id);
  const form = $("referenceFilters");
  const filters = Object.fromEntries(Array.from(form.querySelectorAll("select"), el => [el.name, el]));
  const collator = new Intl.Collator("es", {numeric:true});
  const viewer = $("referenceViewer");
  let references = [];
  let fragmentUrl = "";

  async function readTable(table, order, columns) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const params = new URLSearchParams({select:columns, order, limit:"500", offset:String(offset)});
      const response = await fetch(source.url + "/rest/v1/" + table + "?" + params, {
        headers:{apikey:source.key}
      });
      if (!response.ok) throw new Error("No se pudo consultar la muestra.");
      const page = await response.json();
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }

  function mediaUrl(path) {
    return path ? source.url + "/storage/v1/object/public/" + source.bucket + "/" +
      path.split("/").map(encodeURIComponent).join("/") : "";
  }

  const searchable = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  function schemeCode(value) {
    const match = String(value).trim().match(/^(?:E|esquema\s*)?(\d+[a-z]?)(?=$|[\s:–—,-])/i);
    return match ? "E" + match[1].toLowerCase() : "";
  }

  function openImage(url, label) {
    $("referenceImageTitle").textContent = label;
    const image = $("referenceFullImage");
    image.src = url;
    image.alt = label;
    viewer.showModal();
  }

  function preview(url, label) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = label;
    if (url) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Ampliar " + label);
      button.onclick = () => openImage(url, label);
      const image = document.createElement("img");
      image.loading = "lazy";
      image.alt = label;
      image.src = url;
      image.onerror = () => {
        button.remove();
        caption.textContent = label + " no disponible";
      };
      button.append(image);
      figure.append(button);
    } else {
      caption.textContent = label + " no disponible";
    }
    figure.append(caption);
    return figure;
  }

  function paragraph(content) {
    const p = document.createElement("p");
    p.className = "reference-caption";
    p.textContent = content;
    return p;
  }

  function card(ref) {
    const article = document.createElement("article");
    article.className = "reference-card";
    const title = document.createElement("h3");
    title.textContent = [ref.forma, ref.campo].filter(Boolean).join(" · ") || "Campo decorativo";
    const images = document.createElement("div");
    images.className = "reference-images";
    images.append(preview(ref.drawing, "Dibujo " + ref.drawingId), preview(ref.photo, "Foto " + ref.pieceId));
    article.append(title, images, paragraph([ref.pieceId, ref.fieldId, ref.sitio, ref.coleccion].filter(Boolean).join(" · ")));
    const attributes = [...ref.tecnica, ref.simetria].filter(Boolean);
    if (attributes.length) article.append(paragraph(attributes.join(" · ")));
    const schemas = paragraph(ref.schemes.length ? "Esquemas registrados · " : "Esquema pendiente de clasificación");
    ref.schemes.forEach((label, index) => {
      const code = schemeCode(label);
      if (index) schemas.append(" · ");
      if (!ref.titles.has(code)) {
        schemas.append(label);
        return;
      }
      const link = document.createElement("a");
      link.href = "../esquemas/galeria.html?esquema=" + encodeURIComponent(code);
      link.textContent = label;
      schemas.append(link);
    });
    article.append(schemas);
    return article;
  }

  function render() {
    const {forma, campo, tecnica, simetria, esquema} = Object.fromEntries(
      Object.entries(filters).map(([name, select]) => [name, select.value]));
    const query = searchable($("referenceSearch").value.trim());
    const matches = references.filter(ref =>
      (!forma || ref.forma === forma) && (!campo || ref.campo === campo) &&
      (!tecnica || ref.tecnica.includes(tecnica)) && (!simetria || ref.simetria === simetria) &&
      (!esquema || ref.codes.includes(esquema)) &&
      searchable([...ref.schemes, ...ref.codes.map(code => ref.titles.get(code)), ref.pieceId, ref.fieldId, ref.drawingId, ref.sitio, ref.coleccion].filter(Boolean).join(" ")).includes(query));
    const pieces = new Set(matches.map(ref => ref.pieceId));
    $("referenceCount").textContent = matches.length + " dibujos · " + pieces.size + " piezas";
    const list = $("referenceList");
    list.replaceChildren(...matches.map(card));
    if (!matches.length) list.append(paragraph("No hay referentes con esta combinación. Podés ampliar la búsqueda quitando un filtro."));
  }

  function populate(select, values, label = value => value) {
    for (const value of [...new Set(values.filter(Boolean))].sort(collator.compare)) {
      select.add(new Option(label(value), value));
    }
  }

  async function load() {
    const [pieces, fields, drawings, catalog] = await Promise.all([
      readTable("pieces", "uid", "uid,visible_id,forma,forma_otro,sitio,coleccion,photo_path"),
      readTable("fields", "uid", "uid,visible_id,piece_uid,nombre,nombre_otro,tecnicas,tecnica_otro,esquemas,clase_simetria"),
      readTable("drawings", "uid", "uid,visible_id,field_uid,drawing_path"),
      fetch("../esquemas/datos.json").then(response => {
        if (!response.ok) throw new Error("No se pudo consultar el catálogo de esquemas.");
        return response.json();
      })
    ]);
    // Estos códigos aparecen con significados distintos en las dos nomenclaturas.
    const titles = new Map(catalog.esquemas
      .filter(scheme => !/^E(?:2[7-9]|3[0-2])$/.test(scheme.code))
      .map(scheme => [scheme.code, scheme.title]));
    const pieceById = new Map(pieces.map(piece => [piece.uid, piece]));
    const fieldById = new Map(fields.map(field => [field.uid, field]));
    references = drawings.flatMap(drawing => {
      const field = fieldById.get(drawing.field_uid);
      const piece = pieceById.get(field?.piece_uid);
      if (!field || !piece) return [];
      const schemes = [...new Set((field.esquemas || []).map(value => String(value).trim()).filter(Boolean))];
      return [{
        pieceId:piece.visible_id, fieldId:field.visible_id, drawingId:drawing.visible_id,
        forma:piece.forma_otro || piece.forma, campo:field.nombre_otro || field.nombre,
        tecnica:[...(field.tecnicas || []), field.tecnica_otro].filter(Boolean),
        simetria:field.clase_simetria, sitio:piece.sitio, coleccion:piece.coleccion,
        schemes, codes:[...new Set(schemes.map(schemeCode).filter(Boolean))], titles,
        drawing:mediaUrl(drawing.drawing_path), photo:mediaUrl(piece.photo_path)
      }];
    }).sort((a,b) => collator.compare(a.drawingId,b.drawingId));
    const unlinkedCount = drawings.length - references.length;
    $("referenceUnlinked").textContent = unlinkedCount ? unlinkedCount + " dibujos requieren un vínculo con pieza y campo para incluirse en la búsqueda." : "";
    populate(filters.forma, references.map(ref => ref.forma));
    populate(filters.campo, references.map(ref => ref.campo));
    populate(filters.tecnica, references.flatMap(ref => ref.tecnica));
    populate(filters.simetria, references.map(ref => ref.simetria));
    populate(filters.esquema, references.flatMap(ref => ref.codes), code => [code,titles.get(code)].filter(Boolean).join(" · "));
    render();
  }

  form.onchange = render;
  $("referenceSearch").oninput = render;
  form.onreset = () => setTimeout(render);
  $("fragmentPhoto").onchange = event => {
    if (fragmentUrl) URL.revokeObjectURL(fragmentUrl);
    const file = event.target.files[0];
    fragmentUrl = file ? URL.createObjectURL(file) : "";
    $("openFragmentPhoto").hidden = !file;
    if (file) $("fragmentPreview").src = fragmentUrl;
    else $("fragmentPreview").removeAttribute("src");
  };
  $("openFragmentPhoto").onclick = () => openImage(fragmentUrl, "Foto del fragmento");
  load().catch(error => {
    console.error(error);
    $("referenceCount").textContent = "No se pudo cargar la muestra.";
  });
})();
