/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — CONTAX y Sistema
   Clientes CONTAX (con sus accesos), Excepciones de pago, Equipo,
   Bitácora y Ayuda. Esto vive en el proyecto propio de CONTROL:
   los repartidores nunca lo ven.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, ic = X.ic, entero = X.entero;

  /* ══════════ CLIENTES CONTAX ══════════ */
  var CL = { buscar: '', ver: {}, pag: 0 };
  var CAMPOS_CLIENTE = [
    { k: 'idYango', t: 'ID de Yango', max: 30, obligatorio: true },
    { k: 'nombre', t: 'Nombre completo', max: 120, obligatorio: true },
    { k: 'celular', t: 'Celular', max: 20 },
    { k: 'nit', t: 'NIT', max: 20 },
    { k: 'usuarioSiat', t: 'Usuario SIAT', max: 80, auto: 'off' },
    { k: 'claveSiat', t: 'Contraseña SIAT', max: 80, auto: 'off' },
    { k: 'usuarioPortal', t: 'Usuario portal (Impuestos / otro)', max: 80, auto: 'off' },
    { k: 'clavePortal', t: 'Contraseña portal', max: 80, auto: 'off' },
    { k: 'estado', t: 'Estado', tipo: 'select', opciones: [['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']] },
    { k: 'notas', t: 'Notas', tipo: 'textarea', filas: 2, max: 500 }
  ];
  function filtrarClientes() {
    var b = X.normal(CL.buscar);
    return (D.clientes || []).filter(function (c) { return !b || (X.normal(c.nombre) + ' ' + c.idYango + ' ' + c.nit + ' ' + c.celular).indexOf(b) >= 0; })
      .sort(function (a, c) { return X.normal(a.nombre).localeCompare(X.normal(c.nombre)); });
  }
  function secreto(v, k) {
    if (!v) return '<span class="muted">—</span>';
    return '<span class="secreto"><code>' + esc(v) + '</code><button class="icono-btn" data-copiar="' + esc(v) + '" aria-label="Copiar">' + ic('copiar') + '</button></span>';
  }
  X.pagina('clientes', {
    t: 'Clientes CONTAX', i: 'cliente', sec: 'CONTAX',
    render: function () {
      var ed = X.puedeEditar();
      var cab = X.titulo('Clientes CONTAX', 'Repartidores a quienes CONTAX les emite la factura. Sus semanas aparecen como «CONTAX debe emitir» en Pagos.',
        (ed ? '<button class="btn sec" id="impCl">' + ic('subir') + 'Importar Excel</button><button class="btn" id="nuevoCl">' + ic('mas') + 'Nuevo cliente</button>' : '') + '<button class="btn sec" id="expCl">' + ic('descargar') + 'Excel</button>');
      if (!D.clientes) return cab + X.esqueleto(3);
      var l = filtrarClientes(), act = (D.clientes || []).filter(function (c) { return c.estado !== 'INACTIVO'; }).length;
      return cab +
        '<div class="rejilla r4 mb"><div class="kpi"><small>Clientes activos</small><b class="num">' + entero(act) + '</b><em>de ' + entero((D.clientes || []).length) + ' registrados</em></div>' +
          '<div class="kpi"><small>En el portal</small><b class="num">' + entero(D.repartidores ? X.lista().filter(function (r) { return X.clienteDe(r); }).length : 0) + '</b><em>coinciden con un repartidor</em></div></div>' +
        '<div class="aviso-caja">' + ic('candado') + '<div><b>Datos sensibles</b>Las contraseñas se ven completas para poder copiarlas. Solo las ve el equipo de CONTROL; los repartidores no tienen acceso a este proyecto.</div></div>' +
        '<div class="card"><div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bCl" placeholder="Buscar por nombre, ID, NIT o celular" value="' + esc(CL.buscar) + '"></div></div>' +
        (l.length ? X.tabla([
          { t: 'Cliente', html: function (c) { return '<b>' + esc(c.nombre) + '</b><span class="sub num">ID ' + esc(c.idYango) + (c.celular ? ' · ' + esc(X.telVisible(c.celular)) : '') + '</span>'; } },
          { t: 'NIT', html: function (c) { return secreto(c.nit); } },
          { t: 'SIAT', html: function (c) { return (c.usuarioSiat ? secreto(c.usuarioSiat) + '<br>' : '') + secreto(c.claveSiat); } },
          { t: 'Portal', html: function (c) { return (c.usuarioPortal ? secreto(c.usuarioPortal) + '<br>' : '') + secreto(c.clavePortal); } },
          { t: 'Estado', html: function (c) { return c.estado === 'INACTIVO' ? X.chip('neutro', 'Inactivo') : X.chip('contax', 'Activo'); } },
          { t: '', html: function (c) { return ed ? '<span class="fila-acc"><button class="icono-btn" data-ed="' + esc(c._id) + '" aria-label="Editar">' + ic('editar') + '</button><button class="icono-btn" data-bo="' + esc(c._id) + '" aria-label="Borrar">' + ic('borrar') + '</button></span>' : ''; } }
        ], l, { pag: CL.pag }) : X.vacio('Todavía no hay clientes CONTAX', 'Agrégalos uno por uno o importa el Excel de la hoja BDYANGO (columna CONTADOR = CONTAX).', 'marca/graficos/rel-equipo-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      var bq = el.querySelector('#bCl'); if (bq) bq.addEventListener('input', X.debounce(function () { CL.buscar = bq.value; CL.pag = 0; X.refrescar(); X.setFoco('#bCl'); }, 300));
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { CL.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      var n = el.querySelector('#nuevoCl'); if (n) n.addEventListener('click', function () { editarCliente(null); });
      el.querySelectorAll('[data-ed]').forEach(function (b) { b.addEventListener('click', function () { editarCliente(D.clientes.filter(function (c) { return c._id === b.getAttribute('data-ed'); })[0]); }); });
      el.querySelectorAll('[data-bo]').forEach(function (b) {
        b.addEventListener('click', function () {
          var c = D.clientes.filter(function (x) { return x._id === b.getAttribute('data-bo'); })[0];
          X.confirmar('Borrar cliente', '¿Borrar a <b>' + esc(c.nombre) + '</b> de Clientes CONTAX? Si solo dejó de ser cliente, mejor ponlo como Inactivo.', function () {
            X.dbC.collection('clientes').doc(c._id).delete().then(function () { D.clientes = D.clientes.filter(function (x) { return x._id !== c._id; }); X.bitacora('Borró cliente CONTAX', c.idYango + ' · ' + c.nombre); X.refrescar(); }, function () { X.aviso('No se pudo borrar.'); });
          }, 'Borrar', true);
        });
      });
      var e = el.querySelector('#expCl');
      if (e) e.addEventListener('click', function () {
        X.excel([{ nombre: 'Clientes CONTAX', filas: [['ID Yango', 'Nombre', 'Celular', 'NIT', 'Usuario SIAT', 'Contraseña SIAT', 'Usuario portal', 'Contraseña portal', 'Estado', 'Notas']].concat(filtrarClientes().map(function (c) {
          return [c.idYango, c.nombre, c.celular, c.nit, c.usuarioSiat, c.claveSiat, c.usuarioPortal, c.clavePortal, c.estado || 'ACTIVO', c.notas];
        })) }], 'Clientes-CONTAX-' + X.hoyISO());
      });
      var im = el.querySelector('#impCl'); if (im) im.addEventListener('click', importarClientes);
    }
  });
  function editarCliente(c) {
    var nuevo = !c; c = c ? Object.assign({}, c) : { estado: 'ACTIVO' };
    X.formulario(nuevo ? 'Nuevo cliente CONTAX' : 'Editar cliente', 'Se reconoce en el portal por el ID de Yango o por el celular.', CAMPOS_CLIENTE, c, function (v) {
      var id = v._id || X.idSeguro(v.idYango) || X.nuevoId(), datos = {};
      CAMPOS_CLIENTE.forEach(function (k) { datos[k.k] = v[k.k] == null ? '' : String(v[k.k]); });
      datos.actualizado = X.servidor(); datos.quien = S.usuario.email;
      return X.dbC.collection('clientes').doc(id).set(datos, { merge: true }).then(function () {
        datos._id = id; datos.actualizado = new Date();
        D.clientes = (D.clientes || []).filter(function (x) { return x._id !== id; }).concat([datos]);
        X.bitacora(nuevo ? 'Agregó cliente CONTAX' : 'Editó cliente CONTAX', datos.idYango + ' · ' + datos.nombre); X.refrescar();
      });
    });
  }
  function importarClientes() {
    X.ventana('Importar clientes CONTAX', 'Sube un Excel o CSV (por ejemplo, la hoja BDYANGO filtrada por CONTADOR = CONTAX).',
      '<div class="fm"><div class="fila"><label for="imArch">Archivo</label><input id="imArch" type="file" accept=".xlsx,.xls,.csv"></div><div id="imMapa"></div></div>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-ok disabled>Importar</button>', function (v, cerrar) {
        var filas, enc, ok = v.querySelector('[data-ok]'), mapa = v.querySelector('#imMapa');
        var CAMPOS = [['idYango', 'ID de Yango', /ID.*YANGO|^ID$|IDYANGO/], ['nombre', 'Nombre', /NOMBRE|CONDUCTOR|REPARTIDOR/], ['celular', 'Celular', /CEL|TELEF/], ['nit', 'NIT', /^NIT/], ['usuarioSiat', 'Usuario SIAT', /USUARIO.*SIAT/], ['claveSiat', 'Contraseña SIAT', /(CLAVE|CONTRAS).*SIAT/], ['usuarioPortal', 'Usuario portal', /USUARIO(?!.*SIAT)/], ['clavePortal', 'Contraseña portal', /(CLAVE|CONTRAS)(?!.*SIAT)/], ['estado', 'Estado', /ESTADO/], ['contador', 'Contador (solo los CONTAX)', /CONTADOR/]];
        v.querySelector('#imArch').addEventListener('change', function (e) {
          var a = e.target.files[0]; if (!a) return; mapa.innerHTML = X.anillo('Leyendo…');
          X.cargarXLSX().then(function (XL) {
            return a.arrayBuffer().then(function (buf) {
              var lb = XL.read(buf, { type: 'array' }), ws = lb.Sheets[lb.SheetNames[0]];
              var t = XL.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
              var i0 = 0; for (var i = 0; i < Math.min(t.length, 15); i++) { if (t[i].filter(function (c) { return /[a-z]/i.test(String(c)); }).length >= 3) { i0 = i; break; } }
              enc = t[i0].map(function (h) { return String(h).trim(); }); filas = t.slice(i0 + 1).filter(function (f) { return f.some(function (c) { return String(c).trim(); }); });
              mapa.innerHTML = '<p class="muted">' + entero(filas.length) + ' filas. Revisa cada columna:</p><div class="dos">' + CAMPOS.map(function (c) {
                var j = enc.findIndex(function (h) { return c[2].test(X.normal(h)); });
                return '<div class="fila"><label for="im_' + c[0] + '">' + c[1] + '</label><select id="im_' + c[0] + '"><option value="-1">(no usar)</option>' + enc.map(function (h, k) { return '<option value="' + k + '"' + (k === j ? ' selected' : '') + '>' + esc(h || 'Columna ' + (k + 1)) + '</option>'; }).join('') + '</select></div>';
              }).join('') + '</div>';
              ok.disabled = false;
            });
          }).catch(function (ex) { mapa.innerHTML = '<p class="login-err">' + esc(ex.message || 'No se pudo leer.') + '</p>'; });
        });
        ok.addEventListener('click', function () {
          var col = {}; CAMPOS.forEach(function (c) { col[c[0]] = Number(v.querySelector('#im_' + c[0]).value); });
          if (col.idYango < 0 || col.nombre < 0) { X.aviso('Elige al menos las columnas de ID y Nombre.'); return; }
          var val = function (f, k) { return col[k] >= 0 ? String(f[col[k]] == null ? '' : f[col[k]]).trim() : ''; };
          var usar = filas.filter(function (f) { return val(f, 'idYango') && (col.contador < 0 || /CONTAX/.test(X.normal(val(f, 'contador')))); });
          ok.disabled = true; ok.innerHTML = X.anilloBoton() + 'Importando ' + usar.length;
          var trozos = []; for (var i = 0; i < usar.length; i += 400) trozos.push(usar.slice(i, i + 400));
          trozos.reduce(function (p, tr) {
            return p.then(function () {
              var lote = X.dbC.batch();
              tr.forEach(function (f) {
                var d = { idYango: val(f, 'idYango'), nombre: val(f, 'nombre'), celular: val(f, 'celular'), nit: val(f, 'nit'), usuarioSiat: val(f, 'usuarioSiat'), claveSiat: val(f, 'claveSiat'),
                  usuarioPortal: val(f, 'usuarioPortal'), clavePortal: val(f, 'clavePortal'), estado: /INACT|BAJA/.test(X.normal(val(f, 'estado'))) ? 'INACTIVO' : 'ACTIVO', actualizado: X.servidor(), quien: S.usuario.email };
                lote.set(X.dbC.collection('clientes').doc(X.idSeguro(d.idYango)), d, { merge: true });
              });
              return lote.commit();
            });
          }, Promise.resolve()).then(function () {
            X.bitacora('Importó clientes CONTAX', usar.length + ' filas'); cerrar(); X.aviso(usar.length + ' clientes importados');
            return X.cargarControl().then(X.refrescar);
          }, function (e) { console.error(e); ok.disabled = false; ok.textContent = 'Importar'; X.aviso('No se pudo importar. Revisa tus permisos.'); });
        });
      });
  }

  /* ══════════ EXCEPCIONES ══════════ */
  function nuevaExcepcion(base) {
    var e = Object.assign({ activa: true, semana: '*', tipo: 'habilitar' }, base || {});
    X.formulario(e._id ? 'Editar excepción' : 'Nueva excepción de pago', 'La excepción hace que esas semanas cuenten como «listas para pagar» aunque falte la factura.', [
      { k: 'idYango', t: 'ID de Yango', max: 30, obligatorio: true },
      { k: 'nombre', t: 'Nombre (referencia)', max: 120 },
      { k: 'semana', t: 'Semana', max: 30, ayuda: 'Escribe la semana tal como aparece (por ejemplo SEM42G2026) o * para todas sus semanas.' },
      { k: 'tipo', t: 'Tipo', tipo: 'select', opciones: [['habilitar', 'Habilitar el pago sin factura'], ['contax', 'Factura pendiente de CONTAX (cliente)'], ['otro', 'Otro motivo']] },
      { k: 'motivo', t: 'Motivo', tipo: 'textarea', filas: 2, max: 300, obligatorio: true },
      { k: 'hasta', t: 'Vence el (opcional)', tipo: 'date' },
      { k: 'activa', t: 'Activa', tipo: 'switch' }
    ], e, function (v) {
      var id = v._id || X.nuevoId();
      var d = { idYango: String(v.idYango).trim(), nombre: v.nombre || '', semana: v.semana || '*', tipo: v.tipo, motivo: v.motivo, hasta: v.hasta || '', activa: !!v.activa, quien: S.usuario.email, actualizado: X.servidor() };
      if (!d.nombre && D.repartidores) { var r = D.repartidores.get(X.idSeguro(d.idYango)); if (r) d.nombre = r.nombre; }
      return X.dbC.collection('excepciones').doc(id).set(d, { merge: true }).then(function () {
        d._id = id; D.excepciones = (D.excepciones || []).filter(function (x) { return x._id !== id; }).concat([d]);
        X.bitacora(v._id ? 'Editó excepción' : 'Creó excepción', d.idYango + ' · ' + d.semana + ' · ' + d.motivo);
        X.ir('excepciones');
      });
    });
  }
  CTRL.nuevaExcepcion = nuevaExcepcion;
  X.pagina('excepciones', {
    t: 'Excepciones', i: 'excepcion', sec: 'CONTAX',
    render: function () {
      var cab = X.titulo('Excepciones de pago', 'Casos que se pagan aunque falte la factura (por ejemplo, la factura de un cliente CONTAX que no alcanzó a emitirse antes del corte).',
        X.puedeEditar() ? '<button class="btn" id="nuevaEx">' + ic('mas') + 'Nueva excepción</button>' : '');
      if (!D.excepciones) return cab + X.esqueleto(3);
      var hoy = X.hoyISO();
      // Las vencidas se apagan solas en pantalla
      D.excepciones.forEach(function (e) { if (e.activa && e.hasta && e.hasta < hoy) e.activa = false; });
      var l = D.excepciones.slice().sort(function (a, b) { return (b.activa - a.activa) || String(a.nombre).localeCompare(String(b.nombre)); });
      return cab + '<div class="card">' + (l.length ? X.tabla([
        { t: 'Repartidor', html: function (e) { return '<b>' + esc(e.nombre || '—') + '</b><span class="sub num">ID ' + esc(e.idYango) + '</span>'; } },
        { t: 'Semana', html: function (e) { return e.semana === '*' ? 'Todas' : esc(e.semana); } },
        { t: 'Tipo', html: function (e) { return X.chip(e.tipo === 'contax' ? 'contax' : 'neutro', { habilitar: 'Pago sin factura', contax: 'Pendiente de CONTAX', otro: 'Otro' }[e.tipo] || e.tipo); } },
        { t: 'Motivo', html: function (e) { return esc(e.motivo) + '<span class="sub">' + esc(e.quien || '') + (e.hasta ? ' · vence ' + X.fecha(e.hasta) : '') + '</span>'; } },
        { t: 'Estado', html: function (e) { return e.activa ? X.chip('ok', 'Activa') : X.chip('neutro', 'Inactiva'); } },
        { t: '', html: function (e) { return X.puedeEditar() ? '<span class="fila-acc"><button class="icono-btn" data-ed="' + esc(e._id) + '" aria-label="Editar">' + ic('editar') + '</button><button class="icono-btn" data-bo="' + esc(e._id) + '" aria-label="Borrar">' + ic('borrar') + '</button></span>' : ''; } }
      ], l, { tam: 200 }) : X.vacio('No hay excepciones', 'Cuando un pago se deba liberar sin factura, regístralo aquí.', 'marca/graficos/rel-vencimientos-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      var n = el.querySelector('#nuevaEx'); if (n) n.addEventListener('click', function () { nuevaExcepcion(); });
      el.querySelectorAll('[data-ed]').forEach(function (b) { b.addEventListener('click', function () { nuevaExcepcion(D.excepciones.filter(function (x) { return x._id === b.getAttribute('data-ed'); })[0]); }); });
      el.querySelectorAll('[data-bo]').forEach(function (b) {
        b.addEventListener('click', function () {
          var e = D.excepciones.filter(function (x) { return x._id === b.getAttribute('data-bo'); })[0];
          X.confirmar('Borrar excepción', '¿Borrar la excepción de <b>' + esc(e.nombre || e.idYango) + '</b>?', function () {
            X.dbC.collection('excepciones').doc(e._id).delete().then(function () { D.excepciones = D.excepciones.filter(function (x) { return x._id !== e._id; }); X.bitacora('Borró excepción', e.idYango + ' · ' + e.motivo); X.refrescar(); }, function () { X.aviso('No se pudo borrar.'); });
          }, 'Borrar', true);
        });
      });
    }
  });

  /* ══════════ EQUIPO (los usuarios vienen del Panel NUMMEROS) ══════════ */
  var EQ = { lista: null, error: '' };
  var CTRL_DEF = { admin: 'admin', supervisor: 'admin', editor: 'operador', cajero: 'lectura', lector: 'lectura' };
  var CTRL_TXT = { admin: 'Administrador', operador: 'Operador', lectura: 'Solo lectura' };
  var ROL_PANEL = { admin: 'Admin', supervisor: 'Supervisor', editor: 'Editor', cajero: 'Cajero', lector: 'Lector', agent: 'Agente (extensión)' };
  function rolControl(u) {
    if (!u || u.active !== true) return '';
    var s = u.sistemas && u.sistemas.control;
    if (s === 'ninguno') return '';
    if (s === 'admin' || s === 'operador' || s === 'lectura') return s;
    return CTRL_DEF[u.role] || '';
  }
  X.pagina('equipo', {
    t: 'Equipo', i: 'equipo', sec: 'Sistema', soloAdmin: true,
    render: function () {
      var cab = X.titulo('Equipo', 'Los usuarios son los mismos del Panel NUMMEROS (y del CRM). Se crean, se desactivan y se les da permiso en CONTROL desde el Panel.',
        '<a class="btn" href="' + esc(C.panelUrl) + '" target="_blank" rel="noopener">' + ic('equipo') + 'Abrir Panel → Usuarios</a>');
      var intro = '<div class="rejilla r2 mb"><div class="card"><div class="corte"><img class="relieve" src="marca/graficos/rel-seguridad-' + (S.oscuro ? 'oscuro' : 'claro') + '.png" alt="">' +
          '<div><b style="font:600 18px var(--display)">Un solo usuario para todo</b><p class="muted" style="margin:4px 0 0">Cada persona entra al Panel, al CRM y a CONTROL con el mismo correo y contraseña. En Panel → Usuarios, la columna <b>CONTROL</b> define si entra como Administrador, Operador, Solo lectura o sin acceso. Si se desactiva en el Panel, también deja de entrar aquí.</p></div></div></div>' +
        '<figure class="card" style="margin:0;padding:0;overflow:hidden;position:relative"><img src="marca/colaboracion/los-cuatro-oscuro.jpg" alt="Los tres clásicos y el Contador Virtual" style="display:block;width:100%;height:190px;object-fit:cover"><figcaption class="insignia" style="position:absolute;left:12px;bottom:12px"><i><img src="marca/logos/nummeros-isotipo-blanco.svg" alt=""></i>Pitágoras, Euclides y Arquímedes<span>con el Contador Virtual</span></figcaption></figure></div>';
      if (EQ.error) return cab + intro + '<div class="card">' + X.vacio('No se pudo leer la lista del Panel', esc(EQ.error)) + '</div>';
      if (!EQ.lista) return cab + intro + X.cargaBarra('Usuarios del Panel', 'Trayendo…');
      var l = EQ.lista.slice().sort(function (a, b) { return (rolControl(b) ? 1 : 0) - (rolControl(a) ? 1 : 0) || String(a.name || '').localeCompare(String(b.name || '')); });
      return cab + intro + '<div class="card">' + X.tabla([
        { t: 'Persona', html: function (u) { return '<b>' + esc(u.name || u.email) + '</b><span class="sub">' + esc(u.email || '') + '</span>'; } },
        { t: 'Rol en el Panel', html: function (u) { return esc(ROL_PANEL[u.role] || u.role || '—'); } },
        { t: 'En CONTROL', html: function (u) { var r = rolControl(u); return r ? X.chip(r === 'lectura' ? 'neutro' : 'ok', CTRL_TXT[r]) + ((u.sistemas && u.sistemas.control) ? '' : '<span class="sub">Automático por su rol</span>') : X.chip('neutro', 'Sin acceso'); } },
        { t: 'Estado', html: function (u) { return u.active ? X.chip('ok', 'Activo') : X.chip('neutro', 'Inactivo'); } }
      ], l, { tam: 200 }) + '</div>';
    },
    despues: function () {
      if (EQ.lista || EQ.error) return;
      if (!X.authPn.currentUser) { EQ.error = 'Sal y vuelve a entrar con tu usuario del Panel para ver la lista.'; X.refrescar(); return; }
      X.dbPn.collection('users').get().then(function (q) {
        EQ.lista = []; q.forEach(function (d) { var x = d.data(); x.uid = d.id; EQ.lista.push(x); });
        if (S.pagina === 'equipo') X.refrescar();
      }, function (e) { console.error(e); EQ.error = 'Tu rol del Panel no permite ver la lista de usuarios.'; if (S.pagina === 'equipo') X.refrescar(); });
    }
  });

  /* ══════════ BITÁCORA ══════════ */
  var BI = { lista: null };
  X.pagina('bitacora', {
    t: 'Bitácora', i: 'bitacora', sec: 'Sistema',
    render: function () {
      var cab = X.titulo('Bitácora', 'Quién hizo qué y cuándo (últimos 300 movimientos). No se puede editar ni borrar.', '<button class="btn sec" id="expBi">' + ic('descargar') + 'Excel</button>');
      if (!BI.lista) return cab + X.cargaBarra('Bitácora', 'Trayendo…');
      return cab + '<div class="card">' + (BI.lista.length ? X.tabla([
        { t: 'Cuándo', html: function (b) { return X.fechaHora(b.cuando); } },
        { t: 'Quién', html: function (b) { return esc(b.nombre || b.quien) + '<span class="sub">' + esc(b.quien) + '</span>'; } },
        { t: 'Qué', html: function (b) { return '<b>' + esc(b.que) + '</b><span class="sub">' + esc(b.detalle || '') + '</span>'; } }
      ], BI.lista, { tam: 100 }) : X.vacio('Todavía no hay movimientos', '', 'marca/graficos/rel-reportes-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      if (!BI.lista) X.dbC.collection('bitacora').orderBy('cuando', 'desc').limit(300).get().then(function (q) {
        BI.lista = []; q.forEach(function (d) { BI.lista.push(d.data()); }); if (S.pagina === 'bitacora') X.refrescar();
      }, function (e) { console.error(e); BI.lista = []; if (S.pagina === 'bitacora') X.refrescar(); });
      else setTimeout(function () { BI.lista = null; }, 60000);
      var b = el.querySelector('#expBi');
      if (b) b.addEventListener('click', function () { X.excel([{ nombre: 'Bitácora', filas: [['Cuándo', 'Correo', 'Nombre', 'Qué', 'Detalle']].concat((BI.lista || []).map(function (x) { return [X.fechaHora(x.cuando), x.quien, x.nombre, x.que, x.detalle]; })) }], 'Bitacora-' + X.hoyISO()); });
    }
  });

  /* ══════════ AYUDA ══════════ */
  X.pagina('ayuda', {
    t: 'Cómo funciona', i: 'ayuda', sec: 'Sistema',
    render: function () {
      var o = S.oscuro ? 'oscuro' : 'claro';
      var paso = function (img, t, d) { return '<div class="card"><div class="corte"><img class="relieve" src="marca/graficos/' + img + '-' + o + '.png" alt=""><div><b style="font:600 18px var(--display)">' + t + '</b><p class="muted" style="margin:4px 0 0">' + d + '</p></div></div></div>'; };
      return X.titulo('Cómo funciona CONTROL', 'El panel del equipo. El Portal es para los repartidores; CONTROL es para manejarlo todo.') +
        '<section class="portada" style="min-height:220px"><img class="foto" src="marca/colaboracion/pitagoras-muestra-sistema.jpg" alt="Pitágoras muestra el sistema al Contador Virtual de CONTAX">' +
          '<div class="txt"><h2>Una semana de pago</h2><p>De la planilla de Yango a la planilla del banco, sin cruzar hojas a mano.</p></div>' +
          '<div class="insignia"><i><img src="marca/logos/nummeros-isotipo-blanco.svg" alt=""></i>Pitágoras<span>muestra el sistema</span></div></section>' +
        '<img class="pasos-img mb" src="marca/graficos/pas-pasos-' + o + '.jpg" alt="Conocemos, diseñamos, probamos y acompañamos">' +
        '<div class="rejilla r2 mb">' +
          paso('rel-reportes', '1 · Llega la semana', 'Milthagor/Yango envía sus planillas. En Google Sheets se cargan a PPendientes como siempre; cada 15 minutos pasan solas al portal.') +
          paso('rel-app', '2 · El repartidor sube su factura', 'En el portal, en «Mis facturas», sube el PDF y marca las semanas. Corte: jueves 18:00.') +
          paso('rel-factura', '3 · CONTROL la revisa', 'En «Facturas» ves el PDF y si el importe cuadra. Apruebas u observas; el repartidor lo ve al instante. Puedes cruzar con el Excel de Impuestos.') +
          paso('rel-aprobado', '4 · Planilla de pago', 'En «Pagos» quedan separados los listos y los retenidos (regla todo o nada, con excepciones y clientes CONTAX). Descargas el Excel para el banco.') +
        '</div>' +
        '<div class="card mb"><div class="h2">Quién ve qué</div><div class="tabla"><table><thead><tr><th>Dato</th><th>Dónde vive</th><th>Lo ve el repartidor</th></tr></thead><tbody>' +
          '<tr><td>Pagos pendientes, historial, trámites</td><td>Google Sheets → Portal (cada 15 min)</td><td>Solo los suyos</td></tr>' +
          '<tr><td>Facturas subidas y su estado</td><td>Portal (al instante)</td><td>Solo las suyas</td></tr>' +
          '<tr><td>Anuncios, avisos, preguntas</td><td>Portal</td><td>Sí</td></tr>' +
          '<tr><td>Clientes CONTAX y contraseñas, excepciones, notas, bitácora</td><td>CONTROL (proyecto aparte)</td><td>Nunca</td></tr>' +
        '</tbody></table></div></div>' +
        '<div class="card mb"><div class="h2">NUMMEROS × CONTAX</div><div class="galeria">' +
          [['contrato-euclides-oscuro', 'Euclides'], ['apreton-arquimedes', 'Arquímedes'], ['pitagoras-saludo-oscuro', 'Pitágoras'], ['arquimedes-saludo-claro', 'Arquímedes'], ['apreton-brazos', 'NUMMEROS × CONTAX'], ['arquimedes-saludo-vertical', 'Arquímedes']].map(function (f) {
            return '<figure><img src="marca/colaboracion/' + f[0] + '.jpg" alt="' + esc(f[1]) + ' y el Contador Virtual de CONTAX" loading="lazy"><figcaption>' + esc(f[1]) + '</figcaption></figure>';
          }).join('') + '</div></div>' +
        '<div class="card"><div class="h2">Elementos de la marca</div><div class="elementos">' +
          ['ele-cifra-en-relieve', 'ele-etiquetas-por-rubro', 'ele-la-n-en-relieve-' + o, 'ele-boton-de-accion', 'ilu-factura-recibo', 'ilu-inventario'].map(function (f) { return '<img src="marca/graficos/' + f + '.png" alt="" loading="lazy">'; }).join('') +
        '</div><p class="muted" style="margin:14px 0 0">Portal de repartidores: <a href="' + esc(C.portalUrl) + '" target="_blank" rel="noopener">' + esc(C.portalUrl.replace('https://', '')) + '</a> · CONTROL v' + esc(C.version) + '</p></div>';
    }
  });
})();
