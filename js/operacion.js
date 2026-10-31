/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Operación
   Tablero, Pagos (quién está listo para cobrar), Historial de pagos,
   Repartidores y Trámites. Los datos vienen del Portal (Firebase).
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, bs = X.bs, ic = X.ic, entero = X.entero;

  /* ══════════ REGLAS DE PAGO ══════════ */
  /* "SEM41G2026", "41", "Semana 41" → número para ordenar */
  function ordenSemana(s) {
    var t = String(s || ''), y = (t.match(/(20\d\d)/) || [])[1], w = (t.replace(/20\d\d/, '').match(/(\d{1,2})/) || [])[1];
    return (Number(y) || 0) * 100 + (Number(w) || 0);
  }
  function semanaCorta(s) { var w = (String(s || '').replace(/20\d\d/, '').match(/(\d{1,2})/) || [])[1]; return w ? 'Sem ' + w : String(s || '—'); }
  function lista() { return D.repartidores ? Array.from(D.repartidores.values()).filter(function (r) { return !r.prueba; }) : []; }

  /* Facturas vigentes de un repartidor por semana (la más reciente manda) */
  function facturasPorSemana(uid) {
    var m = {};
    (D.facturas || []).forEach(function (f) {
      if (f.uid !== uid || f.estado === 'anulada') return;
      (f.semanas || []).forEach(function (s) {
        var prev = m[s];
        if (!prev || (f.subidoF || 0) > (prev.subidoF || 0)) m[s] = f;
      });
    });
    return m;
  }
  function excepcionDe(r, semana) {
    var id = String(r.id || '');
    return (D.excepciones || []).filter(function (e) {
      if (!e.activa || String(e.idYango || '').trim() !== id) return false;
      if (e.hasta && e.hasta < X.hoyISO()) return false;
      return !e.semana || e.semana === '*' || String(e.semana).trim() === String(semana).trim();
    })[0] || null;
  }
  /* Estado de cada semana pendiente y del repartidor completo */
  var ESTADO_SEMANA = {
    lista: ['ok', 'Factura aprobada'],
    contax: ['contax', 'Emitida por CONTAX'],
    excepcion: ['ok', 'Habilitada por excepción'],
    revision: ['pend', 'Factura en revisión'],
    observada: ['mal', 'Factura observada'],
    porEmitir: ['contax', 'CONTAX debe emitir'],
    falta: ['mal', 'Falta factura']
  };
  function evaluar(r) {
    var fs = facturasPorSemana(r.uid), cli = X.clienteDe(r);
    var semanas = (r.pendientes || []).map(function (p) {
      var f = fs[p.semana], ex = excepcionDe(r, p.semana), e;
      if (f && f.estado === 'aprobada') e = f.origen === 'contax' ? 'contax' : 'lista';
      else if (ex) e = 'excepcion';
      else if (f && f.estado === 'recibida') e = 'revision';
      else if (f && (f.estado === 'observada' || f.estado === 'rechazada')) e = 'observada';
      else if (cli) e = 'porEmitir';
      else e = 'falta';
      return { p: p, f: f || null, ex: ex, estado: e, ok: e === 'lista' || e === 'contax' || e === 'excepcion' };
    });
    var todas = semanas.length && semanas.every(function (s) { return s.ok; });
    var algunas = semanas.filter(function (s) { return s.ok; });
    var regla = C.reglaPago === 'semana' ? 'semana' : 'todo';
    var aPagar = regla === 'todo' ? (todas ? semanas : []) : algunas;
    var total = X.redondear(semanas.reduce(function (s, x) { return s + (Number(x.p.importe) || 0); }, 0));
    var totalPagar = X.redondear(aPagar.reduce(function (s, x) { return s + (Number(x.p.importe) || 0); }, 0));
    var motivo = '';
    if (semanas.length && !aPagar.length) {
      var malas = semanas.filter(function (s) { return !s.ok; });
      motivo = malas.map(function (s) { return semanaCorta(s.p.semana) + ': ' + ESTADO_SEMANA[s.estado][1]; }).join(' · ');
    }
    return { r: r, cliente: cli, semanas: semanas, total: total, totalPagar: totalPagar, listo: aPagar.length > 0 && (regla === 'semana' || todas), parcial: regla === 'semana' && aPagar.length && aPagar.length < semanas.length, motivo: motivo };
  }
  function chipSemana(e) { var x = ESTADO_SEMANA[e] || ['neutro', e]; return X.chip(x[0], x[1]); }

  /* Próximo corte: jueves 18:00, hora de Bolivia (UTC-4) */
  function corte() {
    var b = new Date(Date.now() - 4 * 3600e3), dia = b.getUTCDay();
    var c = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + ((C.corte.dia - dia + 7) % 7), C.corte.hora, 0, 0));
    if (c <= b) c = new Date(c.getTime() + 7 * 864e5);
    var ms = c - b, h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return { fecha: c, ms: ms, texto: (h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h + ' h ' + String(m).padStart(2, '0') + ' min'),
      dia: dias[c.getUTCDay()] + ' ' + String(c.getUTCDate()).padStart(2, '0') + '/' + String(c.getUTCMonth() + 1).padStart(2, '0') };
  }
  function tramiteAbierto(t) {
    var e = X.normal(t.estado + ' ' + t.resolucion);
    return !/RESUELT|APROBAD|VIGENTE|CERRAD|PAGAD|FINALIZ|RECHAZ|ATENDID|COMPLETAD/.test(e);
  }
  function sinPortal() {
    return !S.portalUsuario ? X.vacio('Conecta el Portal para ver estos datos', 'Usa el botón «Conectar» de arriba.', 'marca/graficos/rel-seguridad-' + (S.oscuro ? 'oscuro' : 'claro') + '.png') : '';
  }
  function cargando() { return D.repartidores ? '' : X.esqueleto(6); }

  /* ══════════ TABLERO ══════════ */
  X.pagina('tablero', {
    t: 'Tablero', i: 'tablero', orden: 1, sec: 'Operación',
    render: function () {
      var nombre = String(S.nombre || '').split(/\s+/)[0];
      var portada = '<section class="portada"><img class="foto" src="marca/colaboracion/reunion-sala.jpg" alt="Los tres clásicos de NUMMEROS y el Contador Virtual de CONTAX en una sala de reuniones">' +
        '<div class="txt"><h2>Hola, ' + esc(nombre || 'equipo') + '</h2><p>Todo lo del Portal de repartidores, en un solo lugar: facturas, pagos y trámites.</p>' +
        '<div class="acc"><button class="btn" data-ir="facturas">' + ic('factura') + 'Revisar facturas</button><button class="btn sec" data-ir="pagos">' + ic('pagos') + 'Ver pagos</button></div></div>' +
        '<div class="insignia"><i><img src="marca/logos/nummeros-isotipo-blanco.svg" alt=""></i>Los tres clásicos<span>y el Contador Virtual de CONTAX</span></div></section>';
      if (!S.portalUsuario) return portada + '<div class="card">' + sinPortal() + '</div>';
      if (!D.repartidores) return portada + X.esqueleto(6);
      var l = lista(), ev = l.map(evaluar);
      var conPend = ev.filter(function (e) { return e.semanas.length; });
      var totPend = X.redondear(conPend.reduce(function (s, e) { return s + e.total; }, 0));
      var listos = ev.filter(function (e) { return e.listo; }), totListos = X.redondear(listos.reduce(function (s, e) { return s + e.totalPagar; }, 0));
      var porRevisar = (D.facturas || []).filter(function (f) { return f.estado === 'recibida'; }).length;
      var observadas = (D.facturas || []).filter(function (f) { return f.estado === 'observada'; }).length;
      var tram = 0; l.forEach(function (r) { (r.tramites || []).forEach(function (t) { if (tramiteAbierto(t)) tram++; }); });
      var noHab = l.filter(function (r) { return r.habilitado === false; }).length, sinPol = l.filter(function (r) { return !r.poliza; }).length;
      var porEmitir = 0; ev.forEach(function (e) { e.semanas.forEach(function (s) { if (s.estado === 'porEmitir') porEmitir++; }); });
      var k = corte();
      return portada +
        '<div class="rejilla r4 mb">' +
          '<button class="kpi" data-ir="repartidores"><small>Repartidores</small><b class="num">' + entero(l.length) + '</b><em>' + entero(noHab) + ' no habilitados · ' + entero(sinPol) + ' sin póliza</em></button>' +
          '<button class="kpi" data-ir="pagos"><small>Por pagar</small><b class="num">' + bs(totPend) + '</b><em>' + entero(conPend.length) + ' repartidores con pendientes</em></button>' +
          '<button class="kpi" data-ir="pagos"><small>Listos para pagar</small><b class="num">' + bs(totListos) + '</b><em>' + entero(listos.length) + ' con todas sus facturas bien</em></button>' +
          '<button class="kpi' + (porRevisar ? ' alerta' : '') + '" data-ir="facturas"><small>Facturas por revisar</small><b class="num">' + entero(porRevisar) + '</b><em>' + entero(observadas) + ' observadas esperando corrección</em></button>' +
        '</div>' +
        '<div class="rejilla r2 mb">' +
          '<div class="card"><div class="h2">Próximo corte <small>jueves 18:00</small></div><div class="corte">' +
            '<img class="relieve" src="marca/graficos/rel-vencimientos-' + (S.oscuro ? 'oscuro' : 'claro') + '.png" alt="">' +
            '<div><div class="reloj" id="relojCorte">' + esc(k.texto) + '</div><div class="muted">Cierra el ' + esc(k.dia) + ' a las 18:00. Lo que llegue después entra al pago siguiente.</div></div></div></div>' +
          '<div class="card"><div class="h2">Para hoy</div><ul class="lista-tareas">' +
            '<li>' + ic('factura') + '<span>Facturas subidas por revisar</span><b>' + entero(porRevisar) + '</b><button class="btn sec chico" data-ir="facturas">Revisar</button></li>' +
            '<li>' + ic('cliente') + '<span>Semanas de clientes CONTAX por emitir</span><b>' + entero(porEmitir) + '</b><button class="btn sec chico" data-ir="pagos">Ver</button></li>' +
            '<li>' + ic('tramites') + '<span>Trámites abiertos</span><b>' + entero(tram) + '</b><button class="btn sec chico" data-ir="tramites">Ver</button></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="rejilla r2">' +
          '<div class="card"><div class="h2">Pagado por fecha de pago <small>últimos 12 pagos</small></div><div class="grafico"><canvas id="gPagado"></canvas></div></div>' +
          '<div class="card"><div class="h2">Pendiente por semana</div><div class="grafico"><canvas id="gPend"></canvas></div></div>' +
        '</div>';
    },
    despues: function (el) {
      var t = setInterval(function () { var r = document.getElementById('relojCorte'); if (!r) return clearInterval(t); r.textContent = corte().texto; }, 30000);
      if (!D.repartidores || !S.portalUsuario) return;
      var l = lista(), pag = {}, pen = {};
      l.forEach(function (r) {
        (r.historial || []).forEach(function (h) { var k = String(h.fechaPago || ''); if (!k) return; pag[k] = (pag[k] || 0) + (Number(h.importe) || 0); });
        (r.pendientes || []).forEach(function (p) { var k = String(p.semana || '—'); pen[k] = pen[k] || { t: 0, n: 0 }; pen[k].t += Number(p.importe) || 0; pen[k].n++; });
      });
      var fechas = Object.keys(pag).sort(function (a, b) { return (X.aFecha(a) || 0) - (X.aFecha(b) || 0); }).slice(-12);
      var col = X.colores();
      var gP = el.querySelector('#gPagado');
      if (gP) X.grafico(gP, { type: 'bar', data: { labels: fechas.map(function (f) { return f.slice(0, 5); }), datasets: [{ label: 'Pagado', data: fechas.map(function (f) { return X.redondear(pag[f]); }), backgroundColor: col.fuerte, borderRadius: 6 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return bs(c.parsed.y); } } } }, scales: { y: { ticks: { callback: function (v) { return 'Bs ' + entero(v); } } } } } });
      var sem = Object.keys(pen).sort(function (a, b) { return ordenSemana(a) - ordenSemana(b); }).slice(-10);
      var gS = el.querySelector('#gPend');
      if (gS) X.grafico(gS, { type: 'bar', data: { labels: sem.map(semanaCorta), datasets: [{ label: 'Pendiente', data: sem.map(function (s) { return X.redondear(pen[s].t); }), backgroundColor: col.medio, borderRadius: 6 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return bs(c.parsed.y) + ' · ' + pen[sem[c.dataIndex]].n + ' repartidores'; } } } }, scales: { y: { ticks: { callback: function (v) { return 'Bs ' + entero(v); } } } } } });
    }
  });

  /* ══════════ PAGOS ══════════ */
  var P = { filtro: 'todos', semana: '', buscar: '', pag: 0 };
  X.pagina('pagos', {
    t: 'Pagos', i: 'pagos', orden: 3, sec: 'Operación',
    render: function () {
      var reglaTxt = C.reglaPago === 'semana' ? 'Se paga cada semana que tenga su factura aprobada.' : 'Regla «todo o nada»: si a un repartidor le falta una factura o una está mal, se retienen todos sus pagos.';
      var SM = X.semanas, mc = SM && SM.modoControl();
      var cab = X.titulo('Pagos pendientes', reglaTxt + ' Las excepciones y los clientes CONTAX se aplican solos.',
        (SM && X.puedeEditar() ? '<button class="btn sec" id="btnImportar">' + ic('subir') + 'Importar planilla semanal</button>' : '') +
        (SM ? '<button class="btn sec" id="btnImportaciones">' + ic('historial') + 'Importaciones</button>' : '') +
        (SM && X.esAdmin() ? '<button class="btn sec" id="btnMigrar">Migrar desde Sheets</button>' : '') +
        (X.banco && X.puedeEditar() ? '<button class="btn sec" id="btnCuentas">' + ic('cliente') + 'Cuentas bancarias</button>' : '') +
        '<button class="btn sec" id="btnCierres">' + ic('historial') + 'Planillas generadas</button><button class="btn" id="btnPlanilla"' + (X.puedeEditar() ? '' : ' disabled') + '>' + ic('descargar') + 'Planilla de pago</button>');
      if (!S.portalUsuario) return cab + '<div class="card">' + sinPortal() + '</div>';
      if (!D.repartidores) return cab + X.esqueleto(3);
      var pc = mc ? SM.porConfirmar() : null;
      cab += (mc ? '' : '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>Los pagos todavía salen de Google Sheets</b>Lo que importes queda guardado en «semanas», pero esta página sigue mostrando las hojas hasta que se cambie <code>fuentePagos</code> a <code>\'control\'</code> en config.js.</div></div>') +
        (pc && pc.semanas ? '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>' + entero(pc.semanas) + ' semanas en planillas sin confirmar · ' + bs(pc.total) + '</b>Cuando llegue el extracto del banco, ábrelo en «Planillas generadas» y toca «Conciliar extracto».</div></div>' : '');
      var ev = lista().map(evaluar).filter(function (e) { return e.semanas.length; });
      var semanas = {}; ev.forEach(function (e) { e.semanas.forEach(function (s) { semanas[s.p.semana] = 1; }); });
      var semLista = Object.keys(semanas).sort(function (a, b) { return ordenSemana(b) - ordenSemana(a); });
      var f = filtrarPagos(ev);
      var tot = function (l, k) { return X.redondear(l.reduce(function (s, e) { return s + e[k]; }, 0)); };
      var listos = ev.filter(function (e) { return e.listo; }), ret = ev.filter(function (e) { return !e.listo; });
      var cuenta = function (k) { return { todos: ev.length, listos: listos.length, retenidos: ret.length, contax: ev.filter(function (e) { return e.cliente; }).length, revision: ev.filter(function (e) { return e.semanas.some(function (s) { return s.estado === 'revision'; }); }).length }[k]; };
      return cab +
        '<div class="rejilla r4 mb">' +
          '<div class="kpi"><small>Total pendiente</small><b class="num">' + bs(tot(ev, 'total')) + '</b><em>' + entero(ev.length) + ' repartidores</em></div>' +
          '<div class="kpi"><small>Listos para pagar</small><b class="num">' + bs(tot(listos, 'totalPagar')) + '</b><em>' + entero(listos.length) + ' repartidores</em></div>' +
          '<div class="kpi alerta"><small>Retenidos</small><b class="num">' + bs(tot(ret, 'total')) + '</b><em>' + entero(ret.length) + ' repartidores</em></div>' +
          '<div class="kpi"><small>Corte</small><b class="num">' + esc(corte().texto) + '</b><em>' + esc(corte().dia) + ' · 18:00</em></div>' +
        '</div>' +
        '<div class="card"><div class="pestanas" role="tablist">' + [['todos', 'Todos'], ['listos', 'Listos'], ['retenidos', 'Retenidos'], ['revision', 'En revisión'], ['contax', 'Clientes CONTAX']].map(function (p) {
          return '<button role="tab" aria-selected="' + (P.filtro === p[0]) + '" data-filtro="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(cuenta(p[0])) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bPagos" placeholder="Buscar por nombre, ID o celular" value="' + esc(P.buscar) + '"></div>' +
          '<select id="sSemana" aria-label="Semana"><option value="">Todas las semanas</option>' + semLista.map(function (s) { return '<option' + (s === P.semana ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
        (f.length ? X.tabla([
          { t: 'Repartidor', html: function (e) { return '<b>' + esc(e.r.nombre) + '</b><span class="sub num">ID ' + esc(e.r.id) + (e.cliente ? ' · ' : '') + '</span>' + (e.cliente ? X.chip('contax', 'Cliente CONTAX') : ''); } },
          { t: 'Semanas', html: function (e) { return e.semanas.map(function (s) { return '<div style="margin:2px 0"><span class="num">' + esc(semanaCorta(s.p.semana)) + '</span> ' + chipSemana(s.estado) + (s.p.rebote ? ' ' + X.chip('mal', 'Rebotó en el banco') : '') + '</div>'; }).join(''); } },
          { t: 'Estado', html: function (e) { return e.listo ? X.chip('ok', e.parcial ? 'Pago parcial' : 'Listo para pagar') : X.chip('mal', 'Retenido'); } },
          { t: 'Pendiente', clase: 'monto', html: function (e) { return bs(e.total); } },
          { t: 'A pagar', clase: 'monto', html: function (e) { return '<b>' + bs(e.totalPagar) + '</b>'; } }
        ], f, { clic: true, pag: P.pag, pie: '<td colspan="3">Total (' + entero(f.length) + ')</td><td class="monto">' + bs(tot(f, 'total')) + '</td><td class="monto">' + bs(tot(f, 'totalPagar')) + '</td>' })
          : X.vacio('Nada que mostrar con estos filtros', '', 'marca/graficos/ilu-crecimiento-reportes.png')) +
        '</div>';
    },
    despues: function (el) {
      var ev = D.repartidores ? lista().map(evaluar).filter(function (e) { return e.semanas.length; }) : [];
      el.querySelectorAll('[data-filtro]').forEach(function (b) { b.addEventListener('click', function () { P.filtro = b.getAttribute('data-filtro'); P.pag = 0; X.refrescar(); }); });
      var bq = el.querySelector('#bPagos'); if (bq) bq.addEventListener('input', debounce(function () { P.buscar = bq.value; P.pag = 0; X.refrescar(); setFoco('#bPagos'); }, 300));
      var ss = el.querySelector('#sSemana'); if (ss) ss.addEventListener('change', function () { P.semana = ss.value; P.pag = 0; X.refrescar(); });
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { P.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          var filtrados = filtrarPagos(ev); var e = filtrados[Number(tr.getAttribute('data-fila'))]; if (e) detalleRepartidor(e.r.uid);
        });
      });
      // Se recalcula al hacer clic: las facturas llegan en vivo y pueden haber cambiado desde que se pintó la página
      var bp = el.querySelector('#btnPlanilla'); if (bp) bp.addEventListener('click', function () { planilla(lista().map(evaluar).filter(function (e) { return e.semanas.length; })); });
      var bc = el.querySelector('#btnCierres'); if (bc) bc.addEventListener('click', verCierres);
      var bi = el.querySelector('#btnImportar'); if (bi) bi.addEventListener('click', function () { X.semanas.importar(); });
      var bl = el.querySelector('#btnImportaciones'); if (bl) bl.addEventListener('click', function () { X.semanas.verImportaciones(); });
      var bm = el.querySelector('#btnMigrar'); if (bm) bm.addEventListener('click', function () { X.semanas.migrar(); });
      var bcu = el.querySelector('#btnCuentas'); if (bcu) bcu.addEventListener('click', function () { X.banco.verCuentas(); });
    }
  });
  function filtrarPagos(ev) {
    return ev.filter(function (e) {
      if (P.semana && !e.semanas.some(function (s) { return s.p.semana === P.semana; })) return false;
      if (P.filtro === 'listos' && !e.listo) return false;
      if (P.filtro === 'retenidos' && e.listo) return false;
      if (P.filtro === 'contax' && !e.cliente) return false;
      if (P.filtro === 'revision' && !e.semanas.some(function (s) { return s.estado === 'revision'; })) return false;
      if (P.buscar) { var b = X.normal(P.buscar); if ((X.normal(e.r.nombre) + ' ' + e.r.id + ' ' + e.r.celular).indexOf(b) < 0) return false; }
      return true;
    }).sort(function (a, b) { return (b.listo - a.listo) || X.normal(a.r.nombre).localeCompare(X.normal(b.r.nombre)); });
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function setFoco(sel) { var e = document.querySelector(sel); if (e) { e.focus(); var v = e.value; e.value = ''; e.value = v; } }

  /* Planilla de pago: archivo de carga masiva del Banco Ganadero (js/banco.js), una fila por semana pagada.
     Los listos sin cuenta bancaria quedan fuera y se avisan. */
  function planilla(ev) {
    var listos = ev.filter(function (e) { return e.listo; }), ret = ev.filter(function (e) { return !e.listo; });
    var B = X.banco, a = B.armar(listos), sem = B.semanaPrincipal(a.lineas), mc = X.semanas && X.semanas.modoControl();
    var totSin = X.redondear(a.sinCuenta.reduce(function (t, x) { return t + x.importe; }, 0));
    X.ventana('Planilla de pago', 'Se descarga la planilla de carga masiva del Banco Ganadero: una fila por semana pagada, con la glosa «Pago MTG - ID Rider … Fact.Nro … SEM…».',
      '<div class="rejilla r3 mb"><div class="dato"><small>Repartidores a pagar</small><b class="num">' + entero(a.pagan.length) + '</b></div>' +
        '<div class="dato"><small>Filas para el banco</small><b class="num">' + entero(a.lineas.length) + '</b></div>' +
        '<div class="dato"><small>Total a pagar</small><b class="num">' + bs(a.total) + '</b></div></div>' +
      (a.sinCuenta.length ? '<div class="aviso-caja mb">' + ic('excepcion') + '<div><b>' + entero(a.sinCuenta.length) + ' repartidores listos no tienen cuenta bancaria · ' + bs(totSin) + '</b>Quedan fuera de esta planilla. Agrégalas en «Cuentas bancarias» y vuelve a generar. <button class="btn sec chico" id="plCuentas" type="button">Ver cuentas</button></div></div>' : '') +
      '<div class="fm"><div class="dos"><div class="fila"><label for="plFecha">Fecha de pago</label><input id="plFecha" type="date" value="' + X.hoyISO() + '"></div>' +
        '<div class="fila"><label for="plNombre">Nombre del archivo</label><input id="plNombre" value="' + esc((sem ? sem.replace(/G\d{4}$/, '') + ' ' : '') + 'Planilla Banco') + '"></div></div></div>' +
      (mc
        ? '<div class="aviso-caja">' + ic('check') + '<div><b>Se guarda en «Planillas generadas»</b>Las semanas incluidas pasan a «en planilla» y no vuelven a salir en otra planilla hasta que se concilie el extracto, se confirme o se anule.</div></div><input type="checkbox" id="chkCierre" checked hidden>'
        : '<label class="interruptor"><input type="checkbox" id="chkCierre" checked>Guardar esta planilla en «Planillas generadas»</label>'),
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok' + (a.lineas.length ? '' : ' disabled') + '>' + ic('descargar') + 'Descargar planilla del banco</button>',
      function (v, cerrar) {
        var pc = v.querySelector('#plCuentas'); if (pc) pc.addEventListener('click', function () { cerrar(); B.verCuentas(); });
        v.querySelector('[data-ok]').addEventListener('click', function () {
          var btn = v.querySelector('[data-ok]'), fecha = v.querySelector('#plFecha').value, nombre = v.querySelector('#plNombre').value.trim() || 'Planilla Banco';
          if (!fecha) { X.aviso('Elige la fecha de pago.'); return; }
          btn.disabled = true; btn.innerHTML = X.anilloBoton() + 'Preparando';
          B.descargarBanco(a.lineas, fecha, nombre).then(function () {
            X.bitacora('Descargó planilla del banco', a.pagan.length + ' repartidores · ' + a.lineas.length + ' filas · ' + bs(a.total));
            // Con fuentePagos 'control' la planilla siempre se guarda: sus semanas pasan a «en planilla»
            if (!v.querySelector('#chkCierre').checked && !mc) return;
            var ok = function (e) { return e.semanas.filter(function (s) { return s.ok; }); };
            var filas = a.pagan.map(function (e) {
              return { id: String(e.r.id), nombre: e.r.nombre, importe: e.totalPagar, ciudad: ok(e).map(function (s) { return s.p.ciudad; }).filter(Boolean)[0] || e.r.ciudad || '',
                semanas: ok(e).map(function (s) { return s.p.semana; }),
                detalle: ok(e).map(function (s) { return { semana: s.p.semana, importe: Number(s.p.importe) || 0 }; }),
                docs: ok(e).map(function (s) { return s.p._doc; }).filter(Boolean) };
            });
            var docs = a.lineas.map(function (l) { return l.doc; }).filter(Boolean);
            return X.dbC.collection('pagos').add({
              fecha: X.hoyISO(), fechaProgramada: fecha, archivo: nombre, semanaPrincipal: sem, creado: X.servidor(), quien: S.usuario.email,
              total: a.total, cantidad: a.pagan.length, retenidos: ret.length, regla: C.reglaPago || 'todo', estado: mc ? 'enviada' : 'registro', fuente: mc ? 'control' : 'sheets',
              filas: filas, lineas: a.lineas, sinCuenta: a.sinCuenta,
              retenidosDet: ret.map(function (e) { return { id: String(e.r.id), nombre: e.r.nombre, importe: e.total, motivo: e.motivo }; })
            }).then(function (ref) {
              return mc ? X.semanas.marcarEnPlanilla(ref.id, docs).then(function () { X.recargarTodo(); }) : null;
            });
          }).then(function () { cerrar(); X.aviso('Planilla del banco descargada'); }, function (e) { console.error(e); btn.disabled = false; btn.textContent = 'Descargar planilla del banco'; X.aviso(e.message || 'No se pudo generar el Excel.'); });
        });
      });
  }
  function verCierres() {
    var c = X.cajon('Planillas generadas', 'Cada planilla del banco que se generó. Concilia el extracto para marcar lo pagado y lo rebotado.', X.cargaBarra('Planillas', 'Trayendo…'));
    X.dbC.collection('pagos').orderBy('creado', 'desc').limit(60).get().then(function (q) {
      var l = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; l.push(x); });
      c.cuerpo.innerHTML = l.length ? X.tabla([
        { t: 'Planilla', html: function (x) { return '<b>' + esc(x.archivo || ('Planilla ' + X.fecha(x.fecha))) + '</b><span class="sub">' + X.fechaHora(x.creado) + ' · ' + esc(x.quien) + '</span>'; } },
        { t: 'Repartidores', clase: 'monto', html: function (x) { return entero(x.cantidad) + (x.lineas ? '<span class="sub">' + entero(x.lineas.length) + ' filas</span>' : ''); } },
        { t: 'Total', clase: 'monto', html: function (x) { return '<b>' + bs(x.total) + '</b>'; } },
        { t: 'Estado', html: function (x) {
          return (x.estado === 'pagada' ? X.chip('ok', 'Pagada ' + X.fecha(x.fechaPago)) : x.estado === 'enviada' ? X.chip('pend', x.conciliacion ? 'Conciliada en parte' : 'Por confirmar') : x.estado === 'anulada' ? X.chip('neutro', 'Anulada') : X.chip('neutro', 'Registro')) +
            ((x.rebotados || []).length ? ' ' + X.chip('mal', entero(x.rebotados.length) + ' rebotados') : '') + ((x.sinCuenta || []).length ? ' ' + X.chip('pend', entero(x.sinCuenta.length) + ' sin cuenta') : '');
        } },
        { t: '', html: function (x) {
          var conf = X.semanas && x.estado === 'enviada' && X.puedeEditar();
          return '<div class="fila-acc"><button class="btn sec chico" data-bajar="' + esc(x._id) + '">' + ic('descargar') + (x.lineas ? 'Banco' : 'Excel') + '</button>' +
            (x.lineas ? '<button class="btn sec chico" data-detalle="' + esc(x._id) + '">' + ic('descargar') + 'Detalle</button>' : '') +
            (X.semanas ? '<button class="btn sec chico" data-reporte="' + esc(x._id) + '">' + ic('grafico') + 'Gráficos</button>' : '') +
            (conf && x.lineas ? '<button class="btn chico" data-conciliar="' + esc(x._id) + '">' + ic('cruzar') + 'Conciliar extracto</button>' : '') +
            (conf ? '<button class="btn sec chico" data-confirmar="' + esc(x._id) + '">' + ic('check') + 'Pago confirmado</button><button class="btn sec chico" data-anular="' + esc(x._id) + '">Anular</button>' : '') + '</div>';
        } }
      ], l) : X.vacio('Todavía no se guardó ninguna planilla', '', 'marca/graficos/ilu-factura-recibo.png');
      var buscarP = function (b, k) { return l.filter(function (y) { return y._id === b.getAttribute(k); })[0]; };
      c.cuerpo.querySelectorAll('[data-reporte]').forEach(function (b) { b.addEventListener('click', function () { X.semanas.reporte(buscarP(b, 'data-reporte')); }); });
      c.cuerpo.querySelectorAll('[data-detalle]').forEach(function (b) { b.addEventListener('click', function () { X.banco.detalleExcel(buscarP(b, 'data-detalle')); }); });
      c.cuerpo.querySelectorAll('[data-conciliar]').forEach(function (b) { b.addEventListener('click', function () { X.banco.conciliar(buscarP(b, 'data-conciliar'), c.cerrar); }); });
      c.cuerpo.querySelectorAll('[data-confirmar]').forEach(function (b) { b.addEventListener('click', function () { X.semanas.confirmarPago(buscarP(b, 'data-confirmar'), c.cerrar); }); });
      c.cuerpo.querySelectorAll('[data-anular]').forEach(function (b) { b.addEventListener('click', function () { X.semanas.anularPlanilla(buscarP(b, 'data-anular'), c.cerrar); }); });
      c.cuerpo.querySelectorAll('[data-bajar]').forEach(function (b) {
        b.addEventListener('click', function () {
          var x = buscarP(b, 'data-bajar');
          if (x.lineas) { X.banco.descargarBanco(x.lineas, x.fechaProgramada || x.fecha, x.archivo || 'Planilla Banco'); return; }
          X.excel([{ nombre: 'Pagar', filas: [['N.º', 'ID Yango', 'Nombre', 'Semanas', 'Importe (Bs)']].concat((x.filas || []).map(function (f, i) { return [i + 1, f.id, f.nombre, (f.semanas || []).join(', '), f.importe]; })).concat([['', '', 'TOTAL', '', x.total]]) }], 'Planilla-pago-' + x.fecha);
        });
      });
    }, function (e) { console.error(e); c.cuerpo.innerHTML = X.vacio('No se pudieron traer las planillas', 'Revisa tus permisos.'); });
  }

  /* ══════════ HISTORIAL DE PAGOS ══════════ */
  var H = { buscar: '' };
  function pagosPorFecha() {
    var m = {};
    lista().forEach(function (r) {
      (r.historial || []).forEach(function (h) {
        var k = String(h.fechaPago || '—');
        m[k] = m[k] || { fecha: k, total: 0, filas: [], semanas: {} };
        m[k].total += Number(h.importe) || 0; m[k].filas.push({ r: r, h: h }); m[k].semanas[h.semana] = 1;
      });
    });
    return Object.keys(m).map(function (k) { m[k].total = X.redondear(m[k].total); return m[k]; }).sort(function (a, b) { return (X.aFecha(b.fecha) || 0) - (X.aFecha(a.fecha) || 0); });
  }
  X.pagina('historial', {
    t: 'Historial de pagos', i: 'historial', orden: 4, sec: 'Operación',
    render: function () {
      var cab = X.titulo('Historial de pagos', (X.semanas && X.semanas.modoControl() ? 'Pagos ya realizados (confirmados en CONTROL y migrados de HistPagosMTG), del último año, agrupados por fecha de pago.' : 'Pagos ya realizados (hoja HistPagosMTG), agrupados por fecha de pago.'), '<button class="btn sec" id="btnExpHist">' + ic('descargar') + 'Excel</button>');
      if (!S.portalUsuario) return cab + '<div class="card">' + sinPortal() + '</div>';
      if (!D.repartidores) return cab + X.esqueleto(3);
      var l = pagosPorFecha(), total = X.redondear(l.reduce(function (s, x) { return s + x.total; }, 0));
      var anio = new Date().getFullYear(), delAnio = l.filter(function (x) { var d = X.aFecha(x.fecha); return d && d.getFullYear() === anio; });
      return cab +
        '<div class="rejilla r4 mb">' +
          '<div class="kpi"><small>Pagado ' + anio + '</small><b class="num">' + bs(delAnio.reduce(function (s, x) { return s + x.total; }, 0)) + '</b><em>' + entero(delAnio.length) + ' fechas de pago</em></div>' +
          '<div class="kpi"><small>Último pago</small><b class="num">' + (l[0] ? bs(l[0].total) : '—') + '</b><em>' + (l[0] ? esc(l[0].fecha) + ' · ' + entero(l[0].filas.length) + ' pagos' : '') + '</em></div>' +
          '<div class="kpi"><small>Promedio por pago</small><b class="num">' + bs(l.length ? total / l.length : 0) + '</b><em>sobre ' + entero(l.length) + ' fechas</em></div>' +
          '<div class="kpi"><small>Total histórico</small><b class="num">' + bs(total) + '</b><em>todo lo registrado</em></div>' +
        '</div>' +
        '<div class="card mb"><div class="h2">Evolución <small>por fecha de pago</small></div><div class="grafico"><canvas id="gHist"></canvas></div></div>' +
        '<div class="card"><div class="h2">Fechas de pago <small>toca una para ver el detalle</small></div>' +
          X.tabla([
            { t: 'Fecha de pago', html: function (x) { return '<b class="num">' + esc(x.fecha) + '</b>'; } },
            { t: 'Semanas', html: function (x) { return esc(Object.keys(x.semanas).map(semanaCorta).join(', ')); } },
            { t: 'Pagos', clase: 'monto', html: function (x) { return entero(x.filas.length); } },
            { t: 'Total', clase: 'monto', html: function (x) { return '<b>' + bs(x.total) + '</b>'; } }
          ], l, { clic: true, tam: 30, pag: H.pag || 0 }) + '</div>';
    },
    despues: function (el) {
      if (!D.repartidores) return;
      var l = pagosPorFecha(), col = X.colores(), g = l.slice(0, 26).reverse();
      var cv = el.querySelector('#gHist');
      if (cv) X.grafico(cv, { type: 'line', data: { labels: g.map(function (x) { return x.fecha.slice(0, 5); }), datasets: [{ label: 'Pagado', data: g.map(function (x) { return x.total; }), borderColor: col.fuerte, backgroundColor: col.suave, fill: true, tension: .3, pointRadius: 3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return bs(c.parsed.y); } } } }, scales: { y: { ticks: { callback: function (v) { return 'Bs ' + entero(v); } } } } } });
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { H.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { detallePago(l[Number(tr.getAttribute('data-fila'))]); }); });
      var be = el.querySelector('#btnExpHist');
      if (be) be.addEventListener('click', function () {
        var filas = [['Fecha de pago', 'Semana', 'Período', 'ID Yango', 'Nombre', 'Importe (Bs)']];
        l.forEach(function (x) { x.filas.forEach(function (f) { filas.push([x.fecha, f.h.semana, f.h.rango, f.r.id, f.r.nombre, Number(f.h.importe) || 0]); }); });
        X.excel([{ nombre: 'Por fecha', filas: [['Fecha de pago', 'Pagos', 'Total (Bs)']].concat(l.map(function (x) { return [x.fecha, x.filas.length, x.total]; })) }, { nombre: 'Detalle', filas: filas }], 'Historial-pagos-' + X.hoyISO());
      });
    }
  });
  function detallePago(x) {
    if (!x) return;
    var filas = x.filas.slice().sort(function (a, b) { return X.normal(a.r.nombre).localeCompare(X.normal(b.r.nombre)); });
    X.cajon('Pago del ' + esc(x.fecha), entero(filas.length) + ' pagos · ' + bs(x.total),
      '<div class="herr"><button class="btn sec chico" id="bjP">' + ic('descargar') + 'Excel</button></div>' +
      X.tabla([
        { t: 'Repartidor', html: function (f) { return '<b>' + esc(f.r.nombre) + '</b><span class="sub num">ID ' + esc(f.r.id) + '</span>'; } },
        { t: 'Semana', html: function (f) { return esc(f.h.semana) + '<span class="sub">' + esc(f.h.rango || '') + '</span>'; } },
        { t: 'Importe', clase: 'monto', html: function (f) { return bs(f.h.importe); } }
      ], filas, { tam: 500, pie: '<td colspan="2">Total</td><td class="monto">' + bs(x.total) + '</td>' }),
      function (c) {
        c.querySelector('#bjP').addEventListener('click', function () {
          X.excel([{ nombre: 'Pago ' + x.fecha.replace(/\//g, '-'), filas: [['ID Yango', 'Nombre', 'Semana', 'Período', 'Importe (Bs)']].concat(filas.map(function (f) { return [f.r.id, f.r.nombre, f.h.semana, f.h.rango, Number(f.h.importe) || 0]; })) }], 'Pago-' + x.fecha.replace(/\//g, '-'));
        });
      });
  }

  /* ══════════ REPARTIDORES ══════════ */
  var R = { buscar: '', filtro: 'todos', pag: 0 };
  function filtrarRep() {
    var b = X.normal(R.buscar);
    return lista().filter(function (r) {
      if (R.filtro === 'pendientes' && !(r.pendientes || []).length) return false;
      if (R.filtro === 'nohab' && r.habilitado !== false) return false;
      if (R.filtro === 'sinpoliza' && r.poliza) return false;
      if (R.filtro === 'contax' && !X.clienteDe(r)) return false;
      if (b && (X.normal(r.nombre) + ' ' + r.id + ' ' + r.celular).indexOf(b) < 0) return false;
      return true;
    }).sort(function (a, b2) { return X.normal(a.nombre).localeCompare(X.normal(b2.nombre)); });
  }
  X.pagina('repartidores', {
    t: 'Repartidores', i: 'repartidor', orden: 5, sec: 'Operación',
    render: function () {
      var cab = X.titulo('Repartidores', 'Quiénes pueden entrar al portal (hoja BDYANGO) y cómo están sus pagos.', '<button class="btn sec" id="btnExpRep">' + ic('descargar') + 'Excel</button>');
      if (!S.portalUsuario) return cab + '<div class="card">' + sinPortal() + '</div>';
      if (!D.repartidores) return cab + X.esqueleto(3);
      var f = filtrarRep(), l = lista();
      var n = { todos: l.length, pendientes: l.filter(function (r) { return (r.pendientes || []).length; }).length, nohab: l.filter(function (r) { return r.habilitado === false; }).length, sinpoliza: l.filter(function (r) { return !r.poliza; }).length, contax: l.filter(function (r) { return X.clienteDe(r); }).length };
      return cab + '<div class="card"><div class="pestanas">' + [['todos', 'Todos'], ['pendientes', 'Con pendientes'], ['nohab', 'No habilitados'], ['sinpoliza', 'Sin póliza'], ['contax', 'Clientes CONTAX']].map(function (p) {
        return '<button aria-selected="' + (R.filtro === p[0]) + '" data-f="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(n[p[0]]) + '</em></button>';
      }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bRep" placeholder="Buscar por nombre, ID o celular" value="' + esc(R.buscar) + '"></div></div>' +
        (f.length ? X.tabla([
          { t: 'Repartidor', html: function (r) { return '<b>' + esc(r.nombre) + '</b><span class="sub num">ID ' + esc(r.id) + '</span>'; } },
          { t: 'Celular', html: function (r) { return '<span class="num">' + esc(X.telVisible(r.celular)) + '</span>'; } },
          { t: 'Situación', html: function (r) { return (r.habilitado === false ? X.chip('mal', 'No habilitado') : X.chip('ok', 'Habilitado')) + ' ' + (r.poliza ? '' : X.chip('pend', 'Sin póliza')) + (X.clienteDe(r) ? ' ' + X.chip('contax', 'CONTAX') : ''); } },
          { t: 'Pendiente', clase: 'monto', html: function (r) { var p = (r.resumen || {}).pendientes || {}; return p.cantidad ? '<b>' + bs(p.total) + '</b><span class="sub">' + p.cantidad + ' sem.</span>' : '<span class="muted">—</span>'; } },
          { t: 'Último pago', clase: 'monto', html: function (r) { var h = (r.historial || [])[0]; return h ? bs(h.importe) + '<span class="sub">' + esc(h.fechaPago) + '</span>' : '<span class="muted">—</span>'; } }
        ], f, { clic: true, pag: R.pag }) : X.vacio('No hay repartidores con ese filtro', '', 'marca/graficos/rel-equipo-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      if (!D.repartidores) return;
      el.querySelectorAll('[data-f]').forEach(function (b) { b.addEventListener('click', function () { R.filtro = b.getAttribute('data-f'); R.pag = 0; X.refrescar(); }); });
      var bq = el.querySelector('#bRep'); if (bq) bq.addEventListener('input', debounce(function () { R.buscar = bq.value; R.pag = 0; X.refrescar(); setFoco('#bRep'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { R.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      var f = filtrarRep();
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var r = f[Number(tr.getAttribute('data-fila'))]; if (r) detalleRepartidor(r.uid); }); });
      var be = el.querySelector('#btnExpRep');
      if (be) be.addEventListener('click', function () {
        X.excel([{ nombre: 'Repartidores', filas: [['ID Yango', 'Nombre', 'Celular', 'Habilitado', 'Póliza', 'Cliente CONTAX', 'Semanas pendientes', 'Pendiente (Bs)', 'Pagos recibidos', 'Total cobrado (Bs)']].concat(f.map(function (r) {
          var re = r.resumen || {}; return [r.id, r.nombre, X.telVisible(r.celular), r.habilitado === false ? 'NO' : 'SÍ', r.poliza ? 'SÍ' : 'NO', X.clienteDe(r) ? 'SÍ' : '', (re.pendientes || {}).cantidad || 0, (re.pendientes || {}).total || 0, (re.pagados || {}).cantidad || 0, (re.pagados || {}).total || 0];
        })) }], 'Repartidores-' + X.hoyISO());
      });
    }
  });

  function detalleRepartidor(uid) {
    var r = D.repartidores && D.repartidores.get(uid); if (!r) return;
    var e = evaluar(r), cli = e.cliente, nota = (D.notas || {})[uid];
    var facts = (D.facturas || []).filter(function (f) { return f.uid === uid; });
    var html =
      '<div class="datos">' +
        '<div class="dato"><small>ID de Yango</small><b class="num">' + esc(r.id) + '</b></div>' +
        '<div class="dato"><small>Celular</small><b class="num">' + esc(X.telVisible(r.celular)) + '</b></div>' +
        '<div class="dato"><small>Situación</small><b>' + (r.habilitado === false ? X.chip('mal', 'No habilitado') : X.chip('ok', 'Habilitado')) + ' ' + (r.poliza ? X.chip('ok', 'Con póliza') : X.chip('pend', 'Sin póliza')) + '</b></div>' +
        '<div class="dato"><small>Pago</small><b>' + (e.semanas.length ? (e.listo ? X.chip('ok', 'Listo para pagar') : X.chip('mal', 'Retenido')) : X.chip('neutro', 'Sin pendientes')) + '</b></div>' +
      '</div>' +
      '<div class="fila-acc mb"><a class="btn sec chico" href="' + X.wa(r.celular, 'Hola ' + String(r.nombre || '').split(' ')[0] + ', te escribimos de CONTAX.') + '" target="_blank" rel="noopener">' + ic('whatsapp') + 'WhatsApp</a>' +
        '<button class="btn sec chico" data-copiar="' + esc(r.id) + '">' + ic('copiar') + 'Copiar ID</button>' +
        (X.puedeEditar() ? '<button class="btn sec chico" id="btnNota">' + ic('editar') + (nota ? 'Editar nota' : 'Nota interna') + '</button><button class="btn sec chico" id="btnExc">' + ic('excepcion') + 'Excepción de pago</button>' : '') + '</div>' +
      (nota && nota.texto ? '<div class="nota-interna mb"><b>Nota interna:</b> ' + esc(nota.texto) + '<span class="sub">' + esc(nota.quien || '') + ' · ' + X.fechaHora(nota.cuando) + '</span></div>' : '') +
      (cli ? '<div class="card mb"><div class="h2">Cliente CONTAX ' + X.chip('contax', cli.estado || 'ACTIVO') + '</div>' + accesosCliente(cli) + '</div>' : '') +
      '<div class="card mb"><div class="h2">Pendientes <small>' + bs(e.total) + '</small></div>' +
        (e.semanas.length ? X.tabla([
          { t: 'Semana', html: function (s) { return '<b class="num">' + esc(s.p.semana) + '</b><span class="sub">' + esc(s.p.rango || '') + '</span>'; } },
          { t: X.semanas && X.semanas.modoControl() ? 'Estado' : 'Estado en Sheets', html: function (s) { return esc(s.p.estado || ''); } },
          { t: 'Factura', html: function (s) { return chipSemana(s.estado) + (s.f && s.f.numero ? '<span class="sub">N.º ' + esc(s.f.numero) + '</span>' : '') + (s.ex ? '<span class="sub">' + esc(s.ex.motivo || '') + '</span>' : ''); } },
          { t: 'Importe', clase: 'monto', html: function (s) { return bs(s.p.importe); } }
        ], e.semanas, { tam: 100 }) : X.vacio('Sin pagos pendientes')) + '</div>' +
      '<div class="card mb"><div class="h2">Facturas subidas <small>' + facts.length + '</small></div>' +
        (facts.length ? X.tabla([
          { t: 'Subida', html: function (f) { return X.fechaHora(f.subidoF); } },
          { t: 'N.º', html: function (f) { return '<b class="num">' + esc(f.numero) + '</b>'; } },
          { t: 'Semanas', html: function (f) { return esc((f.semanas || []).join(', ')); } },
          { t: 'Estado', html: function (f) { return CTRL.chipFactura ? CTRL.chipFactura(f) : esc(f.estado); } },
          { t: 'Importe', clase: 'monto', html: function (f) { return bs(f.importe); } }
        ], facts, { tam: 100, clic: true }) : X.vacio('Aún no subió facturas por el portal')) + '</div>' +
      '<div class="card mb"><div class="h2">Historial de pagos <small>' + bs(((r.resumen || {}).pagados || {}).total) + '</small></div>' +
        ((r.historial || []).length ? X.tabla([
          { t: 'Fecha de pago', html: function (h) { return esc(h.fechaPago); } },
          { t: 'Semana', html: function (h) { return esc(h.semana) + '<span class="sub">' + esc(h.rango || '') + '</span>'; } },
          { t: 'Importe', clase: 'monto', html: function (h) { return bs(h.importe); } }
        ], r.historial, { tam: 20 }) : X.vacio('Todavía no recibió pagos')) + '</div>' +
      '<div class="card"><div class="h2">Trámites <small>' + (r.tramites || []).length + '</small></div>' +
        ((r.tramites || []).length ? X.tabla([
          { t: 'N.º', html: function (t) { return '<b class="num">' + esc(t.numero) + '</b><span class="sub">' + esc(t.tipo) + '</span>'; } },
          { t: 'Fecha', html: function (t) { return esc(t.fecha); } },
          { t: 'Estado', html: function (t) { return X.chip(tramiteAbierto(t) ? 'pend' : 'ok', t.estado || 'Sin estado'); } },
          { t: 'Detalle', html: function (t) { return esc([t.asunto, t.detalle, t.comentario].filter(Boolean).join(' · ')); } }
        ], r.tramites, { tam: 50 }) : X.vacio('Sin trámites')) + '</div>';
    X.cajon(esc(r.nombre), 'Portal CONTAX · datos al ' + X.fechaHora(r.actualizado), html, function (c, cerrar) {
      c.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var f = facts[Number(tr.getAttribute('data-fila'))]; if (f && CTRL.abrirFactura) { cerrar(); CTRL.abrirFactura(f._id); } }); });
      var bn = c.querySelector('#btnNota');
      if (bn) bn.addEventListener('click', function () {
        X.formulario('Nota interna', 'Solo la ve el equipo, nunca el repartidor.', [{ k: 'texto', t: 'Nota', tipo: 'textarea', filas: 4, max: 600 }], { texto: nota ? nota.texto : '' }, function (v) {
          return X.dbC.collection('notas').doc(uid).set({ texto: v.texto, quien: S.usuario.email, cuando: X.servidor(), id: String(r.id), nombre: r.nombre }).then(function () {
            D.notas[uid] = { texto: v.texto, quien: S.usuario.email, cuando: new Date() }; X.bitacora('Nota interna', r.id + ' · ' + r.nombre); cerrar(); detalleRepartidor(uid);
          });
        });
      });
      var bx = c.querySelector('#btnExc');
      if (bx) bx.addEventListener('click', function () { cerrar(); if (CTRL.nuevaExcepcion) CTRL.nuevaExcepcion({ idYango: String(r.id), nombre: r.nombre }); });
    });
  }
  function accesosCliente(c) {
    var sec = function (et, v) { return v ? '<div class="dato"><small>' + et + '</small><div class="secreto"><code>' + esc(v) + '</code><button class="icono-btn" data-copiar="' + esc(v) + '" aria-label="Copiar ' + et + '">' + ic('copiar') + '</button></div></div>' : ''; };
    return '<div class="datos">' + sec('NIT', c.nit) + sec('Usuario SIAT', c.usuarioSiat) + sec('Contraseña SIAT', c.claveSiat) + sec('Usuario portal', c.usuarioPortal) + sec('Contraseña portal', c.clavePortal) + '</div>' +
      (c.notas ? '<p class="muted" style="margin:0">' + esc(c.notas) + '</p>' : '');
  }

  /* ══════════ TRÁMITES ══════════ */
  var TR = { buscar: '', tipo: '', estado: 'abiertos', pag: 0 };
  function todosTramites() {
    var l = [];
    lista().forEach(function (r) { (r.tramites || []).forEach(function (t) { l.push({ r: r, t: t, abierto: tramiteAbierto(t), o: X.aFecha(t.fecha) || 0 }); }); });
    return l.sort(function (a, b) { return b.o - a.o; });
  }
  X.pagina('tramites', {
    t: 'Trámites', i: 'tramites', orden: 6, sec: 'Operación',
    cuenta: function () { if (!D.repartidores) return 0; var n = 0; lista().forEach(function (r) { (r.tramites || []).forEach(function (t) { if (tramiteAbierto(t)) n++; }); }); return n; },
    render: function () {
      var cab = X.titulo('Trámites', 'Soporte, pólizas, devoluciones y pagos por desactivación. Hoy se responden en sus hojas de seguimiento; aquí se ven todos juntos.', '<button class="btn sec" id="btnExpTr">' + ic('descargar') + 'Excel</button>');
      if (!S.portalUsuario) return cab + '<div class="card">' + sinPortal() + '</div>';
      if (!D.repartidores) return cab + X.esqueleto(3);
      var todos = todosTramites(), tipos = {};
      todos.forEach(function (x) { tipos[x.t.tipo] = (tipos[x.t.tipo] || 0) + 1; });
      var f = filtrarTr(todos);
      return cab +
        '<div class="rejilla r4 mb">' + Object.keys(tipos).map(function (k) {
          var ab = todos.filter(function (x) { return x.t.tipo === k && x.abierto; }).length;
          return '<button class="kpi" data-tipo="' + esc(k) + '"><small>' + esc(k) + '</small><b class="num">' + entero(ab) + '</b><em>abiertos de ' + entero(tipos[k]) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="card"><div class="pestanas">' + [['abiertos', 'Abiertos'], ['cerrados', 'Resueltos'], ['', 'Todos']].map(function (p) {
          return '<button aria-selected="' + (TR.estado === p[0]) + '" data-est="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bTr" placeholder="Buscar por nombre, ID o número" value="' + esc(TR.buscar) + '"></div>' +
          '<select id="sTipo"><option value="">Todos los tipos</option>' + Object.keys(tipos).map(function (k) { return '<option' + (k === TR.tipo ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        (f.length ? X.tabla([
          { t: 'N.º', html: function (x) { return '<b class="num">' + esc(x.t.numero) + '</b><span class="sub">' + esc(x.t.tipo) + '</span>'; } },
          { t: 'Repartidor', html: function (x) { return esc(x.r.nombre) + '<span class="sub num">ID ' + esc(x.r.id) + '</span>'; } },
          { t: 'Fecha', html: function (x) { return esc(x.t.fecha); } },
          { t: 'Detalle', html: function (x) { return esc([x.t.asunto, x.t.detalle].filter(Boolean).join(' · ')); } },
          { t: 'Estado', html: function (x) { return X.chip(x.abierto ? 'pend' : 'ok', x.t.estado || 'Sin estado') + (x.t.resolucion ? '<span class="sub">' + esc(x.t.resolucion) + '</span>' : ''); } }
        ], f, { clic: true, pag: TR.pag }) : X.vacio('No hay trámites con ese filtro', '', 'marca/graficos/rel-aprobado-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      if (!D.repartidores) return;
      var todos = todosTramites(), f = filtrarTr(todos);
      el.querySelectorAll('[data-est]').forEach(function (b) { b.addEventListener('click', function () { TR.estado = b.getAttribute('data-est'); TR.pag = 0; X.refrescar(); }); });
      el.querySelectorAll('[data-tipo]').forEach(function (b) { b.addEventListener('click', function () { TR.tipo = b.getAttribute('data-tipo'); TR.estado = 'abiertos'; TR.pag = 0; X.refrescar(); }); });
      var st = el.querySelector('#sTipo'); if (st) st.addEventListener('change', function () { TR.tipo = st.value; TR.pag = 0; X.refrescar(); });
      var bq = el.querySelector('#bTr'); if (bq) bq.addEventListener('input', debounce(function () { TR.buscar = bq.value; TR.pag = 0; X.refrescar(); setFoco('#bTr'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { TR.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var x = f[Number(tr.getAttribute('data-fila'))]; if (x) detalleRepartidor(x.r.uid); }); });
      var be = el.querySelector('#btnExpTr');
      if (be) be.addEventListener('click', function () {
        X.excel([{ nombre: 'Trámites', filas: [['N.º', 'Tipo', 'Fecha', 'ID Yango', 'Nombre', 'Asunto', 'Detalle', 'Estado', 'Resolución', 'Comentario', 'Fecha respuesta']].concat(f.map(function (x) {
          return [x.t.numero, x.t.tipo, x.t.fecha, x.r.id, x.r.nombre, x.t.asunto, x.t.detalle, x.t.estado, x.t.resolucion, x.t.comentario, x.t.fechaRespuesta];
        })) }], 'Tramites-' + X.hoyISO());
      });
    }
  });
  function filtrarTr(todos) {
    var b = X.normal(TR.buscar);
    return todos.filter(function (x) {
      if (TR.estado === 'abiertos' && !x.abierto) return false;
      if (TR.estado === 'cerrados' && x.abierto) return false;
      if (TR.tipo && x.t.tipo !== TR.tipo) return false;
      if (b && (X.normal(x.r.nombre) + ' ' + x.r.id + ' ' + X.normal(x.t.numero)).indexOf(b) < 0) return false;
      return true;
    });
  }

  X.evaluar = evaluar; X.ordenSemana = ordenSemana; X.semanaCorta = semanaCorta; X.lista = lista;
  X.detalleRepartidor = detalleRepartidor; X.accesosCliente = accesosCliente; X.debounce = debounce; X.setFoco = setFoco; X.corte = corte;
})();
