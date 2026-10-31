/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Banco
   Cuentas bancarias de los repartidores, planilla de carga masiva del
   Banco Ganadero (una fila por semana pagada), «Detalle de pagos» en
   Excel y conciliación con el extracto del banco (ACEP / PROCESADO /
   VENCIDO). Pagos de MILTHAGOR S.R.L. a repartidores de Yango.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D;
  var esc = X.esc, bs = X.bs, ic = X.ic, entero = X.entero;

  /* Forma de pago 1 = cuenta del Banco Ganadero (moneda 0, entidad 0, sucursal 0).
     Forma 3 = transferencia ACH a otro banco (moneda 1, sucursal SCZ). Códigos tomados de las planillas reales. */
  var ENTIDADES = {
    1001: 'Banco Nacional de Bolivia', 1003: 'Banco Mercantil Santa Cruz', 1005: 'Banco de Crédito', 1009: 'Banco BISA',
    1014: 'Banco Unión', 1016: 'Banco Económico', 1017: 'Banco Solidario', 1033: 'Banco FIE', 1034: 'Banco Fortaleza', 3001: 'Cooperativa Jesús Nazareno'
  };
  var CIUDAD_CORTA = { SCZ: 'SC', CBBA: 'CBBA', LPZ: 'LP' };
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var ENC_BANCO = ['NRO. DE ORDEN', 'CODIGO DE CLIENTE', 'NRO.DECUENTA', 'NOMBRE DE CLIENTE', 'DOC DE IDENTIDAD', 'IMPORTE', 'FECHA DE PAGO', 'FORMA DE PAGO',
    'MONEDA DESTINO', 'ENTIDAD DESTINO', 'SUCURSAL DESTINO', 'GLOSA', 'CODIGO UNICO', 'EMAIL NOTIFICACION', 'NRO_DOC_TERCERO', 'NOMBRE_TERCERO'];

  function colC() { return X.dbC.collection('cuentas'); }
  function z2(n) { return (n < 10 ? '0' : '') + n; }
  function nombreBanco(c) { return !c ? '' : Number(c.forma) === 1 ? 'Banco Ganadero' : (ENTIDADES[Number(c.entidad)] || 'Entidad ' + c.entidad); }

  /* ══════════ TEXTOS: GLOSA, SEMANA, FECHAS ══════════ */
  /* «Pago MTG - ID Rider: 12345678 Fact.Nro.71 - SEM43G2026» o «PAGO MTG - ID RIDER 12345678 FACTNRO3 - SEM43G2026» */
  function leerGlosa(t) {
    var s = String(t || ''), m = s.match(/ID\s*RIDER\s*:?\s*([A-Za-z0-9._-]+)/i), w = s.match(/SEM\s*(\d{1,2})\s*G\s*(20\d\d)/i);
    if (!m || !w) return null;
    var f = s.match(/FACT\.?\s*NRO\.?\s*(\d*)/i);
    return { id: m[1], factura: f ? f[1] : '', sem: 'SEM' + Number(w[1]) + 'G' + w[2] };
  }
  function glosa(id, factura, sem) { return 'Pago MTG - ID Rider: ' + id + ' Fact.Nro.' + (factura || '') + ' - ' + sem; }
  /* Semana como la escribe el banco: «SEM43G2026» (aunque internamente diga «43») */
  function semBanco(texto, orden) {
    var t = String(texto || '').replace(/\s+/g, '').toUpperCase(), m = t.match(/^SEM0*(\d{1,2})G(20\d\d)$/);
    if (m) return 'SEM' + Number(m[1]) + 'G' + m[2];
    var P = X.semanas._puro, n = P.numSemana(t), a = P.anioDe(t) || (orden ? Math.floor(orden / 100) : P.inferirAnio(n));
    return n ? 'SEM' + n + 'G' + a : t;
  }
  function serialExcel(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5) : ''; }
  function fechaCortaISO(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  /* «19/10 al 25/10» + 2026 → «Del 19 al 25 de Octubre 2026» (formato del Detalle de pagos) */
  function rangoLargo(r, anio) {
    var m = String(r || '').match(/(\d{1,2})\/(\d{1,2})\D+(\d{1,2})\/(\d{1,2})/);
    if (!m) return r || '';
    var m1 = MESES[Number(m[2]) - 1], m2 = MESES[Number(m[4]) - 1];
    return 'Del ' + z2(+m[1]) + (m1 === m2 ? '' : ' de ' + m1) + ' al ' + z2(+m[3]) + ' de ' + m2 + ' ' + (anio || '');
  }
  /* Número tal cual lo espera el banco: número si es solo dígitos (sin cero adelante), si no texto */
  function numOTexto(v) { var t = String(v == null ? '' : v).trim(); return /^[1-9]\d{0,14}$/.test(t) ? Number(t) : t; }

  /* ══════════ CUENTAS BANCARIAS ══════════ */
  function cargar() {
    if (!X.puedeEditar()) { D.cuentas = new Map(); return Promise.resolve(); }
    return colC().get().then(function (q) { D.cuentas = new Map(); q.forEach(function (d) { var x = d.data(); x._id = d.id; D.cuentas.set(d.id, x); }); },
      function (e) { console.warn('Cuentas:', e); D.cuentas = new Map(); });
  }
  /* Qué le falta a una cuenta para entrar a la planilla del banco (se le muestra al repartidor) */
  function faltaEnCuenta(c) {
    if (!c) return ['no tenemos tus datos bancarios'];
    var f = [];
    if (!String(c.nombre || '').trim()) f.push('falta tu nombre completo');
    if (!String(c.ci || '').trim()) f.push('falta tu número de carnet');
    if (Number(c.forma) !== 1 && !Number(c.entidad)) f.push('falta el nombre de tu banco');
    if (!/^\d{4,20}$/.test(String(c.cuenta || '').trim())) f.push('falta tu número de cuenta');
    return f;
  }
  function cuentaDe(id) { return D.cuentas ? D.cuentas.get(X.idSeguro(id)) || null : null; }
  function escribirC(ops, progreso) {
    var i = 0;
    var paso = function () {
      if (i >= ops.length) return Promise.resolve();
      var b = X.dbC.batch();
      ops.slice(i, i + 400).forEach(function (o) { b.set(o.ref, o.datos, { merge: true }); });
      return b.commit().then(function () { i += 400; if (progreso) progreso(Math.min(i, ops.length), ops.length); return paso(); });
    };
    return paso();
  }
  /* Lee una planilla del banco ya cargada antes y saca la cuenta de cada ID Rider (de la glosa) */
  function cuentasDePlanilla(hojas) {
    var res = { cuentas: {}, sinGlosa: 0, filas: 0 };
    hojas.forEach(function (h) {
      var enc = h.enc.map(X.normal), c = function (re) { for (var i = 0; i < enc.length; i++) if (re.test(enc[i])) return i; return -1; };
      var k = { cuenta: c(/^NRO\.?\s*DE\s*CUENTA|^NRO\.DECUENTA/), nombre: c(/^NOMBRE DE CLIENTE/), ci: c(/^DOC DE IDENTIDAD/), forma: c(/^FORMA DE PAGO/), moneda: c(/^MONEDA DESTINO/),
        entidad: c(/^ENTIDAD DESTINO/), sucursal: c(/^SUCURSAL DESTINO/), glosa: c(/^GLOSA/), email: c(/^EMAIL/) };
      if (k.cuenta < 0 || k.glosa < 0) return;
      h.filas.forEach(function (f) {
        res.filas++;
        var g = leerGlosa(f[k.glosa]); if (!g) { res.sinGlosa++; return; }
        var forma = Number(f[k.forma]) || 3;
        res.cuentas[X.idSeguro(g.id)] = {
          id: g.id, nombre: String(f[k.nombre] || '').trim(), ci: String(f[k.ci] == null ? '' : f[k.ci]).trim(), cuenta: String(f[k.cuenta] == null ? '' : f[k.cuenta]).trim(),
          forma: forma, moneda: k.moneda >= 0 ? Number(f[k.moneda]) || 0 : (forma === 1 ? 0 : 1), entidad: k.entidad >= 0 ? Number(f[k.entidad]) || 0 : 0,
          sucursal: k.sucursal >= 0 ? (String(f[k.sucursal]).trim() === '0' ? 0 : String(f[k.sucursal]).trim()) : (forma === 1 ? 0 : 'SCZ'),
          email: k.email >= 0 ? String(f[k.email] || '').trim() : ''
        };
      });
    });
    return res;
  }
  function importarCuentas(alTerminar) {
    X.ventana('Importar cuentas bancarias', 'Sube una planilla que ya se cargó al Banco Ganadero (por ejemplo «SEM43 Planilla Banco»). Se toma la cuenta de cada ID Rider de la glosa.',
      '<div class="fm"><div class="fila"><label for="cbArch">Archivo</label><input id="cbArch" type="file" accept=".xlsx,.xls,.csv"></div><div id="cbRes"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('check') + 'Guardar</button>', function (v, cerrar) {
        var ok = v.querySelector('[data-ok]'), caja = v.querySelector('#cbRes'), lista = null;
        v.querySelector('#cbArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return;
          caja.innerHTML = X.anillo('Leyendo…'); ok.disabled = true;
          X.semanas.leerLibro(a).then(function (hojas) {
            var r = cuentasDePlanilla(hojas), ids = Object.keys(r.cuentas), n = 0, c = 0, i = 0;
            ids.forEach(function (k) {
              var ant = D.cuentas && D.cuentas.get(k), x = r.cuentas[k];
              if (!ant) n++; else if (ant.cuenta !== x.cuenta || Number(ant.forma) !== x.forma || Number(ant.entidad) !== x.entidad || ant.ci !== x.ci) c++; else i++;
            });
            lista = ids.filter(function (k) { var ant = D.cuentas && D.cuentas.get(k), x = r.cuentas[k]; return !ant || ant.cuenta !== x.cuenta || Number(ant.forma) !== x.forma || Number(ant.entidad) !== x.entidad || ant.ci !== x.ci || ant.nombre !== x.nombre; })
              .map(function (k) { return { k: k, x: r.cuentas[k] }; });
            if (!r.filas) { caja.innerHTML = '<p class="login-err">No se encontraron las columnas NRO.DECUENTA y GLOSA. ¿Es una planilla del banco?</p>'; return; }
            caja.innerHTML = '<div class="rejilla r3 mb"><div class="dato"><small>Nuevas</small><b class="num">' + entero(n) + '</b></div><div class="dato"><small>Cambian</small><b class="num">' + entero(c) + '</b></div><div class="dato"><small>Iguales</small><b class="num">' + entero(i) + '</b></div></div>' +
              (r.sinGlosa ? '<p class="muted">' + entero(r.sinGlosa) + ' filas sin «ID Rider» en la glosa se omiten.</p>' : '') +
              '<p class="muted">Si un repartidor cambió de cuenta, se guarda la de este archivo.</p>';
            ok.disabled = !lista.length; ok.innerHTML = ic('check') + 'Guardar ' + entero(lista.length);
          }).catch(function (ex) { console.error(ex); caja.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          var quien = S.usuario.email;
          escribirC(lista.map(function (o) { var d = Object.assign({}, o.x, { origen: 'planilla-banco', actualizado: X.servidor(), quien: quien }); return { ref: colC().doc(o.k), datos: d }; }),
            function (h, t) { ok.innerHTML = X.anilloBoton() + entero(h) + ' de ' + entero(t); })
            .then(function () { return X.bitacora('Importó cuentas bancarias', lista.length + ' cuentas'); })
            .then(function () { return cargar(); })
            .then(function () { cerrar(); X.aviso('Cuentas guardadas'); if (alTerminar) alTerminar(); }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar'; X.aviso('No se pudo guardar. Revisa las reglas de CONTROL (colección «cuentas»).'); });
        });
      });
  }
  var CB = { buscar: '', pag: 0 };
  function verCuentas() {
    var c = X.cajon('Cuentas bancarias', 'Cuenta de cada repartidor para la planilla del Banco Ganadero. Sin cuenta, el repartidor no entra en la planilla.', '');
    var pintar = function () {
      var b = X.normal(CB.buscar), l = Array.from((D.cuentas || new Map()).values())
        .filter(function (x) { return !b || (X.normal(x.nombre) + ' ' + x.id + ' ' + x.ci + ' ' + x.cuenta).indexOf(b) >= 0; })
        .sort(function (a, z) { return X.normal(a.nombre).localeCompare(X.normal(z.nombre)); });
      // Los datos bancarios se toman de BDYango (datos actualizados de Yango), no de planillas anteriores del banco
      c.cuerpo.innerHTML = '<div class="fila-acc mb">' + (X.puedeEditar() ? '<button class="btn sec chico" id="cbNueva">' + ic('mas') + 'Agregar</button>' : '') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="cbBuscar" placeholder="Buscar por nombre, ID, CI o cuenta" value="' + esc(CB.buscar) + '"></div></div>' +
        (l.length ? X.tabla([
          { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.nombre) + '</b><span class="sub num">ID ' + esc(x.id) + ' · CI ' + esc(x.ci) + '</span>'; } },
          { t: 'Banco', html: function (x) { return esc(nombreBanco(x)) + '<span class="sub num">' + esc(x.cuenta) + '</span>'; } },
          { t: '', html: function (x) { return X.puedeEditar() ? '<button class="btn sec chico" data-editar="' + esc(x._id || X.idSeguro(x.id)) + '">' + ic('editar') + 'Editar</button>' : ''; } }
        ], l, { pag: CB.pag }) : X.vacio(D.cuentas && D.cuentas.size ? 'Nada con esa búsqueda' : 'Todavía no hay cuentas', 'Se cargarán desde BDYango.', 'marca/graficos/ilu-factura-recibo.png'));
      var bq = c.cuerpo.querySelector('#cbBuscar');
      bq.addEventListener('input', function () { CB.buscar = bq.value; CB.pag = 0; pintar(); var e = c.cuerpo.querySelector('#cbBuscar'); e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
      c.cuerpo.querySelectorAll('[data-pag]').forEach(function (x) { x.addEventListener('click', function () { CB.pag = Number(x.getAttribute('data-pag')); pintar(); }); });
      var bi = c.cuerpo.querySelector('#cbImp'); if (bi) bi.addEventListener('click', function () { importarCuentas(pintar); });
      var bn = c.cuerpo.querySelector('#cbNueva'); if (bn) bn.addEventListener('click', function () { editarCuenta(null, pintar); });
      c.cuerpo.querySelectorAll('[data-editar]').forEach(function (x) { x.addEventListener('click', function () { editarCuenta(D.cuentas.get(x.getAttribute('data-editar')), pintar); }); });
    };
    if (D.cuentas) pintar(); else { c.cuerpo.innerHTML = X.cargaBarra('Cuentas', 'Trayendo…'); cargar().then(pintar); }
  }
  function editarCuenta(x, alTerminar) {
    var item = x ? Object.assign({}, x, { forma: String(x.forma), entidad: String(x.entidad) }) : { forma: '3', entidad: '1005', sucursal: 'SCZ' };
    var esACH = function (v) { return v.forma === '3'; };
    X.formulario(x ? 'Editar cuenta bancaria' : 'Agregar cuenta bancaria', x ? esc(x.nombre) + ' · ID ' + esc(x.id) : 'El ID Yango debe ser el mismo de las planillas.', [
      { k: 'id', t: 'ID Yango', obligatorio: true, max: 30 },
      { k: 'nombre', t: 'Nombre del titular (como figura en el banco)', obligatorio: true, max: 120 },
      { k: 'ci', t: 'Documento de identidad', obligatorio: true, max: 20 },
      { k: 'cuenta', t: 'Número de cuenta', obligatorio: true, max: 25 },
      { k: 'forma', t: 'Banco', tipo: 'select', opciones: [['1', 'Banco Ganadero (cuenta propia)'], ['3', 'Otro banco (transferencia ACH)']] },
      { k: 'entidad', t: 'Entidad destino', tipo: 'select', si: esACH, opciones: Object.keys(ENTIDADES).map(function (k) { return [k, ENTIDADES[k] + ' (' + k + ')']; }) },
      { k: 'sucursal', t: 'Sucursal destino', si: esACH, max: 6, ph: 'SCZ' },
      { k: 'email', t: 'Correo para el aviso del banco (opcional)', tipo: 'email', max: 120 }
    ], item, function (v) {
      if (!/^\d{4,20}$/.test(v.cuenta)) throw new Error('El número de cuenta debe tener solo dígitos.');
      var forma = Number(v.forma), d = { id: v.id, nombre: v.nombre, ci: v.ci, cuenta: v.cuenta, forma: forma, moneda: forma === 1 ? 0 : 1,
        entidad: forma === 1 ? 0 : Number(v.entidad), sucursal: forma === 1 ? 0 : (v.sucursal || 'SCZ').toUpperCase(), email: v.email || '', origen: 'manual', actualizado: X.servidor(), quien: S.usuario.email };
      return colC().doc(X.idSeguro(v.id)).set(d, { merge: true }).then(function () { return X.bitacora(x ? 'Editó cuenta bancaria' : 'Agregó cuenta bancaria', v.id + ' · ' + v.nombre); })
        .then(cargar).then(function () { X.aviso('Cuenta guardada'); if (alTerminar) alTerminar(); });
    });
  }

  /* ══════════ PLANILLA DEL BANCO GANADERO ══════════
     Una línea por semana pagada (como la planilla real): glosa con ID Rider, N.º de factura y semana. */
  function armar(listos) {
    var lineas = [], sinCuenta = [], pagan = [];
    listos.forEach(function (e) {
      var oks = e.semanas.filter(function (s) { return s.ok; }), c = cuentaDe(e.r.id), falta = faltaEnCuenta(c);
      if (falta.length) {
        var m = falta.join(', ');
        sinCuenta.push({ id: String(e.r.id), nombre: e.r.nombre || '', importe: e.totalPagar, motivo: m.charAt(0).toUpperCase() + m.slice(1), semanas: oks.map(function (s) { return s.p.semana; }), docs: oks.map(function (s) { return s.p._doc; }).filter(Boolean) });
        return;
      }
      pagan.push(e);
      oks.forEach(function (s) {
        var f = s.f;
        lineas.push({
          id: String(e.r.id), nombre: e.r.nombre || c.nombre, titular: c.nombre, importe: X.redondear(s.p.importe), semana: s.p.semana, sem: semBanco(s.p.semana, s.p._orden),
          rango: s.p.rango || '', ciudad: s.p.ciudad || e.r.ciudad || '', doc: s.p._doc || '', uid: e.r.uid,
          factura: f ? { numero: String(f.numero || ''), fecha: f.fechaEmision || '', nit: String(f.nitEmisor || ''), autorizacion: String(f.autorizacion || f.cuf || '') } : null,
          excepcion: s.estado === 'excepcion', contax: s.estado === 'contax'
        });
      });
    });
    lineas.sort(function (a, b) { return a.importe - b.importe; });
    return { lineas: lineas, sinCuenta: sinCuenta, pagan: pagan, total: X.redondear(lineas.reduce(function (t, l) { return t + l.importe; }, 0)) };
  }
  function filasBanco(lineas, fechaISO) {
    var serial = serialExcel(fechaISO);
    return [ENC_BANCO].concat(lineas.map(function (l, i) {
      var c = cuentaDe(l.id) || {}, f1 = Number(c.forma) === 1;
      return [i + 1, '', numOTexto(c.cuenta), c.nombre || l.titular || l.nombre, numOTexto(c.ci), l.importe, serial, f1 ? 1 : 3, f1 ? 0 : (Number(c.moneda) || 1),
        f1 ? 0 : Number(c.entidad) || 0, f1 ? 0 : (c.sucursal || 'SCZ'), glosa(l.id, l.factura && l.factura.numero, l.sem), '', c.email || '', '', ''];
    }));
  }
  function descargarBanco(lineas, fechaISO, nombre) {
    return X.cargarXLSX().then(function (XL) {
      var ws = XL.utils.aoa_to_sheet(filasBanco(lineas, fechaISO));
      for (var r = 1; r <= lineas.length; r++) {
        var g = ws[XL.utils.encode_cell({ r: r, c: 6 })]; if (g && g.v !== '') g.z = 'm/d/yy';
        var k = ws[XL.utils.encode_cell({ r: r, c: 2 })]; if (k && k.t === 'n') k.z = '0';
      }
      ws['!cols'] = [6, 8, 18, 36, 12, 10, 10, 8, 8, 8, 8, 56, 8, 24, 8, 8].map(function (w) { return { wch: w }; });
      var lb = XL.utils.book_new(); XL.utils.book_append_sheet(lb, ws, 'Hoja1');
      XL.writeFile(lb, nombre + '.xlsx');
    });
  }
  function semanaPrincipal(lineas) {
    var c = {}; lineas.forEach(function (l) { c[l.sem] = (c[l.sem] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0] || '';
  }

  /* ══════════ DETALLE DE PAGOS (Excel, mismo formato que el que se manda a Milthagor) ══════════ */
  function estadoLinea(l) { return l.excepcion ? 'Habilitado Exception' : 'Habilitado ✅'; }
  function facturaCols(l) {
    var f = l.factura;
    return f ? [numOTexto(f.numero), fechaCortaISO(f.fecha) || f.fecha || '', numOTexto(f.nit), f.autorizacion || ''] : ['', '', '', ''];
  }
  function detalleExcel(p) {
    var lineas = p.lineas || [], fecha = p.fechaPago || p.fechaProgramada || p.fecha, principal = p.semanaPrincipal || semanaPrincipal(lineas);
    var d = X.aFecha(fecha), titulo = d ? z2(d.getDate()) + ' ' + MESES[d.getMonth()] : fecha;
    var hojas = [];
    // 1) Todos los repartidores de la semana principal: habilitados y retenidos
    if (X.semanas.modoControl() && D.semanas && principal) {
      var enPlanilla = {}; lineas.forEach(function (l) { enPlanilla[l.doc] = l; });
      var semDocs = D.semanas.filter(function (s) { return semBanco(s.semana, s.orden) === principal && (Number(s.importe) || 0) > 0; })
        .sort(function (a, b) { return (Number(a.importe) || 0) - (Number(b.importe) || 0); });
      var anio = (principal.match(/G(\d{4})/) || [])[1];
      hojas.push({ nombre: 'Planilla ' + principal.replace(/G\d{4}$/, '').replace('SEM', 'Sem'), filas: [['Nro', 'Semana', 'Rango (Días)', 'ID del mensajero', 'Nombre completo', 'Importe total', 'Comentarios', 'Nro Factura', 'Fecha Factura', 'NIT Factura', 'Nro Autorización', 'ESTADO DE PAGO', 'Gestión SEM', 'Ciudad']]
        .concat(semDocs.map(function (s, i) {
          var l = enPlanilla[s._id] || (s.estado === 'pagado' || s.estado === 'en_planilla' ? { excepcion: false, factura: null } : null);
          var rep = D.repartidores && D.repartidores.get(s.uid);
          return [i + 1, principal, rangoLargo(s.rango, anio), numOTexto(s.id), s.nombre || (rep && rep.nombre) || '', Number(s.importe) || 0, CIUDAD_CORTA[s.ciudad] || '']
            .concat(l ? facturaCols(l) : ['Pago Retenido', 'Pago Retenido', 'Pago Retenido', 'Pago Retenido'])
            .concat([l ? estadoLinea(l) : 'Retención ❌', Number(anio) || '', '']);
        })) });
    }
    // 2) Lo que se paga en esta planilla (todas las semanas), con el resumen por semana a la derecha
    var porSem = {}; lineas.forEach(function (l) { porSem[l.sem] = porSem[l.sem] || [0, 0]; porSem[l.sem][0]++; porSem[l.sem][1] += l.importe; });
    var res = Object.keys(porSem).sort(function (a, b) { var P = X.semanas._puro; return (P.anioDe(a) * 100 + P.numSemana(a)) - (P.anioDe(b) * 100 + P.numSemana(b)); });
    var pagos = [['Nro', 'Fecha Pago', 'Semana', 'Rango (Días)', 'ID del mensajero', 'Nombre completo', 'Importe total', 'Comentarios', 'Nro Factura', 'Fecha Factura', 'NIT Factura', 'Nro Autorización', 'ESTADO DE PAGO', 'Gestión SEM', '', '', 'Semana', 'Cant', 'Importe']]
      .concat(lineas.map(function (l, i) {
        var anio = Number((l.sem.match(/G(\d{4})/) || [])[1]) || '';
        var fila = [i + 1, fechaCortaISO(fecha) || fecha, l.sem, rangoLargo(l.rango, anio), numOTexto(l.id), l.nombre, l.importe, CIUDAD_CORTA[l.ciudad] || ''].concat(facturaCols(l)).concat([estadoLinea(l), anio, '', '']);
        var r = res[i];
        return fila.concat(r ? [r, porSem[r][0], X.redondear(porSem[r][1])] : r === undefined && i === res.length ? ['TOTAL', lineas.length, X.redondear(p.total)] : ['', '', '']);
      }));
    hojas.push({ nombre: 'Pagos ' + titulo, filas: pagos });
    if ((p.retenidosDet || []).length) hojas.push({ nombre: 'Retenidos', filas: [['ID del mensajero', 'Nombre completo', 'Importe retenido', 'Motivo']].concat(p.retenidosDet.map(function (r) { return [numOTexto(r.id), r.nombre, r.importe, r.motivo]; })) });
    if ((p.sinCuenta || []).length) hojas.push({ nombre: 'Sin cuenta bancaria', filas: [['ID del mensajero', 'Nombre completo', 'Importe', 'Semanas']].concat(p.sinCuenta.map(function (r) { return [numOTexto(r.id), r.nombre, r.importe, (r.semanas || []).join(', ')]; })) });
    if ((p.rebotados || []).length) hojas.push({ nombre: 'Rebotados', filas: [['ID del mensajero', 'Nombre', 'Semana', 'Importe', 'Estado en el banco', 'Banco']].concat(p.rebotados.map(function (r) { return [numOTexto(r.id), r.nombre, r.sem, r.importe, r.estado, r.banco]; })) });
    return X.excel(hojas, 'Detalle Pagos ' + titulo).then(function () { X.bitacora('Descargó detalle de pagos', titulo); });
  }

  /* ══════════ CONCILIACIÓN CON EL EXTRACTO DEL BANCO ══════════ */
  var OK_BANCO = /ACEP|PROCES|PAGAD|ABONAD|EXITO/;
  function leerExtracto(hojas) {
    var r = { filas: [], cabecera: {} };
    hojas.forEach(function (h) {
      // El extracto trae datos de la planilla arriba y la tabla abajo: se busca la fila con «Estado» y «Glosa»
      var todas = h.todas || [h.enc].concat(h.filas), i0 = -1;
      todas.forEach(function (f, i) {
        var t = f.map(X.normal);
        if (i0 < 0 && t.indexOf('ESTADO') >= 0 && t.indexOf('GLOSA') >= 0) i0 = i;
        if (i0 < 0) f.forEach(function (c) { var m = String(c).match(/^\s*(N[uú]mero de Planilla|Estado|Fecha Carga|Importe|Nombre de la Planilla)\s*:\s*(.+)$/i); if (m) r.cabecera[X.normal(m[1])] = m[2].trim(); });
      });
      if (i0 < 0) return;
      var enc = todas[i0].map(X.normal), c = function (re) { for (var i = 0; i < enc.length; i++) if (re.test(enc[i])) return i; return -1; };
      var k = { est: c(/^ESTADO$/), glosa: c(/^GLOSA$/), monto: c(/^MONTO/), fecha: c(/^FECHA DE PAGO/), banco: c(/^BANCO RECEPTOR/), nombre: c(/^NOMBRE$/) };
      todas.slice(i0 + 1).forEach(function (f) {
        var g = leerGlosa(f[k.glosa]); if (!g) return;
        r.filas.push({ id: g.id, sem: g.sem, estado: X.normal(f[k.est]), monto: X.numero(f[k.monto]), fecha: k.fecha >= 0 ? f[k.fecha] : '', banco: k.banco >= 0 ? String(f[k.banco]) : '', nombre: k.nombre >= 0 ? String(f[k.nombre]) : '' });
      });
    });
    return r;
  }
  function cruzar(lineas, ext) {
    var porClave = {}; ext.filas.forEach(function (f) { porClave[X.idSeguro(f.id) + '|' + f.sem] = f; });
    var res = { pagados: [], rebotados: [], faltan: [], sobran: [], montoDistinto: 0, fecha: '' };
    var usados = {};
    lineas.forEach(function (l) {
      var k = X.idSeguro(l.id) + '|' + l.sem, f = porClave[k];
      if (!f || !f.estado) { res.faltan.push(l); return; }
      usados[k] = 1;
      if (f.monto !== null && Math.abs(f.monto - l.importe) > 0.005) res.montoDistinto++;
      if (OK_BANCO.test(f.estado)) { res.pagados.push({ l: l, f: f }); if (!res.fecha && f.fecha) res.fecha = X.semanas.fechaISO(f.fecha); }
      else res.rebotados.push({ l: l, f: f });
    });
    ext.filas.forEach(function (f) { if (!usados[X.idSeguro(f.id) + '|' + f.sem]) res.sobran.push(f); });
    return res;
  }
  function conciliar(p, alTerminar) {
    if (!(p.lineas || []).length) { X.aviso('Esta planilla no tiene líneas del banco guardadas. Usa «Pago confirmado».'); return; }
    X.ventana('Conciliar con el extracto', 'Sube el extracto del Banco Ganadero de esta planilla. Cada pago se reconoce por la glosa (ID Rider + semana).',
      '<div class="fm"><div class="fila"><label for="exArch">Extracto</label><input id="exArch" type="file" accept=".xlsx,.xls,.csv"></div><div id="exRes"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('check') + 'Aplicar</button>', function (v, cerrar) {
        var ok = v.querySelector('[data-ok]'), caja = v.querySelector('#exRes'), cr = null, ext = null;
        v.querySelector('#exArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return;
          caja.innerHTML = X.anillo('Leyendo…'); ok.disabled = true;
          X.semanas.leerLibro(a).then(function (hojas) {
            ext = leerExtracto(hojas);
            if (!ext.filas.length) { caja.innerHTML = '<p class="login-err">No se encontró la tabla con «Estado» y «Glosa». ¿Es el histórico de pago de planillas?</p>'; return; }
            cr = cruzar(p.lineas, ext);
            var suma = function (l) { return X.redondear(l.reduce(function (t, x) { return t + (x.l ? x.l.importe : x.importe); }, 0)); };
            caja.innerHTML =
              (ext.cabecera['NUMERO DE PLANILLA'] ? '<p class="muted">Planilla del banco N.º ' + esc(ext.cabecera['NUMERO DE PLANILLA']) + ' · ' + esc(ext.cabecera['ESTADO'] || '') + ' · ' + esc(ext.cabecera['IMPORTE'] || '') + '</p>' : '') +
              '<div class="rejilla r3 mb"><div class="dato"><small>Pagados</small><b class="num">' + entero(cr.pagados.length) + ' · ' + bs(suma(cr.pagados)) + '</b></div>' +
              '<div class="dato"><small>Rebotados</small><b class="num">' + entero(cr.rebotados.length) + ' · ' + bs(suma(cr.rebotados)) + '</b></div>' +
              '<div class="dato"><small>No están en el extracto</small><b class="num">' + entero(cr.faltan.length) + '</b></div></div>' +
              (cr.rebotados.length ? '<div class="card mb"><div class="h2">Rebotados: vuelven a pendientes</div>' + X.tabla([
                { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.l.nombre) + '</b><span class="sub num">ID ' + esc(x.l.id) + ' · ' + esc(x.l.sem) + '</span>'; } },
                { t: 'Banco', html: function (x) { return esc(x.f.banco) + '<span class="sub">' + esc(x.f.estado) + '</span>'; } },
                { t: 'Importe', clase: 'monto', html: function (x) { return bs(x.l.importe); } }
              ], cr.rebotados) + '</div>' : '') +
              (cr.faltan.length ? '<div class="aviso-caja mb">' + ic('excepcion') + '<div><b>' + entero(cr.faltan.length) + ' líneas de la planilla no aparecen en el extracto</b>Se quedan «en planilla» hasta conciliar otro extracto o confirmarlas a mano.</div></div>' : '') +
              (cr.sobran.length ? '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>' + entero(cr.sobran.length) + ' líneas del extracto no son de esta planilla</b>Se ignoran. Revisa que sea el extracto correcto.</div></div>' : '') +
              (cr.montoDistinto ? '<div class="aviso-caja mb">' + ic('excepcion') + '<div><b>' + entero(cr.montoDistinto) + ' pagos con importe distinto al de la planilla</b>Revísalos en el banco.</div></div>' : '') +
              '<div class="fila"><label for="exFecha">Fecha del pago</label><input id="exFecha" type="date" value="' + esc(cr.fecha || p.fechaProgramada || X.hoyISO()) + '"></div>';
            ok.disabled = !(cr.pagados.length || cr.rebotados.length);
          }).catch(function (ex) { console.error(ex); caja.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          var fecha = v.querySelector('#exFecha').value; if (!fecha) { X.aviso('Elige la fecha del pago.'); return; }
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Aplicando';
          aplicarConciliacion(p, cr, ext, fecha).then(function () { cerrar(); X.aviso('Conciliación aplicada'); if (alTerminar) alTerminar(); X.recargarTodo(); }, function (e) {
            console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar'; X.aviso('No se pudo aplicar. Reintenta: lo ya marcado no se repite.');
          });
        });
      });
  }
  function aplicarConciliacion(p, cr, ext, fecha) {
    var mc = X.semanas.modoControl(), col = X.dbP.collection('semanas'), quien = S.usuario.email;
    var docs = cr.pagados.concat(cr.rebotados).map(function (x) { return x.l.doc; }).filter(Boolean);
    var lee = mc ? Promise.all(docs.map(function (k) { return col.doc(k).get(); })) : Promise.resolve([]);
    return lee.then(function (snaps) {
      var est = {}; snaps.forEach(function (d) { if (d.exists) est[d.id] = d.data(); });
      var ops = [], pagadosUid = {}, rebotadosUid = {};
      var vale = function (k) { return mc && k && est[k] && est[k].estado === 'en_planilla' && est[k].planilla === p._id; };
      cr.pagados.forEach(function (x) { if (vale(x.l.doc)) { ops.push({ tipo: 'update', ref: col.doc(x.l.doc), datos: { estado: 'pagado', fechaPago: fecha, rebote: null, actualizado: X.servidor(), quien: quien } }); pagadosUid[x.l.uid || X.idSeguro(x.l.id)] = 1; } });
      cr.rebotados.forEach(function (x) {
        if (vale(x.l.doc)) ops.push({ tipo: 'update', ref: col.doc(x.l.doc), datos: { estado: 'pendiente', planilla: null, rebote: { fecha: fecha, estadoBanco: x.f.estado, banco: x.f.banco, planilla: p._id }, actualizado: X.servidor(), quien: quien } });
        rebotadosUid[x.l.uid || X.idSeguro(x.l.id)] = 1;
      });
      return X.semanas.escribir(ops).then(function () {
        var completa = !cr.faltan.length;
        return Promise.all([
          X.dbC.collection('pagos').doc(p._id).update({
            estado: completa ? 'pagada' : 'enviada', fechaPago: fecha, confirmadoPor: quien, confirmado: X.servidor(),
            conciliacion: { cuando: X.servidor(), quien: quien, pagados: cr.pagados.length, rebotados: cr.rebotados.length, faltan: cr.faltan.length, planillaBanco: ext.cabecera['NUMERO DE PLANILLA'] || '' },
            rebotados: cr.rebotados.map(function (x) { return { id: x.l.id, nombre: x.l.nombre, sem: x.l.sem, importe: x.l.importe, estado: x.f.estado, banco: x.f.banco }; })
          }),
          X.bitacora('Concilió extracto del banco', (p.fecha || '') + ' · ' + cr.pagados.length + ' pagados · ' + cr.rebotados.length + ' rebotados · ' + cr.faltan.length + ' sin dato'),
          X.semanas.encolarNotif('Recibiste tu pago', 'Milthagor realizó tu pago del ' + X.fecha(fecha) + '. Revisa el detalle en tu historial.', Object.keys(pagadosUid), 'historial'),
          X.semanas.encolarNotif('Tu pago fue devuelto por el banco', 'El banco no pudo depositar tu pago. Revisa que tu número de cuenta esté bien y escríbenos para volver a enviarlo.', Object.keys(rebotadosUid), 'inicio')
        ]);
      });
    });
  }

  X.banco = {
    cargar: cargar, cuentaDe: cuentaDe, faltaEnCuenta: faltaEnCuenta, nombreBanco: nombreBanco, verCuentas: verCuentas, importarCuentas: importarCuentas,
    armar: armar, descargarBanco: descargarBanco, semanaPrincipal: semanaPrincipal, detalleExcel: detalleExcel, conciliar: conciliar,
    _puro: { leerGlosa: leerGlosa, glosa: glosa, semBanco: semBanco, serialExcel: serialExcel, rangoLargo: rangoLargo, numOTexto: numOTexto, cuentasDePlanilla: cuentasDePlanilla, filasBanco: filasBanco, leerExtracto: leerExtracto, cruzar: cruzar, ENC_BANCO: ENC_BANCO }
  };
})();
