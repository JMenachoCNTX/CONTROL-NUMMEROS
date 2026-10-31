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
  function cargar() {
    if (!modoControl() || !S.portalUsuario) { D.semanas = null; return Promise.resolve(); }
    // Abiertas (pendientes, en planilla, no habilitadas) + todo lo del último año (el historial reciente)
    var w = isoSemana(new Date()), m = {};
    var junta = function (q) { q.forEach(function (d) { var x = d.data(); x._id = d.id; m[d.id] = x; }); };
    return Promise.all([
      col().where('estado', 'in', ABIERTOS).get().then(junta),
      col().where('orden', '>=', (w.anio - 1) * 100 + w.semana).get().then(junta)
    ]).then(function () {
      D.semanas = Object.keys(m).map(function (k) { return m[k]; });
      aplicar();
    }, function (e) {
      console.error('Semanas:', e); D.semanas = [];
      X.aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso para leer «semanas»: falta publicar las reglas del Portal.' : 'No se pudieron traer las semanas de pago.');
    });
  }
  function aplicar() {
    if (!D.repartidores || !D.semanas) return;
    D.repartidores.forEach(function (r) {
      if (!r._sheets) r._sheets = { pendientes: r.pendientes || [], historial: r.historial || [], habilitado: r.habilitado, resumen: r.resumen };
      r.pendientes = []; r.historial = []; r.enPlanilla = []; r._ultima = 0; r._ultimaNoHab = false; r._ultCiudad = 0; r.ciudad = '';
    });
    D.semanas.forEach(function (s) {
      var uid = s.uid || X.idSeguro(s.id), r = D.repartidores.get(uid);
      if (!r) {
        r = { uid: uid, id: String(s.id), nombre: s.nombre || '', celular: s.celular || '', sinCuenta: true, habilitado: true, poliza: false,
          pendientes: [], historial: [], enPlanilla: [], tramites: [], _ultima: 0, _ultimaNoHab: false };
        D.repartidores.set(uid, r);
      }
      var item = { semana: s.semana, rango: s.rango || '', importe: Number(s.importe) || 0, ciudad: s.ciudad || '', _doc: s._id, _orden: s.orden || 0, rebote: s.rebote || null };
      if (s.estado === 'pendiente') { item.estado = 'Pendiente'; r.pendientes.push(item); }
      else if (s.estado === 'en_planilla') { item.estado = 'En planilla'; item.planilla = s.planilla || ''; r.enPlanilla.push(item); }
      else if (s.estado === 'pagado') { item.fechaPago = X.fecha(s.fechaPago); item._o = X.aFecha(s.fechaPago) ? X.aFecha(s.fechaPago).getTime() : 0; r.historial.push(item); }
      if ((s.orden || 0) >= r._ultima) { r._ultima = s.orden || 0; r._ultimaNoHab = s.estado === 'no_habilitado'; }
      if (s.ciudad && (s.orden || 0) >= (r._ultCiudad || 0)) { r._ultCiudad = s.orden || 0; r.ciudad = s.ciudad; }
    });
    var suma = function (l) { return X.redondear(l.reduce(function (t, x) { return t + (x.importe || 0); }, 0)); };
    D.repartidores.forEach(function (r) {
      r.pendientes.sort(function (a, b) { return b._orden - a._orden; });
      r.historial.sort(function (a, b) { return (b._o - a._o) || (b._orden - a._orden); });
      r.habilitado = !r._ultimaNoHab;
      r.resumen = { pendientes: { cantidad: r.pendientes.length, total: suma(r.pendientes) }, pagados: { cantidad: r.historial.length, total: suma(r.historial) } };
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
      if (!r.nombre && rep) r.nombre = rep.nombre;
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
          col().where('orden', 'in', lista).get().then(function (q) {
            var ex = {}; q.forEach(function (d) { var x = d.data(); x._id = d.id; ex[d.id] = x; });
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
            var d = { id: r.id, uid: r.uid, nombre: r.nombre, celular: r.celular, ciudad: info.ciudad, anio: r.anio, orden: r.orden, ganancias: r.ganancias, importeAnterior: r.importeAnterior,
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
        }).then(function () { cerrarCajon(); X.aviso('Importación deshecha'); X.recargarTodo(); }, function (e) { console.error(e); X.aviso('No se pudo deshacer. Revisa tus permisos.'); });
      }, 'Deshacer', true);
    }, function (e) { console.error(e); X.aviso('No se pudo consultar Firebase.'); });
  }

  /* ══════════ MIGRACIÓN ÚNICA DESDE GOOGLE SHEETS ══════════
     Lo que el robot copió de PPendientes e HistPagosMTG a cada repartidor pasa a «semanas».
     No pisa nada que ya exista. */
  function armarMigracion(repartidores, existentes, hoy) {
    var docs = {}, sinSemana = 0, hist = 0, pend = 0;
    repartidores.forEach(function (r) {
      if (r.prueba || r.sinCuenta) return;
      var o = r._sheets || r, uid = r.uid || X.idSeguro(r.id);
      var agregar = function (x, estado) {
        var n = numSemana(x.semana); if (!n) { sinSemana++; return; }
        var ref = estado === 'pagado' ? X.aFecha(x.fechaPago) || hoy : hoy;
        var anio = anioDe(x.semana) || inferirAnio(n, ref), k = idDoc(uid, anio, n);
        if (existentes[k]) return;
        var imp = X.redondear(Number(x.importe) || 0), d = docs[k];
        if (d) { d.importe = X.redondear(d.importe + imp); if (estado === 'pagado') d.estado = 'pagado'; return; }
        docs[k] = { id: String(r.id), uid: uid, nombre: r.nombre || '', celular: String(r.celular || ''), ciudad: '', semana: String(x.semana), anio: anio, orden: anio * 100 + n,
          rango: x.rango || '', importe: imp, estado: estado, planilla: null, fechaPago: estado === 'pagado' ? fechaISO(x.fechaPago) : null, origen: 'migracion' };
        if (estado === 'pagado') hist++; else pend++;
      };
      (o.historial || []).forEach(function (h) { agregar(h, 'pagado'); });
      (o.pendientes || []).forEach(function (p) { agregar(p, 'pendiente'); });
    });
    return { docs: docs, pendientes: pend, pagados: hist, sinSemana: sinSemana };
  }
  function migrar() {
    if (!X.esAdmin()) { X.aviso('Solo un administrador puede migrar.'); return; }
    if (!D.repartidores) { X.aviso('Espera a que carguen los datos.'); return; }
    var c = X.ventana('Migrar desde Google Sheets', 'Paso único: copia a «semanas» los pendientes (PPendientes) y el historial (HistPagosMTG) que hoy ve el Portal.', X.anillo('Revisando lo que ya existe…'), '<button class="btn sec" data-cerrar>Cancelar</button>');
    col().get().then(function (q) {
      var ex = {}; q.forEach(function (d) { ex[d.id] = 1; });
      var m = armarMigracion(D.repartidores, ex, new Date()), lista = Object.keys(m.docs);
      var tot = function (e) { return X.redondear(lista.reduce(function (s, k) { return s + (m.docs[k].estado === e ? m.docs[k].importe : 0); }, 0)); };
      c.cerrar();
      X.ventana('Migrar desde Google Sheets', 'Revisa los números antes de guardar.',
        '<div class="rejilla r2 mb"><div class="dato"><small>Semanas pendientes</small><b class="num">' + entero(m.pendientes) + ' · ' + bs(tot('pendiente')) + '</b></div>' +
        '<div class="dato"><small>Semanas pagadas (historial)</small><b class="num">' + entero(m.pagados) + ' · ' + bs(tot('pagado')) + '</b></div></div>' +
        '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Es seguro repetirla</b>' + entero(Object.keys(ex).length) + ' semanas ya existen en «semanas» y no se tocan.' +
        (m.sinSemana ? ' ' + entero(m.sinSemana) + ' filas no tienen número de semana y se omiten.' : '') + ' La ciudad queda vacía en lo migrado (las hojas no la tienen).</div></div>',
        '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok' + (lista.length ? '' : ' disabled') + '>' + ic('check') + 'Migrar ' + entero(lista.length) + (lista.length === 1 ? ' semana' : ' semanas') + '</button>',
        function (v, cerrar) {
          var ok = v.querySelector('[data-ok]');
          ok.addEventListener('click', function () {
            ok.disabled = true;
            var lote = 'migracion-' + X.hoyISO(), quien = S.usuario.email;
            var ops = lista.map(function (k) { var d = m.docs[k]; d.lote = lote; d.loteCreado = lote; d.creado = X.servidor(); d.actualizado = X.servidor(); d.quien = quien; return { ref: col().doc(k), datos: d }; });
            escribir(ops, function (h, t) { ok.innerHTML = X.anilloBoton() + entero(h) + ' de ' + entero(t); }).then(function () {
              return X.bitacora('Migró semanas desde Sheets', m.pendientes + ' pendientes · ' + m.pagados + ' pagadas');
            }).then(function () { cerrar(); X.aviso('Migración guardada'); X.recargarTodo(); }, function (e) {
              console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar';
              X.aviso('Se cortó la migración. Reintenta: lo ya guardado no se repite.');
            });
          });
        });
    }, function (e) {
      console.error(e); c.cerrar();
      X.aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso sobre «semanas»: falta publicar las reglas del Portal.' : 'No se pudo consultar Firebase.');
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
            var ops = [], uids = {}, raras = 0;
            snaps.forEach(function (d) {
              if (!d.exists) return;
              var x = d.data();
              if (x.estado !== 'en_planilla' || x.planilla !== p._id) { raras++; return; }
              ops.push({ tipo: 'update', ref: d.ref, datos: { estado: 'pagado', fechaPago: f, rebote: null, actualizado: X.servidor(), quien: S.usuario.email } });
              uids[x.uid] = 1;
            });
            return escribir(ops).then(function () {
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
    var max = Math.max.apply(null, datos.map(function (d) { return d.v; }).concat([1])), alto = 28, ancho = 520, eti = 130, h = datos.length * alto + 8;
    return '<svg viewBox="0 0 ' + (ancho + eti + 110) + ' ' + h + '" width="100%" role="img" aria-label="' + esc(o.titulo || '') + '">' + datos.map(function (d, i) {
      var w = Math.max(2, Math.round(d.v / max * ancho)), y = i * alto + 4;
      return '<text x="' + (eti - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="12" fill="#335F4F">' + esc(d.k) + '</text>' +
        '<rect x="' + eti + '" y="' + y + '" width="' + w + '" height="20" rx="4" fill="' + (d.color || '#235347') + '"/>' +
        '<text x="' + (eti + w + 6) + '" y="' + (y + 15) + '" font-size="12" fill="#051F20">' + esc(o.fmt ? o.fmt(d.v) : d.v) + '</text>';
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

  X.semanas = {
    modoControl: modoControl, cargar: cargar, aplicar: aplicar, importar: importar, verImportaciones: verImportaciones, migrar: migrar,
    marcarEnPlanilla: marcarEnPlanilla, marcarFuera: marcarFuera, confirmarPago: confirmarPago, anularPlanilla: anularPlanilla, porConfirmar: porConfirmar, reporte: reporte,
    // piezas que usa js/banco.js
    leerLibro: leerLibro, escribir: escribir, encolarNotif: encolarNotif, CIUDADES: CIUDADES, fechaISO: fechaISO,
    // lógica pura (para pruebas)
    _puro: { semanaDeArchivo: semanaDeArchivo, numSemana: numSemana, anioDe: anioDe, isoSemana: isoSemana, inferirAnio: inferirAnio, idDoc: idDoc, patronSemana: patronSemana, textoSemana: textoSemana, ciudadDeArchivo: ciudadDeArchivo, analizar: analizar, armarMigracion: armarMigracion, adivinar: adivinar, CAMPOS: CAMPOS }
  };
})();
