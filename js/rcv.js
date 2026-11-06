/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — RCV mensual
   El Registro de Compras COMPLETO del mes, para los auditores: el 100 %
   de las facturas, cada una con su clasificación y su fecha de pago.
   No toca facturas ni pagos: solo lee. Se guarda en «cruces» con el
   documento rcv_AAAA-MM y sus partes rcv_AAAA-MM_p1…, sin campo «cuando»,
   así no aparece en Conciliaciones. La fecha de pago se calcula al abrir,
   y las correcciones a mano quedan aparte, en «ajustes».
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D;
  var esc = X.esc, ic = X.ic, entero = X.entero, bs = X.bs;
  var TAM = 1000, MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var RIDER = 'FACTURAS RIDERS', OTRAS = 'OTRAS FACTURAS', DUP = 'NO TOMAR EN CUENTA / DUPLICADA', IMP = 'NO TOMAR EN CUENTA / IMPORTES NO AUTORIZADOS', NOT = 'NO TOMAR EN CUENTA', IDENT = 'IDENTIFICAR';
  var CLASES = [RIDER, OTRAS, DUP, IMP, NOT, IDENT];

  /* Solo una sugerencia: el RCV no dice qué se compró, se deduce del nombre del proveedor */
  var RUBROS = [
    ['Combustible', /ESTACION DE SERVICIO|SURTIDOR|GASOLINERA|YPFB|\bGNV\b/],
    ['Telefonía e internet', /\bENTEL\b|TELECEL|\bTIGO\b|NUEVATEL|\bCOTAS\b|\bAXS\b|TELECOMUNICACION/],
    ['Servicios básicos', /\bCRE\b|ELFEC|DELAPAZ|SAGUAPAC|SEMAPA|\bEPSAS\b|ELECTRIFICACION|AGUA POTABLE/],
    ['Bancos y finanzas', /\bBANCO\b|FINANCIERA|AHORRO Y CREDITO|\bFIE\b/],
    ['Seguros', /SEGUROS?\b|ASEGURADORA|REASEGURO/],
    ['Alimentación', /RESTAURANT|POLLOS|PIZZ|CAFE\b|CAFETERIA|HAMBURGUES|SUPERMERCADO|HIPERMAXI|FIDALGA|PANADERIA/],
    ['Viajes y hospedaje', /\bHOTEL|BOLIVIANA DE AVIACION|AEROLINEA|AGENCIA DE VIAJES|TRANSPORTE AEREO/],
    ['Salud', /FARMACIA|CLINICA|HOSPITAL|LABORATORIO/],
    ['Vehículos', /LLANTA|REPUESTO|AUTOMOTRIZ|LUBRICANTE|TALLER|MOTOS?\b/],
    ['Oficina e imprenta', /PAPELERIA|LIBRERIA|IMPRENTA|GRAFICA/],
    ['Tecnología', /COMPUTACION|SOFTWARE|TECNOLOGIA|SISTEMAS/],
    ['Servicios profesionales', /CONSULTOR|AUDITOR|ABOGAD|NOTARIA|ESTUDIO JURIDICO|CONTABLE/],
    ['Inmuebles y alquiler', /INMOBILIARIA|ALQUILER|CONDOMINIO/]
  ];
  function rubroDe(nom) { var t = X.normal(nom); for (var i = 0; i < RUBROS.length; i++) if (RUBROS[i][1].test(t)) return RUBROS[i][0]; return 'Sin identificar'; }
  function clave(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function nombreMes(m) { var p = String(m).split('-'); return (MESES[Number(p[1]) - 1] || '') + ' ' + p[0]; }
  function col() { return X.dbC.collection('cruces'); }

  /* ── Columnas del RCV ── */
  function columnas(enc) {
    var bus = function (re) { for (var j = 0; j < enc.length; j++) if (re.test(X.normal(enc[j]))) return j; return -1; };
    return { num: bus(/^NUMERO FACTURA|^N(RO|UM)?\.?\s*(DE\s*)?FACTURA/), imp: bus(/^IMPORTE TOTAL/), nit: bus(/^NIT/), nom: bus(/^RAZON|^NOMBRE/), fecha: bus(/^FECHA/), aut: bus(/AUTORIZACION|^CUF/), est: bus(/^ESTADO/), cf: bus(/^CREDITO FISCAL/) };
  }

  /* ── Clasificación: usa el mismo cruce de la conciliación, sin escribir nada ── */
  function claseDe(x, f) {
    if (f && f.caso && /observada|rechazada|porAnular/.test(f.estado || '')) {
      if (/duplicada|sinPago/i.test(f.caso)) return DUP;
      if (/importe|suma/.test(f.caso)) return IMP;
      return NOT;
    }
    if (x.r === 'coincide') return RIDER;
    if (x.r === 'usada') return /repetida/.test(x.det || '') ? DUP : RIDER;
    if (x.r === 'otros') return OTRAS;
    if (x.r === 'duplicada' || x.r === 'sinPago') return DUP;
    if (x.r === 'importe' || x.r === 'suma') return IMP;
    if (x.r === 'anulada') return NOT;
    return IDENT;
  }
  function indiceHist() {
    var aut = {}, sem = {}, porId = {};
    (D.hist || []).forEach(function (h) {
      if (h.autorizacion) aut[clave(h.autorizacion)] = h;
      sem[h.id + '|' + X.ordenSemana(h.semana)] = h;
      (porId[h.id] = porId[h.id] || []).push(h);
    });
    return { aut: aut, sem: sem, porId: porId };
  }
  function clasificar(raw, c, ctx) {
    var P = X.conciliacion._puro, lista = P.leerFilas(raw, c);
    lista.forEach(function (x, i) { x._i = i; });
    var res = P.cruzar(lista, ctx).filas.filter(function (r) { return !r.portal; });
    var facturas = {}; (D.facturas || []).forEach(function (f) { facturas[f._id] = f; });
    var ix = indiceHist(), usados = {}, salida = new Array(raw.length);
    var semanaDe = function (r, f) { return r.semana || (f && (f.semanas || [])[0]) || ''; };
    res.forEach(function (r) {
      var f = r.fid ? facturas[r.fid] : null, clase = claseDe(r, f), h = ix.aut[clave(r.aut)], s = semanaDe(r, f) || (h ? h.semana : '');
      if (clase === RIDER) { var k = (r.id || (h && h.id)) + '|' + X.ordenSemana(s); usados[k] = 1; }
      salida[r._i] = { d: raw[r._i], c: clase, i: String(r.id || (h && h.id) || ''), n: r.nombre || (h && h.nombre) || '', s: s, k: r.contador || '', o: clase === RIDER || clase === OTRAS ? '' : (r.r === 'anulada' ? 'Anulada' : String(r.det || '').slice(0, 160)) };
    });
    // Pagos confirmados en CONTROL no guardan el código de la factura: se reconocen por repartidor e importe
    res.forEach(function (r) {
      var o = salida[r._i]; if (!o || (o.c !== DUP && o.c !== IMP) || !o.i || r.r === 'usada') return;
      var h = (ix.porId[o.i] || []).filter(function (y) {
        return !usados[y.id + '|' + X.ordenSemana(y.semana)] && Math.abs(y.importe - r.imp) <= 0.05 && (!y.autorizacion || clave(y.autorizacion) === clave(r.aut));
      })[0];
      if (h) { usados[h.id + '|' + X.ordenSemana(h.semana)] = 1; o.c = RIDER; o.s = h.semana; o.o = ''; }
    });
    return salida.filter(Boolean);
  }

  /* ── Fecha de pago: se calcula al abrir, así se completa sola cuando el pago se confirma ── */
  function fechaPago(o, ix, abiertas, c) {
    if (o.c !== RIDER) return { t: '' };
    var h = ix.aut[clave(o.d[c.aut])] || ix.sem[o.i + '|' + X.ordenSemana(o.s)];
    if (h) return { t: X.fecha(h.fecha), pagada: true };
    var a = abiertas[o.i + '|' + X.ordenSemana(o.s)];
    if (a) return { t: a === 'en_planilla' ? 'En planilla' : 'Pendiente de pago', falta: true };
    return { t: IDENT, sinDato: true };
  }
  function claveFila(o, c) { return clave(o.d[c.aut]) || (P_limpia(o.d[c.nit]) + '|' + P_limpia(o.d[c.num])); }
  function P_limpia(v) { return X.conciliacion._puro.limpiaNum(v); }

  /* ── Estado de la página ── */
  var V = { lista: null, mes: '', doc: null, filas: null, filtro: '', buscar: '', pag: 0, cargando: false };
  function ajustes() { try { return JSON.parse((V.doc && V.doc.ajustes) || '{}'); } catch (e) { return {}; } }
  function vista() {
    if (!V.filas) return [];
    var c = V.doc.cols, ix = indiceHist(), ab = {}, aj = ajustes();
    (D.semanas || []).forEach(function (s) { ab[s.id + '|' + X.ordenSemana(s.semana)] = s.estado; });
    return V.filas.map(function (o, i) {
      var k = claveFila(o, c), a = aj[k], e = a ? Object.assign({}, o, { c: a.c || o.c, o: a.o != null ? a.o : o.o }) : o, p = fechaPago(e, ix, ab, c);
      var imp = X.numero(o.d[c.imp]) || 0, cf = c.cf >= 0 ? X.numero(o.d[c.cf]) || 0 : 0, nom = String(o.d[c.nom] || '');
      var g = e.c === RIDER ? (p.pagada ? 'pagada' : p.falta ? 'porPagar' : 'ident') : e.c === IDENT ? 'ident' : e.c === OTRAS ? 'otras' : 'notomar';
      return { i: i, k: k, o: e, p: p, g: g, imp: imp, cf: cf, nom: nom, rubro: e.c === OTRAS ? ((a && a.rubro) || rubroDe(nom)) : '', manual: !!a };
    });
  }
  function suma(l) { return { n: l.length, t: X.redondear(l.reduce(function (s, x) { return s + x.imp; }, 0)), cf: X.redondear(l.reduce(function (s, x) { return s + x.cf; }, 0)) }; }
  function cargarLista() {
    if (V.cargando) return; V.cargando = true;
    col().where('rcvMes', '>=', '2000').get().then(function (q) {
      var l = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; l.push(x); });
      V.lista = l.sort(function (a, b) { return String(b.rcvMes).localeCompare(String(a.rcvMes)); }); V.cargando = false;
      if (l.length) abrirMes(V.mes || l[0].rcvMes); else X.refrescar();
    }, function (e) { console.error(e); V.lista = []; V.cargando = false; X.aviso('No se pudo leer el RCV guardado.'); X.refrescar(); });
  }
  function abrirMes(m) {
    var doc = (V.lista || []).filter(function (x) { return x.rcvMes === m; })[0]; if (!doc) return;
    V.mes = m; V.doc = doc; V.filas = null; V.pag = 0; X.refrescar();
    var l = []; for (var i = 1; i <= (doc.partes || 0); i++) l.push(col().doc(doc._id + '_p' + i).get());
    Promise.all(l).then(function (ds) {
      V.filas = ds.reduce(function (a, d) { return a.concat(d.exists ? JSON.parse(d.data().filas || '[]') : []); }, []); X.refrescar();
    }, function (e) { console.error(e); X.aviso('No se pudieron traer las facturas de ese mes.'); });
  }
  function guardar(mes, enc, c, filas, archivo, aj) {
    var id = 'rcv_' + mes, lote = X.dbC.batch(), partes = Math.ceil(filas.length / TAM);
    lote.set(col().doc(id), { rcvMes: mes, archivo: archivo, encabezados: enc, cols: c, filasTotal: filas.length, partes: partes, ajustes: aj || '{}', actualizado: X.servidor(), quien: S.usuario.email });
    for (var i = 0; i < partes; i++) lote.set(col().doc(id + '_p' + (i + 1)), { parteDe: id, n: i + 1, filas: JSON.stringify(filas.slice(i * TAM, (i + 1) * TAM)) });
    return lote.commit();
  }
  function listo() {
    if (D.facturas && D.hist && D.bdyango && (D.bdyango.lista || []).length) return true;
    X.aviso('Todavía están cargando los datos. Espera unos segundos y vuelve a intentar.'); return false;
  }
  function procesar(raw, enc, c, archivo, mes, aj, texto) {
    X.clasicos(true, 'Arquímedes está clasificando el RCV del mes…');
    return X.conciliacion._puro.contexto().then(function (ctx) {
      var filas = clasificar(raw, c, ctx);
      return guardar(mes, enc, c, filas, archivo, aj).then(function () { return X.bitacora(texto, nombreMes(mes) + ' · ' + filas.length + ' facturas'); });
    }).then(function () {
      X.clasicos(false); V.lista = null; V.mes = mes; V.doc = null; V.filas = null; X.aviso('RCV de ' + nombreMes(mes) + ' listo.'); X.refrescar();
    }, function (e) { console.error(e); X.clasicos(false); X.aviso('No se pudo guardar el RCV. Revisa tu conexión o tus permisos.'); });
  }
  function subir() {
    if (!listo()) return;
    X.ventana('Subir RCV del mes', 'El Registro de Compras completo que descargas de Impuestos Nacionales (Excel). Si ese mes ya estaba, se reemplaza y se conservan tus correcciones a mano.',
      '<div class="fm"><div class="fila"><label for="rvArch">Archivo</label><input id="rvArch" type="file" accept=".xlsx,.xls,.csv"></div><div id="rvInfo"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('subir') + 'Clasificar y guardar</button>', function (v, cerrar) {
        var ok = v.querySelector('[data-ok]'), info = v.querySelector('#rvInfo'), dato = null;
        v.querySelector('#rvArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return;
          ok.disabled = true; dato = null; info.innerHTML = X.anillo('Leyendo el archivo…');
          X.cargarXLSX().then(function (XL) {
            return a.arrayBuffer().then(function (buf) {
              var lb = /\.csv$/i.test(a.name) ? XL.read(new TextDecoder('utf-8').decode(buf), { type: 'string', raw: true }) : XL.read(buf, { type: 'array' });
              var todas = XL.utils.sheet_to_json(lb.Sheets[lb.SheetNames[0]], { header: 1, raw: true, defval: '' }), i0 = 0;
              for (var i = 0; i < Math.min(todas.length, 15); i++) if (todas[i].filter(function (t) { return /[a-z]/i.test(String(t)); }).length >= 3) { i0 = i; break; }
              var enc = todas[i0].map(function (h) { return String(h).trim(); }), c = columnas(enc);
              if (c.num < 0 || c.imp < 0 || c.nit < 0 || c.nom < 0 || c.fecha < 0) throw new Error('Este archivo no parece el Registro de Compras: faltan columnas.');
              var limpia = X.conciliacion._puro.limpiaNum, fechaRCV = X.conciliacion._puro.fechaRCV;
              var raw = todas.slice(i0 + 1).filter(function (f) { return limpia(f[c.num]) || limpia(f[c.nit]); });
              var meses = {}; raw.forEach(function (f) { var m = fechaRCV(f[c.fecha]).slice(0, 7); if (m) meses[m] = (meses[m] || 0) + 1; });
              var orden = Object.keys(meses).sort(function (p, q) { return meses[q] - meses[p]; }), mes = orden[0];
              if (!mes) throw new Error('No se pudo leer la fecha de las facturas.');
              var total = raw.reduce(function (s, f) { return s + (X.numero(f[c.imp]) || 0); }, 0), fuera = raw.length - meses[mes];
              dato = { raw: raw, enc: enc, c: c, mes: mes, archivo: a.name };
              info.innerHTML = '<div class="aviso-caja">' + ic('ayuda') + '<div><b>' + esc(nombreMes(mes)) + ': ' + entero(raw.length) + ' facturas · ' + bs(total) + '</b>' + (fuera ? entero(fuera) + ' facturas tienen fecha de otro mes: revisa que sea el archivo correcto.' : 'Todas las facturas son de este mes.') + '</div></div>';
              ok.disabled = false;
            });
          }).catch(function (ex) { console.error(ex); info.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          var ant = (V.lista || []).filter(function (x) { return x.rcvMes === dato.mes; })[0];
          cerrar(); procesar(dato.raw, dato.enc, dato.c, dato.archivo, dato.mes, ant ? ant.ajustes : '{}', 'Subió RCV mensual');
        });
      });
  }
  function actualizar() {
    if (!listo() || !V.filas) return;
    var d = V.doc;
    procesar(V.filas.map(function (o) { return o.d; }), d.encabezados, d.cols, d.archivo, d.rcvMes, d.ajustes, 'Actualizó RCV mensual');
  }
  function corregir(x) {
    var c = V.doc.cols;
    X.ventana('Corregir clasificación', 'Factura N.º ' + esc(x.o.d[c.num]) + ' · ' + esc(x.nom) + ' · ' + bs(x.imp),
      '<div class="fm"><div class="fila"><label for="rvC">Clasificación</label><select id="rvC">' + CLASES.map(function (k) { return '<option' + (k === x.o.c ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fila"><label for="rvR">Rubro (solo Otras Facturas)</label><input id="rvR" maxlength="60" value="' + esc(x.rubro) + '"></div>' +
      '<div class="fila"><label for="rvO">Observación</label><input id="rvO" maxlength="160" value="' + esc(x.o.o || '') + '"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Guardar</button>', function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var aj = ajustes(), nuevo = v.querySelector('#rvC').value;
          aj[x.k] = { c: nuevo, rubro: v.querySelector('#rvR').value.trim(), o: v.querySelector('#rvO').value.trim(), quien: S.usuario.email };
          var txt = JSON.stringify(aj); ok.disabled = true;
          col().doc(V.doc._id).update({ ajustes: txt, actualizado: X.servidor() }).then(function () {
            V.doc.ajustes = txt; cerrar(); X.bitacora('Corrigió clasificación del RCV', nombreMes(V.mes) + ' · N.º ' + x.o.d[c.num] + ' · ' + nuevo); X.refrescar();
          }, function (e) { console.error(e); ok.disabled = false; X.aviso('No se pudo guardar.'); });
        });
      });
  }

  /* ── Excel para los auditores: el 100 % de las facturas ── */
  function colorClase(v) {
    if (v === RIDER) return ['8EB69B', '051F20'];
    if (v === OTRAS) return ['DAF1DE', '163832'];
    if (v === IDENT) return ['FFF2CC', '7A5B00'];
    return ['FBE5D6', 'B54708'];
  }
  function excel() {
    var l = vista(), d = V.doc, enc = d.encabezados, nombre = 'RCV ' + nombreMes(V.mes).replace(' ', '');
    var numerica = enc.map(function (h) { return /^(IMPORTE|TASAS|OTRO NO SUJETO|SUBTOTAL|DESCUENTOS|CREDITO FISCAL)/.test(X.normal(h)); });
    var filas = [enc.concat(['CLASIFICACIÓN', 'Fecha de Pago', 'ID repartidor', 'Nombre repartidor', 'Semana', 'Contador', 'Rubro sugerido', 'Observación'])].concat(l.map(function (x) {
      var base = enc.map(function (_, j) { var v = x.o.d[j]; return numerica[j] && typeof v === 'string' ? (X.numero(v) || 0) : (v == null ? '' : v); });
      return base.concat([x.o.c, x.p.t, x.o.i, x.o.n, x.o.s, x.o.k, x.rubro, x.o.o || '']);
    }));
    var fila = function (t, s) { return [t, s.n, s.t, s.cf]; }, por = function (k) { return suma(l.filter(function (x) { return x.o.c === k; })); };
    var resumen = [['Clasificación', 'Facturas', 'Importe (Bs)', 'Crédito fiscal (Bs)']].concat(CLASES.map(function (k) { return fila(k, por(k)); })).concat([fila('TOTAL DEL MES', suma(l))]);
    var estados = [['Pago de las Facturas Riders', 'Facturas', 'Importe (Bs)', 'Crédito fiscal (Bs)'], fila('Pagadas', suma(l.filter(function (x) { return x.g === 'pagada'; }))), fila('Por pagar', suma(l.filter(function (x) { return x.g === 'porPagar'; })))];
    var rub = {}; l.forEach(function (x) { if (x.rubro) (rub[x.rubro] = rub[x.rubro] || []).push(x); });
    var rubros = [['Rubro sugerido (según el nombre del proveedor)', 'Facturas', 'Importe (Bs)', 'Crédito fiscal (Bs)']].concat(Object.keys(rub).sort().map(function (k) { return fila(k, suma(rub[k])); }));
    var col0 = enc.length;
    return X.excel([
      { nombre: nombre, columnas: filas[0].length, importe: d.cols.imp, estado: col0, colorEstado: colorClase, filas: filas },
      { nombre: 'Resumen', importe: 2, filas: resumen },
      { nombre: 'Pago de riders', importe: 2, filas: estados },
      { nombre: 'Otras por rubro', importe: 2, filas: rubros }
    ], nombre, X.banco.estiloDetalle).then(function () { X.bitacora('Descargó RCV para auditores', nombreMes(V.mes)); });
  }

  /* ── Página ── */
  var GRUPOS = [['', 'Facturas del mes'], ['pagada', 'Riders pagadas'], ['porPagar', 'Riders por pagar'], ['ident', 'Por identificar'], ['otras', 'Otras facturas'], ['notomar', 'No tomar en cuenta']];
  function chipClase(k) { return X.chip(k === RIDER ? 'ok' : k === OTRAS ? 'neutro' : k === IDENT ? 'pend' : 'mal', k.replace('NO TOMAR EN CUENTA / ', 'No tomar: ').replace('NO TOMAR EN CUENTA', 'No tomar').replace('FACTURAS RIDERS', 'Rider').replace('OTRAS FACTURAS', 'Otra').replace('IDENTIFICAR', 'Identificar')); }
  X.pagina('rcv', {
    t: 'RCV mensual', i: 'factura', orden: 2.6, sec: 'Operación',
    render: function () {
      var ed = X.puedeEditar();
      var cab = X.titulo('RCV mensual', 'El Registro de Compras completo del mes para los auditores: todas las facturas, con su clasificación y su fecha de pago.',
        (V.filas ? '<button class="btn sec" id="rvExcel">' + ic('descargar') + 'Excel para auditores</button>' + (ed ? '<button class="btn sec" id="rvAct">' + ic('recargar') + 'Actualizar cruce</button>' : '') : '') + (ed ? '<button class="btn" id="rvSubir">' + ic('subir') + 'Subir RCV del mes</button>' : ''));
      if (!V.lista) { cargarLista(); return cab + X.cargaN('Trayendo el RCV', ''); }
      if (!V.lista.length) return cab + '<div class="card">' + X.vacio('Todavía no subiste ningún RCV', 'Descarga el Registro de Compras del mes en Impuestos Nacionales y súbelo aquí.') + '</div>';
      var sel = '<div class="herr"><select id="rvMes" aria-label="Mes">' + V.lista.map(function (x) { return '<option value="' + esc(x.rcvMes) + '"' + (x.rcvMes === V.mes ? ' selected' : '') + '>' + esc(nombreMes(x.rcvMes)) + ' · ' + entero(x.filasTotal) + ' facturas</option>'; }).join('') + '</select>';
      if (!V.filas) return cab + X.cargaN('Trayendo las facturas del mes', '');
      var l = vista(), b = X.normal(V.buscar);
      var kpis = '<div class="rejilla r3 mb">' + GRUPOS.map(function (g) {
        var s = suma(g[0] ? l.filter(function (x) { return x.g === g[0]; }) : l);
        return '<button class="kpi' + (V.filtro === g[0] ? ' activo' : '') + '" data-rf="' + g[0] + '"><small>' + esc(g[1]) + '</small><b class="num">' + entero(s.n) + '</b><em>' + bs(s.t) + ' · CF ' + bs(s.cf) + '</em></button>';
      }).join('') + '</div>';
      var c = V.doc.cols, lista = l.filter(function (x) {
        if (V.filtro && x.g !== V.filtro) return false;
        return !b || (X.normal(x.nom + ' ' + x.o.n) + ' ' + x.o.i + ' ' + x.o.d[c.nit] + ' ' + x.o.d[c.num] + ' ' + clave(x.o.d[c.aut])).indexOf(b) >= 0;
      });
      V.vistaLista = lista;
      var t = X.tabla([
        { t: 'Fecha', html: function (x) { return '<span class="num">' + esc(X.fecha(X.conciliacion._puro.fechaRCV(x.o.d[c.fecha]))) + '</span>'; } },
        { t: 'Factura', html: function (x) { return '<b class="num">N.º ' + esc(x.o.d[c.num]) + '</b><span class="sub num">NIT ' + esc(x.o.d[c.nit]) + '</span>'; } },
        { t: 'Proveedor', html: function (x) { return '<b>' + esc(x.nom) + '</b>' + (x.rubro ? '<span class="sub">' + esc(x.rubro) + '</span>' : ''); } },
        { t: 'Importe', clase: 'monto', html: function (x) { return bs(x.imp); } },
        { t: 'Clasificación', html: function (x) { return chipClase(x.o.c) + (x.manual ? ' ' + X.chip('neutro', 'A mano') : '') + (x.o.o ? '<span class="sub">' + esc(x.o.o) + '</span>' : ''); } },
        { t: 'Fecha de pago', html: function (x) { return x.p.t ? esc(x.p.t) : '<span class="muted">—</span>'; } },
        { t: 'Repartidor', html: function (x) { return x.o.i ? esc(x.o.n) + '<span class="sub num">ID ' + esc(x.o.i) + (x.o.s ? ' · ' + esc(X.semanaCorta(x.o.s)) : '') + '</span>' : '<span class="muted">—</span>'; } }
      ], lista, { clic: ed, tam: 50, pag: V.pag });
      sel += '<div class="buscar">' + ic('buscar') + '<input type="search" id="rvBuscar" placeholder="Buscar por proveedor, repartidor, ID, NIT, N.º o autorización" value="' + esc(V.buscar) + '"></div></div>';
      return cab + kpis + '<div class="card">' + sel + '<p class="muted" style="margin:0 0 10px"><b>' + entero(lista.length) + ' facturas · ' + bs(suma(lista).t) + '</b>' + (ed ? ' · toca una factura para corregir su clasificación' : '') + ' · archivo: ' + esc(V.doc.archivo) + '</p>' + t + '</div>';
    },
    despues: function (el) {
      var on = function (s, f) { var b = el.querySelector(s); if (b) b.addEventListener('click', f); };
      on('#rvSubir', subir); on('#rvAct', actualizar);
      on('#rvExcel', function () { excel().catch(function (e) { console.error(e); X.aviso('No se pudo generar el Excel.'); }); });
      var m = el.querySelector('#rvMes'); if (m) m.addEventListener('change', function () { abrirMes(m.value); });
      el.querySelectorAll('[data-rf]').forEach(function (b) { b.addEventListener('click', function () { V.filtro = b.getAttribute('data-rf'); V.pag = 0; X.refrescar(); }); });
      var bu = el.querySelector('#rvBuscar'); if (bu) bu.addEventListener('input', X.debounce(function () { V.buscar = bu.value; V.pag = 0; X.refrescar(); X.setFoco('#rvBuscar'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { V.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var x = (V.vistaLista || [])[Number(tr.getAttribute('data-fila'))]; if (x) corregir(x); }); });
    }
  });
  X.rcv = { _puro: { claseDe: claseDe, rubroDe: rubroDe, columnas: columnas, clasificar: clasificar } };
})();
