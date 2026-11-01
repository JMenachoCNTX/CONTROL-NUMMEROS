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

  /* ══════════ CLIENTES CONTAX ══════════
     Son los clientes «Activos» de Panel NUMMEROS → Clientes (colección `bdclientes` de crm-contax).
     Se editan en el Panel; aquí solo se ven, y se reconoce cuáles son repartidores de Yango
     (por NIT o celular, cruzando con BDYango y el portal). */
  var CL = { buscar: '', filtro: 'todos', pag: 0 };
  var cargandoPanel = null;
  function cargarPanelClientes(forzar) {
    if (cargandoPanel && !forzar) return cargandoPanel;
    if (forzar) D.panelClientes = null;
    cargandoPanel = X.dbPn.collection('bdclientes').get().then(function (q) {
      var l = [];
      q.forEach(function (d) { if (d.id === '_meta') return; var x = d.data(); x._id = d.id; l.push(x); });
      D.panelClientes = { lista: l, leido: new Date() };
    }, function (e) { console.warn('Clientes del Panel:', e); D.panelClientes = { lista: [], error: 'No se pudo leer la base de clientes del Panel. Revisa que tu usuario del Panel tenga permiso para ver Clientes.' }; })
      .then(function () { if (S.pagina === 'clientes') X.refrescar(); });
    return cargandoPanel;
  }
  // Valor de una columna de BDCONTAX aunque el título tenga número adelante («2. NIT»)
  function pv(x, titulo) {
    var t = X.normal(titulo);
    for (var k in x) if (X.normal(String(k).replace(/^\s*\d+\s*[.\-)]\s*/, '')) === t) return String(x[k] == null ? '' : x[k]).trim();
    return '';
  }
  var digitos = function (v, n) { var d = String(v || '').replace(/\D/g, ''); return n ? d.slice(-n) : d; };
  function activosPanel() {
    var P = D.panelClientes; if (!P || !P.lista) return [];
    var porNit = {}, porCel = {};
    ((D.bdyango && D.bdyango.lista) || []).forEach(function (y) { if (y.nit) porNit[digitos(y.nit)] = y; if (y.telefono) porCel[digitos(y.telefono, 8)] = porCel[digitos(y.telefono, 8)] || y; });
    if (D.repartidores) X.lista().forEach(function (r) { var c = digitos(r.celular, 8); if (c) porCel[c] = r; });
    return P.lista.filter(function (x) { return X.normal(pv(x, 'Estado Usuario')) === 'ACTIVO'; }).map(function (x) {
      var c = { x: x, nombre: pv(x, 'NOMBRE') || pv(x, 'Nombre o Razón Social'), codigo: pv(x, 'Codigo de ID'), nit: pv(x, 'NIT'), ci: pv(x, 'C.I.'), celular: pv(x, 'Celular'),
        usuario: pv(x, 'Usuario'), clave: pv(x, 'Contraseña'), claveSiat: pv(x, 'Contraseña SIAT'), brinda: pv(x, 'Brinda Servicios A'), costo: pv(x, 'Costo Servicio Mensual') };
      var y = (c.nit && porNit[digitos(c.nit)]) || (digitos(c.celular, 8).length === 8 && porCel[digitos(c.celular, 8)]);
      c.idYango = y ? String(y.id) : '';
      return c;
    });
  }
  function filtrarClientes(l) {
    var b = X.normal(CL.buscar);
    return l.filter(function (c) {
      if (CL.filtro === 'yango' && !c.idYango) return false;
      if (CL.filtro === 'otros' && c.idYango) return false;
      return !b || (X.normal(c.nombre) + ' ' + c.codigo + ' ' + c.nit + ' ' + c.ci + ' ' + c.celular + ' ' + c.idYango + ' ' + X.normal(c.brinda)).indexOf(b) >= 0;
    }).sort(function (a, c) { return X.normal(a.nombre).localeCompare(X.normal(c.nombre)); });
  }
  function secreto(v) {
    if (!v) return '<span class="muted">—</span>';
    return '<span class="secreto"><code>' + esc(v) + '</code><button class="icono-btn" data-copiar="' + esc(v) + '" aria-label="Copiar">' + ic('copiar') + '</button></span>';
  }
  X.pagina('clientes', {
    t: 'Clientes CONTAX', i: 'cliente', sec: 'CONTAX',
    render: function () {
      var P = D.panelClientes;
      var cab = X.titulo('Clientes CONTAX', 'Los clientes «Activos» de Panel NUMMEROS → Clientes' + (P && P.leido ? ' · leídos ' + X.hace(P.leido) : '') + '. Se agregan y corrigen en el Panel; aquí se ven y se marca quiénes son repartidores de Yango.',
        '<a class="btn sec" href="' + esc(C.panelUrl) + '" target="_blank" rel="noopener">' + ic('cliente') + 'Abrir el Panel</a><button class="btn sec" id="recCl">' + ic('recargar') + 'Leer de nuevo</button><button class="btn sec" id="expCl">' + ic('descargar') + 'Excel</button>');
      if (!P) return cab + '<div class="card">' + X.cargaBarra('Clientes', 'Leyendo los clientes del Panel…') + '</div>';
      if (P.error) return cab + '<div class="card">' + X.vacio('No se pudo leer', P.error) + '</div>';
      var todos = activosPanel(), l = filtrarClientes(todos); CL.lista = l;
      var n = { todos: todos.length, yango: todos.filter(function (c) { return c.idYango; }).length };
      n.otros = n.todos - n.yango;
      return cab +
        '<div class="aviso-caja mb">' + ic('candado') + '<div><b>Datos sensibles</b>Las contraseñas se ven completas para poder copiarlas. Solo las ve el equipo; los repartidores no tienen acceso.</div></div>' +
        '<div class="card"><div class="pestanas" role="tablist">' + [['todos', 'Activos'], ['yango', 'Son repartidores de Yango'], ['otros', 'No están en Yango']].map(function (p) {
          return '<button role="tab" aria-selected="' + (CL.filtro === p[0]) + '" data-fcl="' + p[0] + '">' + p[1] + ' <em class="num">' + entero(n[p[0]]) + '</em></button>';
        }).join('') + '</div>' +
        '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bCl" placeholder="Buscar por nombre, código, NIT, CI, celular o ID de Yango" value="' + esc(CL.buscar) + '"></div></div>' +
        (l.length ? X.tabla([
          { t: 'Cliente', html: function (c) { return '<b>' + esc(c.nombre || 'Sin nombre') + '</b><span class="sub num">' + (c.codigo ? 'Código ' + esc(c.codigo) : '') + (c.celular ? ' · ' + esc(c.celular) : '') + '</span>'; } },
          { t: 'NIT', html: function (c) { return secreto(c.nit); } },
          { t: 'Accesos SIAT', html: function (c) { return (c.usuario ? secreto(c.usuario) + '<br>' : '') + secreto(c.claveSiat || c.clave); } },
          { t: 'Trabaja para', html: function (c) { return esc(c.brinda || '—'); } },
          { t: 'Yango', html: function (c) { return c.idYango ? X.chip('contax', 'ID ' + c.idYango) : '<span class="muted">—</span>'; } }
        ], l, { clic: true, pag: CL.pag }) : X.vacio('Nadie con este filtro')) + '</div>';
    },
    despues: function (el) {
      if (!D.panelClientes) cargarPanelClientes();
      var bq = el.querySelector('#bCl'); if (bq) bq.addEventListener('input', X.debounce(function () { CL.buscar = bq.value; CL.pag = 0; X.refrescar(); X.setFoco('#bCl'); }, 300));
      el.querySelectorAll('[data-fcl]').forEach(function (b) { b.addEventListener('click', function () { CL.filtro = b.getAttribute('data-fcl'); CL.pag = 0; X.refrescar(); }); });
      el.querySelectorAll('[data-pag]').forEach(function (b) { b.addEventListener('click', function () { CL.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
      var rc = el.querySelector('#recCl'); if (rc) rc.addEventListener('click', function () { cargarPanelClientes(true); X.refrescar(); });
      el.querySelectorAll('tr[data-fila]').forEach(function (tr) { tr.addEventListener('click', function () { var c = (CL.lista || [])[Number(tr.getAttribute('data-fila'))]; if (c) fichaCliente(c); }); });
      var e = el.querySelector('#expCl');
      if (e) e.addEventListener('click', function () {
        X.excel([{ nombre: 'Clientes CONTAX', filas: [['Código', 'Nombre', 'NIT', 'CI', 'Celular', 'Usuario', 'Contraseña', 'Contraseña SIAT', 'Trabaja para', 'Costo mensual', 'ID Yango']].concat((CL.lista || []).map(function (c) {
          return [c.codigo, c.nombre, c.nit, c.ci, c.celular, c.usuario, c.clave, c.claveSiat, c.brinda, c.costo, c.idYango];
        })) }], 'Clientes-CONTAX-' + X.hoyISO());
      });
    }
  });
  function fichaCliente(c) {
    var x = c.x, html = '<div class="datos">' + Object.keys(x).filter(function (k) { return k.charAt(0) !== '_' && String(x[k] == null ? '' : x[k]).trim(); })
      .sort(function (a, b) { return (parseInt(a, 10) || 99) - (parseInt(b, 10) || 99); })
      .map(function (k) { var t = k.replace(/^\s*\d+\s*[.\-)]\s*/, ''); return '<div class="dato"><small>' + esc(t) + '</small>' + (/contrase|usuario|nit/i.test(t) ? secreto(String(x[k])) : '<b>' + esc(x[k]) + '</b>') + '</div>'; }).join('') + '</div>' +
      (c.idYango ? '<button class="btn" id="clInf">' + ic('persona') + 'Ver informe del repartidor (ID ' + esc(c.idYango) + ')</button>' : '');
    X.cajon(esc(c.nombre || 'Cliente'), 'Cliente activo de CONTAX · datos del Panel NUMMEROS', html, function (cu, cerrar) {
      var b = cu.querySelector('#clInf'); if (b) b.addEventListener('click', function () { cerrar(); X.informe.abrir(c.idYango); });
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
