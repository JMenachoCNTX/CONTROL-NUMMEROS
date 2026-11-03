/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Base propia de repartidores («padron»)
   BDYango solo muestra a los activos: cuando Yango desactiva a alguien,
   sus datos desaparecen. Aquí se guarda a cada repartidor que pasó por
   BDYango o por el historial de pagos y NUNCA se borra: si deja de
   aparecer queda «inactivo» con la fecha de baja.
   El NIT se completa con el de las facturas ya aprobadas (historial) y
   se puede copiar al Portal («perfiles») para no pedírselo al repartidor.
   Se guarda en «padron» de CONTROL, en partes de 800 repartidores
   (campo «filas», texto JSON) para gastar pocas lecturas y escrituras.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D;
  var esc = X.esc, ic = X.ic, entero = X.entero;
  var TAM = 800, MINIMO = 1000; // BDYango casi vacía = error de lectura: no se marca a nadie como inactivo
  var CAMPOS = ['nombre', 'ci', 'nit', 'telefono', 'telegram', 'correo', 'ciudad', 'estadoYango', 'fecha', 'bancoTexto', 'cuenta', 'matricula', 'roe', 'seguroVence'];
  var P = { mapa: null, partes: {}, promesa: null, guardando: false };

  function col() { return X.dbC.collection('padron'); }
  function hoy() { return X.hoyISO(); }

  function cargar() {
    if (P.promesa) return P.promesa;
    P.promesa = col().get().then(function (q) {
      var m = {};
      q.forEach(function (d) {
        P.partes[d.id] = d.data().filas || '[]';
        try { JSON.parse(d.data().filas || '[]').forEach(function (x) { m[x.id] = x; }); } catch (e) { console.warn('padron ' + d.id, e); }
      });
      P.mapa = m; D.padron = m;
    }, function (e) { console.warn('Base propia:', e); P.mapa = null; P.error = e; });
    return P.promesa;
  }

  /* NIT del historial de pagos (facturas ya aprobadas): el más reciente de cada repartidor */
  function nitsHistorial() {
    var n = {};
    (D.hist || []).slice().sort(function (a, z) { return String(a.fecha).localeCompare(String(z.fecha)); }).forEach(function (h) {
      var nit = String(h.nit || '').replace(/\D/g, ''); if (nit.length >= 5 && nit.length <= 15) n[h.id] = { nit: nit, nombre: h.nombre };
    });
    // Razón social del emisor de las facturas aprobadas en el Portal (si coincide el NIT)
    (D.facturas || []).forEach(function (f) {
      var nit = String(f.nitEmisor || '').replace(/\D/g, ''), id = String(f.id || '');
      if (f.estado === 'aprobada' && id && nit.length >= 5 && f.razonEmisor) n[id] = { nit: nit, nombre: (n[id] || {}).nombre || f.nombre, razon: f.razonEmisor };
    });
    return n;
  }

  /* Une BDYango (todos = {id: fila}) con la base guardada y guarda solo las partes que cambiaron */
  function actualizar(todos) {
    if (todos && Object.keys(todos).length) P.ultimos = todos;
    if (!X.puedeEditar() || P.guardando) return Promise.resolve();
    return cargar().then(function () {
      if (!P.mapa) return;
      var m = P.mapa, f = hoy(), ids = Object.keys(todos || {}), completa = ids.length >= MINIMO;
      ids.forEach(function (id) {
        var b = todos[id], x = m[id] || (m[id] = { id: id, alta: f });
        CAMPOS.forEach(function (c) { if (b[c]) { if (c === 'nit' && x.nitOrigen === 'factura' && x.nit && x.nit !== b[c]) x.nitBDYango = b[c]; else x[c] = b[c]; } });
        if (b.nit && !x.nitOrigen) x.nitOrigen = 'bdyango';
        x.activo = true; x.visto = f; delete x.baja;
      });
      if (completa) Object.keys(m).forEach(function (id) { var x = m[id]; if (!todos[id] && x.activo !== false && x.visto) { x.activo = false; x.baja = f; } });
      var hn = nitsHistorial();
      Object.keys(hn).forEach(function (id) {
        var x = m[id] || (m[id] = { id: id, alta: f, activo: false, nombre: hn[id].nombre || '' });
        if (!x.nit) { x.nit = hn[id].nit; x.nitOrigen = 'factura'; }
        if (hn[id].razon && x.nit === hn[id].nit) x.razon = hn[id].razon;
        if (!x.nombre && hn[id].nombre) x.nombre = hn[id].nombre;
      });
      return guardar();
    }).catch(function (e) { console.warn('Base propia (guardar):', e); });
  }
  function guardar() {
    var l = Object.keys(P.mapa).sort().map(function (id) { return P.mapa[id]; }), ops = [], vistos = {};
    for (var i = 0; i * TAM < l.length; i++) {
      var id = 'p' + (i + 1), txt = JSON.stringify(l.slice(i * TAM, (i + 1) * TAM)); vistos[id] = 1;
      if (P.partes[id] !== txt) ops.push({ id: id, txt: txt, n: Math.min(TAM, l.length - i * TAM) });
    }
    if (!ops.length) return Promise.resolve();
    P.guardando = true;
    var lote = X.dbC.batch();
    ops.forEach(function (o) { lote.set(col().doc(o.id), { filas: o.txt, cantidad: o.n, actualizado: X.servidor(), quien: S.usuario.email }); });
    return lote.commit().then(function () { ops.forEach(function (o) { P.partes[o.id] = o.txt; }); }).then(function () { P.guardando = false; }, function (e) { P.guardando = false; throw e; });
  }

  function dato(id) { return P.mapa ? P.mapa[String(id)] || null : null; }

  /* ══════════ CAJÓN «BASE PROPIA» (desde DBYango) ══════════ */
  var V = { filtro: 'todos', buscar: '', pag: 0 };
  function ver() {
    var c = X.cajon('Base propia de repartidores', 'Todos los que pasaron por BDYango o por el historial de pagos. No se borra a nadie: los que Yango desactiva quedan como inactivos con sus datos.', X.cargaBarra('Base propia', 'Leyendo…'));
    cargar().then(function () {
      if (!P.mapa) { c.cuerpo.innerHTML = X.vacio('No se pudo leer la base propia', 'Falta publicar las reglas de CONTROL (colección «padron»).'); return; }
      pintar();
    });
    function lista() {
      var b = X.normal(V.buscar);
      return Object.keys(P.mapa).map(function (k) { return P.mapa[k]; }).filter(function (x) {
        if (V.filtro === 'activos' && x.activo === false) return false;
        if (V.filtro === 'inactivos' && x.activo !== false) return false;
        if (V.filtro === 'connit' && !x.nit) return false;
        return !b || (X.normal(x.nombre) + ' ' + x.id + ' ' + (x.ci || '') + ' ' + (x.nit || '') + ' ' + (x.telefono || '')).indexOf(b) >= 0;
      }).sort(function (a, z) { return X.normal(a.nombre).localeCompare(X.normal(z.nombre)); });
    }
    function pintar() {
      var t = Object.keys(P.mapa).map(function (k) { return P.mapa[k]; });
      var n = { todos: t.length, activos: t.filter(function (x) { return x.activo !== false; }).length, inactivos: t.filter(function (x) { return x.activo === false; }).length, connit: t.filter(function (x) { return x.nit; }).length };
      c.cuerpo.innerHTML = '<div class="herr">' + (X.puedeEditar() ? '<button class="btn" id="pdNit">' + ic('subir') + 'Pasar NIT al Portal</button>' : '') +
          '<button class="btn sec" id="pdExc">' + ic('descargar') + 'Excel</button></div>' +
        '<div class="pestanas">' + [['todos', 'Todos'], ['activos', 'En BDYango'], ['inactivos', 'Inactivos'], ['connit', 'Con NIT']].map(function (p) {
          return '<button aria-selected="' + (V.filtro === p[0]) + '" data-pd="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(n[p[0]]) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="pdBus" placeholder="Buscar por nombre, ID, CI, NIT o teléfono" value="' + esc(V.buscar) + '"></div></div><div id="pdRes"></div>';
      c.cuerpo.querySelectorAll('[data-pd]').forEach(function (b) { b.addEventListener('click', function () { V.filtro = b.getAttribute('data-pd'); V.pag = 0; pintar(); }); });
      var tm; c.cuerpo.querySelector('#pdBus').addEventListener('input', function () { var v = this.value; clearTimeout(tm); tm = setTimeout(function () { V.buscar = v; V.pag = 0; tabla(); }, 250); });
      c.cuerpo.querySelector('#pdExc').addEventListener('click', excel);
      var bn = c.cuerpo.querySelector('#pdNit'); if (bn) bn.addEventListener('click', pasarNit);
      tabla();
    }
    function tabla() {
      var l = lista(), caja = c.cuerpo.querySelector('#pdRes');
      caja.innerHTML = l.length ? '<div class="tabla-ancha">' + X.tabla([
        { t: 'Repartidor', html: function (x) { return '<b>' + esc(x.nombre || '—') + '</b><span class="sub num">ID ' + esc(x.id) + (x.ci ? ' · CI ' + esc(x.ci) : '') + '</span>'; } },
        { t: 'Estado', html: function (x) { return (x.activo === false ? X.chip('neutro', 'Inactivo') + '<span class="sub">desde ' + esc(X.fecha(x.baja) || '—') + '</span>' : X.chip('ok', 'En BDYango')); } },
        { t: 'NIT', html: function (x) { return x.nit ? '<span class="num">' + esc(x.nit) + '</span><span class="sub">' + (x.nitOrigen === 'factura' ? 'de sus facturas' : 'de BDYango') + '</span>' : '<span class="muted">—</span>'; } },
        { t: 'Contacto', html: function (x) { return '<span class="num">' + esc(x.telefono || '—') + '</span><span class="sub">' + esc(X.semanas.CIUDADES[x.ciudad] || '') + '</span>'; } },
        { t: 'Banco', html: function (x) { return x.cuenta ? esc(x.bancoTexto || '') + '<span class="sub num">' + esc(x.cuenta) + '</span>' : '<span class="muted">—</span>'; } }
      ], l, { tam: 100, pag: V.pag }) + '</div>' : X.vacio('Nadie con ese filtro', '');
      caja.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { V.pag = Number(b.getAttribute('data-pag')); tabla(); }); });
    }
    function excel() {
      X.excel([{ nombre: 'Base propia', filas: [['ID Yango', 'Nombre', 'CI', 'NIT', 'Origen NIT', 'Razón social', 'Teléfono', 'Telegram', 'Correo', 'Ciudad', 'Estado Yango', 'Banco', 'Cuenta', 'En BDYango', 'Alta', 'Última vez visto', 'Baja']].concat(lista().map(function (x) {
        return [x.id, x.nombre || '', x.ci || '', x.nit || '', x.nitOrigen === 'factura' ? 'Facturas' : x.nit ? 'BDYango' : '', x.razon || '', x.telefono || '', x.telegram || '', x.correo || '', X.semanas.CIUDADES[x.ciudad] || '', x.estadoYango || '',
          x.bancoTexto || '', x.cuenta || '', x.activo === false ? 'NO' : 'SÍ', x.alta || '', x.visto || '', x.baja || ''];
      })) }], 'Base-propia-repartidores-' + hoy());
    }
  }

  /* Copia el NIT conocido a «perfiles» del Portal de los que tienen cuenta y todavía no lo registraron.
     No pisa a nadie: solo crea perfiles que no existen. */
  function pasarNit() {
    if (!X.puedeEditar()) return;
    X.aviso('Revisando quién ya tiene NIT en el Portal…');
    actualizar(P.ultimos || {}).then(function () { return X.dbP.collection('perfiles').get(); }).then(function (q) {
      var ya = {}; q.forEach(function (d) { ya[d.id] = 1; });
      var l = Object.keys(P.mapa).map(function (k) { return P.mapa[k]; }).filter(function (x) {
        var uid = X.idSeguro(x.id), r = D.repartidores && D.repartidores.get(uid);
        return x.nit && /^\d{5,15}$/.test(x.nit) && r && !r.sinCuenta && !ya[uid] && (x.razon || x.nombre);
      });
      if (!l.length) { X.aviso('Todos los repartidores con NIT conocido ya lo tienen en el Portal.'); return; }
      X.confirmar('Pasar NIT al Portal', entero(l.length) + ' repartidores con cuenta en el Portal todavía no registraron su NIT, y lo conocemos por sus facturas o BDYango. ' +
        'Se les guarda ese NIT y su razón social para que el Portal no se los pida. A los ' + entero(Object.keys(ya).length) + ' que ya lo registraron no se los toca.', function () {
        var ops = l.map(function (x) {
          return { tipo: 'set', ref: X.dbP.collection('perfiles').doc(X.idSeguro(x.id)),
            datos: { nit: x.nit, razonSocial: String(x.razon || x.nombre).trim().slice(0, 160), creado: X.servidor(), origen: 'historial', quien: S.usuario.email } };
        });
        X.semanas.escribir(ops).then(function () {
          X.bitacora('Pasó NIT al Portal', entero(ops.length) + ' repartidores');
          X.aviso('Listo: ' + entero(ops.length) + ' repartidores ya tienen su NIT en el Portal.');
        }, function (e) { console.error(e); X.aviso('No se pudo guardar. Revisa tus permisos.'); });
      }, 'Pasar NIT');
    }, function (e) { console.error(e); X.aviso('No se pudo leer «perfiles» del Portal.'); });
  }

  X.padron = { cargar: cargar, actualizar: actualizar, dato: dato, ver: ver, _puro: { nitsHistorial: nitsHistorial } };
})();
