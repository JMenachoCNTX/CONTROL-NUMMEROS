/* Aviso de nueva versión (NUMMEROS)
   Cada 3 minutos (y al volver a la pestaña) revisa si la página o sus archivos .js/.css cambiaron en el servidor.
   Si cambiaron, muestra un aviso para actualizar. No hay que tocar nada al publicar: se detecta solo.
   Uso: <script src="version-aviso.js" defer></script>  (el mismo archivo sirve en cualquier sistema) */
(function () {
  if (!/^https?:$/.test(location.protocol) || location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  var CADA = 3 * 60 * 1000, base = null, avisado = false;

  function archivos() {
    var l = [location.pathname];
    document.querySelectorAll("script[src],link[rel=stylesheet][href]").forEach(function (e) {
      try { var u = new URL(e.getAttribute("src") || e.getAttribute("href"), location.href); if (u.origin === location.origin) l.push(u.pathname); } catch (x) {}
    });
    return l.filter(function (v, i) { return l.indexOf(v) === i; });
  }
  function huella(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ":" + h; }
  function leer() {
    return Promise.all(archivos().map(function (p) {
      return fetch(p + "?_v=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return null; });
    })).then(function (t) { return t.some(function (x) { return x === null; }) ? null : huella(t.join("\u0001")); });
  }
  function mostrar() {
    if (avisado) return; avisado = true;
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:14px;background:#0B2B26;color:#DAF1DE;box-shadow:0 10px 30px rgba(0,0,0,.35);font:500 14px/1.35 Arimo,Helvetica,Arial,sans-serif";
    d.innerHTML = '<span>🔄 Hay una <b>nueva versión</b> del sistema.</span>' +
      '<button type="button" style="border:0;border-radius:9px;padding:8px 14px;background:#8EB69B;color:#051F20;font:700 14px Arimo,Helvetica,Arial,sans-serif;cursor:pointer">Actualizar ahora</button>' +
      '<button type="button" aria-label="Cerrar" style="border:0;background:transparent;color:#DAF1DE;font-size:18px;cursor:pointer;padding:0 4px">✕</button>';
    var b = d.querySelectorAll("button");
    b[0].onclick = function () { location.reload(); };
    b[1].onclick = function () { d.remove(); avisado = false; };   // vuelve a avisar en la próxima revisión
    document.body.appendChild(d);
  }
  function revisar() {
    if (avisado || document.hidden) return;
    leer().then(function (h) {
      if (!h) return;
      if (base === null) { base = h; return; }
      if (h !== base) mostrar();
    });
  }
  setTimeout(revisar, 5000);
  setInterval(revisar, CADA);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) revisar(); });
})();
