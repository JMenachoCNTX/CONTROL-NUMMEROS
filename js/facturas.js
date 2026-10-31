/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Facturas
   Las facturas que suben los repartidores en el portal llegan aquí
   al instante. Se revisan (PDF + importe contra sus semanas) y se
   aprueban u observan. El repartidor ve el resultado en su portal.
   También: registrar facturas emitidas por CONTAX y cruzar con el
   Excel de Impuestos Nacionales.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, bs = X.bs, ic = X.ic, entero = X.entero;

  var ESTADOS = {
    recibida: ['pend', 'Por revisar'], aprobada: ['ok', 'Aprobada'], observada: ['mal', 'Observada'],
    rechazada: ['mal', 'Rechazada'], anulada: ['neutro', 'Anulada por el repartidor']
  };
  function chipFactura(f) {
    if (f.origen === 'contax') return X.chip('contax', 'Emitida por CONTAX');
    var e = ESTADOS[f.estado] || ['neutro', f.estado || '—']; return X.chip(e[0], e[1]);
  }
  CTRL.chipFactura = chipFactura;
  var MOTIVOS = [
    'El importe de la factura no coincide con las semanas.',
    'La razón social o el NIT de MILTHAGOR S.R.L. están mal.',
    'El PDF no se puede leer o no es la factura.',
    'La factura está anulada en Impuestos Nacionales.',
    'Falta incluir una de las semanas pendientes.',
    'La fecha de emisión no corresponde.'
  ];

  /* Suma de las semanas que cubre la factura (según el portal) */
  function comparar(f) {
    var r = D.repartidores && D.repartidores.get(f.uid), suma = 0, encontradas = 0, faltan = [];
    (f.semanas || []).forEach(function (s) {
      var p = r && (r.pendientes || []).filter(function (x) { return x.semana === s; })[0];
      if (p) { suma += Number(p.importe) || 0; encontradas++; } else faltan.push(s);
    });
    suma = X.redondear(suma);
    var dif = X.redondear((Number(f.importe) || 0) - suma);
    return { r: r, suma: suma, dif: dif, cuadra: encontradas > 0 && Math.abs(dif) <= 0.05 && !faltan.length, faltan: faltan };
  }

  var F = { tab: 'recibida', buscar: '', semana: '', pag: 0, sel: {} };
  function filtradas() {
    var b = X.normal(F.buscar);
    return (D.facturas || []).filter(function (f) {
      if (F.tab === 'recibida' && f.estado !== 'recibida') return false;
      if (F.tab === 'observada' && f.estado !== 'observada' && f.estado !== 'rechazada') return false;
      if (F.tab === 'aprobada' && f.estado !== 'aprobada') return false;
      if (F.tab === 'anulada' && f.estado !== 'anulada') return false;
      if (F.semana && (f.semanas || []).indexOf(F.semana) < 0) return false;
      if (b && (X.normal(f.nombre) + ' ' + f.id + ' ' + X.normal(f.numero)).indexOf(b) < 0) return false;
      return true;
    });
  }

  X.pagina('facturas', {
    t: 'Facturas', i: 'factura', orden: 2, sec: 'Operación',
    cuenta: function () { return (D.facturas || []).filter(function (f) { return f.estado === 'recibida'; }).length; },
    render: function () {
      var ed = X.puedeEditar();
      var cab = X.titulo('Facturas', 'Las que suben los repartidores en «Mis facturas» del portal. Llegan al instante; corte: jueves 18:00.',
        (ed ? '<button class="btn sec" id="btnCruce">' + ic('cruzar') + 'Cruzar con Impuestos</button><button class="btn sec" id="btnContax">' + ic('cliente') + 'Registrar emitida por CONTAX</button>' : '') +
        '<button class="btn sec" id="btnExpFac">' + ic('descargar') + 'Excel</button>');
      if (!S.portalUsuario) return cab + '<div class="card">' + X.vacio('Conecta el Portal para ver las facturas', 'Usa el botón «Conectar» de arriba.') + '</div>';
      if (!D.facturas) return cab + X.cargaN('Trayendo facturas', 'Conectando con el portal…');
      var todas = D.facturas, f = filtradas();
      var n = function (e) { return todas.filter(function (x) { return e === 'todas' || x.estado === e || (e === 'observada' && x.estado === 'rechazada'); }).length; };
      var semanas = {}; todas.forEach(function (x) { (x.semanas || []).forEach(function (s) { semanas[s] = 1; }); });
      var sel = Object.keys(F.sel).filter(function (k) { return F.sel[k]; });
      var cuadran = f.filter(function (x) { return x.estado === 'recibida' && comparar(x).cuadra; });
      return cab +
        (todas.length === 0 ? '<div class="card">' +
          '<div class="sello"><img src="marca/graficos/ele-sello-de-aprobado.png" alt=""><div><b>Todavía no llegó ninguna factura por el portal</b><span class="muted">Desde ahora los repartidores las suben en «Mis facturas». Apenas suban la primera, aparece aquí sin recargar.</span></div></div>' +
          '<img class="pasos-img" src="marca/graficos/pas-pasos-' + (S.oscuro ? 'oscuro' : 'claro') + '.jpg" alt="Conocemos, diseñamos, probamos y acompañamos"></div>' :
        '<div class="card"><div class="pestanas">' + [['recibida', 'Por revisar'], ['observada', 'Observadas'], ['aprobada', 'Aprobadas'], ['anulada', 'Anuladas'], ['todas', 'Todas']].map(function (p) {
          return '<button aria-selected="' + (F.tab === p[0]) + '" data-tab="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(n(p[0])) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bFac" placeholder="Buscar por nombre, ID o N.º de factura" value="' + esc(F.buscar) + '"></div>' +
          '<select id="sSemFac"><option value="">Todas las semanas</option>' + Object.keys(semanas).sort(function (a, b) { return X.ordenSemana(b) - X.ordenSemana(a); }).map(function (s) { return '<option' + (s === F.semana ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
          (ed && F.tab === 'recibida' && cuadran.length ? '<button class="btn" id="btnAprCuadran">' + ic('check') + 'Aprobar las ' + cuadran.length + ' que cuadran</button>' : '') +
          (ed && sel.length ? '<button class="btn" id="btnAprSel">' + ic('check') + 'Aprobar ' + sel.length + ' marcadas</button>' : '') +
        '</div>' +
        (f.length ? X.tabla((ed && F.tab === 'recibida' ? [
          { t: '<input type="checkbox" id="chkTodas" aria-label="Marcar todas">', html: function (x) { return '<input type="checkbox" data-sel="' + esc(x._id) + '"' + (F.sel[x._id] ? ' checked' : '') + ' aria-label="Marcar">'; } }] : []).concat([
          { t: 'Subida', html: function (x) { return X.fechaHora(x.subidoF) + (x.fueraDeCorte ? '<span class="sub">' + X.chip('pend', 'Después del corte') + '</span>' : ''); } },
          { t: 'Repartidor', html: function (x) { var c = x.origen === 'contax' ? '' : ''; return '<b>' + esc(x.nombre) + '</b><span class="sub num">ID ' + esc(x.id) + '</span>' + c; } },
          { t: 'N.º', html: function (x) { return '<b class="num">' + esc(x.numero) + '</b>'; } },
          { t: 'Semanas', html: function (x) { return esc((x.semanas || []).map(X.semanaCorta).join(', ')); } },
          { t: 'Importe', clase: 'monto', html: function (x) { var c = comparar(x); return '<b>' + bs(x.importe) + '</b>' + (x.estado === 'recibida' ? '<span class="sub">' + (c.cuadra ? X.chip('ok', 'Cuadra') : X.chip('mal', c.faltan.length ? 'Semana no pendiente' : 'Dif. ' + bs(c.dif))) + '</span>' : ''); } },
          { t: 'Estado', html: function (x) { return chipFactura(x) + (x.revisadoPor ? '<span class="sub">' + esc(String(x.revisadoPor).split('@')[0]) + '</span>' : ''); } }
        ]), f, { clic: true, pag: F.pag }) : X.vacio(F.tab === 'recibida' ? 'No hay facturas por revisar' : 'Nada con estos filtros', F.tab === 'recibida' ? 'Todo al día.' : '', 'marca/graficos/rel-aprobado-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) +
        '</div>');
    },
    despues: function (el) {
      var f = filtradas();
      el.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { F.tab = b.getAttribute('data-tab'); F.pag = 0; F.sel = {}; X.refrescar(); }); });
      var bq = el.querySelector('#bFac'); if (bq) bq.addEventListener('input', X.debounce(function () { F.buscar = bq.value; F.pag = 0; X.refrescar(); X.setFoco('#bFac'); }, 300));
      var ss = el.querySelector('#sSemFac'); if (ss) ss.addEventListener('change', function () { F.semana = ss.value; F.pag = 0; X.refrescar(); });
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { F.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('[data-sel]').forEach(function (c) {
        c.addEventListener('click', function (e) { e.stopPropagation(); });
        c.addEventListener('change', function () { F.sel[c.getAttribute('data-sel')] = c.checked; X.refrescar(); });
      });
      var ct = el.querySelector('#chkTodas');
      if (ct) ct.addEventListener('change', function () { f.forEach(function (x) { if (x.estado === 'recibida') F.sel[x._id] = ct.checked; }); X.refrescar(); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var x = f[Number(tr.getAttribute('data-fila'))]; if (x) abrirFactura(x._id); }); });
      var ba = el.querySelector('#btnAprSel');
      if (ba) ba.addEventListener('click', function () { aprobarVarias(Object.keys(F.sel).filter(function (k) { return F.sel[k]; })); });
      var bc = el.querySelector('#btnAprCuadran');
      if (bc) bc.addEventListener('click', function () { aprobarVarias(f.filter(function (x) { return x.estado === 'recibida' && comparar(x).cuadra; }).map(function (x) { return x._id; })); });
      var bx = el.querySelector('#btnContax'); if (bx) bx.addEventListener('click', function () { registrarContax(); });
      var bz = el.querySelector('#btnCruce'); if (bz) bz.addEventListener('click', cruceImpuestos);
      var be = el.querySelector('#btnExpFac');
      if (be) be.addEventListener('click', function () {
        X.excel([{ nombre: 'Facturas', filas: [['Subida', 'ID Yango', 'Nombre', 'N.º factura', 'Fecha emisión', 'Semanas', 'Importe (Bs)', 'Estado', 'Motivo', 'Revisó', 'Después del corte']].concat(f.map(function (x) {
          return [X.fechaHora(x.subidoF), x.id, x.nombre, x.numero, x.fechaEmision, (x.semanas || []).join(', '), Number(x.importe) || 0, x.origen === 'contax' ? 'Emitida por CONTAX' : (ESTADOS[x.estado] || [0, x.estado])[1], x.motivo || '', x.revisadoPor || '', x.fueraDeCorte ? 'SÍ' : ''];
        })) }], 'Facturas-' + X.hoyISO());
      });
    }
  });
  CTRL.alCambiarFacturas = function () {
    if (S.pagina === 'facturas' && !document.querySelector('.velo')) {
      var a = document.activeElement, id = a && a.id;
      X.refrescar(); if (id) X.setFoco('#' + id);
    } else if ((S.pagina === 'tablero' || S.pagina === 'pagos') && !document.querySelector('.velo')) X.refrescar();
  };

  function cambiarEstado(id, estado, motivo) {
    var cambio = { estado: estado, revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: motivo || '' };
    return X.dbP.collection('facturas').doc(id).update(cambio).then(function () {
      var f = (D.facturas || []).filter(function (x) { return x._id === id; })[0];
      X.bitacora('Factura ' + estado, f ? (f.id + ' · ' + f.nombre + ' · N.º ' + f.numero + (motivo ? ' · ' + motivo : '')) : id);
    });
  }
  function aprobarVarias(ids) {
    if (!ids.length) return;
    X.confirmar('Aprobar ' + ids.length + ' facturas', 'Los repartidores verán su factura como <b>Aprobada</b> en el portal.', function () {
      X.clasicos(true, 'Arquímedes está aprobando ' + ids.length + ' facturas…');
      var lote = X.dbP.batch();
      ids.forEach(function (id) { lote.update(X.dbP.collection('facturas').doc(id), { estado: 'aprobada', revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: '' }); });
      lote.commit().then(function () {
        X.bitacora('Aprobó facturas en lote', ids.length + ' facturas'); F.sel = {}; X.clasicos(false); X.aviso(ids.length + ' facturas aprobadas');
      }, function (e) { console.error(e); X.clasicos(false); X.aviso('No se pudieron aprobar. Revisa tus permisos.'); });
    }, 'Aprobar');
  }

  /* ── Detalle de una factura ── */
  function abrirFactura(id) {
    var f = (D.facturas || []).filter(function (x) { return x._id === id; })[0]; if (!f) return;
    var c = comparar(f), ed = X.puedeEditar(), cli = c.r ? X.clienteDe(c.r) : null;
    var html =
      (f.estado === 'aprobada' ? '<div class="sello"><img src="marca/graficos/ele-sello-de-aprobado.png" alt=""><div><b>Aprobada</b><span class="muted">' + esc(f.revisadoPor || '') + ' · ' + X.fechaHora(f.revisado) + '</span></div></div>' : '') +
      (f.motivo ? '<div class="aviso-caja error">' + ic('excepcion') + '<div><b>Motivo informado al repartidor</b>' + esc(f.motivo) + '</div></div>' : '') +
      '<div class="comparar mb">' +
        '<div class="dato"><small>Importe de la factura</small><b class="num">' + bs(f.importe) + '</b></div>' +
        '<div class="dato ' + (c.cuadra ? 'bien' : 'mal') + '"><small>Suma de sus semanas en el portal</small><b class="num">' + bs(c.suma) + '</b>' +
          (c.cuadra ? '<span class="muted">Cuadra</span>' : '<span>' + (c.faltan.length ? 'Semanas que ya no están pendientes: ' + esc(c.faltan.join(', ')) : 'Diferencia ' + bs(c.dif)) + '</span>') + '</div>' +
      '</div>' +
      '<div class="datos">' +
        '<div class="dato"><small>N.º de factura</small><b class="num">' + esc(f.numero) + '</b></div>' +
        '<div class="dato"><small>Emisión</small><b>' + X.fecha(f.fechaEmision) + '</b></div>' +
        '<div class="dato"><small>Semanas</small><b>' + esc((f.semanas || []).join(', ')) + '</b></div>' +
        '<div class="dato"><small>Subida</small><b>' + X.fechaHora(f.subidoF) + '</b>' + (f.fueraDeCorte ? X.chip('pend', 'Después del corte') : '') + '</div>' +
      '</div>' +
      (f.nota ? '<div class="nota-interna mb"><b>Comentario del repartidor:</b> ' + esc(f.nota) + '</div>' : '') +
      (cli ? '<div class="card mb"><div class="h2">Cliente CONTAX</div>' + X.accesosCliente(cli) + '</div>' : '') +
      '<div id="zonaPdf">' + X.cargaN('Abriendo el PDF', f.nombreArchivo || '') + '</div>' +
      (ed && f.estado !== 'anulada' ? '<div class="fila-acc" style="margin-top:16px;position:sticky;bottom:0;background:var(--fondo);padding:12px 0">' +
        (f.estado !== 'aprobada' ? '<button class="btn" data-acc="aprobar">' + ic('check') + 'Aprobar</button>' : '') +
        (f.estado !== 'observada' ? '<button class="btn sec" data-acc="observar">' + ic('excepcion') + 'Observar</button>' : '') +
        (f.estado !== 'rechazada' ? '<button class="btn sec" data-acc="rechazar">Rechazar</button>' : '') +
        (f.estado !== 'recibida' ? '<button class="btn sec" data-acc="reabrir">Volver a «Por revisar»</button>' : '') +
        '<button class="btn sec" data-acc="repartidor">' + ic('repartidor') + 'Ver repartidor</button></div>' : '');
    X.cajon('Factura N.º ' + esc(f.numero) + ' ' + chipFactura(f), esc(f.nombre) + ' · ID ' + esc(f.id), html, function (cu, cerrar) {
      var zona = cu.querySelector('#zonaPdf');
      if (f.origen === 'contax' && !f.conPdf) { zona.innerHTML = X.vacio('Registrada por el equipo sin PDF', esc(f.registradoPor || '')); }
      else X.dbP.collection('facturasPdf').doc(f._id).get().then(function (d) {
        if (!d.exists) { zona.innerHTML = X.vacio('No se encontró el PDF'); return; }
        var datos = String(d.data().datos || ''), b64 = datos.slice(datos.indexOf(',') + 1);
        var bin = atob(b64), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
        zona.innerHTML = '<div class="fila-acc mb"><a class="btn sec chico" href="' + url + '" target="_blank" rel="noopener">' + ic('ojo') + 'Abrir en otra pestaña</a><a class="btn sec chico" href="' + url + '" download="' + esc(f.nombreArchivo || ('factura-' + f.numero + '.pdf')) + '">' + ic('descargar') + 'Descargar</a></div>' +
          '<iframe class="pdf" src="' + url + '#view=FitH" title="PDF de la factura"></iframe>';
      }, function (e) { console.error(e); zona.innerHTML = X.vacio('No se pudo abrir el PDF', 'Revisa tu conexión o tus permisos.'); });
      cu.querySelectorAll('[data-acc]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-acc');
          if (a === 'repartidor') { cerrar(); X.detalleRepartidor(f.uid); return; }
          if (a === 'aprobar') {
            var go = function () { b.disabled = true; b.innerHTML = X.anilloBoton() + 'Aprobando'; cambiarEstado(f._id, 'aprobada').then(function () { cerrar(); X.aviso('Factura aprobada'); }, falla(b)); };
            if (!c.cuadra) X.confirmar('El importe no cuadra', 'La factura dice ' + bs(f.importe) + ' y sus semanas suman ' + bs(c.suma) + '. ¿Aprobar igual?', go, 'Aprobar igual'); else go();
          } else if (a === 'reabrir') {
            cambiarEstado(f._id, 'recibida').then(function () { cerrar(); X.aviso('Volvió a «Por revisar»'); }, falla(b));
          } else {
            var est = a === 'observar' ? 'observada' : 'rechazada';
            X.formulario(a === 'observar' ? 'Observar factura' : 'Rechazar factura', 'El repartidor ve este motivo en su portal.', [
              { k: 'preset', t: 'Motivo frecuente', tipo: 'select', opciones: [['', 'Escribir otro motivo']].concat(MOTIVOS.map(function (m) { return [m, m]; })) },
              { k: 'motivo', t: 'Motivo (lo lee el repartidor)', tipo: 'textarea', filas: 3, max: 300, si: function (v) { return !v.preset; } }
            ], {}, function (v) {
              var m = v.preset || v.motivo; if (!m) throw new Error('Escribe el motivo.');
              return cambiarEstado(f._id, est, m).then(function () { cerrar(); X.aviso(est === 'observada' ? 'Factura observada' : 'Factura rechazada'); });
            }, a === 'observar' ? 'Observar' : 'Rechazar');
          }
        });
      });
    });
  }
  function falla(b) { return function (e) { console.error(e); b.disabled = false; X.aviso('No se pudo guardar. Revisa tus permisos.'); X.refrescar(); }; }
  CTRL.abrirFactura = abrirFactura;

  /* ── Registrar una factura emitida por CONTAX ── */
  function registrarContax(idInicial) {
    var cuerpo = '<form class="fm" novalidate><div class="fila"><label for="rcId">ID de Yango del repartidor</label><input id="rcId" value="' + esc(idInicial || '') + '" inputmode="numeric"></div>' +
      '<div id="rcInfo"></div></form>';
    X.ventana('Factura emitida por CONTAX', 'Para clientes CONTAX: queda aprobada y el repartidor la ve como «Emitida por CONTAX».', cuerpo,
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>Registrar</button>', function (v, cerrar) {
        var inp = v.querySelector('#rcId'), info = v.querySelector('#rcInfo'), ok = v.querySelector('[data-ok]'), r = null;
        var buscar = function () {
          var id = X.idSeguro(inp.value); r = D.repartidores && D.repartidores.get(id);
          if (!r) { info.innerHTML = inp.value ? '<p class="muted">No hay un repartidor con ese ID.</p>' : ''; ok.disabled = true; return; }
          var ya = {}; (D.facturas || []).forEach(function (f) { if (f.uid === r.uid && f.estado !== 'anulada' && f.estado !== 'rechazada') (f.semanas || []).forEach(function (s) { ya[s] = 1; }); });
          var libres = (r.pendientes || []).filter(function (p) { return !ya[p.semana]; });
          info.innerHTML = '<p><b>' + esc(r.nombre) + '</b>' + (X.clienteDe(r) ? ' ' + X.chip('contax', 'Cliente CONTAX') : ' ' + X.chip('pend', 'No está en Clientes CONTAX')) + '</p>' +
            (libres.length ? '<div class="fila"><label>Semanas</label>' + libres.map(function (p) { return '<label class="interruptor" style="font-weight:400"><input type="checkbox" name="rcSem" value="' + esc(p.semana) + '" data-imp="' + (Number(p.importe) || 0) + '" checked>' + esc(p.semana) + ' · ' + bs(p.importe) + '</label>'; }).join('') + '</div>' +
              '<div class="dos"><div class="fila"><label for="rcNum">N.º de factura</label><input id="rcNum"></div><div class="fila"><label for="rcImp">Importe (Bs)</label><input id="rcImp" inputmode="decimal"></div></div>' +
              '<div class="fila"><label for="rcPdf">PDF (opcional)</label><input id="rcPdf" type="file" accept="application/pdf"></div>' : '<p class="muted">No tiene semanas pendientes sin factura.</p>');
          var imp = v.querySelector('#rcImp');
          var poner = function () { var s = 0; v.querySelectorAll('[name=rcSem]:checked').forEach(function (c) { s += Number(c.getAttribute('data-imp')); }); if (imp) imp.value = X.redondear(s).toFixed(2).replace('.', ','); };
          v.querySelectorAll('[name=rcSem]').forEach(function (c) { c.addEventListener('change', poner); }); poner();
          ok.disabled = !libres.length;
        };
        inp.addEventListener('input', X.debounce(buscar, 250)); if (idInicial) buscar();
        ok.addEventListener('click', function () {
          var sem = [].map.call(v.querySelectorAll('[name=rcSem]:checked'), function (c) { return c.value; });
          var num = (v.querySelector('#rcNum') || {}).value, imp = X.numero((v.querySelector('#rcImp') || {}).value);
          var arch = (v.querySelector('#rcPdf') || {}).files; arch = arch && arch[0];
          if (!r || !sem.length || !num || !imp) { X.aviso('Completa semanas, número e importe.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Registrando';
          var leer = arch ? new Promise(function (res, rej) { if (arch.size > 700 * 1024) return rej(new Error('El PDF pasa de 700 KB.')); var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(arch); }) : Promise.resolve(null);
          leer.then(function (datos) {
            var ref = X.dbP.collection('facturas').doc(), lote = X.dbP.batch();
            lote.set(ref, { uid: r.uid, id: String(r.id), nombre: r.nombre, semanas: sem, numero: String(num).trim(), importe: X.redondear(imp), fechaEmision: X.hoyISO(),
              estado: 'aprobada', origen: 'contax', conPdf: !!datos, nombreArchivo: arch ? arch.name : '', subido: X.servidor(), revisado: X.servidor(),
              revisadoPor: S.usuario.email, registradoPor: S.usuario.email, motivo: '' });
            if (datos) lote.set(X.dbP.collection('facturasPdf').doc(ref.id), { uid: r.uid, datos: datos });
            return lote.commit();
          }).then(function () { X.bitacora('Registró factura emitida por CONTAX', r.id + ' · ' + r.nombre + ' · N.º ' + num); cerrar(); X.aviso('Factura registrada'); },
            function (e) { console.error(e); ok.disabled = false; ok.textContent = 'Registrar'; X.aviso(e.message || 'No se pudo registrar.'); });
        });
      });
  }
  CTRL.registrarContax = registrarContax;

  /* ── Cruce con el Excel de Impuestos Nacionales ── */
  function cruceImpuestos() {
    X.ventana('Cruzar con Impuestos Nacionales', 'Sube el Excel (o CSV) que descargas de Impuestos con las facturas recibidas por MILTHAGOR.',
      '<div class="fm"><div class="fila"><label for="czArch">Archivo</label><input id="czArch" type="file" accept=".xlsx,.xls,.csv"></div><div id="czMapa"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('cruzar') + 'Cruzar</button>', function (v, cerrar) {
        var filas = null, enc = null, ok = v.querySelector('[data-ok]'), mapa = v.querySelector('#czMapa');
        v.querySelector('#czArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return;
          mapa.innerHTML = X.anillo('Leyendo el archivo…');
          X.cargarXLSX().then(function (XL) {
            return a.arrayBuffer().then(function (buf) {
              var lb = XL.read(buf, { type: 'array' }), ws = lb.Sheets[lb.SheetNames[0]];
              var todas = XL.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
              // La fila de encabezados es la primera que tiene varias celdas con texto
              var i0 = 0; for (var i = 0; i < Math.min(todas.length, 15); i++) { if (todas[i].filter(function (c) { return /[a-z]/i.test(String(c)); }).length >= 3) { i0 = i; break; } }
              enc = todas[i0].map(function (h) { return String(h).trim(); }); filas = todas.slice(i0 + 1).filter(function (f) { return f.some(function (c) { return String(c).trim(); }); });
              var adivina = function (re) { for (var j = 0; j < enc.length; j++) if (re.test(X.normal(enc[j]))) return j; return -1; };
              var cols = { num: adivina(/(N(RO|UM|°|º)?\.?\s*(DE\s*)?FACT|FACTURA|NUMERO)/), imp: adivina(/IMPORTE TOTAL|IMPORTE|MONTO|TOTAL/), nit: adivina(/NIT|CI/), nom: adivina(/RAZON|NOMBRE/), est: adivina(/ESTADO/) };
              var sel = function (k, et) { return '<div class="fila"><label for="cz_' + k + '">' + et + '</label><select id="cz_' + k + '"><option value="-1">(no usar)</option>' + enc.map(function (h, j) { return '<option value="' + j + '"' + (cols[k] === j ? ' selected' : '') + '>' + esc(h || ('Columna ' + (j + 1))) + '</option>'; }).join('') + '</select></div>'; };
              mapa.innerHTML = '<p class="muted">' + entero(filas.length) + ' filas leídas. Revisa que cada dato apunte a la columna correcta:</p><div class="dos">' + sel('num', 'N.º de factura') + sel('imp', 'Importe') + sel('nit', 'NIT del emisor') + sel('nom', 'Nombre o razón social') + sel('est', 'Estado (opcional)') + '</div>';
              ok.disabled = false;
            });
          }).catch(function (ex) { console.error(ex); mapa.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          var col = function (k) { return Number(v.querySelector('#cz_' + k).value); };
          var cN = col('num'), cI = col('imp'), cT = col('nit'), cM = col('nom'), cE = col('est');
          if (cN < 0 || cI < 0) { X.aviso('Elige al menos la columna del número y la del importe.'); return; }
          var limpia = function (n) { return String(n == null ? '' : n).replace(/\D/g, '').replace(/^0+/, ''); };
          var idx = {};
          filas.forEach(function (f) { var k = limpia(f[cN]); if (!k) return; (idx[k] = idx[k] || []).push({ imp: X.numero(f[cI]), nit: cT >= 0 ? String(f[cT]) : '', nom: cM >= 0 ? String(f[cM]) : '', est: cE >= 0 ? String(f[cE]) : '' }); });
          var revisar = (D.facturas || []).filter(function (f) { return f.estado === 'recibida' || f.estado === 'observada'; });
          var res = revisar.map(function (f) {
            var c = idx[limpia(f.numero)] || [], r = 'falta', fila = null;
            if (c.length) {
              fila = c.filter(function (x) { return Math.abs((x.imp || 0) - (Number(f.importe) || 0)) <= 0.05; })[0];
              r = fila ? (/ANULAD/.test(X.normal(fila.est)) ? 'anulada' : 'coincide') : 'importe'; fila = fila || c[0];
            }
            return { f: f, r: r, fila: fila };
          });
          cerrar(); mostrarCruce(res, filas.length);
        });
      });
  }
  function mostrarCruce(res, total) {
    var n = function (k) { return res.filter(function (x) { return x.r === k; }).length; };
    var et = { coincide: ['ok', 'Está en Impuestos y el importe coincide'], importe: ['mal', 'Está, pero el importe es distinto'], anulada: ['mal', 'Figura anulada'], falta: ['pend', 'No está en el Excel'] };
    var c = X.cajon('Resultado del cruce', entero(total) + ' facturas en el Excel · ' + entero(res.length) + ' por revisar en CONTROL',
      '<div class="rejilla r4 mb">' + ['coincide', 'importe', 'anulada', 'falta'].map(function (k) { return '<div class="kpi' + (k === 'coincide' ? '' : ' alerta') + '"><small>' + et[k][1] + '</small><b class="num">' + n(k) + '</b></div>'; }).join('') + '</div>' +
      (X.puedeEditar() && n('coincide') ? '<div class="fila-acc mb"><button class="btn" id="czApr">' + ic('check') + 'Aprobar las ' + n('coincide') + ' que coinciden</button><button class="btn sec" id="czObs">Observar las de importe distinto</button></div>' : '') +
      X.tabla([
        { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.f.nombre) + '</b><span class="sub num">ID ' + esc(x.f.id) + '</span>'; } },
        { t: 'N.º', html: function (x) { return '<b class="num">' + esc(x.f.numero) + '</b>'; } },
        { t: 'En CONTROL', clase: 'monto', html: function (x) { return bs(x.f.importe); } },
        { t: 'En Impuestos', clase: 'monto', html: function (x) { return x.fila ? bs(x.fila.imp) + (x.fila.nom ? '<span class="sub">' + esc(x.fila.nom) + '</span>' : '') : '—'; } },
        { t: 'Resultado', html: function (x) { return X.chip(et[x.r][0], et[x.r][1]); } }
      ], res, { tam: 500 }), function (cu, cerrar) {
        X.dbC.collection('cruces').add({ cuando: X.servidor(), quien: S.usuario.email, filasExcel: total, revisadas: res.length, coinciden: n('coincide'), importeDistinto: n('importe'), anuladas: n('anulada'), noEstan: n('falta') }).catch(function () { });
        X.bitacora('Cruce con Impuestos', n('coincide') + ' coinciden · ' + n('importe') + ' importe distinto · ' + n('falta') + ' no están');
        var a = cu.querySelector('#czApr');
        if (a) a.addEventListener('click', function () { cerrar(); aprobarVarias(res.filter(function (x) { return x.r === 'coincide' && x.f.estado === 'recibida'; }).map(function (x) { return x.f._id; })); });
        var o = cu.querySelector('#czObs');
        if (o) o.addEventListener('click', function () {
          var l = res.filter(function (x) { return x.r === 'importe' || x.r === 'anulada'; }); if (!l.length) return;
          var lote = X.dbP.batch();
          l.forEach(function (x) { lote.update(X.dbP.collection('facturas').doc(x.f._id), { estado: 'observada', revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: x.r === 'anulada' ? 'La factura figura anulada en Impuestos Nacionales.' : 'El importe en Impuestos Nacionales (' + bs(x.fila && x.fila.imp) + ') no coincide con el de tu factura.' }); });
          lote.commit().then(function () { X.bitacora('Observó facturas por cruce', l.length + ' facturas'); cerrar(); X.aviso(l.length + ' facturas observadas'); }, function (e) { console.error(e); X.aviso('No se pudieron observar.'); });
        });
      });
    return c;
  }
})();
