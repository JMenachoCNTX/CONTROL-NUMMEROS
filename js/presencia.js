/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Quién está conectado y qué hacen los demás (2.4.72)
   · Burbujas arriba (como Google Sheets): cada persona con CONTROL abierto,
     con la página donde está. Colección «presencia/{uid}» de CONTROL: cada
     pestaña avisa «sigo aquí» cada 60 s; se ve conectado si avisó hace < 2,5 min.
   · Avisos en vivo: lo que otra persona anota en la «bitácora» (planillas,
     excepciones, pagos…) sale como aviso abajo y queda en la campanita.
   · Si dos personas están en «Pagos pendientes», se avisa para coordinar.
   Sin la regla «presencia» publicada, las burbujas no aparecen y nada se rompe.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, esc = X.esc, ic = X.ic;
  var VIVO_MS = 150000, LATIDO_MS = 60000;
  var PR = { lista: [], quitar: null, quitarBit: null, latido: null, reloj: null, activo: false, sinPermiso: false,
    actividad: [], nuevas: 0, desde: 0, avisadoJuntos: '' };
  var COLORES = ['#235347', '#8E5B2E', '#3A5A8C', '#7A3E6B', '#2E7D6B', '#8C3A3A', '#5B6B2E', '#4B4B8C'];

  function color(t) { var h = 0; String(t || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 9973; }); return COLORES[h % COLORES.length]; }
  function iniciales(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase(); }
  function nombreCorto(x) { return x.nombre || String(x.correo || '').split('@')[0] || 'Alguien'; }
  function tituloPagina() { return String(document.title || '').split(' · ')[0] || ''; }
  function yo() { return S.usuario && S.usuario.uid; }

  /* ── Mi latido ── */
  function latir(salio) {
    if (!X.dbC || !yo() || PR.sinPermiso) return;
    X.dbC.collection('presencia').doc(yo()).set({
      correo: String(S.usuario.email || '').toLowerCase(), nombre: S.nombre || '', pagina: S.pagina || '', titulo: tituloPagina(),
      visto: X.servidor(), salio: !!salio
    }).catch(function (e) { if (/permission/i.test(e && e.message)) { PR.sinPermiso = true; detener(); } else console.warn('Presencia:', e); });
  }

  /* ── Burbujas ── */
  function vivos() {
    var ahora = Date.now();
    return PR.lista.filter(function (x) { var t = X.aFecha(x.visto); return !x.salio && t && ahora - t.getTime() < VIVO_MS; })
      .sort(function (a, b) { return (b._id === yo()) - (a._id === yo()) || nombreCorto(a).localeCompare(nombreCorto(b)); });
  }
  function pintar() {
    var el = document.getElementById('presencia'); if (!el) return;
    var l = vivos(), otros = l.filter(function (x) { return x._id !== yo(); });
    var bur = function (x) {
      var n = nombreCorto(x), aqui = x.pagina === S.pagina && x._id !== yo();
      return '<span class="pr-bur' + (aqui ? ' pr-aqui' : '') + '" style="background:' + color(x.correo) + '" title="' + esc(n + (x._id === yo() ? ' (tú)' : '') + ' · ' + (x.titulo || x.pagina || '') + ' · ' + X.hace(x.visto)) + '">' + esc(iniciales(n)) + '</span>';
    };
    el.innerHTML = otros.length ? '<span class="pr-lista" aria-label="Conectados ahora">' + otros.slice(0, 5).map(bur).join('') +
      (otros.length > 5 ? '<span class="pr-bur pr-mas">+' + (otros.length - 5) + '</span>' : '') + '</span>' : '';
    el.title = otros.length ? 'Conectados ahora: ' + otros.map(function (x) { return nombreCorto(x) + ' (' + (x.titulo || x.pagina) + ')'; }).join(', ') : '';
    // Dos personas en Pagos pendientes: avisar una vez (la planilla se genera desde ahí)
    var juntos = S.pagina === 'pagos' ? otros.filter(function (x) { return x.pagina === 'pagos'; }).map(nombreCorto) : [];
    var clave = juntos.join(',');
    if (clave && clave !== PR.avisadoJuntos) avisoGrande('👥 ' + juntos.join(' y ') + (juntos.length === 1 ? ' también está' : ' también están') + ' en Pagos pendientes. Coordinen antes de generar la planilla.');
    PR.avisadoJuntos = clave;
  }

  /* ── Actividad (bitácora en vivo) ── */
  function textoAct(x) { return x.que + (x.detalle ? ' · ' + x.detalle : ''); }
  function pintarCampana() {
    var b = document.getElementById('prCampana'); if (!b) return;
    var n = b.querySelector('.pr-num');
    if (PR.nuevas) { if (!n) { n = document.createElement('span'); n.className = 'pr-num'; b.appendChild(n); } n.textContent = PR.nuevas > 9 ? '9+' : PR.nuevas; }
    else if (n) n.remove();
  }
  function avisoGrande(msg) {
    var t = document.createElement('div');
    t.className = 'toast pr-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 6000);
  }
  function escucharActividad() {
    if (PR.quitarBit || !X.dbC) return;
    PR.desde = Date.now();
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    PR.quitarBit = X.dbC.collection('bitacora').where('cuando', '>=', firebase.firestore.Timestamp.fromDate(hoy)).orderBy('cuando', 'desc').limit(40)
      .onSnapshot(function (q) {
        var mio = String((S.usuario && S.usuario.email) || '').toLowerCase();
        PR.actividad = []; q.forEach(function (d) { var x = d.data(); if (x.que === 'Entró a CONTROL') return; PR.actividad.push(x); });
        q.docChanges().forEach(function (c) {
          if (c.type !== 'added' || c.doc.metadata.hasPendingWrites) return;
          var x = c.doc.data(), t = X.aFecha(x.cuando);
          if (!t || t.getTime() < PR.desde - 5000 || x.quien === mio || x.que === 'Entró a CONTROL') return;
          PR.nuevas++;
          avisoGrande('🔔 ' + (x.nombre || String(x.quien).split('@')[0]) + ': ' + textoAct(x).slice(0, 140));
        });
        pintarCampana();
      }, function (e) { console.warn('Actividad:', e); PR.quitarBit = null; });
  }
  function verActividad() {
    PR.nuevas = 0; pintarCampana();
    var l = PR.actividad, otros = vivos().filter(function (x) { return x._id !== yo(); });
    var cuerpo = '<div class="card mb"><div class="h2">Conectados ahora</div>' + (otros.length
      ? otros.map(function (x) { return '<div class="pr-fila"><span class="pr-bur" style="background:' + color(x.correo) + '">' + esc(iniciales(nombreCorto(x))) + '</span><div><b>' + esc(nombreCorto(x)) + '</b><span class="sub">' + esc(x.titulo || x.pagina || '') + ' · ' + esc(X.hace(x.visto)) + '</span></div></div>'; }).join('')
      : '<p class="muted">Solo tú' + (PR.sinPermiso ? ' (falta publicar la regla «presencia» de CONTROL)' : '') + '.</p>') + '</div>' +
      '<div class="card"><div class="h2">Actividad de hoy</div>' + (l.length
        ? l.map(function (x) { return '<div class="pr-fila"><span class="pr-bur" style="background:' + color(x.quien) + '">' + esc(iniciales(x.nombre || x.quien)) + '</span><div><b>' + esc(x.nombre || String(x.quien).split('@')[0]) + '</b> · ' + esc(x.que) +
          '<span class="sub">' + esc(X.fechaHora(x.cuando)) + (x.detalle ? ' · ' + esc(x.detalle) : '') + '</span></div></div>'; }).join('')
        : '<p class="muted">Todavía no hay movimientos hoy.</p>') + '</div>';
    X.cajon('Equipo en vivo', 'Quién está conectado y lo que se hizo hoy en CONTROL (de la bitácora).', cuerpo);
  }

  /* ── Arranque y cierre ── */
  function iniciar() {
    if (PR.activo || !X.dbC || !yo()) return;
    PR.activo = true;
    PR.quitar = X.dbC.collection('presencia').onSnapshot(function (q) {
      PR.lista = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; PR.lista.push(x); }); pintar();
    }, function (e) { if (/permission/i.test(e && e.message)) PR.sinPermiso = true; else console.warn('Presencia:', e); });
    latir();
    PR.latido = setInterval(function () { if (!document.hidden) latir(); }, LATIDO_MS);
    PR.reloj = setInterval(pintar, 30000);   // los que dejan de avisar desaparecen solos
    escucharActividad();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) latir(); });
    window.addEventListener('pagehide', function () { latir(true); });
  }
  function detener() {
    if (PR.quitar) { PR.quitar(); PR.quitar = null; }
    clearInterval(PR.latido); clearInterval(PR.reloj);
    pintar();
  }
  function cambioPagina() { if (PR.activo) { latir(); pintar(); pintarCampana(); } }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-accion="actividad"]')) verActividad(); });

  X.presencia = { iniciar: iniciar, cambioPagina: cambioPagina, salir: function () { latir(true); } };
})();
