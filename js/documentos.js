/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Documentos de los repartidores
   Lo que suben en «Mis documentos» del portal: NIT, Matrícula de Comercio
   (con vigencia), ROE, declaraciones mensuales (RCV, F-200, F-400) y estados
   financieros. Aquí se ve quién está completo y se aprueba u observa cada uno.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, ic = X.ic, entero = X.entero;
  var CFG = C.documentos || {};
  var TIPOS = { nit: 'Certificado de NIT', matricula: 'Matrícula de Comercio', roe: 'ROE', rcv: 'RCV', f200: 'Formulario 200 (IVA)', f400: 'Formulario 400 (IT)', eeff: 'Estados financieros' };
  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var DC = { filtro: 'revisar', buscar: '', pag: 0 };

  function mesCerrado() { var d = new Date(Date.now() - 4 * 3600e3), x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0'); }
  function nombrePeriodo(p) { var m = String(p || '').match(/^(\d{4})-(\d{2})$/); return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : String(p || ''); }
  function cargar() {
    if (!S.portalUsuario) { D.documentos = []; return Promise.resolve(); }
    return X.dbP.collection('documentos').get().then(function (q) {
      D.documentos = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; D.documentos.push(x); });
    }, function (e) { console.error('Documentos:', e); D.documentos = []; });
  }
  function matriculaOk(d) { return d && d.estado !== 'observado' && (!CFG.matriculaHasta || (d.vigencia && d.vigencia >= CFG.matriculaHasta)); }
  /* Resumen de un repartidor: qué tiene, qué falta y qué está por revisar */
  function resumen(r, lista) {
    var de = function (t, p) { return lista.filter(function (d) { return d.tipo === t && (!p || d.periodo === p); })[0] || null; };
    var mes = mesCerrado(), cli = X.clienteDe(r), mat = de('matricula');
    var ins = ['nit', 'roe'].map(function (t) { return de(t); }).concat([mat]);
    var mens = ['rcv', 'f200', 'f400'].map(function (t) { return de(t, mes); });
    var faltan = ins.filter(function (d) { return !d || d.estado === 'observado'; }).length + (matriculaOk(mat) ? 0 : (mat ? 1 : 0)) +
      (cli ? 0 : mens.filter(function (d) { return !d || d.estado === 'observado'; }).length);
    return { r: r, docs: lista, cli: cli, ins: ins, mat: mat, mens: mens, mes: mes, eeff: de('eeff', CFG.gestionEEFF),
      revisar: lista.filter(function (d) { return d.estado === 'recibido'; }).length, faltan: faltan, matVencida: !!mat && !matriculaOk(mat) };
  }
  function chipDoc(d, ok) {
    if (!d) return X.chip('mal', 'Falta');
    if (d.estado === 'aprobado' && ok !== false) return X.chip('ok', 'Aprobado');
    if (d.estado === 'observado') return X.chip('mal', 'Observado');
    if (ok === false) return X.chip('mal', 'Vencida');
    return X.chip('pend', 'Por revisar');
  }

  X.pagina('documentos', {
    t: 'Documentos', i: 'tramites', orden: 6, sec: 'Operación',
    cuenta: function () { return (D.documentos || []).filter(function (d) { return d.estado === 'recibido'; }).length; },
    render: function () {
      var cab = X.titulo('Documentos de repartidores', 'Lo que suben en «Mis documentos» del portal. Matrícula vigente hasta el ' + X.fecha(CFG.matriculaHasta) + ' · declaraciones de ' + nombrePeriodo(mesCerrado()) + '.');
      if (!S.portalUsuario) return cab + '<div class="card">' + X.vacio('Conecta el Portal para ver los documentos') + '</div>';
      if (!D.documentos || !D.repartidores) return cab + X.esqueleto(4);
      var porUid = {}; D.documentos.forEach(function (d) { (porUid[d.uid] = porUid[d.uid] || []).push(d); });
      var todos = Array.from(D.repartidores.values()).filter(function (r) { return !r.prueba; }).map(function (r) { return resumen(r, porUid[r.uid] || []); });
      var cuenta = { revisar: todos.filter(function (x) { return x.revisar; }).length, incompletos: todos.filter(function (x) { return x.faltan; }).length, vencida: todos.filter(function (x) { return x.matVencida; }).length, todos: todos.length };
      var b = X.normal(DC.buscar);
      var l = todos.filter(function (x) {
        if (DC.filtro === 'revisar' && !x.revisar) return false;
        if (DC.filtro === 'incompletos' && !x.faltan) return false;
        if (DC.filtro === 'vencida' && !x.matVencida) return false;
        return !b || (X.normal(x.r.nombre) + ' ' + x.r.id).indexOf(b) >= 0;
      }).sort(function (a, z) { return (z.revisar - a.revisar) || X.normal(a.r.nombre).localeCompare(X.normal(z.r.nombre)); });
      DC.lista = l;
      return cab + '<div class="card"><div class="pestanas" role="tablist">' + [['revisar', 'Por revisar'], ['incompletos', 'Incompletos'], ['vencida', 'Matrícula vencida'], ['todos', 'Todos']].map(function (p) {
          return '<button role="tab" aria-selected="' + (DC.filtro === p[0]) + '" data-fd="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(cuenta[p[0]]) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bDoc" placeholder="Buscar por nombre o ID" value="' + esc(DC.buscar) + '"></div></div>' +
        (l.length ? X.tabla([
          { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.r.nombre) + '</b><span class="sub num">ID ' + esc(x.r.id) + '</span>' + (x.cli ? X.chip('contax', 'Cliente CONTAX') : ''); } },
          { t: 'NIT · Matrícula · ROE', html: function (x) { return chipDoc(x.ins[0]) + ' ' + chipDoc(x.mat, x.mat ? matriculaOk(x.mat) : undefined) + ' ' + chipDoc(x.ins[1]); } },
          { t: 'Declaraciones ' + nombrePeriodo(mesCerrado()), html: function (x) { return x.cli ? '<span class="muted">Las presenta CONTAX</span>' : entero(x.mens.filter(Boolean).length) + ' de 3'; } },
          { t: 'EEFF ' + esc(CFG.gestionEEFF || ''), html: function (x) { return x.eeff ? chipDoc(x.eeff) : '<span class="muted">—</span>'; } },
          { t: 'Por revisar', clase: 'monto', html: function (x) { return x.revisar ? '<b>' + entero(x.revisar) + '</b>' : ''; } }
        ], l, { clic: true, pag: DC.pag }) : X.vacio('Nada que mostrar con este filtro')) + '</div>';
    },
    despues: function (el) {
      if (!D.documentos && S.portalUsuario) cargar().then(function () { if (S.pagina === 'documentos') X.refrescar(); });
      el.querySelectorAll('[data-fd]').forEach(function (b) { b.addEventListener('click', function () { DC.filtro = b.getAttribute('data-fd'); DC.pag = 0; X.refrescar(); }); });
      var bq = el.querySelector('#bDoc'); if (bq) bq.addEventListener('input', X.debounce(function () { DC.buscar = bq.value; DC.pag = 0; X.refrescar(); X.setFoco('#bDoc'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { DC.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var x = (DC.lista || [])[Number(tr.getAttribute('data-fila'))]; if (x) detalle(x.r); }); });
    }
  });

  function detalle(r) {
    var lista = (D.documentos || []).filter(function (d) { return d.uid === r.uid; })
      .sort(function (a, b) { return String(b.periodo || '').localeCompare(String(a.periodo || '')) || String(a.tipo).localeCompare(String(b.tipo)); });
    var c = X.cajon('Documentos · ' + esc(r.nombre), 'ID ' + esc(r.id), lista.length ? X.tabla([
      { t: 'Documento', html: function (d) { return '<b>' + esc(TIPOS[d.tipo] || d.tipo) + '</b>' + (d.periodo ? ' · ' + esc(nombrePeriodo(d.periodo)) : '') + '<span class="sub">' + esc(d.nombreArchivo || '') + ' · ' + X.fechaHora(d.subido) + '</span>' + (d.vigencia ? '<span class="sub">Vigente hasta ' + X.fecha(d.vigencia) + '</span>' : ''); } },
      { t: 'Estado', html: function (d) { return chipDoc(d, d.tipo === 'matricula' ? matriculaOk(d) : undefined) + (d.motivo ? '<span class="sub">' + esc(d.motivo) + '</span>' : ''); } },
      { t: '', html: function (d) {
        return '<span class="fila-acc"><button class="btn sec chico" data-ver="' + esc(d._id) + '">' + ic('ojo') + 'Ver</button>' +
          (X.puedeEditar() ? (d.estado !== 'aprobado' ? '<button class="btn chico" data-apr="' + esc(d._id) + '">' + ic('check') + 'Aprobar</button>' : '') +
            (d.estado !== 'observado' ? '<button class="btn sec chico" data-obs="' + esc(d._id) + '">Observar</button>' : '') : '') + '</span>';
      } }
    ], lista, { tam: 100 }) : X.vacio('Todavía no subió documentos'), function (cu, cerrar) {
      var de = function (id) { return lista.filter(function (d) { return d._id === id; })[0]; };
      var cambiar = function (d, estado, motivo) {
        var cambio = { estado: estado, motivo: motivo || '', revisadoPor: S.usuario.email, revisado: X.servidor() };
        return X.dbP.collection('documentos').doc(d._id).update(cambio).then(function () {
          Object.assign(d, cambio, { revisado: new Date() });
          X.bitacora('Documento ' + estado, r.id + ' · ' + (TIPOS[d.tipo] || d.tipo) + (d.periodo ? ' ' + d.periodo : '') + (motivo ? ' · ' + motivo : ''));
          cerrar(); detalle(r); X.aviso('Documento ' + estado); if (S.pagina === 'documentos') X.refrescar();
        });
      };
      cu.querySelectorAll('[data-ver]').forEach(function (b) {
        b.addEventListener('click', function () {
          X.dbP.collection('documentosArchivo').doc(b.getAttribute('data-ver')).get().then(function (d) {
            if (!d.exists) { X.aviso('No se encontró el archivo.'); return; }
            var t = String(d.data().datos || ''), bin = atob(t.slice(t.indexOf(',') + 1)), arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            window.open(URL.createObjectURL(new Blob([arr], { type: d.data().mime || 'application/octet-stream' })), '_blank');
          }, function (e) { console.error(e); X.aviso('No se pudo abrir el archivo.'); });
        });
      });
      cu.querySelectorAll('[data-apr]').forEach(function (b) { b.addEventListener('click', function () { cambiar(de(b.getAttribute('data-apr')), 'aprobado').catch(function (e) { console.error(e); X.aviso('No se pudo guardar.'); }); }); });
      cu.querySelectorAll('[data-obs]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = de(b.getAttribute('data-obs'));
          X.formulario('Observar documento', 'El repartidor ve este motivo en su portal y puede subirlo de nuevo.', [{ k: 'motivo', t: 'Motivo', tipo: 'textarea', filas: 3, max: 300, obligatorio: true }], {}, function (v) { return cambiar(d, 'observado', v.motivo); }, 'Observar');
        });
      });
    });
    return c;
  }

  X.documentos = { cargar: cargar };
})();
