(() => {
  const $ = id => document.getElementById(id);
  const BASE_KEY = "mr_reference_data_v1";
  const CATALOG_KEY = "mr_catalog_schemes_v1";
  const DB_NAME = "muestra_referencia_catalogo_media";
  const FORMAT = "muestra-referencia-catalogo";
  const {mount, withPublished, publishedFiles} = window.MR_ESQUEMAS;

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function readBase() {
    const data = load(BASE_KEY);
    return Array.isArray(data?.fields) ? data : null;
  }

  let schemes = withPublished(load(CATALOG_KEY));
  let base = readBase();
  let database;

  function save(next) {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
    schemes = next;
  }

  function openDb() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("svg");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { database = null; reject(request.error); };
      });
    }
    return database;
  }

  async function fileOperation(mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("svg", mode);
      const request = operation(tx.objectStore("svg"));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = () => reject(tx.error || new Error("Operación de archivos interrumpida."));
    });
  }

  async function getFile(key) {
    const file = await fileOperation("readonly", store => store.get(key));
    if (file) return file;
    const name = publishedFiles.get(key);
    if (!name) return null;
    const response = await fetch("../assets/esquemas/" + name);
    if (!response.ok) throw new Error("No se pudo recuperar " + name);
    return new File([await response.blob()], name, {type:"image/svg+xml"});
  }

  function openField(field) {
    const piece = base?.pieces?.find(item => item.uid === field.piece_uid || item.id === field.piece_id);
    $("fieldLinkDetail").textContent = [field.piece_id, field.id, field.nombre, piece?.forma, piece?.sitio].filter(Boolean).join(" · ");
    $("fieldLinkDialog").showModal();
  }

  const controller = mount({
    getData: () => ({schemes, fields:base?.fields || []}),
    save, getFile, openField,
    putFile: (key, file) => fileOperation("readwrite", store => store.put(file, key)),
    deleteFile: key => fileOperation("readwrite", store => store.delete(key))
  });

  function refreshBase() {
    base = readBase();
    $("baseStatus").textContent = base
      ? "Vínculos consultados en la muestra guardada en este navegador."
      : "Abrí la base en este navegador para consultar sus campos vinculados.";
    controller.show(new URL(location.href).searchParams.get("esquema"));
  }

  window.addEventListener("storage", event => {
    if (event.key === BASE_KEY) refreshBase();
    if (event.key === CATALOG_KEY) {
      schemes = withPublished(load(CATALOG_KEY));
      controller.show(new URL(location.href).searchParams.get("esquema"));
    }
  });
  refreshBase();

  function encode(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function decode(item) {
    if (typeof item.key !== "string" || !item.key.startsWith("scheme:") ||
        typeof item.data !== "string" || !item.data.startsWith("data:image/svg+xml;base64,")) {
      throw new Error("Archivo SVG inválido en el respaldo.");
    }
    const bytes = Uint8Array.from(atob(item.data.split(",")[1]), char => char.charCodeAt(0));
    return new File([bytes], item.name || "esquema.svg", {type:"image/svg+xml"});
  }

  let backingUp = false;
  async function withBackupStatus(action) {
    if (backingUp) return;
    backingUp = true;
    $("backupCatalog").disabled = true;
    $("restoreCatalog").disabled = true;
    $("backupStatus").textContent = "Procesando…";
    try { $("backupStatus").textContent = await action(); }
    catch (error) { $("backupStatus").textContent = error.message || "No se pudo completar el respaldo."; }
    finally {
      backingUp = false;
      $("backupCatalog").disabled = false;
      $("restoreCatalog").disabled = false;
    }
  }

  $("backupCatalog").onclick = () => withBackupStatus(async () => {
    const snapshot = schemes;
    const keys = new Set(snapshot.flatMap(scheme => [scheme, ...(scheme.revisions || [])]).map(entry => entry.mediaKey).filter(Boolean));
    const files = await Promise.all([...keys].map(async key => {
      const file = await getFile(key);
      if (!file) throw new Error("Falta un SVG del catálogo. Restauralo antes de exportar.");
      return {key, name:file.name, data:await encode(file)};
    }));
    const blob = new Blob([JSON.stringify({format:FORMAT, schemes:snapshot, files})], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "respaldo_catalogo_esquemas.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return files.length + " SVG incluidos en el respaldo.";
  });

  $("restoreCatalog").onchange = event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    withBackupStatus(async () => {
      const payload = JSON.parse(await file.text());
      if (payload.format !== FORMAT || !Array.isArray(payload.schemes) || !Array.isArray(payload.files) ||
          payload.schemes.some(scheme => !scheme?.uid || typeof scheme.code !== "string")) {
        throw new Error("Elegí un respaldo del catálogo de esquemas.");
      }
      const files = payload.files.map(item => [item.key, decode(item)]);
      await fileOperation("readwrite", store => {
        for (const [key, svg] of files) store.put(svg, key);
      });
      save(withPublished(payload.schemes));
      controller.show(new URL(location.href).searchParams.get("esquema"));
      return "Catálogo restaurado.";
    });
  };
})();
