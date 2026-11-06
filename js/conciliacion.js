/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Conciliación con Impuestos Nacionales
   El Excel (Registro de Compras de MILTHAGOR) es la verificación real:
   subir la factura al Portal es solo una pre-aprobación.
   Se recorre CADA FILA del Excel y se busca un pago que deba factura:
   · alcanza con nombre + importe; si tenemos el NIT, también se compara
   · una factura por pago, y cada fila del Excel se usa una sola vez
   · cada semana se puede facturar desde el martes después de su cierre
   Todo Excel cargado queda guardado en «cruces» para la auditoría:
   el resumen en {id} y las filas en {id}_p1, _p2… (texto JSON, sin campo
   «cuando»: así la lista no las lee y se gastan pocas lecturas).
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D;
  var esc = X.esc, ic = X.ic, entero = X.entero, bs = X.bs;
  var TAM_PARTE = 1000;

  var RES = {
    coincide: ['ok', 'Coincide con un pago', 'ok'],
    importe: ['mal', 'Otro importe', 'mal'],
    suma: ['mal', 'Suma varios pagos', 'mal'],
    nitDistinto: ['mal', 'NIT distinto', 'mal'],
    fechaAntes: ['mal', 'Emitida antes de tiempo', 'mal'],
    dudosa: ['pend', 'Revisar a mano', 'mal'],
    sinPago: ['pend', 'Sin pago pendiente', 'mal'],
    anulada: ['mal', 'Anulada', 'anulada'],
    otros: ['neutro', 'No es de repartidores', 'otros'],
    usada: ['neutro', 'Ya verificada antes', 'ya'],
    noEsta: ['mal', 'Posible fraude: no está en el Excel', 'portal'],
    contaxFalta: ['pend', 'Marcada por CONTAX, no está en el Excel', 'portal'],
    espera: ['neutro', 'Espera el Excel de sus fechas', 'portal']
  };
  function grupo(r) { return (RES[r] || [0, 0, 'mal'])[2]; }

  /* ── Lectura del Excel ── */
  function limpiaNum(n) { return String(n == null ? '' : n).replace(/\D/g, '').replace(/^0+/, ''); }
  function fechaRCV(v) {
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
    var m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : '';
  }
  function claveAut(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  /* El N.º se repite en facturas del mismo repartidor (empieza de nuevo cada tanto): si las dos tienen código de autorización, manda el código.
     La IA a veces lee mal una letra del código: con el mismo NIT, N.º e importe sigue siendo la misma factura. */
  function esLaMisma(f, x) {
    if (!f) return false;
    var a = claveAut(f.autorizacion), b = claveAut(x.aut);
    return !a || !b || a === b || Math.abs((Number(f.importe) || 0) - x.imp) <= 0.05;
  }
  function leerFilas(filas, c) {
    var txt = function (f, k) { return c[k] >= 0 ? String(f[c[k]] == null ? '' : f[c[k]]).trim() : ''; };
    return filas.map(function (f) {
      return { num: limpiaNum(f[c.num]), imp: X.numero(f[c.imp]) || 0, nit: c.nit >= 0 ? limpiaNum(f[c.nit]) : '', nom: txt(f, 'nom'), est: txt(f, 'est'),
        fecha: c.fecha >= 0 ? fechaRCV(f[c.fecha]) : '', aut: txt(f, 'aut') };
    }).filter(function (x) { return x.num || x.nit; }); // las filas de totales no traen ni número ni NIT
  }

  /* ── Fechas: SEM44G2026 cierra el domingo 01/11 y se factura desde el martes 03/11 ── */
  function desdeCuando(semana) {
    var o = X.ordenSemana(semana), y = Math.floor(o / 100), w = o % 100; if (!y || !w) return '';
    var d = new Date(Date.UTC(y, 0, 4)), dia = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - dia + 1 + (w - 1) * 7 + 8); // lunes de la semana + 8 días
    return d.toISOString().slice(0, 10);
  }

  /* ── Nombres: todas las palabras del nombre más corto deben estar en el otro (mínimo 2) ── */
  var FUERA = { DEL: 1, LAS: 1, LOS: 1 };
  function palabras(t) {
    var vistas = {};
    return X.normal(t).split(/[^A-Z]+/).filter(function (w) { if (w.length < 3 || FUERA[w] || vistas[w]) return false; vistas[w] = 1; return true; });
  }
  /* ¿El importe sale de sumar dos o más pagos del repartidor? */
  function esSuma(pool, imp) {
    var meta = Math.round(imp * 100), hechas = { 0: 0 };
    pool.forEach(function (p) {
      var c = Math.round(p.importe * 100);
      Object.keys(hechas).forEach(function (k) {
        var n = Number(k) + c; if (n > meta + 5) return;
        if ((hechas[n] || 0) < hechas[k] + 1) hechas[n] = hechas[k] + 1;
      });
    });
    return Object.keys(hechas).some(function (k) { return Math.abs(Number(k) - meta) <= 5 && hechas[k] >= 2; });
  }

  function datosFactura(f) { return f ? { fnum: String(f.numero || ''), fimp: Number(f.importe) || 0, ffecha: fechaRCV(f.fechaEmision), fnit: limpiaNum(f.nitEmisor) } : {}; }
  /* Lo que el repartidor debe, para comparar a simple vista */
  function textoPagos(l) {
    return l.slice().sort(function (a, b) { return X.ordenSemana(a.semana) - X.ordenSemana(b.semana); }).map(function (p) {
      return X.semanaCorta(p.semana) + ' · ' + bs(p.importe) + (p.f ? ' · factura N.º ' + (p.f.numero || 's/n') + (p.f.verificacion ? ' verificada' : '') : '');
    }).join(' | ');
  }

  /* ── El cruce. No escribe nada.
     ctx: pagos [{id, uid, nombre, semana, importe, tipo, f}], facturas, nombres [{id, nombre}], nits {id: [nit]}, pagadas {clave: 1} ── */
  function cruzar(lista, ctx) {
    var facturas = (ctx.facturas || []).filter(function (f) { return f.estado !== 'anulada'; });
    var porAut = {}, porNitNum = {}, porIdNum = {}, pagosDe = {}, idxNit = {}, idxPal = {}, nombres = ctx.nombres || [], nits = ctx.nits || {}, pagadas = ctx.pagadas || {};
    facturas.forEach(function (f) {
      var a = claveAut(f.autorizacion), n = limpiaNum(f.numero), t = limpiaNum(f.nitEmisor || (f.verificacion && f.verificacion.nit));
      if (a) porAut[a] = f;
      if (n && t) porNitNum[t + '|' + n] = f;
      if (n) porIdNum[f.id + '|' + n] = f;
    });
    (ctx.pagos || []).forEach(function (p) { (pagosDe[p.id] = pagosDe[p.id] || []).push(p); });
    Object.keys(nits).forEach(function (id) { nits[id].forEach(function (n) { var l = idxNit[n] = idxNit[n] || []; if (l.indexOf(id) < 0) l.push(id); }); });
    var pals = nombres.map(function (x) { return palabras(x.nombre); });
    pals.forEach(function (ws, i) { ws.forEach(function (w) { (idxPal[w] = idxPal[w] || []).push(i); }); });

    function porNombre(nom) {
      var ws = palabras(nom), cuenta = {}, ids = {}, exactos = {};
      ws.forEach(function (w) { (idxPal[w] || []).forEach(function (i) { cuenta[i] = (cuenta[i] || 0) + 1; }); });
      Object.keys(cuenta).forEach(function (i) {
        var n = pals[i].length, c = cuenta[i];
        if (c >= 2 && c >= Math.min(ws.length, n)) { ids[nombres[i].id] = 1; if (c === ws.length && c === n) exactos[nombres[i].id] = 1; }
      });
      return { ids: Object.keys(ids), exactos: exactos };
    }
    var nombreDe = {}; nombres.forEach(function (x) { if (!nombreDe[x.id]) nombreDe[x.id] = x.nombre; });
    var usados = {}, vistas = {};
    var abierto = function (p, link) { return !usados[p.id + '|' + p.semana] && !(p.f && p.f.verificacion && !(link && p.f._id === link._id)); };
    var orden = function (a, b) { return X.ordenSemana(a.semana) - X.ordenSemana(b.semana); };
    var igual = function (a, b) { return Math.abs(a - b) <= 0.05; };
    function elegir(eq, row, link) {
      var l = eq.slice().sort(orden), una = function (fn) { return l.filter(fn)[0]; };
      return (link && una(function (p) { return String(p.id) === String(link.id) && (link.semanas || []).indexOf(p.semana) >= 0; })) ||
        una(function (p) { return p.f && p.f.origen === 'contax' && !limpiaNum(p.f.numero); }) ||
        una(function (p) { return p.f && p.f.estado !== 'rechazada' && limpiaNum(p.f.numero) === row.num && esLaMisma(p.f, row); }) ||
        una(function (p) { return !p.f || p.f.estado === 'rechazada'; }) || null;
    }
    var filas = lista.map(function (x) {
      var porNum = x.nit && x.num && porNitNum[x.nit + '|' + x.num];
      return { x: x, link: (claveAut(x.aut) && porAut[claveAut(x.aut)]) || (esLaMisma(porNum, x) ? porNum : null) };
    });
    // Primero las que ya se subieron al Portal: así ninguna otra les quita su semana
    filas.sort(function (a, b) { return (a.link ? 0 : 1) - (b.link ? 0 : 1) || String(a.x.fecha).localeCompare(String(b.x.fecha)); });
    var ligadas = {};
    var res = filas.map(function (o) {
      var x = o.x, link = o.link;
      var fin = function (r, det, p, como, id) {
        var f = link;
        if (!f && p && p.f && p.f.estado !== 'rechazada') f = p.f;
        if (f) ligadas[f._id] = 1;
        var quien = p ? p.id : (id || (f ? f.id : '')), lista = pagosDe[quien] || [];
        return Object.assign({}, x, { r: r, det: det || '', como: como || '', id: quien, nombre: p ? p.nombre : (f ? f.nombre : (lista[0] ? lista[0].nombre : nombreDe[quien] || '')), semana: p ? p.semana : '',
          pago: p ? p.importe : 0, tipo: p ? p.tipo : '', uid: p ? p.uid : (f ? f.uid : ''), fid: f ? f._id : '', fest: f ? f.estado : '', forig: f ? (f.origen || '') : '', fmotivo: f ? (f.motivo || '') : '',
          cnit: (nits[quien] || []).join(', '), abiertos: r === 'coincide' ? '' : textoPagos(lista) }, datosFactura(f));
      };
      var ident = function () {
        if (link) return { ids: [String(link.id)], por: 'factura' };
        if (x.nit && idxNit[x.nit]) return { ids: idxNit[x.nit], por: 'nit' };
        var n = porNombre(x.nom); return { ids: n.ids, por: 'nombre', exactos: n.exactos };
      };
      if (/ANULAD/.test(X.normal(x.est))) return fin('anulada', link && link.estado === 'aprobada' ? 'Estaba aprobada: revísala' : '', null, '', ident().ids[0]);
      var clave = x.aut ? claveAut(x.aut) : x.nit + '|' + x.num;
      if (vistas[clave]) return fin('usada', 'Fila repetida en el Excel');
      vistas[clave] = 1;
      // Verificada antes pero nunca aprobada (sigue «Por revisar»): vuelve a cruzarse para poder aprobarla
      if (link && link.verificacion && link.estado !== 'recibida') return fin('usada', 'Ya verificada en una conciliación anterior');
      var pagada = pagadas[claveAut(x.aut)] || pagadas[x.nit + '|' + x.num];
      if (pagada) return fin('usada', 'Ya se pagó con esta factura' + (typeof pagada === 'string' ? ' · ' + pagada : ''), null, '', ident().ids[0]);

      var who = ident();
      if (!who.ids.length) return fin('otros');
      var pool = [];
      who.ids.forEach(function (id) { (pagosDe[id] || []).forEach(function (p) { if (abierto(p, link)) pool.push(p); }); });
      var eq = pool.filter(function (p) { return igual(p.importe, x.imp); });
      if (!eq.length) {
        if (!pool.length) return fin('sinPago', 'El repartidor no tiene un pago abierto para esta factura', null, '', who.ids[0]);
        if (esSuma(pool, x.imp)) return fin('suma', 'Cada pago necesita su propia factura', null, '', who.ids[0]);
        return fin('importe', 'Ningún pago pendiente del repartidor es de ese importe', null, '', who.ids[0]);
      }
      if (who.por === 'nombre') {
        var gente = {}; eq.forEach(function (p) { gente[p.id] = 1; });
        if (Object.keys(gente).length > 1) {
          var ex = eq.filter(function (p) { return who.exactos[p.id]; }), gx = {};
          ex.forEach(function (p) { gx[p.id] = 1; });
          if (Object.keys(gx).length !== 1) return fin('dudosa', 'Hay ' + Object.keys(gente).length + ' repartidores con ese nombre e importe');
          eq = ex;
        }
      }
      if (!link) { var mismo = eq[0] && porIdNum[eq[0].id + '|' + x.num]; if (mismo && mismo.estado !== 'rechazada' && esLaMisma(mismo, x)) link = mismo; }
      var p = elegir(eq, x, link);
      if (!p) return fin('dudosa', 'Ese pago ya tiene otra factura con otro número', eq[0]);
      usados[p.id + '|' + p.semana] = 1;
      var conocidos = nits[p.id] || [];
      if (x.nit && conocidos.length && conocidos.indexOf(x.nit) < 0) return fin('nitDistinto', 'Tenemos el NIT ' + conocidos[0], p);
      var min = desdeCuando(p.semana);
      if (x.fecha && min && x.fecha < min) return fin('fechaAntes', 'Esa semana se podía facturar desde el ' + X.fecha(min), p);
      return fin('coincide', '', p, who.por === 'nombre' ? (conocidos.length ? 'nombre, NIT e importe' : 'nombre e importe') : who.por === 'nit' ? 'NIT e importe' : 'factura del Portal');
    });

    var desde = '', hasta = '';
    lista.forEach(function (x) { if (x.fecha) { if (!desde || x.fecha < desde) desde = x.fecha; if (!hasta || x.fecha > hasta) hasta = x.fecha; } });
    // Al revés: lo que está en CONTROL y no apareció en el Excel
    facturas.forEach(function (f) {
      if (f.verificacion || ligadas[f._id] || f.estado === 'rechazada') return;
      var fe = fechaRCV(f.fechaEmision), dentro = fe && desde && fe >= desde && fe <= hasta;
      res.push(Object.assign({ num: limpiaNum(f.numero), imp: Number(f.importe) || 0, nit: limpiaNum(f.nitEmisor), nom: f.razonEmisor || '', est: '', fecha: fe, aut: f.autorizacion || '',
        r: !dentro ? 'espera' : f.origen === 'contax' ? 'contaxFalta' : 'noEsta', det: '', como: '', id: f.id, nombre: f.nombre, semana: (f.semanas || []).join(', '), pago: 0, tipo: '', uid: f.uid,
        fid: f._id, fest: f.estado, forig: f.origen || '', fmotivo: f.motivo || '', cnit: (nits[f.id] || []).join(', '), portal: 1 }, datosFactura(f)));
    });
    var enExcel = res.filter(function (r) { return !r.portal; }), n = function (g) { return enExcel.filter(function (r) { return grupo(r.r) === g; }).length; };
    var pagos = ctx.pagos || [], antes = pagos.filter(function (p) { return p.f && p.f.verificacion; }).length, nuevos = n('ok'), cubiertos = {};
    enExcel.forEach(function (r) { if (r.r === 'coincide') cubiertos[r.id + '|' + r.semana] = 1; });
    return { filas: res, desde: desde, hasta: hasta, resumen: {
      filasExcel: enExcel.length, repartidores: n('ok') + n('mal') + n('ya'), otros: n('otros'), anuladas: n('anulada'), coinciden: nuevos, noCuadran: n('mal'), yaVerificadas: n('ya'),
      posibleFraude: res.filter(function (r) { return r.r === 'noEsta'; }).length, contaxFaltan: res.filter(function (r) { return r.r === 'contaxFalta'; }).length, esperan: res.filter(function (r) { return r.r === 'espera'; }).length,
      pagos: pagos.length, verificadosAntes: antes, quedan: pagos.filter(function (p) { return !(p.f && p.f.verificacion) && !cubiertos[p.id + '|' + p.semana]; }).length } };
  }

  /* ── Datos para cruzar ── */
  function contexto() {
    var noHay = function () { return null; };
    return Promise.all([X.padron.cargar().catch(noHay), X.dbP.collection('perfiles').get().catch(noHay)]).then(function (r) {
      var nits = {}, nombres = [], vistos = {}, pagadas = {};
      X.nombresFacturas();
      var nit = function (id, v) { id = String(id); v = limpiaNum(v); if (v.length < 5) return; var l = nits[id] = nits[id] || []; if (l.indexOf(v) < 0) l.push(v); };
      var nom = function (id, v) { var k = id + '|' + X.normal(v); if (!v || vistos[k]) return; vistos[k] = 1; nombres.push({ id: String(id), nombre: v }); };
      if (D.repartidores) D.repartidores.forEach(function (x) { nom(x.id, x.nombre); var d = X.padron.dato(x.id); if (d) { nom(x.id, d.nombre); nit(x.id, d.nit); } });
      ((D.bdyango && D.bdyango.lista) || []).forEach(function (x) { nom(x.id, x.nombre); nit(x.id, x.nit); });
      if (r[1]) r[1].forEach(function (d) { var p = d.data(), x = D.repartidores && D.repartidores.get(d.id), id = x ? x.id : d.id; nit(id, p.nit); nom(id, p.razonSocial); });
      (D.facturas || []).forEach(function (f) { if (f.estado !== 'anulada' && f.estado !== 'rechazada') nit(f.id, f.nitEmisor); });
      (D.hist || []).forEach(function (h) {
        nom(h.id, h.nombre); nit(h.id, h.nit);
        if (!/^\s*\d+\s*$/.test(String(h.factura || ''))) return;
        var txt = X.semanaCorta(h.semana) + ' pagada el ' + X.fecha(h.fecha);
        if (h.autorizacion) pagadas[claveAut(h.autorizacion)] = txt;
        else if (limpiaNum(h.nit)) pagadas[limpiaNum(h.nit) + '|' + limpiaNum(h.factura)] = txt; // sin código, solo queda NIT + N.º
      });
      var pagos = X.listaFacturacionDatos().map(function (x) { return { id: x.id, uid: x.r ? x.r.uid : X.idSeguro(x.id), nombre: x.nombre, semana: x.semana, importe: x.importe, tipo: x.tipo, f: x.f }; });
      return { pagos: pagos, facturas: D.facturas || [], nombres: nombres, nits: nits, pagadas: pagadas };
    });
  }

  /* ── Auditoría ── */
  function guardar(c, archivo) {
    var col = X.dbC.collection('cruces'), ref = col.doc(), lote = X.dbC.batch(), partes = Math.ceil(c.filas.length / TAM_PARTE);
    lote.set(ref, Object.assign({ cuando: X.servidor(), quien: S.usuario.email, archivo: archivo, desde: c.desde, hasta: c.hasta, partes: partes, aplicadas: 0, observadas: 0 }, c.resumen));
    for (var i = 0; i < partes; i++) lote.set(col.doc(ref.id + '_p' + (i + 1)), { parteDe: ref.id, n: i + 1, filas: JSON.stringify(c.filas.slice(i * TAM_PARTE, (i + 1) * TAM_PARTE)) });
    return lote.commit().then(function () {
      X.bitacora('Conciliación con Impuestos', archivo + ' · ' + c.resumen.filasExcel + ' en el Excel · ' + c.resumen.repartidores + ' de repartidores · ' + c.resumen.coinciden + ' coinciden');
      return ref.id;
    });
  }
  function leerFilasGuardadas(c) {
    var col = X.dbC.collection('cruces'), l = [];
    for (var i = 1; i <= (c.partes || 0); i++) l.push(col.doc(c._id + '_p' + i).get());
    return Promise.all(l).then(function (ds) { return ds.reduce(function (a, d) { return a.concat(d.exists ? JSON.parse(d.data().filas || '[]') : []); }, []); });
  }

  /* ── Aplicar el resultado ── */
  function periodoDe(c) { return c.desde ? X.fecha(c.desde) + ' al ' + X.fecha(c.hasta) : 'período del archivo'; }
  function motivo(x, periodo) {
    var n = 'La factura N.º ' + x.num;
    if (x.r === 'nitDistinto') return n + ' figura en Impuestos Nacionales con el NIT ' + x.nit + ', distinto al que tenemos registrado.';
    if (x.r === 'fechaAntes') return n + ' tiene fecha ' + X.fecha(x.fecha) + ', anterior al día en que se podía emitir la factura de esa semana.';
    if (x.r === 'suma') return n + ' suma varios pagos. Cada pago necesita su propia factura: anúlala y emite una por cada pago.';
    if (x.r === 'anulada') return n + ' figura anulada en Impuestos Nacionales.';
    if (x.r === 'noEsta') return n + ' no figura en el Registro de Compras de Impuestos Nacionales de MILTHAGOR (' + periodo + '). Si la anulaste, emite una nueva y súbela.';
    return 'El importe en Impuestos Nacionales (' + bs(x.imp) + ') no coincide con el de tu pago.';
  }
  function nuevaFactura(x, estado, extra) {
    return Object.assign({ uid: x.uid, id: String(x.id), nombre: x.nombre, semanas: [x.semana], numero: x.num, importe: X.redondear(x.imp), fechaEmision: x.fecha, nitEmisor: x.nit, razonEmisor: x.nom,
      autorizacion: x.aut, estado: estado, origen: 'impuestos', conPdf: false, nombreArchivo: '', subido: X.servidor(), revisado: X.servidor(), revisadoPor: S.usuario.email, registradoPor: S.usuario.email, motivo: '' }, extra);
  }
  function opsVerificar(c) {
    var col = X.dbP.collection('facturas'), periodo = periodoDe(c), porId = {}; (D.facturas || []).forEach(function (f) { porId[f._id] = f; });
    return c.filas.filter(function (x) { return x.r === 'coincide' || (x.r === 'usada' && x.fest === 'recibida'); }).map(function (x) {
      if (x.r === 'usada') return { tipo: 'update', ref: col.doc(x.fid), datos: { estado: 'aprobada', revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: '' } };
      var v = { verificacion: { cuando: X.servidor(), quien: S.usuario.email, archivo: c.archivo, periodo: periodo, como: x.como, nit: x.nit, autorizacion: x.aut, conciliacion: c._id || '' } };
      if (!x.fid) return { tipo: 'set', ref: col.doc(), datos: nuevaFactura(x, 'aprobada', v) };
      var f = porId[x.fid] || {}, d = v;
      if (f.estado !== 'aprobada') Object.assign(d, { estado: 'aprobada', revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: '' });
      if (!limpiaNum(f.numero)) d.numero = x.num;           // las de CONTAX se marcan sin número: se completan con el Excel
      if (!limpiaNum(f.nitEmisor)) d.nitEmisor = x.nit;
      if (!f.razonEmisor) d.razonEmisor = x.nom;
      if (x.aut && claveAut(f.autorizacion) !== claveAut(x.aut)) d.autorizacion = x.aut; // manda el código del Excel
      if ((f.semanas || []).length !== 1 || f.semanas[0] !== x.semana) d.semanas = [x.semana];
      return { tipo: 'update', ref: col.doc(x.fid), datos: d };
    });
  }
  function opsObservar(c) {
    var col = X.dbP.collection('facturas'), periodo = periodoDe(c), ops = [];
    c.filas.forEach(function (x) {
      if (['nitDistinto', 'fechaAntes', 'importe', 'suma', 'anulada', 'noEsta'].indexOf(x.r) < 0) return;
      var estado = x.r === 'suma' ? 'rechazada' : 'observada', m = motivo(x, periodo);
      if (x.fid) {
        if ((x.fest === 'recibida' || x.fest === 'observada') && !(x.fest === estado && x.fmotivo === m)) ops.push({ tipo: 'update', ref: col.doc(x.fid), datos: { estado: estado, revisadoPor: S.usuario.email, revisado: X.servidor(), motivo: m } });
      } else if (x.semana && (x.r === 'nitDistinto' || x.r === 'fechaAntes')) ops.push({ tipo: 'set', ref: col.doc(), datos: nuevaFactura(x, 'observada', { motivo: m }) });
    });
    return ops;
  }
  function aplicar(c, ops, campo, texto, listo) {
    X.clasicos(true, 'Arquímedes está guardando ' + ops.length + ' facturas…');
    X.semanas.escribir(ops).then(function () {
      var d = {}; d[campo] = ops.length;
      if (c._id) X.dbC.collection('cruces').doc(c._id).update(d).catch(function (e) { console.error(e); });
      X.bitacora(texto, (c.archivo || '') + ' · ' + ops.length + ' facturas');
      X.clasicos(false); X.aviso(ops.length + ' facturas guardadas'); listo();
    }, function (e) { console.error(e); X.clasicos(false); X.aviso('No se pudo guardar. Revisa tus permisos.'); });
  }

  function CTRL_abrir(id) { if ((D.facturas || []).some(function (f) { return f._id === id; })) X.abrirFactura(id); else X.aviso('Esa factura ya no está en la lista.'); }

  /* ── Pantalla del resultado (la misma para un cruce nuevo y para uno guardado) ── */
  var PEST = [['', 'Todas'], ['ok', 'Coinciden'], ['mal', 'Algo no cuadra'], ['anulada', 'Anuladas'], ['otros', 'No son de repartidores'], ['ya', 'Ya verificadas'], ['portal', 'En CONTROL y no en el Excel']];
  /* Las filas «portal» no están en el Excel: sus datos son de CONTROL y las columnas del Excel quedan vacías */
  var vacia = '<span class="muted">—</span>';
  var deExcel = function (fn) { return function (x) { return x.portal ? vacia : fn(x); }; };
  var estadoF = { recibida: 'Por revisar', aprobada: 'Aprobada', observada: 'Observada', rechazada: 'Rechazada' };
  function textoFactura(x) {
    if (!x.fid) return '';
    var num = x.fnum != null ? x.fnum : x.num, imp = x.fimp != null ? x.fimp : 0;
    return (x.forig === 'contax' ? 'CONTAX' : x.forig === 'impuestos' ? 'Del Excel' : 'Portal') + ' · N.º ' + (num || 's/n') + (imp ? ' · ' + bs(imp) : '') + ' · ' + (estadoF[x.fest] || x.fest || '');
  }
  function textoDetalle(x) { return x.det || (x.como ? 'por ' + x.como : ''); }
  var COLS = [
    { g: 'e', k: 'fecha', t: 'Fecha', v: function (x) { return x.portal ? '' : x.fecha; }, html: deExcel(function (x) { return x.fecha ? X.fecha(x.fecha) : vacia; }) },
    { g: 'e', k: 'num', t: 'N.º', n: 1, v: function (x) { return x.portal ? 0 : Number(x.num) || 0; }, html: deExcel(function (x) { return '<b class="num">' + esc(x.num || '—') + '</b>'; }) },
    { g: 'e', k: 'nit', t: 'NIT', v: function (x) { return x.portal ? '' : x.nit; }, html: deExcel(function (x) { return '<span class="num">' + esc(x.nit || '—') + '</span>'; }) },
    { g: 'e', k: 'nom', t: 'Razón social', v: function (x) { return x.portal ? '' : X.normal(x.nom); }, html: deExcel(function (x) { return esc(x.nom || '—'); }) },
    { g: 'e', k: 'imp', t: 'Importe', n: 1, clase: 'monto', v: function (x) { return x.portal ? 0 : x.imp; }, html: deExcel(function (x) { return '<b>' + bs(x.imp) + '</b>'; }) },
    { g: 'e', k: 'est', t: 'Estado', v: function (x) { return x.portal ? '' : X.normal(x.est); }, html: deExcel(function (x) { return esc(x.est || '—'); }) },
    { g: 'e', k: 'aut', t: 'Autorización', v: function (x) { return x.portal ? '' : x.aut; }, html: deExcel(function (x) { var a = String(x.aut || ''); return a ? '<span class="num" title="' + esc(a) + '">' + esc(a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-6) : a) + '</span>' : vacia; }) },
    { g: 'c', k: 'id', t: 'ID', v: function (x) { return x.id || ''; }, html: function (x) { return x.id ? '<span class="num">' + esc(x.id) + '</span>' : vacia; } },
    { g: 'c', k: 'nombre', t: 'Repartidor', v: function (x) { return X.normal(x.nombre); }, html: function (x) { return x.nombre ? '<b>' + esc(x.nombre) + '</b>' : vacia; } },
    { g: 'c', k: 'cnit', t: 'NIT registrado', v: function (x) { return x.cnit || ''; }, html: function (x) { return x.cnit ? '<span class="num">' + esc(x.cnit) + '</span>' : vacia; } },
    { g: 'c', k: 'semana', t: 'Pago', v: function (x) { return X.ordenSemana(x.semana); }, n: 1, html: function (x) { return x.semana ? esc(X.semanaCorta(x.semana)) + (x.pago ? ' · ' + bs(x.pago) : '') + (x.tipo === 'retenido' ? '<span class="sub">Ya pagado con retención</span>' : '') : vacia; } },
    { g: 'c', k: 'fac', t: 'Factura en CONTROL', v: textoFactura, html: function (x) { return textoFactura(x) ? esc(textoFactura(x)) : vacia; } },
    { g: 'c', k: 'abiertos', t: 'Pagos del repartidor', v: function (x) { return x.abiertos || ''; }, html: function (x) { return x.abiertos ? esc(x.abiertos).replace(/ \| /g, '<br>') : vacia; } },
    { g: 'r', k: 'r', t: 'Resultado', v: function (x) { return (RES[x.r] || [0, x.r])[1]; }, html: function (x) { var e = RES[x.r] || ['neutro', x.r]; return X.chip(e[0], e[1]); } },
    { g: 'r', k: 'det', t: 'Detalle', v: textoDetalle, html: function (x) { return esc(textoDetalle(x)) || vacia; } }
  ];
  function tablaHTML(l, E) {
    var n = function (g) { return COLS.filter(function (c) { return c.g === g; }).length; };
    var trozo = l.slice(E.pag * 100, E.pag * 100 + 100), total = Math.ceil(l.length / 100);
    return '<div class="tabla cn-caja"><table class="cn"><thead><tr class="cn-grupos"><th class="cn-e" colspan="' + n('e') + '">Datos del Excel de Impuestos</th><th class="cn-c" colspan="' + n('c') + '">Datos de CONTROL</th><th class="cn-r" colspan="' + n('r') + '">Resultado del cruce</th></tr><tr>' +
      COLS.map(function (c, i) {
        var marca = E.orden === c.k ? (E.dir > 0 ? ' ▲' : ' ▼') : '', ini = i && COLS[i - 1].g !== c.g;
        return '<th class="' + (c.clase || '') + (ini ? ' cn-ini' : '') + '" data-ord="' + c.k + '" title="Ordenar">' + c.t + marca + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      trozo.map(function (x, i) {
        return '<tr' + (x.fid ? ' class="clic" data-abrir="' + esc(x.fid) + '"' : '') + '>' + COLS.map(function (c, j) { return '<td class="' + (c.clase || '') + (j && COLS[j - 1].g !== c.g ? ' cn-ini' : '') + '">' + c.html(x) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (total > 1 ? '<div class="fila-acc" style="margin-top:10px"><button class="btn sec chico" data-pag="' + (E.pag - 1) + '"' + (E.pag ? '' : ' disabled') + '>Anterior</button><span class="muted">Página ' + (E.pag + 1) + ' de ' + total + '</span><button class="btn sec chico" data-pag="' + (E.pag + 1) + '"' + (E.pag >= total - 1 ? ' disabled' : '') + '>Siguiente</button></div>' : '');
  }
  function exportar(c, filas) {
    X.excel([{ nombre: 'Conciliación', filas: [['Excel: Fecha', 'Excel: N.º factura', 'Excel: NIT', 'Excel: Razón social', 'Excel: Importe', 'Excel: Estado', 'Excel: Autorización', 'CONTROL: ID', 'CONTROL: Repartidor', 'CONTROL: NIT registrado', 'CONTROL: Semana', 'CONTROL: Importe del pago', 'CONTROL: Factura', 'CONTROL: Pagos del repartidor', 'Resultado', 'Detalle']].concat(filas.map(function (x) {
      var e = x.portal ? ['', '', '', '', '', '', ''] : [x.fecha, x.num, x.nit, x.nom, x.imp, x.est, x.aut];
      return e.concat([x.id, x.nombre, x.cnit || '', x.semana, x.pago || '', textoFactura(x), x.abiertos || '', (RES[x.r] || [0, x.r])[1], textoDetalle(x)]);
    })) }], 'Conciliacion-' + (c.hasta || X.hoyISO()));
  }
  function pintar(cu, c, cerrar, vivo) {
    var E = { g: c.resumen.noCuadran ? 'mal' : '', pag: 0, buscar: '', res: '', sem: '', orden: 'nombre', dir: 1 }, r = c.resumen, zona = document.createElement('div');
    if (cu.parentNode) cu.parentNode.classList.add('completa');
    var verif = vivo ? opsVerificar(c) : [], obs = vivo ? opsObservar(c) : [];
    var aprobadasMal = c.filas.filter(function (x) { return x.fest === 'aprobada' && ['importe', 'suma', 'nitDistinto', 'fechaAntes', 'anulada', 'noEsta'].indexOf(x.r) >= 0; }).length;
    cu.innerHTML = '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>' + entero(r.filasExcel) + ' en el Excel · ' + entero(r.repartidores) + ' de repartidores · ' + entero(r.otros) + ' de otros · ' + entero(r.anuladas) + ' anuladas</b>' +
        'De ' + entero(r.pagos) + ' pagos que deben factura, quedan ' + entero(r.quedan) + ' por emitir o verificar.' + (vivo && verif.length ? ' <b>Las facturas todavía no cambiaron: toca «Registrar» antes de cerrar.</b>' : '') + '</div></div>' +
      '<div class="rejilla r4 mb">' +
        '<div class="kpi"><small>Coinciden</small><b class="num">' + entero(r.coinciden) + '</b><em>facturas que cubren un pago</em></div>' +
        '<div class="kpi' + (r.noCuadran ? ' alerta' : '') + '"><small>Algo no cuadra</small><b class="num">' + entero(r.noCuadran) + '</b><em>son de repartidores, para revisar</em></div>' +
        '<div class="kpi' + (r.posibleFraude ? ' alerta' : '') + '"><small>Posible fraude</small><b class="num">' + entero(r.posibleFraude) + '</b><em>en el Portal, no en el Excel de sus fechas</em></div>' +
        '<div class="kpi"><small>Quedan por emitir</small><b class="num">' + entero(r.quedan) + '</b><em>' + entero(r.esperan) + ' facturas esperan el Excel de sus fechas</em></div>' +
      '</div>' +
      (r.contaxFaltan ? '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>' + entero(r.contaxFaltan) + ' marcadas como emitidas por CONTAX no están en este Excel</b>Puede faltar confirmarlas en Impuestos. No se cambian solas.</div></div>' : '') +
      (aprobadasMal ? '<div class="aviso-caja error mb">' + ic('excepcion') + '<div><b>' + aprobadasMal + ' facturas ya aprobadas tienen un problema</b>Revísalas una por una. No se cambian solas.</div></div>' : '') +
      '<div class="fila-acc mb">' +
        (X.puedeEditar() && verif.length ? '<button class="btn" id="cnVer">' + ic('check') + 'Registrar las ' + entero(verif.length) + ' verificadas</button>' : '') +
        (X.puedeEditar() && obs.length ? '<button class="btn sec" id="cnObs">Observar las ' + entero(obs.length) + ' con problema</button>' : '') +
        '<button class="btn sec" id="cnExc">' + ic('descargar') + 'Excel</button></div>';
    var semanas = {}, resultados = {};
    c.filas.forEach(function (x) { if (x.semana) semanas[x.semana] = 1; resultados[x.r] = (resultados[x.r] || 0) + 1; });
    var filtros = document.createElement('div'); filtros.className = 'herr';
    filtros.innerHTML = '<div class="buscar">' + ic('buscar') + '<input type="search" id="cnBus" placeholder="Buscar por nombre, razón social, ID, NIT o N.º"></div>' +
      '<select id="cnRes" aria-label="Filtrar por resultado"><option value="">Todos los resultados</option>' + Object.keys(RES).filter(function (k) { return resultados[k]; }).map(function (k) { return '<option value="' + k + '">' + esc(RES[k][1]) + ' (' + entero(resultados[k]) + ')</option>'; }).join('') + '</select>' +
      '<select id="cnSem" aria-label="Filtrar por semana"><option value="">Todas las semanas</option>' + Object.keys(semanas).sort(function (a, b) { return X.ordenSemana(b) - X.ordenSemana(a); }).map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('') + '</select>';
    cu.appendChild(filtros); cu.appendChild(zona);
    var col = function (k) { return COLS.filter(function (x) { return x.k === k; })[0]; };
    function visibles() {
      var b = X.normal(E.buscar), o = col(E.orden);
      return c.filas.filter(function (x) {
        if (E.g && grupo(x.r) !== E.g) return false;
        if (E.res && x.r !== E.res) return false;
        if (E.sem && x.semana !== E.sem) return false;
        return !b || X.normal([x.nombre, x.nom, x.id, x.nit, x.cnit, x.num, x.fnum].join(' ')).indexOf(b) >= 0;
      }).sort(function (p, q) {
        var a = o.v(p), z = o.v(q);
        return E.dir * (o.n ? (Number(a) || 0) - (Number(z) || 0) : String(a || '').localeCompare(String(z || '')));
      });
    }
    function tabla() {
      var l = visibles();
      zona.innerHTML = '<div class="pestanas">' + PEST.map(function (p) {
        var k = p[0] ? c.filas.filter(function (x) { return grupo(x.r) === p[0]; }).length : c.filas.length;
        return '<button aria-selected="' + (E.g === p[0]) + '" data-gr="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(k) + '</em></button>';
      }).join('') + '</div><p class="muted mb">' + entero(l.length) + ' filas. Toca el título de una columna para ordenar; toca una fila con factura para abrirla.</p>' + (l.length ? tablaHTML(l, E) : X.vacio('Nada con estos filtros', ''));
      zona.querySelectorAll('[data-gr]').forEach(function (b) { b.addEventListener('click', function () { E.g = b.getAttribute('data-gr'); E.pag = 0; tabla(); }); });
      zona.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { E.pag = Number(b.getAttribute('data-pag')); tabla(); }); });
      zona.querySelectorAll('[data-ord]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-ord'); if (E.orden === k) E.dir = -E.dir; else { E.orden = k; E.dir = 1; } E.pag = 0; tabla(); }); });
      zona.querySelectorAll('[data-abrir]').forEach(function (t) { t.addEventListener('click', function () { CTRL_abrir(t.getAttribute('data-abrir')); }); });
    }
    filtros.querySelector('#cnBus').addEventListener('input', X.debounce(function (e) { E.buscar = filtros.querySelector('#cnBus').value; E.pag = 0; tabla(); }, 200));
    filtros.querySelector('#cnRes').addEventListener('change', function (e) { E.res = e.target.value; if (E.res) E.g = ''; E.pag = 0; tabla(); });
    filtros.querySelector('#cnSem').addEventListener('change', function (e) { E.sem = e.target.value; E.pag = 0; tabla(); });
    tabla();
    cu.querySelector('#cnExc').addEventListener('click', function () { exportar(c, visibles()); });
    var bv = cu.querySelector('#cnVer');
    if (bv) bv.addEventListener('click', function () {
      X.confirmar('Registrar ' + verif.length + ' facturas verificadas', 'Quedan como <b>verificadas en Impuestos</b> y aprobadas. El repartidor las ve en su portal. Las que no subió se registran solas y las de CONTAX se completan con el N.º, el NIT y la autorización del Excel.', function () {
        aplicar(c, verif, 'aplicadas', 'Registró facturas verificadas', function () { bv.remove(); });
      }, 'Registrar');
    });
    var bo = cu.querySelector('#cnObs');
    if (bo) bo.addEventListener('click', function () {
      X.confirmar('Observar ' + obs.length + ' facturas', 'El repartidor ve el motivo en su portal. Las que suman varios pagos quedan <b>rechazadas</b>. Las que ya estaban aprobadas no se tocan.', function () {
        aplicar(c, obs, 'observadas', 'Observó facturas por conciliación', function () { bo.remove(); });
      }, 'Observar');
    });
  }

  /* ── Entrada: lo llama «Cruzar con Impuestos» de Facturas ── */
  function conciliar(filas, cols, archivo) {
    if (!D.facturas || !D.hist || !D.bdyango || !(D.bdyango.lista || []).length) { X.aviso('Todavía están cargando los datos. Espera unos segundos y vuelve a intentar.'); return; }
    X.clasicos(true, 'Arquímedes está cruzando el Excel con los pagos…');
    contexto().then(function (ctx) {
      var c = cruzar(leerFilas(filas, cols), ctx); c.archivo = archivo;
      return (X.puedeEditar() ? guardar(c, archivo) : Promise.resolve('')).then(function (id) { c._id = id; C.lista = null; return c; });
    }).then(function (c) {
      X.clasicos(false);
      X.cajon('Resultado de la conciliación', esc(archivo) + ' · ' + esc(periodoDe(c)), '', function (cu, cerrar) { pintar(cu, c, cerrar, true); });
    }).catch(function (e) { console.error(e); X.clasicos(false); X.aviso('No se pudo hacer el cruce. Revisa tu conexión o tus permisos.'); });
  }

  /* ── Página Conciliaciones ── */
  var C = { lista: null, leyendo: false, error: '' };
  function cargarLista() {
    if (C.leyendo) return; C.leyendo = true;
    X.dbC.collection('cruces').orderBy('cuando', 'desc').limit(60).get().then(function (q) {
      C.lista = q.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data()); }); C.leyendo = false; C.error = ''; X.refrescar();
    }, function (e) { console.error(e); C.leyendo = false; C.lista = []; C.error = 'No se pudo leer la lista.'; X.refrescar(); });
  }
  function abrir(c) {
    if (!c.partes) { X.aviso('Este cruce es anterior: solo se guardó su resumen.'); return; }
    X.cajon('Conciliación del ' + X.fecha(c.cuando), esc(c.archivo || '') + ' · ' + esc(periodoDe(c)) + ' · ' + esc(c.quien || ''), X.cargaN('Trayendo las filas', ''), function (cu, cerrar) {
      leerFilasGuardadas(c).then(function (filas) {
        pintar(cu, { filas: filas, resumen: c, archivo: c.archivo, desde: c.desde, hasta: c.hasta, _id: c._id }, cerrar, false);
      }, function (e) { console.error(e); cu.innerHTML = X.vacio('No se pudieron leer las filas', 'Revisa tu conexión.'); });
    });
  }
  X.pagina('conciliaciones', {
    t: 'Conciliaciones', i: 'cruzar', orden: 2.5, sec: 'Operación',
    render: function () {
      var cab = X.titulo('Conciliaciones', 'Cada Excel de Impuestos Nacionales que se cargó, con todas sus filas: las aprobadas, las que no cuadraron, las anuladas y las que no son de repartidores.');
      if (!C.lista) { cargarLista(); return cab + X.cargaN('Trayendo las conciliaciones', ''); }
      if (!C.lista.length) return cab + '<div class="card">' + X.vacio(C.error || 'Todavía no hay conciliaciones', 'Se cargan desde Facturas → «Cruzar con Impuestos».') + '</div>';
      var v = function (x, k) { return x.partes ? entero(x[k] || 0) : '<span class="muted">—</span>'; };
      return cab + '<div class="card">' + X.tabla([
        { t: 'Fecha', html: function (x) { return X.fechaHora(x.cuando) + '<span class="sub">' + esc(x.quien || '') + '</span>'; } },
        { t: 'Archivo', html: function (x) { return '<b>' + esc(x.archivo || '—') + '</b><span class="sub">' + esc(periodoDe(x)) + '</span>'; } },
        { t: 'En el Excel', clase: 'monto', html: function (x) { return entero(x.filasExcel || 0); } },
        { t: 'Repartidores', clase: 'monto', html: function (x) { return v(x, 'repartidores'); } },
        { t: 'Otros', clase: 'monto', html: function (x) { return v(x, 'otros'); } },
        { t: 'Anuladas', clase: 'monto', html: function (x) { return x.partes ? entero(x.anuladas || 0) : entero(x.anuladas || 0); } },
        { t: 'Coinciden', clase: 'monto', html: function (x) { return entero(x.coinciden || 0); } },
        { t: 'No cuadran', clase: 'monto', html: function (x) { return v(x, 'noCuadran'); } },
        { t: 'Registradas', clase: 'monto', html: function (x) { return v(x, 'aplicadas'); } }
      ], C.lista, { clic: true, tam: 60 }) + '</div>';
    },
    despues: function (el) {
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var c = C.lista[Number(tr.getAttribute('data-fila'))]; if (c) abrir(c); }); });
    }
  });

  X.conciliacion = { conciliar: conciliar, _puro: { cruzar: cruzar, contexto: contexto, pintar: pintar, leerFilas: leerFilas, desdeCuando: desdeCuando, esSuma: esSuma, limpiaNum: limpiaNum, fechaRCV: fechaRCV } };
})();
