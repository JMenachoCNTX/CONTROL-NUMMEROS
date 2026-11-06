/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Semanas de pago (colección «semanas» del Portal)
   Importar las 3 planillas semanales de Yango/MTG (SCZ, CBBA, LPZ),
   migración única desde Google Sheets, marcar semanas en planilla,
   confirmar el pago de Miltagor y reporte de pago con gráficos.
   Acuerdo: INTEGRACION-NUCLEO-YANGO.md (carpeta Proyectos).
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, bs = X.bs, ic = X.ic, entero = X.entero;

  var CIUDADES = { SCZ: 'Santa Cruz', CBBA: 'Cochabamba', LPZ: 'La Paz' };
  var ABIERTOS = ['pendiente', 'en_planilla', 'no_habilitado'];
  function modoControl() { return C.fuentePagos === 'control'; }
  function col() { return X.dbP.collection('semanas'); }

  /* ══════════ SEMANAS: TEXTO, NÚMERO Y AÑO ══════════ */
  function z2(n) { return (n < 10 ? '0' : '') + n; }
  function numSemana(t) { var m = String(t == null ? '' : t).replace(/20\d\d/, '').match(/(\d{1,2})/); var n = m ? Number(m[1]) : 0; return n >= 1 && n <= 53 ? n : 0; }
  function anioDe(t) { var m = String(t == null ? '' : t).match(/(20\d\d)/); return m ? Number(m[1]) : 0; }
  function isoSemana(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), dia = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dia);
    var ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { semana: Math.ceil(((t - ini) / 864e5 + 1) / 7), anio: t.getUTCFullYear() };
  }
  /* Año de una semana sin año: el de la fecha de referencia, o el anterior si la semana todavía no llegó */
  function inferirAnio(n, ref) {
    var w = isoSemana(ref || new Date());
    return n > w.semana + 2 ? w.anio - 1 : w.anio;
  }
  function idDoc(uid, anio, n) { return uid + '_' + anio + '-' + z2(n); }

  /* El texto de la semana debe ser IGUAL al que ya usan las facturas («41», «SEM41G2026»…) */
  function patronSemana(muestras) {
    var c = { sem: 0, num: 0, palabra: 0, cero: 0 };
    (muestras || []).forEach(function (s) {
      s = String(s || '').trim(); if (!s) return;
      if (/^SEM\s*\d{1,2}\s*G\s*20\d\d$/i.test(s)) c.sem++;
      else if (/^\d{1,2}$/.test(s)) c.num++;
      else if (/^semana\s+\d{1,2}$/i.test(s)) c.palabra++;
      if (/(^|\D)0\d(\D|$)/.test(s.replace(/20\d\d/, ''))) c.cero++;
    });
    // Sin muestras: el formato real de las planillas Yango/MTG («SEM43G2026»)
    var tipo = c.num > c.sem && c.num >= c.palabra ? 'num' : (c.palabra > c.sem ? 'palabra' : 'sem');
    return { tipo: tipo, cero: c.cero > 0 };
  }
  function textoSemana(p, n, anio) {
    var w = p && p.cero ? z2(n) : String(n);
    if (p && p.tipo === 'sem') return 'SEM' + w + 'G' + anio;
    if (p && p.tipo === 'palabra') return 'Semana ' + w;
    return w;
  }
  function muestrasSemana() {
    var l = [];
    if (D.repartidores) D.repartidores.forEach(function (r) {
      var o = r._sheets || r;
      (o.pendientes || []).forEach(function (p) { l.push(p.semana); });
      (o.historial || []).slice(0, 3).forEach(function (h) { l.push(h.semana); });
    });
    (D.facturas || []).forEach(function (f) { (f.semanas || []).forEach(function (s) { l.push(s); }); });
    (D.semanas || []).forEach(function (s) { l.push(s.semana); });
    return l.slice(0, 3000);
  }
  function ciudadDeArchivo(nombre) {
    var t = X.normal(nombre);
    if (/SANTA|SCZ|CRUZ/.test(t)) return 'SCZ';
    if (/COCHA|CBBA|CBB/.test(t)) return 'CBBA';
    if (/PAZ|LPZ|LPB/.test(t)) return 'LPZ';
    return '';
  }
  /* «Milthagor Santa Cruz 19.10.26-25.10.26.xlsx» → semana 43 de 2026, rango «19/10 al 25/10» */
  function semanaDeArchivo(nombre) {
    var m = String(nombre || '').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\s*(?:-|al|a)\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/i);
    if (m) {
      var a = Number(m[3].length === 2 ? '20' + m[3] : m[3]), d = new Date(a, Number(m[2]) - 1, Number(m[1])), w = isoSemana(d);
      return { semana: w.semana, anio: w.anio, rango: z2(Number(m[1])) + '/' + z2(Number(m[2])) + ' al ' + z2(Number(m[4])) + '/' + z2(Number(m[5])) };
    }
    var n = numSemana((String(nombre || '').match(/sem\D{0,8}(\d{1,2})/i) || [])[1]);
    return n ? { semana: n, anio: anioDe(nombre) || 0, rango: '' } : null;
  }
  function fechaISO(t) { var d = X.aFecha(t); return d ? d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()) : null; }

  /* ══════════ CARGA Y ADAPTADOR ══════════
     En modo 'control', los pendientes y el historial de cada repartidor se arman desde «semanas»
     (lo que antes copiaba el robot desde Sheets). El resto del panel no cambia. */
  function cargar(forzar) {
    if (!modoControl() || !S.portalUsuario) { D.semanas = null; return Promise.resolve(); }
    // Solo las abiertas (pendientes, en planilla, no habilitadas): el historial sale de «historialPagos».
    // Con copia local: solo se leen las que cambiaron (las que pasaron a «pagado» salen de la lista)
    return X.leerConCopia('semanas', { completa: col().where('estado', 'in', ABIERTOS), cambios: col(), forzar: forzar,
      vale: function (x) { return ABIERTOS.indexOf(x.estado) >= 0; } }).then(function (res) {
      D.semanas = Object.keys(res.docs).map(function (k) { var x = res.docs[k]; x._id = k; return x; });
      aplicar();
    }, function (e) {
      console.error('Semanas:', e); D.semanas = [];
      X.aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso para leer «semanas»: falta publicar las reglas del Portal.' : 'No se pudieron traer las semanas de pago.');
    });
  }
  /* Nombre del repartidor según BDYango (para las planillas que vienen solo con el ID) */
  var BYN = { lista: null, m: {} };
  function nombreBDY(id) {
    var l = D.bdyango && D.bdyango.lista; if (!l || !l.length) return ((X.padron && X.padron.dato(id)) || {}).nombre || '';
    if (BYN.lista !== l) { BYN = { lista: l, m: {} }; l.forEach(function (b) { if (b.nombre) BYN.m[b.id] = b.nombre; }); }
    return BYN.m[String(id)] || ((X.padron && X.padron.dato(id)) || {}).nombre || '';
  }
  function aplicar() {
    if (!D.repartidores || !D.semanas) return;
    D.repartidores.forEach(function (r) {
      if (!r._sheets) r._sheets = { pendientes: r.pendientes || [], historial: r.historial || [], habilitado: r.habilitado, resumen: r.resumen };
      r.pendientes = []; r.historial = []; r.enPlanilla = []; r.noHab = []; r._ultima = 0; r._ultimaNoHab = false; r._ultCiudad = 0; r.ciudad = '';
    });
    D.semanas.forEach(function (s) {
      var uid = s.uid || X.idSeguro(s.id), r = D.repartidores.get(uid);
      if (!r) {
        r = { uid: uid, id: String(s.id), nombre: s.nombre || nombreBDY(String(s.id)), celular: s.celular || '', sinCuenta: true, habilitado: true, poliza: false,
          pendientes: [], historial: [], enPlanilla: [], noHab: [], tramites: [], _ultima: 0, _ultimaNoHab: false };
        D.repartidores.set(uid, r);
      }
      if (s.nombreSistema) r.nombreSistema = true;
      var item = { semana: s.semana, rango: s.rango || '', importe: Number(s.importe) || 0, ciudad: s.ciudad || '', _doc: s._id, _orden: s.orden || 0, rebote: s.rebote || null };
      if (s.estado === 'pendiente') { item.estado = 'Pendiente'; r.pendientes.push(item); }
      else if (s.estado === 'en_planilla') { item.estado = 'En planilla'; item.planilla = s.planilla || ''; r.enPlanilla.push(item); }
      else if (s.estado === 'no_habilitado') { item.estado = 'No habilitado'; r.noHab.push(item); }
      if ((s.orden || 0) >= r._ultima) { r._ultima = s.orden || 0; r._ultimaNoHab = s.estado === 'no_habilitado'; }
      if (s.ciudad && (s.orden || 0) >= (r._ultCiudad || 0)) { r._ultCiudad = s.orden || 0; r.ciudad = s.ciudad; }
    });
    var suma = function (l) { return X.redondear(l.reduce(function (t, x) { return t + (x.importe || 0); }, 0)); };
    D.repartidores.forEach(function (r) {
      r.pendientes.sort(function (a, b) { return b._orden - a._orden; });
      r.noHab.sort(function (a, b) { return b._orden - a._orden; });
      r.historial.sort(function (a, b) { return (b._o - a._o) || (b._orden - a._orden); });
      r.habilitado = !r._ultimaNoHab;
      r.resumen = { pendientes: { cantidad: r.pendientes.length, total: suma(r.pendientes) }, pagados: { cantidad: r.historial.length, total: suma(r.historial) } };
    });
    aplicarHistorial();
  }

  /* ══════════ HISTORIAL DE PAGOS («historialPagos» del Portal) ══════════
     Reemplaza a la hoja HistPagosMTG. Un documento por fecha de pago (y parte, máx. 2000 pagos),
     con los pagos en «filas» (texto JSON) para no gastar una escritura por pago:
     [semana, rango, idYango, nombre, importe, comentarios, nroFactura, fechaFactura, nitFactura, autorizacion, nro, mesPago, gestion]
     (las mismas columnas de HistPagosMTG). Cada repartidor ve los suyos en «historialRider/{uid}» del Portal. */
  var TAM_PARTE = 2000;
  function colH() { return X.dbP.collection('historialPagos'); }
  function cargarHistorial() {
    if (!S.portalUsuario) { D.hist = null; return Promise.resolve(); }
    return colH().get().then(function (q) {
      var l = [], partes = [], deuda = [];
      q.forEach(function (d) {
        var x = d.data(), filas = [];
        try { filas = JSON.parse(x.filas || '[]'); } catch (e) { console.warn('historialPagos ' + d.id, e); }
        partes.push({ id: d.id, fecha: x.fecha, origen: x.origen || '' });
        // «hojaControl»: semanas que deben factura según la hoja CONTROL, sin pago registrado (no cuentan como pagos)
        var dest = x.origen === 'hojaControl' ? deuda : l;
        filas.forEach(function (f) {
          dest.push({ fecha: x.fecha, semana: f[0], rango: f[1], id: String(f[2]), nombre: f[3], importe: Number(f[4]) || 0, comentario: f[5] || '', ciudad: f[5] || '',
            factura: f[6] || '', fechaFactura: f[7] || '', nit: f[8] || '', autorizacion: f[9] || '', nro: f[10] || '', mes: f[11] || '', gestion: f[12] || '' });
        });
      });
      D.hist = l; D.histPartes = partes; D.histDeuda = deuda;
      aplicarHistorial();
    }, function (e) { console.warn('Historial:', e); D.hist = null; });
  }
  /* El historial de cada repartidor sale de «historialPagos» (ya no de la copia de la hoja) */
  function aplicarHistorial() {
    if (!D.repartidores || !D.hist || !D.hist.length) return;
    var por = {};
    D.hist.forEach(function (h) { var u = X.idSeguro(h.id); (por[u] = por[u] || []).push(h); });
    D.repartidores.forEach(function (r) {
      var l = (por[r.uid] || []).map(function (h) {
        var d = X.aFecha(h.fecha);
        return { semana: h.semana, rango: h.rango, importe: h.importe, ciudad: h.ciudad, factura: h.factura, fechaPago: X.fecha(h.fecha), fechaISO: h.fecha, _o: d ? d.getTime() : 0 };
      }).sort(function (a, b) { return b._o - a._o; });
      r.historial = l;
      if (!r.nombre && por[r.uid] && por[r.uid][0]) r.nombre = por[r.uid][0].nombre;
      r.resumen = r.resumen || {};
      r.resumen.pagados = { cantidad: l.length, total: X.redondear(l.reduce(function (t, x) { return t + x.importe; }, 0)) };
    });
  }
  /* Agrega pagos confirmados en CONTROL a su fecha (documento «{fecha}_c») */
  function agregarAlHistorial(fecha, filas) {
    if (!filas.length) return Promise.resolve();
    var ref = colH().doc(fecha + '_c');
    return ref.get().then(function (d) {
      var ant = []; try { ant = d.exists ? JSON.parse(d.data().filas || '[]') : []; } catch (e) { ant = []; }
      var todas = ant.concat(filas);
      return ref.set({ fecha: fecha, parte: 'c', origen: 'control', cantidad: todas.length, total: X.redondear(todas.reduce(function (t, f) { return t + (Number(f[4]) || 0); }, 0)),
        filas: JSON.stringify(todas), actualizado: X.servidor(), quien: S.usuario.email });
    });
  }

  /* ══════════ ESCRITURA EN LOTES ══════════ */
  function escribir(ops, progreso) {
    var i = 0, tam = 400;
    var paso = function () {
      if (i >= ops.length) return Promise.resolve(ops.length);
      var lote = X.dbP.batch();
      ops.slice(i, i + tam).forEach(function (o) {
        if (o.tipo === 'delete') lote.delete(o.ref);
        else if (o.tipo === 'update') lote.update(o.ref, o.datos);
        else lote.set(o.ref, o.datos, o.merge ? { merge: true } : undefined);
      });
      return lote.commit().then(function () { i += tam; if (progreso) progreso(Math.min(i, ops.length), ops.length); return paso(); });
    };
    return paso();
  }
  function encolarNotif(titulo, cuerpo, uids, link) {
    if (!modoControl() || !uids.length) return Promise.resolve();
    return X.dbP.collection('colaNotif').add({
      titulo: String(titulo).slice(0, 80), cuerpo: String(cuerpo).slice(0, 240), paraQuien: 'IDS', ids: uids.join(','),
      link: link || 'inicio', estado: 'pendiente', creado: X.servidor(), quien: S.usuario.email
    }).catch(function (e) { console.warn('Notificación:', e); });
  }

  /* ══════════ IMPORTAR LAS PLANILLAS SEMANALES ══════════ */
  /* [clave, etiqueta, encabezados que la reconocen (en orden de preferencia), obligatoria] */
  var CAMPOS = [
    ['id', 'ID Yango', [/^ID DEL MENSAJERO/, /^ID.*(YANGO|MENSAJERO|RIDER|CONDUCTOR|DRIVER|PARTNER)/, /^ID$/, /^ID /], true],
    ['nombre', 'Nombre', [/^NOMBRE COMPLETO/, /^NOMBRE/, /REPARTIDOR|CONDUCTOR|DRIVER/], false],
    ['celular', 'Celular', [/CELULAR|TELEFONO|PHONE/], false],
    ['importe', 'Importe a pagar', [/^IMPORTE TOTAL$/, /A PAGAR/, /^IMPORTE TOTAL/, /^IMPORTE/, /^MONTO/], true],
    ['ganancias', 'Ganancias de la semana', [/^GANANCIAS TOTALES/, /^GANANCIAS/], false],
    ['anterior', 'Importe del periodo anterior', [/^IMPORTE DEL PERIODO ANTERIOR/, /PERIODO ANTERIOR/], false],
    ['ciudad', 'Ciudad (para revisar)', [/^CIUDAD$/], false],
    ['semana', 'Semana (si viene en una columna)', [/^SEMANA/, /^SEM\b/, /WEEK/], false],
    ['rango', 'Rango de fechas (si viene en una columna)', [/^RANGO/, /^PERIODO/], false]
  ];
  function leerMapaGuardado() { try { return JSON.parse(localStorage.getItem('ctrl_mapa_semanas') || '{}'); } catch (e) { return {}; } }
  function guardarMapa(m) { try { localStorage.setItem('ctrl_mapa_semanas', JSON.stringify(m)); } catch (e) { } }

  function leerLibro(archivo) {
    return X.cargarXLSX().then(function (XL) {
      return archivo.arrayBuffer().then(function (buf) {
        var lb = XL.read(buf, { type: 'array' });
        return lb.SheetNames.map(function (n) {
          var todas = XL.utils.sheet_to_json(lb.Sheets[n], { header: 1, raw: true, defval: '' });
          var i0 = 0;
          for (var i = 0; i < Math.min(todas.length, 20); i++) { if (todas[i].filter(function (c) { return /[a-z]/i.test(String(c)); }).length >= 3) { i0 = i; break; } }
          var enc = (todas[i0] || []).map(function (h) { return String(h).trim(); });
          // _fila = número de fila tal como se ve en el Excel (para la vista previa)
          var filas = todas.slice(i0 + 1).map(function (f, j) { f._fila = i0 + 2 + j; return f; }).filter(function (f) { return f.some(function (c) { return String(c).trim(); }); });
          return { nombre: n, enc: enc, filas: filas, todas: todas };
        });
      });
    });
  }
  function adivinar(enc, guardado) {
    var m = {};
    CAMPOS.forEach(function (c) {
      var j = -1;
      if (guardado && guardado[c[0]]) j = enc.indexOf(guardado[c[0]]);
      for (var p = 0; j < 0 && p < c[2].length; p++) for (var k = 0; k < enc.length; k++) { if (c[2][p].test(X.normal(enc[k]))) { j = k; break; } }
      m[c[0]] = j;
    });
    if (m.nombre === m.id) m.nombre = -1;
    return m;
  }

  /* Arma la vista previa: qué se crea, qué cambia, qué queda igual y qué se bloquea */
  function analizar(o) {
    var res = { filas: [], errores: [], nuevos: 0, cambian: 0, iguales: 0, bloqueados: 0, noHab: 0, sinCuenta: 0, sinActividad: 0, otraCiudad: 0, total: 0, semanas: {}, faltan: [] };
    var porDoc = {};
    o.filas.forEach(function (f, i) {
      var id = String(f[o.mapa.id] == null ? '' : f[o.mapa.id]).trim().replace(/\.0+$/, '');
      var imp = X.numero(f[o.mapa.importe]);
      if (!id && imp === null) return;
      var fila = f._fila || i + 1;
      if (!id) { res.errores.push({ fila: fila, motivo: 'Sin ID Yango' }); return; }
      if (imp === null) { res.errores.push({ fila: fila, id: id, motivo: 'Importe vacío o no numérico' }); return; }
      if (imp < 0) imp = 0;
      // Todas las filas se guardan (también las de Bs 0) para que el repartidor vea cada semana en su historial
      var gan = o.mapa.ganancias >= 0 ? X.redondear(X.numero(f[o.mapa.ganancias]) || 0) : 0;
      var antP = o.mapa.anterior >= 0 ? X.redondear(X.numero(f[o.mapa.anterior]) || 0) : 0;
      if (imp === 0 && o.mapa.ganancias >= 0 && !(gan > 0)) res.sinActividad++;
      if (o.mapa.ciudad >= 0 && o.ciudad && ciudadDeArchivo(f[o.mapa.ciudad]) && ciudadDeArchivo(f[o.mapa.ciudad]) !== o.ciudad) res.otraCiudad++;
      var n = o.semanaFija, anio = o.anioFijo;
      if (o.mapa.semana >= 0 && String(f[o.mapa.semana]).trim()) {
        n = numSemana(f[o.mapa.semana]); anio = anioDe(f[o.mapa.semana]) || o.anioFijo || inferirAnio(n);
      }
      if (!n || !anio) { res.errores.push({ fila: fila, id: id, motivo: 'No se reconoce la semana' }); return; }
      var uid = X.idSeguro(id), k = idDoc(uid, anio, n);
      var r = porDoc[k];
      if (r) { r.importe = X.redondear(r.importe + imp); r.ganancias = X.redondear(r.ganancias + gan); r.importeAnterior = X.redondear(r.importeAnterior + antP); r.repetido = (r.repetido || 1) + 1; return; }
      porDoc[k] = r = {
        doc: k, id: id, uid: uid, n: n, anio: anio, orden: anio * 100 + n, importe: X.redondear(imp), ganancias: gan, importeAnterior: antP,
        nombre: o.mapa.nombre >= 0 ? String(f[o.mapa.nombre]).trim() : '', celular: o.mapa.celular >= 0 ? String(f[o.mapa.celular]).replace(/\D/g, '') : '',
        rango: o.mapa.rango >= 0 && String(f[o.mapa.rango]).trim() ? String(f[o.mapa.rango]).trim() : o.rangoFijo
      };
    });
    Object.keys(porDoc).forEach(function (k) {
      var r = porDoc[k], ant = o.existentes[k], rep = D.repartidores && D.repartidores.get(r.uid);
      var dePlanilla = !!r.nombre;
      if (!r.nombre && rep) r.nombre = rep.nombre;
      if (!r.nombre) r.nombre = nombreBDY(r.id); // planillas que vienen solo con el ID
      if (!r.nombre && ant) r.nombre = ant.nombre || '';
      r.nombreSistema = !dePlanilla && !!r.nombre;
      r.cuenta = !!(rep && !rep.sinCuenta);
      r.estadoNuevo = r.importe > 0 ? 'pendiente' : 'no_habilitado';
      r.texto = ant ? ant.semana : textoSemana(o.patron, r.n, r.anio);
      if (!ant) r.accion = 'nuevo';
      else if (ant.estado === 'en_planilla' || ant.estado === 'pagado') r.accion = Math.abs((Number(ant.importe) || 0) - r.importe) > 0.005 ? 'bloqueado' : 'igual';
      else r.accion = (Math.abs((Number(ant.importe) || 0) - r.importe) > 0.005 || ant.estado !== r.estadoNuevo) ? 'cambia' : 'igual';
      r.ant = ant || null;
      res.filas.push(r);
      res[{ nuevo: 'nuevos', cambia: 'cambian', igual: 'iguales', bloqueado: 'bloqueados' }[r.accion]]++;
      if (r.estadoNuevo === 'no_habilitado') res.noHab++;
      if (!r.cuenta) res.sinCuenta++;
      if (r.accion !== 'bloqueado') res.total += r.importe;
      res.semanas[r.texto] = 1;
    });
    res.total = X.redondear(res.total);
    var vienen = {}; res.filas.forEach(function (r) { vienen[r.doc] = 1; });
    Object.keys(o.existentes).forEach(function (k) {
      var e = o.existentes[k];
      if (!vienen[k] && e.ciudad === o.ciudad && res.semanas[e.semana]) res.faltan.push(e);
    });
    return res;
  }

  function importar() {
    if (!X.puedeEditar()) { X.aviso('Tu rol no permite importar.'); return; }
    var w = isoSemana(new Date(Date.now() - 7 * 864e5));
    X.ventana('Importar planilla semanal', 'Sube el Excel que manda Yango/MTG de una ciudad («Milthagor Santa Cruz 19.10.26-25.10.26»). Se revisa todo antes de guardar.',
      '<div class="fm">' +
        '<div class="dos"><div class="fila"><label for="imArch">Archivo</label><input id="imArch" type="file" accept=".xlsx,.xls,.csv"></div>' +
        '<div class="fila"><label for="imCiudad">Ciudad</label><select id="imCiudad"><option value="">Elegir…</option>' + Object.keys(CIUDADES).map(function (k) { return '<option value="' + k + '">' + CIUDADES[k] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="dos"><div class="fila"><label for="imSem">Semana N.º</label><input id="imSem" type="number" min="1" max="53" value="' + w.semana + '"></div>' +
        '<div class="fila"><label for="imAnio">Año</label><input id="imAnio" type="number" min="2024" max="2099" value="' + w.anio + '"></div></div>' +
        '<div class="fila"><label for="imRango">Rango de fechas</label><input id="imRango" placeholder="19/10 al 25/10"></div>' +
        '<div id="imMapa"></div>' +
      '</div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('buscar') + 'Revisar</button>',
      function (v, cerrar) {
        var hojas = null, hoja = null, ok = v.querySelector('[data-ok]'), mapa = v.querySelector('#imMapa'), archivo = null;
        var pintarMapa = function () {
          var m = adivinar(hoja.enc, leerMapaGuardado());
          var sel = function (c) {
            return '<div class="fila"><label for="im_' + c[0] + '">' + c[1] + (c[3] ? ' *' : '') + '</label><select id="im_' + c[0] + '"><option value="-1">(no usar)</option>' +
              hoja.enc.map(function (h, j) { return '<option value="' + j + '"' + (m[c[0]] === j ? ' selected' : '') + '>' + esc(h || ('Columna ' + (j + 1))) + '</option>'; }).join('') + '</select></div>';
          };
          mapa.innerHTML = (hojas.length > 1 ? '<div class="fila"><label for="imHoja">Hoja</label><select id="imHoja">' + hojas.map(function (h, j) { return '<option value="' + j + '"' + (h === hoja ? ' selected' : '') + '>' + esc(h.nombre) + ' (' + entero(h.filas.length) + ' filas)</option>'; }).join('') + '</select></div>' : '') +
            '<p class="muted">' + entero(hoja.filas.length) + ' filas leídas. Revisa que cada dato apunte a la columna correcta:</p><div class="dos">' + CAMPOS.map(sel).join('') + '</div>';
          var sh = mapa.querySelector('#imHoja'); if (sh) sh.addEventListener('change', function () { hoja = hojas[Number(sh.value)]; pintarMapa(); });
          ok.disabled = false;
        };
        v.querySelector('#imArch').addEventListener('change', function (e) {
          archivo = e.target.files[0]; if (!archivo) return;
          var c = ciudadDeArchivo(archivo.name); if (c) v.querySelector('#imCiudad').value = c;
          var sa = semanaDeArchivo(archivo.name);
          if (sa) { v.querySelector('#imSem').value = sa.semana; if (sa.anio) v.querySelector('#imAnio').value = sa.anio; if (sa.rango) v.querySelector('#imRango').value = sa.rango; }
          mapa.innerHTML = X.anillo('Leyendo el archivo…'); ok.disabled = true;
          leerLibro(archivo).then(function (l) {
            hojas = l; hoja = l.filter(function (h) { return h.filas.length; })[0] || l[0];
            if (!hoja || !hoja.filas.length) { mapa.innerHTML = '<p class="login-err">El archivo no tiene filas con datos.</p>'; return; }
            pintarMapa();
          }).catch(function (ex) { console.error(ex); mapa.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          var m = {}; CAMPOS.forEach(function (c) { m[c[0]] = Number(v.querySelector('#im_' + c[0]).value); });
          var ciudad = v.querySelector('#imCiudad').value;
          var n = Number(v.querySelector('#imSem').value), anio = Number(v.querySelector('#imAnio').value), rango = v.querySelector('#imRango').value.trim();
          if (!ciudad) { X.aviso('Elige la ciudad de la planilla.'); return; }
          if (m.id < 0 || m.importe < 0) { X.aviso('Elige al menos la columna del ID Yango y la del importe.'); return; }
          if (m.semana < 0 && (!(n >= 1 && n <= 53) || !(anio >= 2024))) { X.aviso('Escribe el número de semana y el año.'); return; }
          var g = {}; CAMPOS.forEach(function (c) { if (m[c[0]] >= 0) g[c[0]] = hoja.enc[m[c[0]]]; }); guardarMapa(g);
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Revisando';
          // Las semanas que ya existen de esa semana (para saber qué cambia)
          var ordenes = {};
          if (m.semana < 0) ordenes[anio * 100 + n] = 1;
          else hoja.filas.forEach(function (f) { var sn = numSemana(f[m.semana]); if (sn) ordenes[(anioDe(f[m.semana]) || anio || inferirAnio(sn)) * 100 + sn] = 1; });
          var lista = Object.keys(ordenes).map(Number);
          if (lista.length > 10) { X.aviso('El archivo trae más de 10 semanas distintas. Revisa la columna de semana.'); ok.disabled = false; ok.innerHTML = ic('buscar') + 'Revisar'; return; }
          // BDYango hace falta para completar los nombres que la planilla trae vacíos
          Promise.all([col().where('orden', 'in', lista).get(), X.banco ? X.banco.cargarBDYango() : null]).then(function (rr) {
            var q = rr[0], ex = {}; q.forEach(function (d) { var x = d.data(); x._id = d.id; ex[d.id] = x; });
            var res = analizar({ filas: hoja.filas, mapa: m, semanaFija: m.semana < 0 ? n : 0, anioFijo: anio, rangoFijo: rango, ciudad: ciudad, existentes: ex, patron: patronSemana(muestrasSemana()) });
            cerrar(); vistaPrevia(res, { ciudad: ciudad, archivo: archivo.name, hoja: hoja.nombre });
          }, function (e) {
            console.error(e); ok.disabled = false; ok.innerHTML = ic('buscar') + 'Revisar';
            X.aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso sobre «semanas»: falta publicar las reglas del Portal.' : 'No se pudo consultar Firebase.');
          });
        });
      });
  }

  var ACC = { nuevo: ['ok', 'Nueva'], cambia: ['pend', 'Cambia'], igual: ['neutro', 'Sin cambios'], bloqueado: ['mal', 'Bloqueada'] };
  function vistaPrevia(res, info) {
    var aGuardar = res.filas.filter(function (r) { return r.accion === 'nuevo' || r.accion === 'cambia'; });
    var avisos = res.filas.filter(function (r) { return r.accion !== 'igual' || r.repetido || !r.cuenta; })
      .sort(function (a, b) { return ['bloqueado', 'cambia', 'nuevo', 'igual'].indexOf(a.accion) - ['bloqueado', 'cambia', 'nuevo', 'igual'].indexOf(b.accion); });
    var semTxt = Object.keys(res.semanas).join(', ');
    var cuerpo =
      '<div class="rejilla r4 mb">' +
        '<div class="kpi"><small>Nuevas</small><b class="num">' + entero(res.nuevos) + '</b><em>no estaban guardadas</em></div>' +
        '<div class="kpi"><small>Cambian</small><b class="num">' + entero(res.cambian) + '</b><em>' + entero(res.iguales) + ' sin cambios</em></div>' +
        '<div class="kpi' + (res.bloqueados ? ' alerta' : '') + '"><small>Bloqueadas</small><b class="num">' + entero(res.bloqueados) + '</b><em>ya en planilla o pagadas</em></div>' +
        '<div class="kpi"><small>Total del archivo</small><b class="num">' + bs(res.total) + '</b><em>' + esc(CIUDADES[info.ciudad]) + ' · sem ' + esc(semTxt) + ' · ' + entero(res.noHab) + ' no habilitados (Bs 0)</em></div>' +
      '</div>' +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Se guardará como semana «' + esc(semTxt) + '»</b>Es el mismo texto que usan las facturas del Portal. ' +
        (res.sinCuenta ? entero(res.sinCuenta) + ' repartidores todavía no tienen cuenta en el Portal: sus semanas quedan guardadas y las verán cuando se cree su cuenta. ' : '') +
        (res.sinActividad ? entero(res.sinActividad) + ' repartidores no tuvieron actividad: se guardan como «no habilitado» para que la semana quede en su historial.' : '') + '</div></div>' +
      (res.otraCiudad ? '<div class="aviso-caja mb">' + ic('excepcion') + '<div><b>' + entero(res.otraCiudad) + ' filas dicen otra ciudad</b>Revisa que hayas elegido la ciudad correcta antes de guardar.</div></div>' : '') +
      (res.errores.length ? '<div class="card mb"><div class="h2">Filas que no se pueden leer <small>' + entero(res.errores.length) + '</small></div>' +
        X.tabla([{ t: 'Fila', k: 'fila' }, { t: 'ID', k: 'id' }, { t: 'Motivo', k: 'motivo' }], res.errores.slice(0, 50)) + '</div>' : '') +
      (res.faltan.length ? '<div class="card mb"><div class="h2">Estaban guardadas y ya no vienen <small>' + entero(res.faltan.length) + '</small></div><p class="muted">No se borran. Revísalas con Yango/MTG.</p>' +
        X.tabla([{ t: 'ID', k: 'id' }, { t: 'Nombre', k: 'nombre' }, { t: 'Importe', clase: 'monto', html: function (e) { return bs(e.importe); } }, { t: 'Estado', k: 'estado' }], res.faltan.slice(0, 50)) + '</div>' : '') +
      (avisos.length ? '<div class="card"><div class="h2">Detalle <small>' + entero(avisos.length) + ' para revisar</small></div>' + X.tabla([
        { t: 'Repartidor', html: function (r) { return '<b>' + esc(r.nombre || '—') + '</b><span class="sub num">ID ' + esc(r.id) + '</span>'; } },
        { t: 'Cambio', html: function (r) { return X.chip(ACC[r.accion][0], ACC[r.accion][1]) + (r.repetido ? ' ' + X.chip('pend', 'Repetido ×' + r.repetido + ' (sumado)') : '') + (r.cuenta ? '' : ' ' + X.chip('neutro', 'Sin cuenta')); } },
        { t: 'Antes', clase: 'monto', html: function (r) { return r.ant ? bs(r.ant.importe) : '—'; } },
        { t: 'Ahora', clase: 'monto', html: function (r) { return '<b>' + bs(r.importe) + '</b>'; } }
      ], avisos.slice(0, 300)) + '</div>' : '');
    X.ventana('Revisar importación', esc(info.archivo) + ' · hoja «' + esc(info.hoja) + '»', cuerpo,
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok' + (aGuardar.length ? '' : ' disabled') + '>' + ic('check') + 'Guardar ' + entero(aGuardar.length) + (aGuardar.length === 1 ? ' semana' : ' semanas') + '</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          var lote = 'imp-' + X.nuevoId(), quien = S.usuario.email;
          var ops = aGuardar.map(function (r) {
            var d = { id: r.id, uid: r.uid, nombre: r.nombre, nombreSistema: !!r.nombreSistema, celular: r.celular, ciudad: info.ciudad, anio: r.anio, orden: r.orden, ganancias: r.ganancias, importeAnterior: r.importeAnterior,
              rango: r.rango || (r.ant && r.ant.rango) || '', importe: r.importe, estado: r.estadoNuevo, lote: lote, actualizado: X.servidor(), quien: quien };
            if (r.accion === 'nuevo') { d.semana = r.texto; d.origen = 'excel'; d.loteCreado = lote; d.creado = X.servidor(); d.planilla = null; d.fechaPago = null; }
            else d.anterior = { importe: Number(r.ant.importe) || 0, estado: r.ant.estado, lote: r.ant.lote || '' };
            return { ref: col().doc(r.doc), datos: d, merge: true };
          });
          escribir(ops, function (h, t) { ok.innerHTML = X.anilloBoton() + entero(h) + ' de ' + entero(t); }).then(function () {
            var nuevosPend = aGuardar.filter(function (r) { return r.accion === 'nuevo' && r.estadoNuevo === 'pendiente'; });
            var semTxt = Object.keys(res.semanas).join(', ');
            return Promise.all([
              X.dbC.collection('importaciones').doc(lote).set({
                cuando: X.servidor(), quien: quien, ciudad: info.ciudad, archivo: info.archivo, hoja: info.hoja, semanas: Object.keys(res.semanas),
                nuevos: res.nuevos, cambian: res.cambian, iguales: res.iguales, bloqueados: res.bloqueados, noHabilitados: res.noHab, total: res.total, deshecha: false
              }),
              X.bitacora('Importó planilla semanal', CIUDADES[info.ciudad] + ' · semana ' + semTxt + ' · ' + aGuardar.length + ' semanas · ' + bs(res.total)),
              encolarNotif(nuevosPend.length && Object.keys(res.semanas).length === 1 ? 'Semana ' + semTxt + ' registrada' : 'Tienes semanas nuevas por cobrar',
                'Ya puedes ver tu pago pendiente. Envía tu factura hasta el jueves a las 18:00.', nuevosPend.map(function (r) { return r.uid; }), 'pendientes')
            ]);
          }).then(function () {
            cerrar(); X.aviso('Importación guardada'); X.recargarTodo();
          }, function (e) {
            console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar';
            X.aviso('Se cortó la importación. Puedes volver a importar el mismo archivo: lo ya guardado no se duplica.');
          });
        });
      });
  }

  /* ══════════ IMPORTACIONES (lista y deshacer) ══════════ */
  function verImportaciones() {
    var c = X.cajon('Importaciones', 'Cada planilla semanal que se cargó. Deshacer quita lo que creó y devuelve lo que cambió.', X.cargaBarra('Importaciones', 'Trayendo…'));
    X.dbC.collection('importaciones').orderBy('cuando', 'desc').limit(60).get().then(function (q) {
      var l = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; l.push(x); });
      c.cuerpo.innerHTML = l.length ? X.tabla([
        { t: 'Fecha', html: function (x) { return X.fechaHora(x.cuando) + '<span class="sub">' + esc(x.quien) + '</span>'; } },
        { t: 'Planilla', html: function (x) { return '<b>' + esc(CIUDADES[x.ciudad] || x.ciudad) + '</b> · Sem ' + esc((x.semanas || []).join(', ')) + '<span class="sub">' + esc(x.archivo) + '</span>'; } },
        { t: 'Nuevas / cambian', clase: 'monto', html: function (x) { return entero(x.nuevos) + ' / ' + entero(x.cambian); } },
        { t: 'Total', clase: 'monto', html: function (x) { return bs(x.total); } },
        { t: '', html: function (x) { return x.deshecha ? X.chip('neutro', 'Deshecha') : (X.esAdmin() ? '<button class="btn sec chico" data-deshacer="' + esc(x._id) + '">Deshacer</button>' : ''); } }
      ], l) : X.vacio('Todavía no se importó ninguna planilla', '', 'marca/graficos/ilu-crecimiento-reportes.png');
      c.cuerpo.querySelectorAll('[data-deshacer]').forEach(function (b) {
        b.addEventListener('click', function () { deshacer(b.getAttribute('data-deshacer'), c.cerrar); });
      });
    }, function (e) { console.error(e); c.cuerpo.innerHTML = X.vacio('No se pudieron traer las importaciones', 'Revisa tus permisos y las reglas de CONTROL.'); });
  }
  /* ══════════ PLANILLAS POR SEMANA ══════════
     La planilla completa de una semana (todas las ciudades): quién se pagó, quién falta (pendiente o enviado a pagar)
     y quién quedó en Bs 0 (no habilitado). Lee de Firebase solo los documentos de esa semana; las semanas pagadas
     antes de CONTROL (migradas de Sheets) salen del historial (ahí no se guardaron los Bs 0). */
  var PS = { orden: 0, ciudad: '', estado: '', buscar: '', pag: 0 };
  var EST_FACT = { lista: 'Lista para pagar', contax: 'Factura CONTAX', excepcion: 'Excepción', revision: 'Factura en revisión', observada: 'Factura observada', tarde: 'Después del corte', porEmitir: 'Por emitir (CONTAX)', falta: 'Falta factura' };
  function ordenHist(h) { return anioSemana(h.semana, h.gestion, h.fecha) * 100 + numSemana(h.semana); }
  function semanasDisponibles() {
    var m = {};
    (D.semanas || []).forEach(function (s) { if (s.orden) m[s.orden] = 1; });
    (D.hist || []).forEach(function (h) { var o = ordenHist(h); if (o % 100) m[o] = 1; });
    return Object.keys(m).map(Number).sort(function (a, b) { return b - a; });
  }
  function textoOrden(o) { return 'Semana ' + (o % 100) + ' · ' + Math.floor(o / 100); }
  function verPorSemana() {
    var ords = semanasDisponibles();
    if (!ords.length) return X.aviso('Todavía no hay semanas cargadas.');
    if (ords.indexOf(PS.orden) < 0) PS.orden = ords[0];
    var c = X.cajon('Planillas por semana', 'La planilla completa de cualquier semana: pagados (historial), pendientes y en Bs 0 (no habilitados).', ''), filas = [];
    function traer() {
      var o = PS.orden; PS.pag = 0;
      c.cuerpo.innerHTML = X.cargaBarra('Planilla', 'Trayendo ' + textoOrden(o) + '…');
      col().where('orden', '==', o).get().then(function (q) {
        var hs = (D.hist || []).filter(function (h) { return ordenHist(h) === o; }), porId = {}, vistos = {}, evs = {};
        hs.forEach(function (h) { porId[h.id] = h; });
        filas = [];
        q.forEach(function (d) {
          var x = d.data(), id = String(x.id), h = porId[id], uid = x.uid || X.idSeguro(id), f = '—';
          vistos[id] = 1;
          if (x.estado === 'pendiente' && D.repartidores && D.repartidores.get(uid)) {
            var ev = evs[uid] || (evs[uid] = X.evaluar(D.repartidores.get(uid)));
            var e = ev.semanas.filter(function (z) { return z.p.semana === x.semana; })[0];
            f = e ? (EST_FACT[e.estado] || 'Pago retenido') : 'Falta factura';
          }
          filas.push({ ciudad: x.ciudad || '', id: id, nombre: x.nombre || (h && h.nombre) || nombreBDY(id), nombreSistema: !!x.nombreSistema || !x.nombre, semana: x.semana, rango: x.rango || (h && h.rango) || '',
            importe: x.estado === 'no_habilitado' ? 0 : Number(x.importe) || 0, ganancias: Number(x.ganancias) || 0,
            estado: { pagado: 'Pagado', pendiente: 'Pendiente', en_planilla: 'Enviado a pagar', no_habilitado: 'No habilitado' }[x.estado] || x.estado,
            fechaPago: x.estado === 'pagado' ? X.fecha(x.fechaPago || (h && h.fecha)) : '', factura: x.estado === 'pagado' ? ((h && h.factura) || '—') : x.estado === 'no_habilitado' ? 'No corresponde' : f });
        });
        hs.forEach(function (h) {
          if (vistos[h.id]) return; vistos[h.id] = 1;
          filas.push({ ciudad: CIUDADES[h.ciudad] ? h.ciudad : '', id: h.id, nombre: h.nombre || nombreBDY(h.id), semana: h.semana, rango: h.rango, importe: h.importe, ganancias: 0,
            estado: 'Pagado', fechaPago: X.fecha(h.fecha), factura: h.factura || '—' });
        });
        filas.sort(function (a, b) { return String(a.ciudad).localeCompare(String(b.ciudad)) || X.normal(a.nombre).localeCompare(X.normal(b.nombre)); });
        armar();
      }, function (e) { console.error(e); c.cuerpo.innerHTML = X.vacio('No se pudo traer la semana', 'Revisa tu conexión y tus permisos.'); });
    }
    function deCiudad() { return filas.filter(function (f) { return !PS.ciudad || f.ciudad === PS.ciudad; }); }
    function visibles() {
      var b = X.normal(PS.buscar);
      return deCiudad().filter(function (f) {
        if (PS.estado === 'pendiente' && f.estado !== 'Pendiente' && f.estado !== 'Enviado a pagar') return false;
        if (PS.estado && PS.estado !== 'pendiente' && f.estado !== PS.estado) return false;
        return !b || (X.normal(f.nombre) + ' ' + f.id).indexOf(b) >= 0;
      });
    }
    function cuenta(l) {
      var k = function (fn) { var x = l.filter(fn); return { n: x.length, t: X.redondear(x.reduce(function (s, f) { return s + f.importe; }, 0)) }; };
      return { todos: k(function () { return true; }), pagado: k(function (f) { return f.estado === 'Pagado'; }),
        pendiente: k(function (f) { return f.estado === 'Pendiente' || f.estado === 'Enviado a pagar'; }), nohab: k(function (f) { return f.estado === 'No habilitado'; }) };
    }
    // Resumen por ciudad (para sacar captura y mandarlo): total, habilitados, en Bs 0 e importe de la semana
    function porCiudad() {
      var g = function (l) { var hab = l.filter(function (f) { return f.estado !== 'No habilitado'; });
        return { n: l.length, hab: hab.length, nohab: l.length - hab.length, t: X.redondear(hab.reduce(function (s, f) { return s + f.importe; }, 0)) }; };
      return Object.keys(CIUDADES).map(function (x) { return { nom: CIUDADES[x], k: g(filas.filter(function (f) { return f.ciudad === x; })) }; })
        .concat(filas.some(function (f) { return !CIUDADES[f.ciudad]; }) ? [{ nom: 'Sin ciudad', k: g(filas.filter(function (f) { return !CIUDADES[f.ciudad]; })) }] : [])
        .concat([{ nom: 'Total de la semana', k: g(filas), total: true }]);
    }
    function resumenCiudades() {
      if (!filas.length) return '';
      var fila = function (t, v, cl) { return '<div class="ciu-fila' + (cl ? ' ' + cl : '') + '"><span>' + t + '</span><b class="num">' + v + '</b></div>'; };
      return '<div class="card mb ciu-resumen"><div class="h2">Resumen por ciudad <small>' + textoOrden(PS.orden) + '</small></div><div class="rejilla r4">' +
        porCiudad().map(function (c) {
          return '<div class="ciu-card' + (c.total ? ' total' : '') + '"><small>' + esc(c.nom) + '</small><b class="num">' + bs(c.k.t) + '</b>' +
            fila('Repartidores', entero(c.k.n)) + fila('Habilitados', entero(c.k.hab), 'ok') + fila('No habilitados (Bs 0)', entero(c.k.nohab), 'cero') + '</div>';
        }).join('') + '</div></div>';
    }
    function armar() {
      var k = cuenta(deCiudad());
      c.cuerpo.innerHTML = '<div class="herr">' +
          '<select id="psSem" aria-label="Semana">' + ords.map(function (o) { return '<option value="' + o + '"' + (o === PS.orden ? ' selected' : '') + '>' + textoOrden(o) + '</option>'; }).join('') + '</select>' +
          '<select id="psCiu" aria-label="Ciudad"><option value="">Todas las ciudades</option>' + Object.keys(CIUDADES).map(function (x) { return '<option value="' + x + '"' + (x === PS.ciudad ? ' selected' : '') + '>' + CIUDADES[x] + '</option>'; }).join('') + '</select>' +
          '<button class="btn sec" id="psExcel"' + (filas.length ? '' : ' disabled') + '>' + ic('descargar') + 'Excel</button></div>' +
        '<div class="rejilla r4 mb">' +
          '<button class="kpi' + (PS.estado === '' ? ' activo' : '') + '" data-ps=""><small>Planilla completa</small><b class="num">' + bs(k.todos.t) + '</b><em>' + entero(k.todos.n) + ' repartidores</em></button>' +
          '<button class="kpi' + (PS.estado === 'Pagado' ? ' activo' : '') + '" data-ps="Pagado"><small>Pagados</small><b class="num">' + bs(k.pagado.t) + '</b><em>' + entero(k.pagado.n) + ' repartidores</em></button>' +
          '<button class="kpi alerta' + (PS.estado === 'pendiente' ? ' activo' : '') + '" data-ps="pendiente"><small>Falta pagar</small><b class="num">' + bs(k.pendiente.t) + '</b><em>' + entero(k.pendiente.n) + ' repartidores</em></button>' +
          '<button class="kpi' + (PS.estado === 'No habilitado' ? ' activo' : '') + '" data-ps="No habilitado"><small>No habilitados (Bs 0)</small><b class="num">' + entero(k.nohab.n) + '</b><em>no cumplieron las horas</em></button>' +
        '</div>' + resumenCiudades() +
        '<div class="pestanas">' + [['', 'Todos', 'todos'], ['Pagado', 'Pagados', 'pagado'], ['pendiente', 'Falta pagar', 'pendiente'], ['No habilitado', 'No habilitados', 'nohab']].map(function (p) {
          return '<button aria-selected="' + (PS.estado === p[0]) + '" data-ps="' + esc(p[0]) + '">' + p[1] + ' <em class="num">' + entero(k[p[2]].n) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="psBus" placeholder="Buscar por nombre o ID" value="' + esc(PS.buscar) + '"></div></div>' +
        '<div id="psRes"></div>' +
        (filas.length ? '' : '<p class="muted">No hay datos de esta semana.</p>');
      var q = function (s) { return c.cuerpo.querySelector(s); };
      q('#psSem').addEventListener('change', function () { PS.orden = Number(this.value); traer(); });
      q('#psCiu').addEventListener('change', function () { PS.ciudad = this.value; PS.pag = 0; armar(); });
      c.cuerpo.querySelectorAll('[data-ps]').forEach(function (b) { b.addEventListener('click', function () { PS.estado = b.getAttribute('data-ps'); PS.pag = 0; armar(); }); });
      var t; q('#psBus').addEventListener('input', function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { PS.buscar = v; PS.pag = 0; resultados(); }, 250); });
      q('#psExcel').addEventListener('click', excel);
      resultados();
    }
    function resultados() {
      var l = visibles(), caja = c.cuerpo.querySelector('#psRes'); if (!caja) return;
      var chip = function (e) { return X.chip({ 'Pagado': 'ok', 'Pendiente': 'pend', 'Enviado a pagar': 'pend', 'No habilitado': 'neutro' }[e] || 'neutro', e === 'No habilitado' ? 'No habilitado (Bs 0)' : e); };
      caja.innerHTML = l.length ? '<div class="tabla-ancha">' + X.tabla([
        { t: 'Ciudad', html: function (f) { return esc(CIUDADES[f.ciudad] || '—'); } },
        { t: 'Repartidor', html: function (f) { return '<b>' + esc(f.nombre || 'Sin nombre') + '</b><span class="sub num">ID ' + esc(f.id) + '</span>' + (f.nombreSistema ? '<span class="sub">' + X.chip('neutro', 'Nombre colocado por el sistema') + '</span>' : ''); } },
        { t: 'Importe', clase: 'monto', html: function (f) { return bs(f.importe); } },
        { t: 'Pago', html: function (f) { return chip(f.estado) + (f.fechaPago ? '<span class="sub num">' + esc(f.fechaPago) + '</span>' : ''); } },
        { t: 'Factura', html: function (f) { return esc(f.factura); } }
      ], l, { tam: 100, pag: PS.pag }) + '</div>' : (filas.length ? X.vacio('Nadie con ese filtro', '') : '');
      caja.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { PS.pag = Number(b.getAttribute('data-pag')); resultados(); }); });
    }
    function excel() {
      var l = deCiudad(), k = cuenta(l), nom = 'Planilla-SEM' + (PS.orden % 100) + '-' + Math.floor(PS.orden / 100) + (PS.ciudad ? '-' + PS.ciudad : '');
      X.excel([
        { nombre: 'Resumen', filas: [['Planilla', textoOrden(PS.orden) + (PS.ciudad ? ' · ' + CIUDADES[PS.ciudad] : ' · todas las ciudades')], [], ['', 'Repartidores', 'Importe (Bs)'],
          ['Planilla completa', k.todos.n, k.todos.t], ['Pagados', k.pagado.n, k.pagado.t], ['Falta pagar', k.pendiente.n, k.pendiente.t], ['No habilitados (Bs 0)', k.nohab.n, 0],
          [], ['Por ciudad', 'Repartidores', 'Habilitados', 'No habilitados (Bs 0)', 'Importe (Bs)']].concat(porCiudad().map(function (c) { return [c.nom, c.k.n, c.k.hab, c.k.nohab, c.k.t]; })) },
        { nombre: 'Detalle', filas: [['Ciudad', 'ID Yango', 'Nombre', 'Semana', 'Rango', 'Importe (Bs)', 'Ganancias (Bs)', 'Estado del pago', 'Fecha de pago', 'Factura', 'Nota']].concat(l.map(function (f) {
          return [CIUDADES[f.ciudad] || '', f.id, f.nombre, f.semana, f.rango, f.importe, f.ganancias || '', f.estado, f.fechaPago, f.factura, f.nombreSistema ? 'Nombre colocado por el sistema' : ''];
        })) }
      ], nom);
      X.bitacora('Descargó planilla por semana', nom);
    }
    traer();
  }
  function deshacer(lote, cerrarCajon) {
    col().where('lote', '==', lote).get().then(function (q) {
      var ops = [], bloqueadas = 0;
      q.forEach(function (d) {
        var x = d.data();
        if (x.estado === 'en_planilla' || x.estado === 'pagado') { bloqueadas++; return; }
        if (x.loteCreado === lote) ops.push({ tipo: 'delete', ref: d.ref });
        else if (x.anterior) ops.push({ tipo: 'update', ref: d.ref, datos: { importe: x.anterior.importe, estado: x.anterior.estado, lote: x.anterior.lote || '', anterior: firebase.firestore.FieldValue.delete(), actualizado: X.servidor(), quien: S.usuario.email } });
      });
      X.confirmar('Deshacer importación', 'Se quitan o devuelven ' + entero(ops.length) + ' semanas.' + (bloqueadas ? ' ' + entero(bloqueadas) + ' ya están en planilla o pagadas y no se tocan.' : ''), function () {
        escribir(ops).then(function () {
          return Promise.all([X.dbC.collection('importaciones').doc(lote).update({ deshecha: true, deshechaPor: S.usuario.email, deshechaEn: X.servidor() }), X.bitacora('Deshizo importación', lote + ' · ' + ops.length + ' semanas')]);
        }).then(function () { return X.olvidarCopia('semanas'); }).then(function () { cerrarCajon(); X.aviso('Importación deshecha'); X.recargarTodo(); }, function (e) { console.error(e); X.aviso('No se pudo deshacer. Revisa tus permisos.'); });
      }, 'Deshacer', true);
    }, function (e) { console.error(e); X.aviso('No se pudo consultar Firebase.'); });
  }

  /* ══════════ MIGRACIÓN DESDE GOOGLE SHEETS (HistPagosMTG y PPendientes) ══════════
     Se leen las hojas en vivo (puente del Panel). El historial va a «historialPagos» (se reescribe entero:
     se puede repetir hasta el día del cambio) y los pendientes a «semanas». No pisa semanas en planilla o pagadas. */
  var CIUDAD_HOJA = { SC: 'SCZ', SCZ: 'SCZ', CBBA: 'CBBA', CB: 'CBBA', LP: 'LPZ', LPZ: 'LPZ' };
  function numHoja(v) {
    if (typeof v === 'number') return v;
    var t = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
    return Number(t) || 0;
  }
  /* «SEM43G2026» → 2026 · «SEM50G25» → 2025 · si no, la columna «Gestión SEM» */
  function anioSemana(t, gestion, ref) {
    var m = String(t || '').match(/G\s*(\d{2,4})\s*$/i);
    if (m) return Number(m[1].length === 2 ? '20' + m[1] : m[1]);
    return anioDe(t) || (/^20\d\d$/.test(String(gestion).trim()) ? Number(gestion) : inferirAnio(numSemana(t), ref));
  }
  /* filas A:N desde la fila 3: Nro, Fecha de pago, Semana, Rango, ID, Nombre, Importe, Comentarios, Nro factura, Fecha factura, NIT, Autorización, Mes/Estado, Gestión */
  function leerHojasPagos(hojas) {
    var hist = [], pend = [], de = function (n) { return (hojas.filter(function (h) { return h.nombre === n; })[0] || { filas: [] }).filas; };
    de('HistPagosMTG').forEach(function (f) {
      var id = String(f[4] || '').trim(); if (!id && !f[6]) return;
      var fecha = fechaISO(f[1]);
      hist.push({ fecha: fecha || 'sin-fecha', fila: [String(f[2] || '').trim(), String(f[3] || '').trim(), id, String(f[5] || '').trim(), X.redondear(numHoja(f[6])),
        String(f[7] || '').trim(), String(f[8] || '').trim(), String(f[9] || '').trim(), String(f[10] || '').trim(), String(f[11] || '').trim(), String(f[0] || '').trim(),
        String(f[12] || '').trim(), String(f[13] || '').trim()], gestion: f[13] });
    });
    de('PPendientes').forEach(function (f) {
      var id = String(f[4] || '').trim(); if (!id && !f[6]) return;
      pend.push({ semana: String(f[2] || '').trim(), rango: String(f[3] || '').trim(), id: id, nombre: String(f[5] || '').trim(), importe: X.redondear(numHoja(f[6])),
        comentario: String(f[7] || '').trim(), estadoHoja: String(f[12] || f[1] || '').trim(), gestion: f[13] });
    });
    return { hist: hist, pend: pend };
  }
  function armarMigracion(datos, existentes, hoy) {
    var suma = function (l, k) { return X.redondear(l.reduce(function (t, x) { return t + (k ? x[k] : x.fila[4]); }, 0)); };
    // Historial agrupado por fecha de pago, en partes de TAM_PARTE
    var porFecha = {}, partes = [];
    datos.hist.forEach(function (h) { (porFecha[h.fecha] = porFecha[h.fecha] || []).push(h.fila); });
    Object.keys(porFecha).sort().forEach(function (f) {
      for (var i = 0, n = 1; i < porFecha[f].length; i += TAM_PARTE, n++) {
        var filas = porFecha[f].slice(i, i + TAM_PARTE);
        partes.push({ id: f + '_' + n, fecha: f, parte: n, filas: filas, total: X.redondear(filas.reduce(function (t, x) { return t + x[4]; }, 0)) });
      }
    });
    // Historial de cada repartidor para su portal: [semana, rango, importe, fechaPago, nroFactura]
    var porRider = {};
    datos.hist.forEach(function (h) {
      var u = X.idSeguro(h.fila[2]); if (!u) return;
      var r = porRider[u] || (porRider[u] = { uid: u, id: h.fila[2], filas: [] });
      r.filas.push([h.fila[0], h.fila[1], h.fila[4], h.fecha, h.fila[6]]);
    });
    // Semanas abiertas que la hoja ya muestra pagadas pasan a «pagado»
    var pagadas = [], vistas = {};
    datos.hist.forEach(function (h) {
      var n = numSemana(h.fila[0]); if (!n) return;
      var k = idDoc(X.idSeguro(h.fila[2]), anioSemana(h.fila[0], h.gestion, X.aFecha(h.fecha) || hoy), n), e = existentes[k];
      if (e && e.estado !== 'pagado' && !vistas[k]) { vistas[k] = 1; pagadas.push({ k: k, fecha: h.fecha }); }
    });
    // Pendientes (retenidos) → «semanas»
    var nuevas = {}, aPendiente = [], yaEstaban = 0, sinSemana = 0;
    datos.pend.forEach(function (p) {
      var n = numSemana(p.semana); if (!n) { sinSemana++; return; }
      var uid = X.idSeguro(p.id), anio = anioSemana(p.semana, p.gestion, hoy), k = idDoc(uid, anio, n), e = existentes[k];
      if (vistas[k]) return;
      if (e && e.estado === 'no_habilitado') { aPendiente.push({ k: k, importe: p.importe }); return; }
      if (e) { yaEstaban++; return; }
      if (nuevas[k]) { nuevas[k].importe = X.redondear(nuevas[k].importe + p.importe); return; }
      nuevas[k] = { id: p.id, uid: uid, nombre: p.nombre, celular: '', ciudad: CIUDAD_HOJA[X.normal(p.comentario)] || '', semana: p.semana, anio: anio, orden: anio * 100 + n,
        rango: p.rango, importe: p.importe, estado: 'pendiente', planilla: null, fechaPago: null, retenido: true, origen: 'migracion' };
    });
    return { partes: partes, riders: Object.keys(porRider).map(function (u) { return porRider[u]; }), pagadas: pagadas, nuevas: nuevas, aPendiente: aPendiente, yaEstaban: yaEstaban, sinSemana: sinSemana,
      hoja: { hist: datos.hist.length, histTotal: suma(datos.hist), pend: datos.pend.length, pendTotal: suma(datos.pend, 'importe') } };
  }
  function migrar() {
    if (!X.esAdmin()) { X.aviso('Solo un administrador puede migrar.'); return; }
    var c = X.ventana('Migrar desde Google Sheets', 'HistPagosMTG → historial de CONTROL · PPendientes → pagos pendientes.', X.anillo('Leyendo las hojas en vivo…'), '<button class="btn sec" data-cerrar>Cancelar</button>');
    Promise.all([X.puente('admin_ctrl_hoja', { hoja: 'pagos' }), col().get()]).then(function (r) {
      var ex = {}; r[1].forEach(function (d) { ex[d.id] = d.data(); });
      var m = armarMigracion(leerHojasPagos(r[0].hojas), ex, new Date()), nuevas = Object.keys(m.nuevas), h = m.hoja;
      var viejas = (D.histPartes || []).filter(function (p) { return p.origen === 'HistPagosMTG' && !m.partes.some(function (x) { return x.id === p.id; }); });
      c.cerrar();
      X.ventana('Migrar desde Google Sheets', 'Leído ' + X.fechaHora(r[0].leido) + '. Revisa los números antes de guardar.',
        '<div class="rejilla r2 mb"><div class="dato"><small>Historial (HistPagosMTG)</small><b class="num">' + entero(h.hist) + ' pagos · ' + bs(h.histTotal) + '</b><em>' + entero(m.partes.length) + ' fechas de pago</em></div>' +
        '<div class="dato"><small>Pendientes (PPendientes)</small><b class="num">' + entero(h.pend) + ' pagos · ' + bs(h.pendTotal) + '</b><em>' + entero(nuevas.length) + ' nuevas · ' + entero(m.yaEstaban) + ' ya estaban</em></div></div>' +
        '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué se guarda</b>El historial se reescribe completo (se puede repetir). ' +
          (m.pagadas.length ? entero(m.pagadas.length) + ' semanas abiertas en CONTROL figuran pagadas en la hoja y pasan a «pagado». ' : '') +
          (m.aPendiente.length ? entero(m.aPendiente.length) + ' semanas «no habilitadas» pasan a pendientes. ' : '') +
          (m.sinSemana ? entero(m.sinSemana) + ' filas de PPendientes no tienen semana y se omiten. ' : '') + '</div></div>',
        '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Migrar</button>',
        function (v, cerrar) {
          var ok = v.querySelector('[data-ok]');
          ok.addEventListener('click', function () {
            ok.disabled = true;
            var lote = 'migracion-' + X.hoyISO(), quien = S.usuario.email, i = 0;
            // Historial: un documento a la vez (cada uno puede pesar cientos de KB)
            var paso = function () {
              if (i >= m.partes.length) return Promise.resolve();
              var p = m.partes[i++];
              ok.innerHTML = X.anilloBoton() + 'Historial ' + entero(i) + ' de ' + entero(m.partes.length);
              return colH().doc(p.id).set({ fecha: p.fecha, parte: p.parte, origen: 'HistPagosMTG', cantidad: p.filas.length, total: p.total, filas: JSON.stringify(p.filas), actualizado: X.servidor(), quien: quien }).then(paso);
            };
            var ops = nuevas.map(function (k) { var d = m.nuevas[k]; d.lote = lote; d.loteCreado = lote; d.creado = X.servidor(); d.actualizado = X.servidor(); d.quien = quien; return { ref: col().doc(k), datos: d }; })
              .concat(m.pagadas.map(function (x) { return { tipo: 'update', ref: col().doc(x.k), datos: { estado: 'pagado', fechaPago: x.fecha, actualizado: X.servidor(), quien: quien } }; }))
              .concat(m.aPendiente.map(function (x) { return { tipo: 'update', ref: col().doc(x.k), datos: { estado: 'pendiente', importe: x.importe, retenido: true, actualizado: X.servidor(), quien: quien } }; }))
              .concat(viejas.map(function (p) { return { tipo: 'delete', ref: colH().doc(p.id) }; }))
              .concat(m.riders.map(function (r) { return { ref: X.dbP.collection('historialRider').doc(r.uid), datos: { uid: r.uid, id: r.id, cantidad: r.filas.length, filas: JSON.stringify(r.filas), origen: 'HistPagosMTG', actualizado: X.servidor() } }; }));
            paso().then(function () {
              return escribir(ops, function (a, t) { ok.innerHTML = X.anilloBoton() + 'Pendientes y repartidores ' + entero(a) + ' de ' + entero(t); });
            }).then(function () {
              return X.bitacora('Migró desde Sheets', h.hist + ' pagos del historial (' + h.histTotal + ') · ' + h.pend + ' pendientes (' + h.pendTotal + ')');
            }).then(cargarHistorial).then(function () {
              var n = (D.hist || []).length, t = X.redondear((D.hist || []).reduce(function (s, x) { return s + x.importe; }, 0));
              cerrar(); X.aviso(n === h.hist && t === h.histTotal ? 'Migración lista: ' + entero(n) + ' pagos · ' + bs(t) : 'Ojo: el historial guardado no cuadra (' + entero(n) + ' · ' + bs(t) + ')');
              X.recargarTodo();
            }, function (e) {
              console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar';
              X.aviso(/quota|resource-exhausted/i.test(e && (e.code + e.message)) ? 'Firebase llegó a su límite diario de escrituras. Reintenta mañana: lo ya guardado no se repite.' : 'Se cortó la migración. Reintenta: lo ya guardado no se repite.');
            });
          });
        });
    }, function (e) {
      console.error(e); c.cerrar();
      X.aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso sobre «semanas» o «historialPagos»: falta publicar las reglas del Portal.' : (e && e.message) || 'No se pudo leer las hojas.');
    });
  }

  /* ══════════ PLANILLA, CONFIRMACIÓN Y ANULACIÓN ══════════ */
  function marcarEnPlanilla(planillaId, docs) {
    if (!modoControl() || !docs.length) return Promise.resolve();
    return escribir(docs.map(function (k) { return { tipo: 'update', ref: col().doc(k), datos: { estado: 'en_planilla', planilla: planillaId, fueraDePlanilla: null, actualizado: X.servidor(), quien: S.usuario.email } }; }));
  }
  /* Semanas listas que no entraron a la planilla del banco: el repartidor ve el motivo en su portal */
  function marcarFuera(planillaId, sinCuenta) {
    if (!modoControl()) return Promise.resolve();
    var ops = [], hoy = X.hoyISO();
    (sinCuenta || []).forEach(function (x) { (x.docs || []).forEach(function (k) { ops.push({ tipo: 'update', ref: col().doc(k), datos: { fueraDePlanilla: { motivo: x.motivo, fecha: hoy, planilla: planillaId }, actualizado: X.servidor(), quien: S.usuario.email } }); }); });
    return escribir(ops);
  }
  function docsDe(p) { var l = []; (p.filas || []).forEach(function (f) { (f.docs || []).forEach(function (d) { l.push(d); }); }); return l; }
  function confirmarPago(p, alTerminar) {
    var docs = docsDe(p);
    X.ventana('Pago confirmado por Miltagor', entero(p.cantidad) + ' repartidores · ' + bs(p.total),
      '<div class="fm"><div class="fila"><label for="cpFecha">Fecha del pago</label><input id="cpFecha" type="date" value="' + X.hoyISO() + '"></div></div>' +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué pasa al confirmar</b>Las ' + entero(docs.length) + ' semanas de esta planilla pasan a «pagado», salen de pendientes, entran al historial y el repartidor recibe el aviso «Recibiste tu pago».</div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Confirmar pago</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var f = v.querySelector('#cpFecha').value; if (!f) { X.aviso('Elige la fecha del pago.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          Promise.all(docs.map(function (k) { return col().doc(k).get(); })).then(function (snaps) {
            var ops = [], uids = {}, raras = 0, hist = [];
            snaps.forEach(function (d) {
              if (!d.exists) return;
              var x = d.data();
              if (x.estado !== 'en_planilla' || x.planilla !== p._id) { raras++; return; }
              ops.push({ tipo: 'update', ref: d.ref, datos: { estado: 'pagado', fechaPago: f, rebote: null, actualizado: X.servidor(), quien: S.usuario.email } });
              hist.push([String(x.semana || ''), x.rango || '', String(x.id), x.nombre || '', X.redondear(Number(x.importe) || 0), x.ciudad || '', x.factura || '', '', '', '', '']);
              uids[x.uid] = 1;
            });
            return escribir(ops).then(function () { return agregarAlHistorial(f, hist); }).then(function () {
              return Promise.all([
                X.dbC.collection('pagos').doc(p._id).update({ estado: 'pagada', fechaPago: f, confirmadoPor: S.usuario.email, confirmado: X.servidor(), semanasPagadas: ops.length }),
                X.bitacora('Confirmó pago de Miltagor', p.fecha + ' · ' + ops.length + ' semanas · ' + bs(p.total) + (raras ? ' · ' + raras + ' semanas ya no estaban en esta planilla' : '')),
                encolarNotif('Recibiste tu pago', 'Miltagor realizó tu pago del ' + X.fecha(f) + '. Revisa el detalle en tu historial.', Object.keys(uids), 'historial')
              ]);
            });
          }).then(function () { cerrar(); X.aviso('Pago confirmado'); if (alTerminar) alTerminar(); X.recargarTodo(); }, function (e) {
            console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar'; X.aviso('No se pudo confirmar. Reintenta: lo ya marcado no se repite.');
          });
        });
      });
  }
  /* ══════════ CAMBIAR LA FECHA DE UN PAGO (solo administrador) ══════════
     Por ejemplo, los pagos marcados el 31/10 que Miltagor recién pagó el 03/11. Mueve todo lo de esa fecha:
     «historialPagos» (las partes de esa fecha pasan a la nueva y se juntan si ya había), «semanas» pagadas,
     las planillas de «pagos» y el historial de cada repartidor en el Portal («historialRider»). */
  function cambiarFecha(vieja, alTerminar) {
    if (!X.esAdmin()) { X.aviso('Solo un administrador puede cambiar la fecha de pago.'); return; }
    var filas = (D.hist || []).filter(function (h) { return h.fecha === vieja; });
    X.ventana('Cambiar fecha de pago', entero(filas.length) + ' pagos del ' + X.fecha(vieja) + ' · ' + bs(filas.reduce(function (s, h) { return s + h.importe; }, 0)),
      '<div class="fm"><div class="fila"><label for="cfFecha">Nueva fecha de pago</label><input id="cfFecha" type="date" value="' + X.hoyISO() + '"></div></div>' +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué cambia</b>Todos los pagos del ' + esc(X.fecha(vieja)) + ' pasan a la nueva fecha: en el historial, en las semanas pagadas, en las planillas y en lo que ve cada repartidor en su portal. Si en la nueva fecha ya hay pagos, se juntan.</div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Cambiar fecha</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var nueva = v.querySelector('#cfFecha').value;
          if (!nueva || nueva === vieja) { X.aviso('Elige una fecha distinta.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Cambiando';
          var n = { hist: 0, semanas: 0, planillas: 0, riders: 0 };
          // 1) Historial de pagos: cada parte de la fecha vieja pasa a la nueva (misma parte), juntándose si ya existe
          colH().where('fecha', '==', vieja).get().then(function (q) {
            var docs = []; q.forEach(function (d) { docs.push(d); });
            return Promise.all(docs.map(function (d) { return colH().doc(d.id.replace(vieja, nueva)).get(); })).then(function (dest) {
              var ops = [];
              docs.forEach(function (d, i) {
                var x = d.data(), ant = [], suyas = []; try { suyas = JSON.parse(x.filas || '[]'); } catch (e) { suyas = []; }
                if (dest[i].exists) { try { ant = JSON.parse(dest[i].data().filas || '[]'); } catch (e) { ant = []; } }
                var todas = ant.concat(suyas); n.hist += suyas.length;
                ops.push({ tipo: 'set', ref: dest[i].ref, datos: Object.assign({}, dest[i].exists ? dest[i].data() : x, { fecha: nueva, filas: JSON.stringify(todas), cantidad: todas.length,
                  total: X.redondear(todas.reduce(function (t, f) { return t + (Number(f[4]) || 0); }, 0)), actualizado: X.servidor(), quien: S.usuario.email, fechaAnterior: vieja }) });
                ops.push({ tipo: 'delete', ref: d.ref });
              });
              return escribir(ops);
            });
          }).then(function () {
            // 2) Semanas pagadas con esa fecha
            return col().where('fechaPago', '==', vieja).get().then(function (q) {
              var ops = []; q.forEach(function (d) { if (d.data().estado === 'pagado') ops.push({ tipo: 'update', ref: d.ref, datos: { fechaPago: nueva, actualizado: X.servidor(), quien: S.usuario.email } }); });
              n.semanas = ops.length; return escribir(ops);
            });
          }).then(function () {
            // 3) Planillas confirmadas con esa fecha
            return X.dbC.collection('pagos').where('fechaPago', '==', vieja).get().then(function (q) {
              var l = []; q.forEach(function (d) { l.push(d.ref.update({ fechaPago: nueva, fechaCambiadaPor: S.usuario.email })); }); n.planillas = l.length; return Promise.all(l);
            });
          }).then(function () {
            // 4) Historial que ve cada repartidor en el Portal (migrado de Sheets)
            var uids = {}; filas.forEach(function (h) { uids[X.idSeguro(h.id)] = 1; });
            return Promise.all(Object.keys(uids).map(function (u) {
              var ref = X.dbP.collection('historialRider').doc(u);
              return ref.get().then(function (d) {
                if (!d.exists) return;
                var l = []; try { l = JSON.parse(d.data().filas || '[]'); } catch (e) { return; }
                var cambio = false; l.forEach(function (f) { if (f[3] === vieja) { f[3] = nueva; cambio = true; } });
                if (!cambio) return; n.riders++;
                return ref.update({ filas: JSON.stringify(l), actualizado: X.servidor() });
              });
            }));
          }).then(function () {
            return X.bitacora('Cambió fecha de pago', X.fecha(vieja) + ' → ' + X.fecha(nueva) + ' · ' + n.hist + ' pagos · ' + n.semanas + ' semanas · ' + n.planillas + ' planillas · ' + n.riders + ' repartidores');
          }).then(function () {
            cerrar(); X.aviso('Listo: ' + entero(n.hist) + ' pagos pasaron al ' + X.fecha(nueva) + '.'); if (alTerminar) alTerminar(nueva); cargarHistorial(); X.recargarTodo();
          }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar'; X.aviso('No se pudo terminar. Reintenta: lo ya movido no se repite.'); });
        });
      });
  }
  /* ══════════ CORREGIR UN PAGO DEL HISTORIAL (solo administrador) ══════════
     Devolver a pendiente (rebotó en el banco) o cambiar la fecha de un solo pago. Primero se lee todo y luego
     se escribe en un solo lote: o queda completo (historial, semana y portal del repartidor) o no cambia nada. */
  function puedeCorregir() { return X.esAdmin() && modoControl(); }
  function mismoPago(f, h) { return String(f.id) === String(h.id) && String(f.semana) === String(h.semana) && Math.abs((Number(f.importe) || 0) - (Number(h.importe) || 0)) < 0.005; }
  function totalFilas(l) { return X.redondear(l.reduce(function (t, f) { return t + (Number(f[4]) || 0); }, 0)); }
  function leerPago(h) {
    var n = numSemana(h.semana), uid = X.idSeguro(h.id);
    if (!n) return Promise.reject(new Error('No se reconoce la semana de este pago.'));
    var anio = anioSemana(h.semana, h.gestion, X.aFecha(h.fecha) || new Date()), ref = X.dbP.collection('historialRider').doc(uid);
    return Promise.all([colH().where('fecha', '==', h.fecha).get(), col().doc(idDoc(uid, anio, n)).get(), ref.get()]).then(function (res) {
      var r = { uid: uid, anio: anio, orden: anio * 100 + n, semana: res[1], rider: null, parte: null, filas: null, fila: null };
      res[0].forEach(function (d) {
        if (r.fila || d.data().origen === 'hojaControl') return;
        var l = []; try { l = JSON.parse(d.data().filas || '[]'); } catch (e) { return; }
        for (var i = 0; i < l.length; i++) if (mismoPago({ id: l[i][2], semana: l[i][0], importe: l[i][4] }, h)) { r.parte = d; r.fila = l.splice(i, 1)[0]; r.filas = l; return; }
      });
      if (!r.fila) throw new Error('Ese pago ya no está en el historial. Recarga la página.');
      if (res[2].exists) {
        var lr = []; try { lr = JSON.parse(res[2].data().filas || '[]'); } catch (e) { lr = []; }
        var k = lr.findIndex(function (f) { return f[3] === h.fecha && String(f[0]) === String(h.semana) && Math.abs((Number(f[2]) || 0) - h.importe) < 0.005; });
        if (k >= 0) r.rider = { ref: ref, filas: lr, i: k };
      }
      return r;
    });
  }
  function opParte(r) {
    return { tipo: 'update', ref: r.parte.ref, datos: { filas: JSON.stringify(r.filas), cantidad: r.filas.length, total: totalFilas(r.filas), actualizado: X.servidor(), quien: S.usuario.email } };
  }
  function opRider(r) { return { tipo: 'update', ref: r.rider.ref, datos: { filas: JSON.stringify(r.rider.filas), cantidad: r.rider.filas.length, actualizado: X.servidor() } }; }
  function resumenPago(h) { return (h.nombre || h.id) + ' · ' + semCorta(h.semana) + ' · ' + bs(h.importe); }
  function semCorta(t) { return 'Sem ' + numSemana(t); }

  function devolverPago(h) {
    if (!puedeCorregir()) { X.aviso('Solo un administrador puede corregir un pago.'); return; }
    X.ventana('Volver a pendiente', resumenPago(h) + ' · pagado el ' + X.fecha(h.fecha),
      '<div class="fm"><div class="fila"><label for="dpMotivo">Motivo (opcional)</label><input id="dpMotivo" maxlength="120" placeholder="Por ejemplo: cuenta cerrada, número de cuenta errado"></div></div>' +
      '<label class="interruptor"><input type="checkbox" id="dpAvisar" checked>Avisar al repartidor que su pago fue devuelto</label>' +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué pasa</b>El pago sale del historial y vuelve a Pagos pendientes con la marca «Rebotó en el banco». Si cumple las condiciones, entra en la próxima planilla. Antes corrige su cuenta en «Cuentas bancarias» si estaba mal.</div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('recargar') + 'Volver a pendiente</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var motivo = v.querySelector('#dpMotivo').value.trim(), avisar = v.querySelector('#dpAvisar').checked, quien = S.usuario.email, planilla = '', uidAviso = '';
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          leerPago(h).then(function (r) {
            var x = r.semana.exists ? r.semana.data() : null;
            if (x && x.estado !== 'pagado') throw new Error('Esa semana ya figura como «' + x.estado + '», no como pagada. Revísala antes de seguir.');
            planilla = (x && x.planilla) || ''; uidAviso = (x && x.uid) || r.uid;
            var rebote = { fecha: X.hoyISO(), estadoBanco: motivo || 'Devuelto', banco: '', planilla: planilla, fechaPago: h.fecha, manual: true, quien: quien };
            var ops = [opParte(r)];
            if (x) ops.push({ tipo: 'update', ref: r.semana.ref, datos: { estado: 'pendiente', planilla: null, fechaPago: null, fueraDePlanilla: null, rebote: rebote, actualizado: X.servidor(), quien: quien } });
            else ops.push({ ref: r.semana.ref, datos: { id: String(h.id), uid: r.uid, nombre: h.nombre || '', celular: '', ciudad: CIUDAD_HOJA[String(h.ciudad || '').trim().toUpperCase()] || '', semana: h.semana, anio: r.anio, orden: r.orden,
              rango: h.rango || '', importe: h.importe, estado: 'pendiente', planilla: null, fechaPago: null, rebote: rebote, origen: 'rebote', creado: X.servidor(), actualizado: X.servidor(), quien: quien } });
            if (r.rider) { r.rider.filas.splice(r.rider.i, 1); ops.push(opRider(r)); }
            return escribir(ops);
          }).then(function () {
            var extra = [X.bitacora('Devolvió pago a pendiente', resumenPago(h) + ' · pagado el ' + X.fecha(h.fecha) + (motivo ? ' · ' + motivo : ''))];
            if (planilla) extra.push(X.dbC.collection('pagos').doc(planilla).update({ rebotados: firebase.firestore.FieldValue.arrayUnion({ id: String(h.id), nombre: h.nombre || '', sem: h.semana, importe: h.importe, estado: motivo || 'Devuelto', banco: '' }) }).catch(function (e) { console.warn('Planilla:', e); }));
            if (avisar) extra.push(encolarNotif('Tu pago fue devuelto por el banco', 'El banco no pudo depositar tu pago. Revisa que tu número de cuenta esté bien y escríbenos para volver a enviarlo.', [uidAviso], 'inicio'));
            return Promise.all(extra);
          }).then(function () {
            cerrar(); X.aviso('El pago volvió a pendientes.'); cargarHistorial(); X.recargarTodo();
          }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('recargar') + 'Volver a pendiente'; X.aviso(e.message || 'No se pudo guardar. No cambió nada.'); });
        });
      });
  }
  function cambiarFechaPago(h) {
    if (!puedeCorregir()) { X.aviso('Solo un administrador puede corregir un pago.'); return; }
    X.ventana('Cambiar fecha de este pago', resumenPago(h) + ' · pagado el ' + X.fecha(h.fecha),
      '<div class="fm"><div class="fila"><label for="fpFecha">Nueva fecha de pago</label><input id="fpFecha" type="date" value="' + esc(h.fecha) + '"></div></div>' +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué cambia</b>Solo este pago pasa a la nueva fecha, en el historial y en lo que ve el repartidor en su portal. No se le envía ningún aviso.</div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Cambiar fecha</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var nueva = v.querySelector('#fpFecha').value, quien = S.usuario.email;
          if (!nueva || nueva === h.fecha) { X.aviso('Elige una fecha distinta.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Cambiando';
          var destino = colH().doc(nueva + '_c');
          Promise.all([leerPago(h), destino.get()]).then(function (res) {
            var r = res[0], d = res[1], ant = [];
            try { ant = d.exists ? JSON.parse(d.data().filas || '[]') : []; } catch (e) { throw new Error('No se pudo leer el historial de la nueva fecha.'); }
            var todas = ant.concat([r.fila]);
            var ops = [opParte(r), { ref: destino, merge: true, datos: { fecha: nueva, parte: 'c', origen: 'control', cantidad: todas.length, total: totalFilas(todas), filas: JSON.stringify(todas), actualizado: X.servidor(), quien: quien } }];
            if (r.semana.exists && r.semana.data().estado === 'pagado') ops.push({ tipo: 'update', ref: r.semana.ref, datos: { fechaPago: nueva, actualizado: X.servidor(), quien: quien } });
            if (r.rider) { r.rider.filas[r.rider.i][3] = nueva; ops.push(opRider(r)); }
            return escribir(ops);
          }).then(function () {
            return X.bitacora('Cambió fecha de un pago', resumenPago(h) + ' · ' + X.fecha(h.fecha) + ' → ' + X.fecha(nueva));
          }).then(function () {
            cerrar(); X.aviso('El pago pasó al ' + X.fecha(nueva) + '.'); cargarHistorial(); X.recargarTodo();
          }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Cambiar fecha'; X.aviso(e.message || 'No se pudo guardar. No cambió nada.'); });
        });
      });
  }
  /* Un pendiente que ya se pagó por fuera de la planilla: pasa a «pagado» y entra al historial, en un solo lote */
  function marcarPagado(doc, f, verificada) {
    if (!puedeCorregir()) { X.aviso('Solo un administrador puede corregir un pago.'); return; }
    var x0 = (D.semanas || []).filter(function (s) { return s._id === doc; })[0];
    if (!x0) { X.aviso('Ese pago ya no está en pendientes. Recarga la página.'); return; }
    X.ventana('Marcar como pagado', resumenPago({ nombre: x0.nombre, id: x0.id, semana: x0.semana, importe: Number(x0.importe) || 0 }),
      '<div class="fm"><div class="fila"><label for="mpFecha">Fecha del pago</label><input id="mpFecha" type="date" value="' + X.hoyISO() + '"></div></div>' +
      '<label class="interruptor"><input type="checkbox" id="mpAvisar" checked>Avisar al repartidor «Recibiste tu pago»</label>' +
      (verificada ? '' : '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Este pago no tiene factura verificada</b>' + (f && f.numero ? 'La factura N.º ' + esc(f.numero) + ' aún no está verificada en el Excel de Impuestos.' : 'No tiene factura registrada.') + ' Márcalo solo si el pago ya se hizo.</div></div>') +
      '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Qué pasa</b>El pago sale de pendientes, entra al historial con esta fecha y el repartidor lo ve como pagado. No se envía nada al banco: úsalo solo para pagos ya realizados.</div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Marcar como pagado</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]');
        ok.addEventListener('click', function () {
          var fecha = v.querySelector('#mpFecha').value, avisar = v.querySelector('#mpAvisar').checked, quien = S.usuario.email, ref = col().doc(doc), destino = colH().doc(fecha + '_c'), uid = '', texto = '';
          if (!fecha) { X.aviso('Elige la fecha del pago.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          Promise.all([ref.get(), destino.get()]).then(function (res) {
            var x = res[0].exists ? res[0].data() : null;
            if (!x || x.estado !== 'pendiente') throw new Error('Ese pago ya no está pendiente. Recarga la página.');
            var d = res[1], ant = [], importe = X.redondear(Number(x.importe) || 0);
            try { ant = d.exists ? JSON.parse(d.data().filas || '[]') : []; } catch (e) { throw new Error('No se pudo leer el historial de esa fecha.'); }
            var todas = ant.concat([[String(x.semana || ''), x.rango || '', String(x.id), x.nombre || '', importe, x.ciudad || '', (f && f.numero) || '', (f && f.fechaEmision) || '', (f && f.nitEmisor) || '', (f && (f.autorizacion || f.cuf)) || '', '', '', x.anio || '']]);
            uid = x.uid; texto = resumenPago({ nombre: x.nombre, id: x.id, semana: x.semana, importe: importe });
            return escribir([
              { tipo: 'update', ref: ref, datos: { estado: 'pagado', fechaPago: fecha, rebote: null, fueraDePlanilla: null, pagoManual: true, actualizado: X.servidor(), quien: quien } },
              { ref: destino, merge: true, datos: { fecha: fecha, parte: 'c', origen: 'control', cantidad: todas.length, total: totalFilas(todas), filas: JSON.stringify(todas), actualizado: X.servidor(), quien: quien } }
            ]);
          }).then(function () {
            return Promise.all([X.bitacora('Marcó pendiente como pagado', texto + ' · ' + X.fecha(fecha)),
              avisar ? encolarNotif('Recibiste tu pago', 'Miltagor realizó tu pago del ' + X.fecha(fecha) + '. Revisa el detalle en tu historial.', [uid], 'historial') : null]);
          }).then(function () {
            cerrar(); X.aviso('El pago quedó como pagado.'); cargarHistorial(); X.recargarTodo();
          }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Marcar como pagado'; X.aviso(e.message || 'No se pudo guardar. No cambió nada.'); });
        });
      });
  }
  function botonPagado(s) {
    if (!puedeCorregir() || !s.p._doc || s.p.estado !== 'Pendiente') return '';
    return '<button class="btn sec chico" data-pend-pagado="' + esc(s.p._doc) + '" data-f-doc="' + esc((s.f && s.f._id) || '') + '" data-verif="' + (s.f && s.f.verificacion ? 1 : '') + '">' + ic('check') + 'Marcar pagado</button>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-pend-pagado]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    var k = b.getAttribute('data-f-doc'), f = k ? (D.facturas || []).filter(function (x) { return x._id === k; })[0] : null;
    marcarPagado(b.getAttribute('data-pend-pagado'), f || null, !!b.getAttribute('data-verif'));
  }, true);
  /* Botones de cada pago en el historial y en la ficha del repartidor */
  /* ── Cambiar de factura: casos excepcionales, como una duplicada que solo se puede anular al revés.
     Se llama con el pago (h) del historial o con la factura (f). La factura anterior va al Panel para anularla. ── */
  function cambiarFactura(h, f) {
    if (!puedeCorregir()) { X.aviso('Solo un administrador puede cambiar una factura.'); return; }
    var fs = D.facturas || [], id = String((h || f).id), nombre = (h || f).nombre || id, txt = function (v) { return String(v == null ? '' : v).trim(); };
    if (h && !f) f = fs.filter(function (x) { return String(x.id) === id && (x.semanas || []).indexOf(h.semana) >= 0 && !/anulada|porAnular|rechazada/.test(x.estado || ''); })[0] || null;
    var pagos = h ? [h] : (D.hist || []).filter(function (y) { return y.id === id && (f.semanas || []).indexOf(y.semana) >= 0 && (!y.factura || txt(y.factura) === txt(f.numero)); });
    var viejo = h ? { num: txt(h.factura || (f && f.numero)), fecha: h.fechaFactura || (f && f.fechaEmision) || '', aut: txt(h.autorizacion || (f && f.autorizacion)), nit: txt(h.nit || (f && f.nitEmisor)) } :
      { num: txt(f.numero), fecha: f.fechaEmision || '', aut: txt(f.autorizacion), nit: txt(f.nitEmisor) };
    var iso = X.conciliacion._puro.fechaRCV, importe = h ? h.importe : Number(f.importe) || 0, viejoISO = iso(viejo.fecha);
    var candidatas = fs.filter(function (x) { return x !== f && String(x.id) === id && x.caso === 'duplicadaContax' && /porAnular|anulada/.test(x.estado || '') && txt(x.numero) !== viejo.num; });
    var sug = candidatas.filter(function (x) { return Math.abs((Number(x.importe) || 0) - importe) < 0.05; })[0] || null;
    var cliente = X.conciliacion._puro.contadorVivo(id) === 'CONTAX';
    X.ventana('Cambiar la factura', esc(nombre) + ' · ID ' + esc(id) + ' · ' + esc(h ? semCorta(h.semana) + ' · ' : '') + bs(importe),
      '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>Factura actual: N.º ' + esc(viejo.num || 's/n') + ' · ' + esc(X.fecha(viejoISO) || '—') + '</b>Solo para casos excepcionales. Cambia el número, la fecha y la autorización en el historial, en la factura y en lo que ve el repartidor en su portal. Queda registrado en la bitácora.</div></div>' +
      '<div class="fm"><div class="fila"><label for="cfNum">N.º de la factura que queda</label><input id="cfNum" inputmode="numeric" maxlength="30" value="' + esc(sug ? sug.numero : '') + '"></div>' +
      '<div class="fila"><label for="cfFecha">Fecha de la factura</label><input id="cfFecha" type="date" value="' + esc(sug ? iso(sug.fechaEmision) : '') + '"></div>' +
      '<div class="fila"><label for="cfAut">Código de autorización</label><input id="cfAut" maxlength="120" value="' + esc(sug ? sug.autorizacion : '') + '"></div>' +
      '<div class="fila"><label for="cfMotivo">Motivo</label><input id="cfMotivo" maxlength="160" placeholder="Por ejemplo: duplicada, solo se pudo anular la N.º ' + esc(viejo.num) + '"></div></div>' +
      '<label class="interruptor"><input type="checkbox" id="cfPanel"' + (cliente || sug ? ' checked' : '') + '>Mandar la factura N.º ' + esc(viejo.num || 's/n') + ' al Panel para anularla</label>' +
      '<p class="muted" id="cfNota" style="margin:8px 0 0">' + (sug ? 'Datos tomados de la factura N.º ' + esc(sug.numero) + ' que estaba como duplicada: esa ya no se anula.' : '') + '</p>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok>' + ic('check') + 'Cambiar factura</button>',
      function (v, cerrar) {
        var ok = v.querySelector('[data-ok]'), q = function (k) { return v.querySelector(k); };
        q('#cfNum').addEventListener('input', function () {
          var g = candidatas.filter(function (x) { return txt(x.numero) === txt(q('#cfNum').value); })[0];
          if (g) { q('#cfFecha').value = iso(g.fechaEmision); q('#cfAut').value = txt(g.autorizacion); q('#cfPanel').checked = true; }
          q('#cfNota').textContent = g ? 'Datos tomados de la factura N.º ' + g.numero + ' que estaba como duplicada: esa ya no se anula.' : '';
        });
        ok.addEventListener('click', function () {
          var num = txt(q('#cfNum').value), fecha = q('#cfFecha').value, aut = txt(q('#cfAut').value), motivo = txt(q('#cfMotivo').value), alPanel = q('#cfPanel').checked;
          if (!num || !fecha || !aut || !motivo) { X.aviso('Completa el número, la fecha, la autorización y el motivo.'); return; }
          if (num === viejo.num) { X.aviso('Es la misma factura: escribe el número de la que queda.'); return; }
          // Los números se repiten con los años: lo que identifica a una factura es su autorización
          var gemela = candidatas.filter(function (x) { return txt(x.numero) === num; })[0] || null, sinEsp = function (t) { return txt(t).replace(/\s+/g, '').toUpperCase(); }, mismaAut = function (t) { return sinEsp(t) === sinEsp(aut); };
          var otra = fs.filter(function (x) { return x !== f && x !== gemela && x.estado !== 'anulada' && mismaAut(x.autorizacion); })[0];
          var pagada = (D.hist || []).filter(function (y) { return y.id === id && mismaAut(y.autorizacion) && pagos.indexOf(y) < 0; })[0];
          if (otra || pagada) { X.aviso('La factura N.º ' + num + ' ya está registrada' + (pagada ? ' en ' + semCorta(pagada.semana) : '') + '. Revísala antes de seguir.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          var quien = S.usuario.email, detalle = 'Se reemplazó por la N.º ' + num + '. ' + motivo;
          pagos.reduce(function (p, y) {
            return p.then(function () { return leerPago(y); }).then(function (r) {
              var dmy = fecha.split('-').reverse().map(function (t) { return String(Number(t)); }).join('/');
              r.fila[6] = typeof r.fila[6] === 'number' ? Number(num) : num; r.fila[7] = /\//.test(String(y.fechaFactura)) ? dmy : fecha; r.fila[9] = aut;
              r.filas.push(r.fila);
              var ops = [opParte(r)];
              if (r.rider) { r.rider.filas[r.rider.i][4] = num; ops.push(opRider(r)); }
              return escribir(ops);
            });
          }, Promise.resolve()).then(function () {
            var ops = [], col = X.dbP.collection('facturas');
            if (f) {
              var d = { numero: num, fechaEmision: fecha, autorizacion: aut, revisado: X.servidor(), revisadoPor: quien, cambioFactura: { antes: viejo.num, fechaAntes: viejoISO, autorizacionAntes: viejo.aut, motivo: motivo, quien: quien, dia: X.hoyISO() } };
              if (f.verificacion) d['verificacion.autorizacion'] = aut;
              ops.push({ tipo: 'update', ref: col.doc(f._id), datos: d });
            }
            if (gemela) ops.push({ tipo: 'update', ref: col.doc(gemela._id), datos: alPanel ? { numero: viejo.num, fechaEmision: viejoISO, autorizacion: viejo.aut, nitEmisor: viejo.nit, estado: 'porAnular', detalle: detalle } : { estado: 'anulada', detalle: detalle } });
            else if (alPanel) ops.push({ tipo: 'set', ref: col.doc(), datos: X.conciliacion._puro.nuevaFactura({ id: id, nombre: nombre, semana: '', num: viejo.num, imp: importe, fecha: viejoISO, nit: viejo.nit, nom: (f && f.razonEmisor) || nombre, aut: viejo.aut }, 'porAnular', { uid: '', caso: 'duplicadaContax', semanas: [], detalle: detalle }) });
            return escribir(ops);
          }).then(function () {
            return X.bitacora('Cambió la factura de un repartidor', nombre + ' · ID ' + id + ' · N.º ' + viejo.num + ' por N.º ' + num + ' · ' + motivo);
          }).then(function () {
            cerrar(); X.aviso('Factura cambiada: ahora es la N.º ' + num + '.'); cargarHistorial(); X.recargarTodo();
          }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Cambiar factura'; X.aviso(e.message || 'No se pudo guardar.'); });
        });
      });
  }
  function accionesPago(h) {
    if (!puedeCorregir() || !h.fecha || !D.hist) return '';
    var a = ' data-f="' + esc(h.fecha) + '" data-s="' + esc(h.semana) + '" data-i="' + esc(h.id) + '" data-m="' + esc(h.importe) + '"';
    return '<div class="fila-acc" style="flex-wrap:nowrap"><button class="btn sec chico" data-pago-acc="rebote"' + a + '>' + ic('recargar') + 'A pendiente</button>' +
      '<button class="btn sec chico" data-pago-acc="fecha"' + a + '>' + ic('reloj') + 'Fecha</button>' +
      '<button class="btn sec chico" data-pago-acc="factura"' + a + '>' + ic('factura') + 'Factura</button></div>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-pago-acc]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    var f = b.getAttribute('data-f'), q = { id: b.getAttribute('data-i'), semana: b.getAttribute('data-s'), importe: Number(b.getAttribute('data-m')) };
    var h = (D.hist || []).filter(function (x) { return x.fecha === f && mismoPago(x, q); })[0];
    if (!h) { X.aviso('Ese pago ya no está en el historial. Recarga la página.'); return; }
    var acc = b.getAttribute('data-pago-acc');
    if (acc === 'factura') cambiarFactura(h); else (acc === 'rebote' ? devolverPago : cambiarFechaPago)(h);
  }, true);
  function anularPlanilla(p, alTerminar) {
    X.confirmar('Anular planilla', 'Las semanas de esta planilla que sigan «en planilla» vuelven a pendientes, para incluirlas en otra. Úsalo si el banco rechazó la planilla o se generó por error.', function () {
      Promise.all(docsDe(p).map(function (k) { return col().doc(k).get(); })).then(function (snaps) {
        var ops = [];
        snaps.forEach(function (d) { if (d.exists && d.data().estado === 'en_planilla' && d.data().planilla === p._id) ops.push({ tipo: 'update', ref: d.ref, datos: { estado: 'pendiente', planilla: null, actualizado: X.servidor(), quien: S.usuario.email } }); });
        return escribir(ops).then(function () {
          return Promise.all([X.dbC.collection('pagos').doc(p._id).update({ estado: 'anulada', anuladaPor: S.usuario.email, anulada: X.servidor() }), X.bitacora('Anuló planilla de pago', p.fecha + ' · ' + ops.length + ' semanas')]);
        });
      }).then(function () { X.aviso('Planilla anulada'); if (alTerminar) alTerminar(); X.recargarTodo(); }, function (e) { console.error(e); X.aviso('No se pudo anular.'); });
    }, 'Anular', true);
  }
  /* Resumen de lo que está en planillas sin confirmar (para el aviso de la página Pagos) */
  function porConfirmar() {
    var n = 0, t = 0;
    if (D.repartidores) D.repartidores.forEach(function (r) { (r.enPlanilla || []).forEach(function (s) { n++; t += s.importe || 0; }); });
    return { semanas: n, total: X.redondear(t) };
  }

  /* ══════════ REPORTE DE PAGO (para Miltagor) ══════════
     Página aparte, lista para imprimir o guardar en PDF, con gráficos en SVG. */
  function barras(datos, o) {
    o = o || {};
    var max = Math.max.apply(null, datos.map(function (d) { return d.v; }).concat([1])), alto = 30, ancho = 520, eti = 130, h = datos.length * alto + 14;
    return '<svg viewBox="0 0 ' + (ancho + eti + 110) + ' ' + h + '" width="100%" role="img" aria-label="' + esc(o.titulo || '') + '">' + datos.map(function (d, i) {
      var w = Math.max(2, Math.round(d.v / max * ancho)), y = i * alto + 10;
      return '<text x="' + (eti - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="12" fill="#335F4F">' + esc(d.k) + '</text>' +
        X.barraSvg(eti, y, w, 18, d.color || '#235347', true) +
        '<text x="' + (eti + w + 14) + '" y="' + (y + 15) + '" font-size="12" fill="#051F20">' + esc(o.fmt ? o.fmt(d.v) : d.v) + '</text>';
    }).join('') + '</svg>';
  }
  function reporte(p) {
    var filas = p.filas || [], ret = p.retenidosDet || [];
    var porCiudad = {}, porSemana = {};
    filas.forEach(function (f) {
      var c = CIUDADES[f.ciudad] || 'Sin dato';
      porCiudad[c] = porCiudad[c] || { n: 0, t: 0 }; porCiudad[c].n++; porCiudad[c].t += Number(f.importe) || 0;
      (f.detalle || []).forEach(function (s) { porSemana[s.semana] = (porSemana[s.semana] || 0) + (Number(s.importe) || 0); });
      if (!f.detalle) (f.semanas || []).forEach(function (s) { porSemana[s] = porSemana[s] || 0; });
    });
    var totRet = X.redondear(ret.reduce(function (s, r) { return s + (Number(r.importe) || 0); }, 0));
    var ciudades = Object.keys(porCiudad).sort();
    var semanas = Object.keys(porSemana).sort(function (a, b) { return (anioDe(a) * 100 + numSemana(a)) - (anioDe(b) * 100 + numSemana(b)); });
    var fmtBs = function (v) { return bs(v); };
    var estado = p.estado === 'pagada' ? 'Pagada el ' + X.fecha(p.fechaPago) : (p.estado === 'anulada' ? 'Anulada' : 'Enviada, pago por confirmar');
    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte de pago ' + esc(p.fecha) + '</title>' +
      '<style>body{font-family:Questrial,"Century Gothic",Arial,sans-serif;color:#051F20;background:#fff;margin:0;padding:32px;max-width:900px;margin:auto}' +
      'h1{margin:0 0 4px;font-size:24px}h2{font-size:16px;margin:28px 0 8px;color:#235347}.sub{color:#557363;margin:0 0 20px}' +
      '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{border:1px solid #DAF1DE;border-radius:10px;padding:12px}.kpi small{color:#557363;display:block}.kpi b{font-size:18px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px;border-bottom:1px solid #DAF1DE}td.m,th.m{text-align:right}' +
      '.acc{margin:0 0 20px}button{font:inherit;background:#235347;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}' +
      '@media print{.acc{display:none}body{padding:0}}@media(max-width:640px){.kpis{grid-template-columns:1fr 1fr}body{padding:16px}}</style></head><body>' +
      '<div class="acc"><button onclick="print()">Imprimir o guardar en PDF</button></div>' +
      '<h1>Reporte de pago a repartidores</h1><p class="sub">' + esc((C.facturacion || {}).razonSocial || 'MILTHAGOR S.R.L.') + ' · planilla del ' + esc(X.fecha(p.fecha)) + ' · ' + esc(estado) + '</p>' +
      '<div class="kpis"><div class="kpi"><small>' + (p.estado === 'pagada' ? 'Total pagado' : 'Total a pagar') + '</small><b>' + bs(p.total) + '</b></div><div class="kpi"><small>Repartidores</small><b>' + entero(p.cantidad) + '</b></div>' +
      '<div class="kpi"><small>Retenidos</small><b>' + entero(p.retenidos || ret.length) + '</b></div><div class="kpi"><small>Importe retenido</small><b>' + (ret.length ? bs(totRet) : '—') + '</b></div></div>' +
      '<h2>Importe por ciudad</h2>' + barras(ciudades.map(function (k) { return { k: k, v: X.redondear(porCiudad[k].t) }; }), { fmt: fmtBs, titulo: 'Importe por ciudad' }) +
      '<h2>Repartidores por ciudad</h2>' + barras(ciudades.map(function (k) { return { k: k, v: porCiudad[k].n, color: '#8EB69B' }; }), { titulo: 'Repartidores por ciudad' }) +
      (semanas.length && filas.some(function (f) { return f.detalle; }) ? '<h2>Importe por semana</h2>' + barras(semanas.map(function (k) { return { k: 'Sem ' + numSemana(k), v: X.redondear(porSemana[k]) }; }), { fmt: fmtBs, titulo: 'Importe por semana' }) : '') +
      (ret.length ? '<h2>' + (p.estado === 'pagada' ? 'Pagado' : 'A pagar') + ' y retenido</h2>' + barras([{ k: p.estado === 'pagada' ? 'Pagado' : 'A pagar', v: X.redondear(p.total) }, { k: 'Retenido', v: totRet, color: '#B54708' }], { fmt: fmtBs, titulo: 'Pagado y retenido' }) : '') +
      '<h2>Detalle de pagos</h2><table><thead><tr><th>N.º</th><th>ID Yango</th><th>Nombre</th><th>Ciudad</th><th>Semanas</th><th class="m">Importe</th></tr></thead><tbody>' +
      filas.map(function (f, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(f.id) + '</td><td>' + esc(f.nombre) + '</td><td>' + esc(CIUDADES[f.ciudad] || '') + '</td><td>' + esc((f.semanas || []).join(', ')) + '</td><td class="m">' + bs(f.importe) + '</td></tr>'; }).join('') +
      '<tr><td colspan="5"><b>Total</b></td><td class="m"><b>' + bs(p.total) + '</b></td></tr></tbody></table>' +
      (ret.length ? '<h2>Retenidos</h2><table><thead><tr><th>ID Yango</th><th>Nombre</th><th>Motivo</th><th class="m">Importe</th></tr></thead><tbody>' +
        ret.map(function (r) { return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.nombre) + '</td><td>' + esc(r.motivo) + '</td><td class="m">' + bs(r.importe) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p class="sub" style="margin-top:24px">Generado por CONTROL · NUMMEROS (CONTAX) el ' + esc(X.fechaHora(new Date())) + '.</p></body></html>';
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    var w = window.open(url, '_blank');
    if (!w) X.bajarArchivo ? X.bajarArchivo(new Blob([html], { type: 'text/html' }), 'Reporte-pago-' + p.fecha + '.html') : X.aviso('Permite las ventanas emergentes para ver el reporte.');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    X.bitacora('Abrió reporte de pago', p.fecha);
  }

  /* Semanas guardadas sin nombre: se completan con BDYango apenas el repartidor aparece ahí.
     Solo se leen las que están en blanco, así que normalmente no gasta casi nada. */
  function completarNombres() {
    if (!X.puedeEditar() || !S.portalUsuario) return Promise.resolve(0);
    return col().where('nombre', '==', '').get().then(function (q) {
      var ops = [], nuevos = {};
      q.forEach(function (d) {
        var n = nombreBDY(String(d.data().id)); if (!n) return;
        nuevos[d.id] = n;
        ops.push({ tipo: 'update', ref: d.ref, datos: { nombre: n, nombreSistema: true, actualizado: X.servidor() } });
      });
      if (!ops.length) return 0;
      return escribir(ops).then(function () {
        (D.semanas || []).forEach(function (s) {
          if (!nuevos[s._id]) return;
          s.nombre = nuevos[s._id]; s.nombreSistema = true;
          var r = D.repartidores && D.repartidores.get(s.uid || X.idSeguro(s.id)); if (r) r.nombreSistema = true;
        });
        X.bitacora('Nombres colocados por el sistema', ops.length + ' semanas sin nombre completadas con BDYango');
        return ops.length;
      });
    }).catch(function (e) { console.warn('Nombres de semanas:', e); return 0; });
  }
  X.semanas = {
    completarNombres: completarNombres,
    modoControl: modoControl, cargar: cargar, aplicar: aplicar, cargarHistorial: cargarHistorial, aplicarHistorial: aplicarHistorial, agregarAlHistorial: agregarAlHistorial, importar: importar, verImportaciones: verImportaciones, verPorSemana: verPorSemana, migrar: migrar,
    marcarEnPlanilla: marcarEnPlanilla, cambiarFecha: cambiarFecha, puedeCorregir: puedeCorregir, cambiarFactura: cambiarFactura, accionesPago: accionesPago, botonPagado: botonPagado, marcarFuera: marcarFuera, confirmarPago: confirmarPago, anularPlanilla: anularPlanilla, porConfirmar: porConfirmar, reporte: reporte,
    // piezas que usa js/banco.js
    leerLibro: leerLibro, escribir: escribir, encolarNotif: encolarNotif, CIUDADES: CIUDADES, fechaISO: fechaISO,
    // lógica pura (para pruebas)
    _puro: { semanaDeArchivo: semanaDeArchivo, numSemana: numSemana, anioDe: anioDe, isoSemana: isoSemana, inferirAnio: inferirAnio, idDoc: idDoc, patronSemana: patronSemana, textoSemana: textoSemana, ciudadDeArchivo: ciudadDeArchivo, analizar: analizar, armarMigracion: armarMigracion, leerHojasPagos: leerHojasPagos, anioSemana: anioSemana, numHoja: numHoja, adivinar: adivinar, CAMPOS: CAMPOS }
  };
})();
