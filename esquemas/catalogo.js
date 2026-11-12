window.MR_ESQUEMAS = (() => {
  const codePattern = /^E\d+[a-z]?$/i;
  const $ = id => document.getElementById(id);

  const publishedKey = code => "scheme:published:" + code;

  function withPublished(existing, published) {
    const schemes = Array.isArray(existing) ? [...existing] : [];
    for (const entry of published) {
      const index = schemes.findIndex(scheme => scheme.code === entry.code || scheme.aliases?.includes(entry.code));
      const mediaKey = publishedKey(entry.code);
      if (index === -1) {
        schemes.push({uid:"published:" + entry.code, code:entry.code, title:entry.title,
          family:"", criteria:"", aliases:[], mediaKey, revisions:[],
          filename:entry.filename, inkscape:entry.inkscape});
      } else {
        const stored = schemes[index];
        if ((!stored.mediaKey && stored.code === entry.code) || stored.mediaKey === mediaKey) {
          schemes[index] = {...stored, mediaKey, filename:entry.filename, inkscape:entry.inkscape};
        }
      }
    }
    return schemes;
  }

  const searchable = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  function normalizeCode(value) {
    const code = String(value || "").trim();
    return codePattern.test(code) ? "E" + code.slice(1).toLowerCase() : "";
  }

  function recordedCode(value) {
    const code = String(value || "").trim().match(/^E\d+[a-z]?(?=$|[\s:–—-])/i)?.[0];
    return normalizeCode(code);
  }

  function fileCode(name) {
    const match = name.match(/^(?:esquema[\s_-]*)?e?(\d+[a-z]?)(?=$|[\s_.-])/i);
    return match ? normalizeCode("E" + match[1]) : "";
  }

  function mount({ getData, save, getFile, putFile, deleteFile, openField }) {
    let selected = "";
    let rendering = 0;
    let busy = false;
    const gallery = $("schemeGallery");
    const form = $("schemeForm");
    const status = $("schemeStatus");

    const records = () => getData().schemes || [];
    const sorted = () => [...records()].sort((a, b) => a.code.localeCompare(b.code, "es", {numeric:true}));
    const active = () => records().find(scheme => scheme.uid === selected);
    const codes = scheme => [scheme.code, ...(scheme.aliases || [])];
    const getByCode = code => records().find(scheme => codes(scheme).includes(code));

    function occurrences(scheme) {
      const accepted = codes(scheme);
      return getData().fields.filter(field => (field.esquemas || []).some(value => accepted.includes(recordedCode(value))));
    }

    function button(label, action, style = "secondary") {
      const element = document.createElement("button");
      element.type = "button";
      element.className = style;
      element.textContent = label;
      element.onclick = action;
      return element;
    }

    function text(tag, value) {
      const element = document.createElement(tag);
      element.textContent = value;
      return element;
    }

    async function showImage(box, scheme) {
      box.replaceChildren(text("span", "Sin SVG"));
      if (!scheme?.mediaKey) return;
      const file = await getFile(scheme.mediaKey).catch(() => null);
      if (!box.isConnected || box.dataset.media !== scheme.mediaKey) return;
      if (!file) {
        box.replaceChildren(text("span", "SVG pendiente de restaurar"));
        return;
      }
      const image = document.createElement("img");
      const url = URL.createObjectURL(file);
      image.alt = scheme.code + (scheme.title ? " · " + scheme.title : "");
      image.onload = () => URL.revokeObjectURL(url);
      image.onerror = () => {
        URL.revokeObjectURL(url);
        box.replaceChildren(text("span", "No se pudo mostrar el SVG"));
      };
      box.replaceChildren(image);
      image.src = url;
    }

    function imageBox(scheme) {
      const box = document.createElement("div");
      box.className = "scheme-image";
      box.dataset.media = scheme?.mediaKey || "";
      if (scheme?.mediaKey) {
        queueMicrotask(() => showImage(box, scheme));
      } else {
        box.append(text("span", "Sin SVG"));
      }
      return box;
    }

    function render() {
      if (!$("esquemas").classList.contains("active")) return;
      const query = searchable($("schemeSearch").value.trim());
      const available = sorted();
      gallery.replaceChildren();
      const matches = available.filter(scheme => searchable([...codes(scheme), scheme.title, scheme.family, ...(scheme.inkscape?.labels || [])].join(" ")).includes(query));
      if (!matches.length) gallery.append(text("p", available.length ? "Sin coincidencias." : "Cargá tus SVG para iniciar el catálogo."));
      matches.forEach(scheme => {
        const card = document.createElement("article");
        card.className = "scheme-card";
        card.classList.toggle("selected", scheme.uid === selected);
        const label = [scheme.code, scheme.title].filter(Boolean).join(" · ");
        const fields = occurrences(scheme);
        const pieces = new Set(fields.map(field => field.piece_uid || field.piece_id).filter(Boolean));
        const preview = button("Ver " + label, () => view(scheme), "scheme-thumb");
        preview.setAttribute("aria-label", "Ver " + label);
        preview.replaceChildren(imageBox(scheme));
        card.append(preview, button(label, () => view(scheme)), text("small", pieces.size + " piezas · " + fields.length + " campos"));
        gallery.append(card);
      });
    }

    function updateUrl(scheme) {
      const url = new URL(location.href);
      if (scheme) url.searchParams.set("esquema", scheme.code);
      else url.searchParams.delete("esquema");
      history.replaceState(null, "", url);
    }

    function view(scheme) {
      selected = scheme.uid;
      updateUrl(scheme);
      $("schemeViewTitle").textContent = [scheme.code, scheme.title].filter(Boolean).join(" · ");
      $("schemeViewImage").replaceChildren(imageBox(scheme));
      $("schemeViewFile").textContent = scheme.filename ? "Archivo · " + scheme.filename : "";
      $("schemeViewCriteria").textContent = scheme.criteria || "";
      const labels = $("schemeViewLabels");
      labels.replaceChildren();
      for (const label of scheme.inkscape?.labels || []) labels.append(text("li", label));
      $("schemeViewSource").hidden = !labels.children.length && !scheme.inkscape?.images;
      const images = scheme.inkscape?.images;
      $("schemeViewPhotos").textContent = images ? "Imágenes incrustadas en el SVG · " + images : "";
      const fields = occurrences(scheme);
      $("schemeViewOccurrences").replaceChildren();
      for (const field of fields) {
        const item = text("li", "");
        item.append(button([field.piece_id, field.id, field.nombre].filter(Boolean).join(" · "), () => openField(field)));
        $("schemeViewOccurrences").append(item);
      }
      $("schemeViewFieldSection").hidden = !fields.length;
      $("editViewedScheme").onclick = () => {
        $("schemeViewDialog").close();
        edit(scheme.uid);
        $("schemeCode").focus();
      };
      if (!$("schemeViewDialog").open) $("schemeViewDialog").showModal();
    }

    function edit(uid = "") {
      selected = uid;
      const scheme = active();
      rendering += 1;
      updateUrl(scheme);
      $("schemeEditor").hidden = false;
      form.reset();
      $("schemeEditorTitle").textContent = scheme?.code || "Nuevo esquema";
      for (const [key, id] of [["code","schemeCode"],["title","schemeTitle"],["family","schemeFamily"],["criteria","schemeCriteria"]]) {
        $(id).value = scheme?.[key] || "";
      }
      const preview = $("schemePreview");
      preview.replaceChildren(imageBox(scheme));
      const list = $("schemeOccurrences");
      list.replaceChildren();
      for (const field of scheme ? occurrences(scheme) : []) {
        const item = document.createElement("li");
        item.append(button([field.piece_id, field.id, field.nombre].filter(Boolean).join(" · "), () => openField(field)));
        list.append(item);
      }
      $("schemeRevisions").replaceChildren(new Option("Seleccionar versión…", ""));
      (scheme?.revisions || []).forEach((revision, index) => {
        $("schemeRevisions").add(new Option(revision.date.replace("T"," ").slice(0,16) + " · " + revision.code, String(index)));
      });
      $("schemeHistory").hidden = !scheme?.revisions?.length;
      render();
    }

    function snapshot(scheme) {
      const {revisions, ...entry} = scheme;
      return {...entry, date:new Date().toISOString()};
    }

    async function commit(schemes, uploadedKeys = []) {
      try {
        save(schemes);
      } catch (error) {
        await Promise.allSettled(uploadedKeys.map(deleteFile));
        throw error;
      }
    }

    async function storeSvg(file) {
      const documentSvg = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
      const root = documentSvg.documentElement;
      if (root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg" || documentSvg.querySelector("parsererror")) {
        throw new Error("SVG inválido");
      }
      const key = "scheme:" + crypto.randomUUID();
      await putFile(key, new File([file], file.name, {type:"image/svg+xml"}));
      const labels = [...root.getElementsByTagNameNS(root.namespaceURI, "text")]
        .map(node => node.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      return {mediaKey:key, filename:file.name, inkscape:{
        labels:[...new Set(labels)], images:root.getElementsByTagNameNS(root.namespaceURI, "image").length
      }};
    }

    async function run(action) {
      if (busy) return;
      busy = true;
      $("schemeSave").disabled = true;
      $("schemeBulk").disabled = true;
      status.textContent = "Guardando…";
      try {
        status.textContent = await action();
      } catch (error) {
        status.textContent = error.message || "No se pudo guardar el catálogo.";
      } finally {
        busy = false;
        $("schemeSave").disabled = false;
        $("schemeBulk").disabled = false;
      }
    }

    form.onsubmit = event => {
      event.preventDefault();
      const previous = active();
      const generation = rendering;
      const code = normalizeCode($("schemeCode").value);
      const title = $("schemeTitle").value.trim();
      const family = $("schemeFamily").value.trim();
      const criteria = $("schemeCriteria").value.trim();
      const file = $("schemeFile").files[0];
      run(async () => {
        if (!code) throw new Error("Usá un código como E7 o E27a.");
        const existing = getByCode(code);
        if (existing && existing.uid !== previous?.uid) throw new Error(code + " ya pertenece a otro esquema.");
        const media = file ? await storeSvg(file) : {mediaKey:previous?.mediaKey || "", filename:previous?.filename, inkscape:previous?.inkscape};
        const aliases = [...new Set(previous ? codes(previous).filter(value => value !== code) : [])];
        const scheme = {
          uid: previous?.uid || crypto.randomUUID(), code, title, family, criteria, aliases, ...media,
          revisions: previous ? [snapshot(previous), ...(previous.revisions || [])] : []
        };
        await commit([...records().filter(item => item.uid !== scheme.uid), scheme], file ? [media.mediaKey] : []);
        if (generation === rendering) edit(scheme.uid);
        else render();
        return code + " guardado.";
      });
    };

    $("schemeBulk").onchange = event => {
      const files = [...event.target.files];
      event.target.value = "";
      run(async () => {
        const additions = [];
        const pending = [];
        for (const file of files) {
          const code = fileCode(file.name);
          const previous = code && getByCode(code);
          if (!code || previous?.mediaKey || additions.some(item => codes(item).includes(code))) {
            pending.push(file.name);
            continue;
          }
          try {
            const media = await storeSvg(file);
            const scheme = previous
              ? {...previous, ...media, revisions:[snapshot(previous), ...(previous.revisions || [])]}
              : {uid:crypto.randomUUID(), code, title:"", family:"", criteria:"", aliases:[], ...media, revisions:[]};
            additions.push(scheme);
          } catch {
            pending.push(file.name);
          }
        }
        if (additions.length) {
          const retained = records().filter(item => !additions.some(scheme => scheme.uid === item.uid));
          await commit([...retained, ...additions], additions.map(scheme => scheme.mediaKey));
          render();
        }
        const result = additions.length + " SVG incorporados.";
        return pending.length ? result + " Revisá manualmente estos archivos: " + pending.join(", ") : result;
      });
    };

    $("restoreScheme").onclick = () => {
      const previous = active();
      const value = $("schemeRevisions").value;
      const revision = value === "" ? null : previous?.revisions?.[Number(value)];
      if (!revision) return;
      run(async () => {
        const {date, ...content} = revision;
        const restored = {
          ...content,
          aliases:[...new Set([...codes(previous), ...codes(content)].filter(code => code !== content.code))],
          revisions:[snapshot(previous), ...previous.revisions]
        };
        await commit(records().map(item => item.uid === restored.uid ? restored : item));
        edit(restored.uid);
        return restored.code + " restaurado.";
      });
    };

    $("newScheme").onclick = () => { edit(); $("schemeCode").focus(); };
    $("schemeSearch").oninput = render;
    $("closeSchemeEditor").onclick = () => {
      $("schemeEditor").hidden = true;
      $("newScheme").focus();
    };

    function show(code, open = false) {
      const scheme = getByCode(normalizeCode(code));
      render();
      if (scheme && open) view(scheme);
    }

    return {render, show};
  }

  return {mount, withPublished, publishedKey};
})();
