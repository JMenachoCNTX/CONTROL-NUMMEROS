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
  /* Cuadro «Códigos de Banco para Envío vía ACH» del Banco Ganadero: [código, nombre, abreviación, forma de pago] */
  var TABLA_BANCOS = [
    [1001, 'Banco Nacional de Bolivia', 'BNB', 3], [1003, 'Banco Mercantil Santa Cruz', 'BMSC', 3], [1005, 'Banco de Crédito de Bolivia', 'BCP', 3],
    [1008, 'Banco Do Brasil', 'DO BRASIL', 3], [1009, 'Banco Bisa', 'BISA', 3], [1014, 'Banco Unión', 'Unión', 3], [1016, 'Banco Económico', 'Económico', 3],
    [1017, 'Banco Solidario', 'Banco Sol', 3], [1033, 'Banco FIE', 'FIE', 3], [1034, 'Banco Fortaleza', 'Fortaleza', 3], [1035, 'Banco FASSIL S.A.', '', 3],
    [1036, 'Banco PRODEM S.A.', 'PRODEM', 3], [3001, 'Cooperativa Jesús Nazareno', 'JESUS NAZARENO', 3], [53001, 'EEFECTIVO S.A.', 'TIGO MONEY', 3],
    [74002, 'Banco PYME ECOFUTURO S.A.A.', 'ECOFUTURO', 3], [74003, 'Banco PYME de la Comunidad', 'BANCOMUNIDAD', 3],
    ['', 'Banco Ganadero', 'Ganadero', 1], ['', 'Banco Ganadero', 'Yolo', 1], [1005, 'Banco de Crédito de Bolivia', 'Yape', 3]
  ];
  var ENTIDADES = {};
  TABLA_BANCOS.forEach(function (b) { if (b[0] && !ENTIDADES[b[0]]) ENTIDADES[b[0]] = b[1]; });
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
  /* Cuenta para pagar: la corregida a mano en CONTROL manda; si no, la de BDYango en vivo; si no, la guardada */
  function cuentaDe(id) {
    var k = X.idSeguro(id), g = D.cuentas ? D.cuentas.get(k) || null : null;
    if (g && g.origen === 'manual') return g;
    return (D.bdyango && D.bdyango.cuentas[k]) || g;
  }
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
  /* ══════════ IMPORTAR DESDE BDYANGO ══════════
     «BOL Registro Activación» (hojas Activation/Deactivation SCZ, CBBA, LPZ): de ahí salen los datos
     actualizados de cada repartidor (Yango los mantiene). Se usa: ID, Nombre y Apellido (completos), CI,
     NIT, Teléfono, Banco, Cta Banco y Telegram. Si un ID aparece varias veces, manda la última fila con datos. */
  var BANCOS_TEXTO = [
    [/GANADERO|^BG$|YOLO/, 1, 0], [/YAPE/, 3, 1005], [/BRASIL/, 3, 1008], [/FASSIL/, 3, 1035], [/PRODEM/, 3, 1036], [/TIGO|EFECTIVO/, 3, 53001],
    [/ECOFUTURO/, 3, 74002], [/COMUNIDAD/, 3, 74003], [/CREDITO|BCP/, 3, 1005], [/SOL(IDARIO)?\b|BANCOSOL/, 3, 1017], [/UNION/, 3, 1014],
    [/MERCANTIL|BMSC/, 3, 1003], [/NACIONAL|BNB/, 3, 1001], [/BISA/, 3, 1009], [/ECONOMICO|BEC\b/, 3, 1016],
    [/FIE/, 3, 1033], [/FORTALEZA/, 3, 1034], [/NAZARENO/, 3, 3001]
  ];
  function bancoDe(texto) {
    var t = X.normal(texto); if (!t) return null;
    for (var i = 0; i < BANCOS_TEXTO.length; i++) if (BANCOS_TEXTO[i][0].test(t)) return { forma: BANCOS_TEXTO[i][1], entidad: BANCOS_TEXTO[i][2] };
    return { forma: 3, entidad: 0, desconocido: true };
  }
  function filasBDYango(hojas) {
    var porId = {}, sinBanco = 0, desconocidos = {}, yolo = 0, hojasUsadas = [];
    hojas.forEach(function (h) {
      var enc = h.enc.map(X.normal), c = function (re) { for (var i = 0; i < enc.length; i++) if (re.test(enc[i])) return i; return -1; };
      var k = { id: c(/^ID\b/), nom: c(/^NOMBRE \(COMPLETO\)|^NOMBRE$/), ape: c(/^APELLIDO/), ci: c(/^CI$/), nit: c(/^NIT$/), tel: c(/^TELEFONO/),
        banco: c(/^BANCO$/), cuenta: c(/^CTA|^CUENTA/), tg: c(/^TELEGRAM/), est: c(/^ESTADO$/), fecha: c(/^FECHA$/), correo: c(/^CORREO/), esp: c(/^ESPECIALISTA/),
        mat: c(/^MATRICULA DE COMERCIO NR/), roe: c(/^ROE/), seg: c(/^FECHA CADUCIDAD SEGURO/) };
      if (k.fecha < 0 && !enc[0]) k.fecha = 0;
      if (k.id < 0 || k.banco < 0 || k.cuenta < 0) return;
      hojasUsadas.push(h.nombre);
      var ciudad = /SCZ/i.test(h.nombre) ? 'SCZ' : /CBBA/i.test(h.nombre) ? 'CBBA' : /LPZ/i.test(h.nombre) ? 'LPZ' : '';
      h.filas.forEach(function (f) {
        var id = String(f[k.id] == null ? '' : f[k.id]).trim().replace(/\.0+$/, ''); if (!/^\d{4,}$/.test(id)) return;
        var x = porId[id] || (porId[id] = { id: id, registros: 0 });
        var pon = function (campo, v) { v = String(v == null ? '' : v).trim(); if (v) x[campo] = v; };
        x.registros++; x.ciudad = ciudad;
        [['fecha', 'fecha'], ['correo', 'correo'], ['esp', 'especialista'], ['mat', 'matricula'], ['roe', 'roe'], ['seg', 'seguroVence']].forEach(function (p) { if (k[p[0]] >= 0) pon(p[1], f[k[p[0]]]); });
        pon('nombre', [k.nom >= 0 ? f[k.nom] : '', k.ape >= 0 ? f[k.ape] : ''].join(' ').replace(/\s+/g, ' ').trim());
        if (k.ci >= 0) pon('ci', String(f[k.ci]).replace(/\.0+$/, ''));
        if (k.nit >= 0) pon('nit', String(f[k.nit]).replace(/\D/g, ''));
        if (k.tel >= 0) pon('telefono', String(f[k.tel]).replace(/\D/g, ''));
        if (k.tg >= 0) pon('telegram', String(f[k.tg]).replace(/^@/, ''));
        if (k.est >= 0) pon('estadoYango', f[k.est]);
        var cta = String(f[k.cuenta] == null ? '' : f[k.cuenta]).replace(/\D/g, '');
        if (cta && String(f[k.banco]).trim()) { x.cuenta = cta; x.bancoTexto = String(f[k.banco]).trim(); }
      });
    });
    var cuentas = {};
    Object.keys(porId).forEach(function (id) {
      var x = porId[id];
      if (x.cuenta) { var bb = bancoDe(x.bancoTexto); x.forma = bb.forma; x.entidad = bb.entidad; x.desconocido = !!bb.desconocido; }
      if (!x.cuenta) { sinBanco++; return; }
      var b = bancoDe(x.bancoTexto);
      if (b.desconocido) desconocidos[x.bancoTexto] = (desconocidos[x.bancoTexto] || 0) + 1;
      if (/YOLO/.test(X.normal(x.bancoTexto))) yolo++;
      cuentas[X.idSeguro(id)] = { id: id, nombre: x.nombre || '', ci: x.ci || '', cuenta: x.cuenta, forma: b.forma, moneda: b.forma === 1 ? 0 : 1, entidad: b.entidad,
        sucursal: b.forma === 1 ? 0 : 'SCZ', banco: x.bancoTexto, telefono: x.telefono || '', telegram: x.telegram || '', estadoYango: x.estadoYango || '', nit: x.nit || '' };
    });
    return { cuentas: cuentas, todos: porId, total: Object.keys(porId).length, sinBanco: sinBanco, desconocidos: desconocidos, yolo: yolo, hojas: hojasUsadas };
  }
  function importarBDYango(alTerminar) {
    X.ventana('Importar desde BDYango', 'Sube el Excel de «BOL Registro Activación» (Archivo → Descargar → Microsoft Excel). Se actualizan los datos bancarios de cada repartidor.',
      '<div class="fm"><div class="fila"><label for="byArch">Archivo</label><input id="byArch" type="file" accept=".xlsx,.xls"></div><div id="byRes"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>' + ic('check') + 'Guardar</button>', function (v, cerrar) {
        var ok = v.querySelector('[data-ok]'), caja = v.querySelector('#byRes'), cambios = [], nits = [];
        v.querySelector('#byArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return;
          caja.innerHTML = X.anillo('Leyendo BDYango…'); ok.disabled = true;
          Promise.all([X.semanas.leerLibro(a), X.dbP.collection('perfiles').get().catch(function () { return { forEach: function () { } }; })]).then(function (r) {
            var b = filasBDYango(r[0]), ids = Object.keys(b.cuentas), conPerfil = {};
            r[1].forEach(function (d) { conPerfil[d.id] = 1; });
            if (!b.hojas.length) { caja.innerHTML = '<p class="login-err">No se encontraron hojas con las columnas ID, Banco y Cta Banco.</p>'; return; }
            var campos = ['nombre', 'ci', 'cuenta', 'forma', 'entidad', 'telefono', 'telegram', 'banco'];
            cambios = ids.filter(function (k) { var ant = D.cuentas && D.cuentas.get(k), x = b.cuentas[k]; return !ant || campos.some(function (c) { return String(ant[c] == null ? '' : ant[c]) !== String(x[c]); }); });
            var nuevos = cambios.filter(function (k) { return !(D.cuentas && D.cuentas.get(k)); }).length;
            nits = ids.filter(function (k) { var x = b.cuentas[k]; return !conPerfil[k] && /^\d{5,15}$/.test(x.nit); });
            var desc = Object.keys(b.desconocidos);
            caja.innerHTML = '<p class="muted">Hojas leídas: ' + esc(b.hojas.join(' · ')) + '</p>' +
              '<div class="rejilla r3 mb"><div class="dato"><small>Con cuenta</small><b class="num">' + entero(ids.length) + '</b></div>' +
              '<div class="dato"><small>Nuevas</small><b class="num">' + entero(nuevos) + '</b></div><div class="dato"><small>Actualizadas</small><b class="num">' + entero(cambios.length - nuevos) + '</b></div></div>' +
              '<p class="muted">' + entero(b.sinBanco) + ' repartidores sin banco o cuenta en BDYango · ' + entero(nits.length) + ' NIT nuevos para el portal.</p>' +
              (b.yolo ? '<p class="muted">' + entero(b.yolo) + ' cuentas «Yolo» se pagan como Banco Ganadero.</p>' : '') +
              (desc.length ? '<div class="aviso-caja">' + ic('excepcion') + '<div><b>Bancos sin código</b>' + esc(desc.map(function (d) { return d + ' (' + b.desconocidos[d] + ')'; }).join(', ')) + ': esas cuentas quedan sin entidad y no entran a la planilla hasta asignar el código.</div></div>' : '');
            cambios = cambios.map(function (k) { return { k: k, x: b.cuentas[k] }; });
            nits = nits.map(function (k) { return { k: k, x: b.cuentas[k] }; });
            ok.disabled = !cambios.length && !nits.length; ok.innerHTML = ic('check') + 'Guardar ' + entero(cambios.length);
          }).catch(function (ex) { console.error(ex); caja.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer el archivo.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Guardando';
          var quien = S.usuario.email;
          escribirC(cambios.map(function (o) { var d = Object.assign({}, o.x, { origen: 'BDYango', actualizado: X.servidor(), quien: quien }); delete d.nit; return { ref: colC().doc(o.k), datos: d }; }),
            function (h, t) { ok.innerHTML = X.anilloBoton() + entero(h) + ' de ' + entero(t); })
            .then(function () {
              // NIT del portal para quienes todavía no lo registraron (no se pisa ninguno)
              return X.semanas.escribir(nits.map(function (o) { return { tipo: 'set', ref: X.dbP.collection('perfiles').doc(o.k), datos: { nit: o.x.nit, razonSocial: o.x.nombre || '', origen: 'BDYango', editadoPor: quien, editado: X.servidor() } }; }));
            })
            .then(function () { return X.bitacora('Importó BDYango', cambios.length + ' cuentas · ' + nits.length + ' NIT'); })
            .then(cargar)
            .then(function () { cerrar(); X.aviso('BDYango importado'); if (alTerminar) alTerminar(); }, function (e) { console.error(e); ok.disabled = false; ok.innerHTML = ic('check') + 'Reintentar'; X.aviso('No se pudo guardar. Revisa tus permisos.'); });
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
      c.cuerpo.innerHTML = '<div class="fila-acc mb">' + (X.puedeEditar() ? '<button class="btn chico" id="cbBdy">' + ic('subir') + 'Importar BDYango</button><button class="btn sec chico" id="cbNueva">' + ic('mas') + 'Agregar</button>' : '') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="cbBuscar" placeholder="Buscar por nombre, ID, CI o cuenta" value="' + esc(CB.buscar) + '"></div></div>' +
        (l.length ? X.tabla([
          { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.nombre) + '</b><span class="sub num">ID ' + esc(x.id) + ' · CI ' + esc(x.ci) + '</span>'; } },
          { t: 'Banco', html: function (x) { return esc(nombreBanco(x)) + '<span class="sub num">' + esc(x.cuenta) + '</span>'; } },
          { t: '', html: function (x) { return X.puedeEditar() ? '<button class="btn sec chico" data-editar="' + esc(x._id || X.idSeguro(x.id)) + '">' + ic('editar') + 'Editar</button>' : ''; } }
        ], l, { pag: CB.pag }) : X.vacio(D.cuentas && D.cuentas.size ? 'Nada con esa búsqueda' : 'Todavía no hay cuentas', 'Usa «Importar BDYango».', 'marca/graficos/ilu-factura-recibo.png'));
      var bq = c.cuerpo.querySelector('#cbBuscar');
      bq.addEventListener('input', function () { CB.buscar = bq.value; CB.pag = 0; pintar(); var e = c.cuerpo.querySelector('#cbBuscar'); e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
      c.cuerpo.querySelectorAll('[data-pag]').forEach(function (x) { x.addEventListener('click', function () { CB.pag = Number(x.getAttribute('data-pag')); pintar(); }); });
      var bi = c.cuerpo.querySelector('#cbImp'); if (bi) bi.addEventListener('click', function () { importarCuentas(pintar); });
      var by = c.cuerpo.querySelector('#cbBdy'); if (by) by.addEventListener('click', function () { importarBDYango(pintar); });
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
      var ops = [], pagadosUid = {}, rebotadosUid = {}, hist = [];
      var vale = function (k) { return mc && k && est[k] && est[k].estado === 'en_planilla' && est[k].planilla === p._id; };
      cr.pagados.forEach(function (x) {
        if (!vale(x.l.doc)) return;
        var s = est[x.l.doc];
        ops.push({ tipo: 'update', ref: col.doc(x.l.doc), datos: { estado: 'pagado', fechaPago: fecha, rebote: null, actualizado: X.servidor(), quien: quien } });
        hist.push([String(s.semana || ''), s.rango || '', String(s.id), s.nombre || '', X.redondear(Number(s.importe) || 0), s.ciudad || '', x.l.factura || '', '', '', '', '']);
        pagadosUid[x.l.uid || X.idSeguro(x.l.id)] = 1;
      });
      cr.rebotados.forEach(function (x) {
        if (vale(x.l.doc)) ops.push({ tipo: 'update', ref: col.doc(x.l.doc), datos: { estado: 'pendiente', planilla: null, rebote: { fecha: fecha, estadoBanco: x.f.estado, banco: x.f.banco, planilla: p._id }, actualizado: X.servidor(), quien: quien } });
        rebotadosUid[x.l.uid || X.idSeguro(x.l.id)] = 1;
      });
      return X.semanas.escribir(ops).then(function () { return X.semanas.agregarAlHistorial(fecha, hist); }).then(function () {
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

  /* ══════════ BDYANGO EN VIVO ══════════
     Se lee «BOL Registro Activación» por el puente del Panel al abrir CONTROL (sin botones). Sus cuentas
     son las que usa la planilla del banco, salvo las corregidas a mano en «Cuentas bancarias». */
  var bdyPromesa = null;
  function cargarBDYango(forzar) {
    if (bdyPromesa && !forzar) return bdyPromesa;
    if (!forzar) D.bdyango = null;
    bdyPromesa = X.puente('admin_ctrl_hoja', { hoja: 'bdyango' }).then(function (r) {
      var b = filasBDYango(r.hojas.map(function (h) { return { nombre: h.nombre, enc: h.filas[0] || [], filas: h.filas.slice(1) }; }));
      D.bdyango = { cuentas: b.cuentas, lista: Object.keys(b.todos).map(function (id) { return b.todos[id]; }), sinBanco: b.sinBanco, desconocidos: b.desconocidos, leido: r.leido };
      // Repartidores sin nombre (por ejemplo los que no están en la hoja BDYANGO del robot): se toma el de BDYango
      if (D.repartidores) D.repartidores.forEach(function (x) { var t = b.todos[x.id]; if (!x.nombre && t && t.nombre) x.nombre = t.nombre; });
    }, function (e) { console.warn('BDYango:', e); D.bdyango = { cuentas: {}, lista: [], error: e.message || 'No se pudo leer BDYango.' }; })
      .then(function () { if (['bdyango', 'pagos', 'repartidores', 'informe', 'historial', 'tablero'].indexOf(S.pagina) >= 0 && !document.querySelector('.velo') && !/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName)) X.refrescar(); });
    return bdyPromesa;
  }
  var BY = { ciudad: '', filtro: 'todos', buscar: '', pag: 0 };
  X.pagina('bdyango', {
    t: 'DBYango', i: 'base', orden: 5, sec: 'Operación',
    render: function () {
      var B = D.bdyango;
      var cab = X.titulo('DBYango', 'Datos de «BOL Registro Activación» (Yango), leídos en vivo' + (B && B.leido ? ' · ' + X.hace(B.leido) : '') + '. Una fila por repartidor (su último registro). Sus cuentas son las que usa la planilla del banco.',
        '<button class="btn sec" id="byExc">' + ic('descargar') + 'Excel de esta lista</button><button class="btn sec" id="byRec">' + ic('recargar') + 'Leer de nuevo</button>');
      if (!B) return cab + '<div class="card">' + X.cargaBarra('BDYango', 'Leyendo la hoja de Yango…') + '</div>';
      if (B.error) return cab + '<div class="card">' + X.vacio('No se pudo leer BDYango', B.error) + '</div>';
      var conCta = B.lista.filter(function (x) { return x.cuenta; }), bq = X.normal(BY.buscar);
      var cuenta = { todos: B.lista.length, activos: B.lista.filter(function (x) { return /ACTIV/.test(X.normal(x.estadoYango)) && !/DESACTIV/.test(X.normal(x.estadoYango)); }).length,
        sinbanco: B.lista.length - conCta.length, sincodigo: conCta.filter(function (x) { return x.desconocido; }).length };
      var l = B.lista.filter(function (x) {
        if (BY.ciudad && x.ciudad !== BY.ciudad) return false;
        if (BY.filtro === 'activos' && !(/ACTIV/.test(X.normal(x.estadoYango)) && !/DESACTIV/.test(X.normal(x.estadoYango)))) return false;
        if (BY.filtro === 'sinbanco' && x.cuenta) return false;
        if (BY.filtro === 'sincodigo' && !(x.cuenta && x.desconocido)) return false;
        return !bq || (X.normal(x.nombre) + ' ' + x.id + ' ' + (x.ci || '') + ' ' + (x.telefono || '') + ' ' + (x.cuenta || '') + ' ' + (x.nit || '')).indexOf(bq) >= 0;
      }).sort(function (a, z) { return X.normal(a.nombre).localeCompare(X.normal(z.nombre)); });
      BY.lista = l;
      return cab + '<div class="rejilla r4 mb">' +
          '<div class="kpi"><small>Repartidores</small><b class="num">' + entero(cuenta.todos) + '</b><em>' + entero(cuenta.activos) + ' activados</em></div>' +
          '<div class="kpi"><small>Con cuenta bancaria</small><b class="num">' + entero(conCta.length) + '</b><em>' + entero(conCta.filter(function (x) { return Number(x.forma) === 1; }).length) + ' Banco Ganadero</em></div>' +
          '<div class="kpi"><small>Sin banco o cuenta</small><b class="num">' + entero(cuenta.sinbanco) + '</b><em>no entran a la planilla</em></div>' +
          '<div class="kpi"><small>Banco no reconocido</small><b class="num">' + entero(cuenta.sincodigo) + '</b><em>' + esc(Object.keys(B.desconocidos || {}).slice(0, 3).join(', ')) + '</em></div>' +
        '</div><div class="card"><div class="pestanas" role="tablist">' + [['todos', 'Todos'], ['activos', 'Activados'], ['sinbanco', 'Sin datos bancarios'], ['sincodigo', 'Banco no reconocido']].map(function (p) {
          return '<button role="tab" aria-selected="' + (BY.filtro === p[0]) + '" data-fby="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(cuenta[p[0]]) + '</em></button>';
        }).join('') + '</div>' +
 (BY.filtro === 'sincodigo' ? '<div class="aviso-caja mb">' + ic('ayuda') + '<div><b>¿Qué es «banco no reconocido»?</b>El banco que figura en BDYango no está en el cuadro de códigos del Banco Ganadero (pestaña «Códigos de banco»), o en esa columna escribieron otra cosa (por ejemplo un número). Sin código no se puede transferir: hay que pedir a Yango que lo corrija.</div></div>' : '') +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bBy" placeholder="Buscar por nombre, ID, CI, NIT, teléfono o cuenta" value="' + esc(BY.buscar) + '"></div>' +
          '<select id="sByCiudad" aria-label="Ciudad"><option value="">Todas las ciudades</option>' + ['SCZ', 'CBBA', 'LPZ'].map(function (c) { return '<option value="' + c + '"' + (BY.ciudad === c ? ' selected' : '') + '>' + esc(X.semanas.CIUDADES[c]) + '</option>'; }).join('') + '</select></div>' +
        (l.length ? X.tabla([
          { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.nombre || '—') + '</b><span class="sub num">ID ' + esc(x.id) + (x.ci ? ' · CI ' + esc(x.ci) : '') + '</span>'; } },
          { t: 'Ciudad · Estado', html: function (x) { return esc(X.semanas.CIUDADES[x.ciudad] || x.ciudad || '') + '<span class="sub">' + esc(x.estadoYango || '') + (x.fecha ? ' · ' + esc(x.fecha) : '') + '</span>'; } },
          { t: 'Contacto', html: function (x) { return '<span class="num">' + esc(x.telefono || '—') + '</span>' + (x.telegram ? '<span class="sub">@' + esc(x.telegram) + '</span>' : ''); } },
          { t: 'Banco · Cuenta', html: function (x) { return x.cuenta ? (x.desconocido ? esc(x.bancoTexto) + ' ' + X.chip('mal', 'No reconocido') : esc(nombreBanco(x))) + '<span class="sub num">' + esc(x.cuenta) + '</span>' : X.chip('mal', 'Sin datos bancarios'); } },
          { t: 'NIT', html: function (x) { return '<span class="num">' + esc(x.nit || '—') + '</span>'; } }
        ], l, { clic: true, pag: BY.pag }) : X.vacio('Nada con este filtro')) + '</div>';
    },
    despues: function (el) {
      if (!D.bdyango && !bdyPromesa) cargarBDYango();
      var br = el.querySelector('#byRec'); if (br) br.addEventListener('click', function () { br.disabled = true; br.innerHTML = X.anilloBoton() + 'Leyendo'; cargarBDYango(true); });
      var bx = el.querySelector('#byExc'); if (bx) bx.addEventListener('click', function () {
        var nom = { todos: 'Todos', activos: 'Activados', sinbanco: 'Sin datos bancarios', sincodigo: 'Banco no reconocido' }[BY.filtro] + (BY.ciudad ? ' ' + BY.ciudad : '');
        X.excel([{ nombre: nom.slice(0, 30), filas: [['ID Yango', 'Nombre', 'Ciudad', 'Estado', 'Fecha de registro', 'CI', 'NIT', 'Teléfono', 'Telegram', 'Correo', 'Banco (como figura en BDYango)', 'Cuenta', 'Banco para la planilla', 'Código', 'Observación']]
          .concat((BY.lista || []).map(function (x) {
            var obs = !x.cuenta ? 'Sin datos bancarios' : x.desconocido ? 'Banco no reconocido' : '';
            return [x.id, x.nombre || '', X.semanas.CIUDADES[x.ciudad] || x.ciudad || '', x.estadoYango || '', x.fecha || '', x.ci || '', x.nit || '', x.telefono || '', x.telegram || '', x.correo || '',
              x.bancoTexto || '', x.cuenta || '', x.cuenta && !x.desconocido ? nombreBanco(x) : '', x.cuenta && !x.desconocido ? (Number(x.forma) === 1 ? 'Ganadero' : x.entidad) : '', obs];
          })) }], 'BDYango-' + nom.replace(/\s+/g, '-') + '-' + X.hoyISO());
      });
      el.querySelectorAll('[data-fby]').forEach(function (b) { b.addEventListener('click', function () { BY.filtro = b.getAttribute('data-fby'); BY.pag = 0; X.refrescar(); }); });
      var sc = el.querySelector('#sByCiudad'); if (sc) sc.addEventListener('change', function () { BY.ciudad = sc.value; BY.pag = 0; X.refrescar(); });
      var bq = el.querySelector('#bBy'); if (bq) bq.addEventListener('input', X.debounce(function () { BY.buscar = bq.value; BY.pag = 0; X.refrescar(); X.setFoco('#bBy'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { BY.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var x = (BY.lista || [])[Number(tr.getAttribute('data-fila'))]; if (x) detalleBDYango(x); }); });
    }
  });
  function detalleBDYango(x) {
    var g = D.cuentas && D.cuentas.get(X.idSeguro(x.id)), dato = function (t, v) { return '<div class="dato"><small>' + t + '</small><b>' + esc(v || '—') + '</b></div>'; };
    X.cajon(esc(x.nombre || 'Repartidor'), 'ID ' + esc(x.id) + ' · ' + esc(X.semanas.CIUDADES[x.ciudad] || '') + (x.registros > 1 ? ' · ' + entero(x.registros) + ' registros en BDYango (se muestra el último)' : ''),
      '<div class="rejilla r2 mb">' + dato('Estado en Yango', x.estadoYango) + dato('Fecha de registro', x.fecha) + dato('CI', x.ci) + dato('NIT', x.nit) +
        dato('Teléfono', x.telefono) + dato('Telegram', x.telegram ? '@' + x.telegram : '') + dato('Correo', x.correo) + dato('Especialista', x.especialista) +
        dato('Banco', x.bancoTexto) + dato('Cuenta', x.cuenta) + dato('Matrícula de Comercio', x.matricula) + dato('Caducidad del seguro', x.seguroVence) + '</div>' +
      (g && g.origen === 'manual' ? '<div class="aviso-caja">' + ic('ayuda') + '<div><b>Cuenta corregida a mano en CONTROL</b>La planilla usa ' + esc(nombreBanco(g)) + ' ' + esc(g.cuenta) + ', no la de BDYango.</div></div>' : ''));
  }

  /* ══════════ CÓDIGOS DE BANCO (cuadro con el que se arma la planilla) ══════════ */
  X.pagina('codigosBanco', {
    t: 'Códigos de banco', i: 'banco', orden: 5.5, sec: 'Operación',
    render: function () {
      var uso = {};
      ((D.bdyango && D.bdyango.lista) || []).forEach(function (x) { if (!x.cuenta || x.desconocido) return; var k = Number(x.forma) === 1 ? 'G' : String(x.entidad); uso[k] = (uso[k] || 0) + 1; });
      return X.titulo('Códigos de banco', 'Cuadro «Códigos de Banco para Envío vía ACH» con el que se arma la planilla del Banco Ganadero. Forma de pago 1 = cuenta del Banco Ganadero; 3 = transferencia ACH a otro banco con su código.') +
        '<div class="card">' + X.tabla([
          { t: 'Código', html: function (b) { return '<b class="num">' + esc(b[0] || '—') + '</b>'; } },
          { t: 'Nombre del banco', html: function (b) { return esc(b[1]); } },
          { t: 'Abreviación (como lo escriben)', html: function (b) { return esc(b[2] || '—'); } },
          { t: 'Forma de pago', clase: 'monto', html: function (b) { return '<b>' + b[3] + '</b>'; } },
          { t: 'Repartidores en BDYango', clase: 'monto', html: function (b, i) { var k = b[3] === 1 ? 'G' : String(b[0]); return b[2] === 'Yolo' || b[2] === 'Yape' ? '<span class="muted">incluido arriba</span>' : entero(uso[k] || 0); } }
        ], TABLA_BANCOS, { tam: 50 }) + '</div>';
    }
  });

  X.banco = {
    cargar: cargar, cargarBDYango: cargarBDYango, cuentaDe: cuentaDe, faltaEnCuenta: faltaEnCuenta, nombreBanco: nombreBanco, verCuentas: verCuentas, importarCuentas: importarCuentas,
    armar: armar, descargarBanco: descargarBanco, semanaPrincipal: semanaPrincipal, detalleExcel: detalleExcel, conciliar: conciliar,
    importarBDYango: importarBDYango,
    _puro: { bancoDe: bancoDe, filasBDYango: filasBDYango, leerGlosa: leerGlosa, glosa: glosa, semBanco: semBanco, serialExcel: serialExcel, rangoLargo: rangoLargo, numOTexto: numOTexto, cuentasDePlanilla: cuentasDePlanilla, filasBanco: filasBanco, leerExtracto: leerExtracto, cruzar: cruzar, ENC_BANCO: ENC_BANCO }
  };
})();
