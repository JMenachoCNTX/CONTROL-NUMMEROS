/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Lo que ven los repartidores en el portal
   Anuncios (carrusel), Avisos (ventanas al entrar), Preguntas,
   Notificaciones al celular y Chats del asistente.
   Todo se guarda en el documento publico/contenido del Portal:
   los cambios se ven al instante (las imágenes nuevas en ~15 min,
   cuando la sincronización las publica en GitHub).
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D, C = X.C;
  var esc = X.esc, ic = X.ic, entero = X.entero;
  var previas = {};

  var TIPOS = [['INFO', 'Información'], ['IMPORTANTE', 'Importante'], ['URGENTE', 'Urgente']];
  var FRECUENCIAS = [['UNA VEZ', 'Una sola vez'], ['CADA INGRESO', 'Cada vez que entra'], ['HASTA QUE CONFIRME', 'Hasta que presione «Entendido»']];
  var PARA = [['TODOS', 'Todos'], ['NO HABILITADOS', 'No habilitados por la app'], ['SIN POLIZA', 'Sin póliza presentada'], ['CON PENDIENTES', 'Con pagos pendientes'], ['IDS', 'IDs específicos']];
  var LINKS = [['inicio', 'Inicio'], ['pendientes', 'Pendientes'], ['facturas', 'Mis facturas'], ['historial', 'Historial'], ['tramites', 'Mis trámites'], ['reporte', 'Reporte']];
  function nombreDe(l, v) { for (var i = 0; i < l.length; i++) if (l[i][0] === v) return l[i][1]; return v || ''; }
  function lista(k) { D.contenido = D.contenido || {}; D.contenido[k] = D.contenido[k] || []; return D.contenido[k]; }
  function fechaCorta(iso) { if (!iso) return ''; var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function vigente(it) { var h = X.hoyISO(); return it.activo !== false && (!it.desde || it.desde <= h) && (!it.hasta || it.hasta >= h); }
  function vigencia(it) {
    if (it.desde && it.hasta) return 'Del ' + fechaCorta(it.desde) + ' al ' + fechaCorta(it.hasta);
    if (it.desde) return 'Desde el ' + fechaCorta(it.desde);
    if (it.hasta) return 'Hasta el ' + fechaCorta(it.hasta);
    return 'Sin fecha límite';
  }
  function estadoItem(it) {
    if (it.activo === false) return X.chip('neutro', 'Apagado');
    if (!vigente(it)) return X.chip('pend', 'Fuera de fecha');
    return X.chip('ok', 'Publicado');
  }
  function urlImagen(it) {
    var m = String(it.fuente || '').match(/^subida:(.+)$/);
    if (it.imagen) return /^https?:/.test(it.imagen) ? it.imagen : C.portalUrl + '/' + it.imagen;
    if (m && previas[m[1]]) return previas[m[1]];
    if (/^https:\/\//.test(it.fuente || '')) return it.fuente;
    return '';
  }
  function sinPortal() { return !S.portalUsuario ? '<div class="card">' + X.vacio('Conecta el Portal para editar lo que ven los repartidores', 'Usa el botón «Conectar» de arriba.') + '</div>' : ''; }
  function soloLectura() { return X.puedeEditar() ? '' : '<div class="aviso-caja">' + ic('candado') + '<div><b>Solo lectura</b>Tu rol permite ver, no editar.</div></div>'; }

  /* Trae la versión más reciente antes de editar (por si alguien más cambió algo) */
  function recargar() { return X.cargarContenido(); }
  function guardar(k, msg, detalle) {
    var cambio = {}; cambio[k] = lista(k); cambio.actualizado = X.servidor();
    return X.dbP.collection('publico').doc('contenido').set(cambio, { merge: true }).then(function () {
      X.aviso(msg); X.bitacora(msg, detalle || '');
    });
  }
  function achicar(archivo) {
    return new Promise(function (ok, mal) {
      if (!archivo) return ok(null);
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () {
        var max = 1400, w = img.naturalWidth, h = img.naturalHeight;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
        var datos = cv.toDataURL('image/webp', .85);
        if (datos.indexOf('data:image/webp') !== 0) datos = cv.toDataURL('image/jpeg', .86);
        var q = .8; while (datos.length > 900000 && q > .4) { datos = cv.toDataURL(datos.indexOf('webp') > 0 ? 'image/webp' : 'image/jpeg', q); q -= .1; }
        if (datos.length > 900000) return mal(new Error('La imagen es demasiado grande.'));
        ok(datos);
      };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('Ese archivo no es una imagen.')); };
      img.src = url;
    });
  }
  function subirImagen(archivo) {
    return achicar(archivo).then(function (datos) {
      if (!datos) return null;
      var id = X.nuevoId(); previas[id] = datos;
      return X.dbP.collection('imagenes').doc(id).set({ datos: datos, tipo: datos.slice(5, datos.indexOf(';')), nombre: String(archivo.name || '').slice(0, 120), fecha: X.servidor() })
        .then(function () { return 'subida:' + id; });
    });
  }
  function encolarNotif(n) {
    return X.dbP.collection('colaNotif').add({
      titulo: String(n.titulo || '').slice(0, 80), cuerpo: String(n.cuerpo || '').slice(0, 240), paraQuien: n.paraQuien || 'TODOS', ids: n.ids || '',
      link: n.link || 'inicio', estado: 'pendiente', creado: X.servidor(), quien: S.usuario.email
    }).then(function () { X.aviso('Notificación en cola: sale en los próximos 15 minutos.'); X.bitacora('Notificación encolada', n.titulo); });
  }
  function textoPlano(t) { return String(t || '').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' ').trim(); }
  function enlazar(el, sel, fn) { el.querySelectorAll(sel).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); fn(b.getAttribute('data-id'), b); }); }); }
  function mover(k, id, paso) {
    var l = lista(k).slice().sort(function (a, b) { return (a.orden || 999) - (b.orden || 999); });
    var i = l.findIndex(function (x) { return x.id === id; }), j = i + paso;
    if (i < 0 || j < 0 || j >= l.length) return;
    var t = l[i]; l[i] = l[j]; l[j] = t; l.forEach(function (x, n) { x.orden = n + 1; });
    D.contenido[k] = l; guardar(k, 'Orden guardado').then(X.refrescar);
  }
  function borrar(k, id, nombre) {
    X.confirmar('Borrar', '¿Seguro que quieres borrar «' + esc(nombre) + '»? Dejará de verse en el portal.', function () {
      recargar().then(function () { D.contenido[k] = lista(k).filter(function (x) { return x.id !== id; }); return guardar(k, 'Borrado', nombre); }).then(X.refrescar, function () { X.aviso('No se pudo borrar.'); });
    }, 'Borrar', true);
  }

  /* ══════════ ANUNCIOS ══════════ */
  X.pagina('anuncios', {
    t: 'Anuncios', i: 'imagen', sec: 'Portal de repartidores',
    render: function () {
      var cab = X.titulo('Anuncios', 'Las imágenes del carrusel en el inicio del portal.', X.puedeEditar() ? '<button class="btn" id="nuevoAn">' + ic('mas') + 'Nuevo anuncio</button>' : '');
      if (!S.portalUsuario) return cab + sinPortal();
      if (!D.contenido) return cab + X.esqueleto(3);
      var l = lista('anuncios').slice().sort(function (a, b) { return (a.orden || 999) - (b.orden || 999); });
      return cab + soloLectura() + '<div class="card">' + (l.length ? X.tabla([
        { t: 'Imagen', html: function (a) { var u = urlImagen(a); return u ? '<img class="miniatura" src="' + esc(u) + '" alt="">' : '<span class="muted">Procesando…</span>'; } },
        { t: 'Título', html: function (a) { return '<b>' + esc(a.titulo || 'Sin título') + '</b>' + (a.link ? '<span class="sub">' + esc(a.link) + '</span>' : ''); } },
        { t: 'Vigencia', html: function (a) { return esc(vigencia(a)); } },
        { t: 'Estado', html: estadoItem },
        { t: '', html: function (a) { return X.puedeEditar() ? '<span class="fila-acc"><button class="icono-btn" data-sube data-id="' + a.id + '" aria-label="Subir">↑</button><button class="icono-btn" data-baja data-id="' + a.id + '" aria-label="Bajar">↓</button><button class="icono-btn" data-ed data-id="' + a.id + '" aria-label="Editar">' + ic('editar') + '</button><button class="icono-btn" data-bo data-id="' + a.id + '" aria-label="Borrar">' + ic('borrar') + '</button></span>' : ''; } }
      ], l, { tam: 100 }) : X.vacio('Todavía no hay anuncios', 'Crea el primero con «Nuevo anuncio».', 'marca/graficos/ilu-ventas-celular.png')) + '</div>';
    },
    despues: function (el) {
      var b = el.querySelector('#nuevoAn'); if (b) b.addEventListener('click', function () { editarAnuncio(null); });
      enlazar(el, '[data-ed]', function (id) { editarAnuncio(lista('anuncios').filter(function (x) { return x.id === id; })[0]); });
      enlazar(el, '[data-bo]', function (id) { var a = lista('anuncios').filter(function (x) { return x.id === id; })[0]; borrar('anuncios', id, a ? a.titulo : ''); });
      enlazar(el, '[data-sube]', function (id) { mover('anuncios', id, -1); });
      enlazar(el, '[data-baja]', function (id) { mover('anuncios', id, 1); });
    }
  });
  function editarAnuncio(it) {
    var nuevo = !it;
    it = it ? Object.assign({}, it) : { id: X.nuevoId(), activo: true, orden: lista('anuncios').length + 1 };
    var u = urlImagen(it);
    X.formulario(nuevo ? 'Nuevo anuncio' : 'Editar anuncio', 'Imagen horizontal; se achica sola si pesa mucho.', [
      { k: 'archivo', t: nuevo ? 'Imagen' : 'Cambiar imagen (opcional)', tipo: 'archivo', accept: 'image/*', previa: u ? '<img src="' + esc(u) + '" alt="" style="max-height:120px;border-radius:10px">' : '' },
      { k: 'titulo', t: 'Título (para ti y para lectores de pantalla)', max: 80, obligatorio: true },
      { k: 'link', t: 'Link al tocar la imagen (opcional)', ph: 'https://wa.me/59169021969' },
      { k: 'desde', t: 'Mostrar desde (opcional)', tipo: 'date' },
      { k: 'hasta', t: 'Mostrar hasta (opcional)', tipo: 'date' },
      { k: 'activo', t: 'Publicado', tipo: 'switch' }
    ], it, function (v) {
      if (nuevo && !v.archivo) throw new Error('Elige la imagen.');
      var archivo = v.archivo; delete v.archivo;
      if (v.link && !/^https?:\/\//i.test(v.link)) v.link = 'https://' + v.link;
      return subirImagen(archivo).then(function (f) {
        if (f) { v.fuente = f; v.imagen = ''; }
        return recargar();
      }).then(function () {
        var l = lista('anuncios'), i = l.findIndex(function (x) { return x.id === v.id; });
        if (i >= 0) l[i] = v; else l.push(v);
        return guardar('anuncios', nuevo ? 'Anuncio creado' : 'Anuncio guardado', v.titulo);
      }).then(X.refrescar);
    });
  }

  /* ══════════ AVISOS ══════════ */
  X.pagina('avisos', {
    t: 'Avisos', i: 'megafono', sec: 'Portal de repartidores',
    render: function () {
      var cab = X.titulo('Avisos', 'Las ventanas que aparecen al entrar al portal. Se ven al instante.', X.puedeEditar() ? '<button class="btn" id="nuevoAv">' + ic('mas') + 'Nuevo aviso</button>' : '');
      if (!S.portalUsuario) return cab + sinPortal();
      if (!D.contenido) return cab + X.esqueleto(3);
      var l = lista('avisos');
      return cab + soloLectura() + '<div class="card">' + (l.length ? X.tabla([
        { t: 'Aviso', html: function (a) { return '<b>' + esc(a.titulo || 'Sin título') + '</b><span class="sub">' + esc(textoPlano(a.mensaje).slice(0, 140)) + '</span>'; } },
        { t: 'Tipo', html: function (a) { return X.chip(a.tipo === 'URGENTE' ? 'mal' : a.tipo === 'IMPORTANTE' ? 'pend' : 'neutro', nombreDe(TIPOS, a.tipo)) + '<span class="sub">' + esc(nombreDe(FRECUENCIAS, a.frecuencia)) + '</span>'; } },
        { t: 'Para', html: function (a) { return esc(a.paraQuien === 'IDS' ? String(a.ids || '').split(/[,;\s]+/).filter(Boolean).length + ' IDs' : nombreDe(PARA, a.paraQuien)); } },
        { t: 'Vigencia', html: function (a) { return esc(vigencia(a)) + '<span class="sub">' + estadoItem(a) + '</span>'; } },
        { t: 'Lecturas', html: function (a) { return a.frecuencia !== 'CADA INGRESO' ? '<span class="fila-acc"><button class="btn sec chico" data-lec data-id="' + a.id + '">Contar</button><button class="btn sec chico" data-bl data-id="' + a.id + '" aria-label="Descargar quién lo leyó">' + ic('descargar') + 'Quiénes</button></span>' : '<span class="muted">—</span>'; } },
        { t: '', html: function (a) { return X.puedeEditar() ? '<span class="fila-acc"><button class="icono-btn" data-ed data-id="' + a.id + '" aria-label="Editar">' + ic('editar') + '</button><button class="icono-btn" data-cp data-id="' + a.id + '" aria-label="Duplicar">' + ic('copiar') + '</button><button class="icono-btn" data-bo data-id="' + a.id + '" aria-label="Borrar">' + ic('borrar') + '</button></span>' : ''; } }
      ], l, { tam: 100 }) : X.vacio('Todavía no hay avisos', 'Crea el primero con «Nuevo aviso».', 'marca/graficos/rel-app-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      var b = el.querySelector('#nuevoAv'); if (b) b.addEventListener('click', function () { editarAviso(null); });
      var de = function (id) { return lista('avisos').filter(function (x) { return x.id === id; })[0]; };
      enlazar(el, '[data-ed]', function (id) { editarAviso(de(id)); });
      enlazar(el, '[data-cp]', function (id) { editarAviso(de(id), true); });
      enlazar(el, '[data-bo]', function (id) { var a = de(id); borrar('avisos', id, a ? a.titulo : ''); });
      enlazar(el, '[data-lec]', function (id, btn) {
        var a = de(id); btn.innerHTML = X.anilloBoton();
        var q = X.dbP.collectionGroup('lecturas').where('codigo', '==', a.codigo);
        (q.count ? q.count().get().then(function (r) { return r.data().count; }) : q.get().then(function (r) { return r.size; })).then(function (n) {
          btn.outerHTML = '<span class="num"><b>' + entero(n) + '</b> lo leyeron</span>';
        }, function (e) { console.error(e); btn.textContent = 'No se pudo'; });
      });
      // Lista de quién leyó el aviso (lo que antes se descargaba desde el portal)
      enlazar(el, '[data-bl]', function (id, btn) {
        var a = de(id); btn.disabled = true;
        X.dbP.collectionGroup('lecturas').where('codigo', '==', a.codigo).get().then(function (q) {
          var filas = [['Fecha', 'ID Yango', 'Nombre', 'Aviso']];
          q.forEach(function (d) { var x = d.data(); filas.push([X.fechaHora(x.fecha), x.id || '', x.nombre || '', x.titulo || '']); });
          return X.excel([{ nombre: 'Lecturas', filas: filas }], 'Lecturas-' + String(a.titulo || 'aviso').slice(0, 30).replace(/[^\w\-]+/g, '-'));
        }).then(function () { btn.disabled = false; }, function (e) { console.error(e); btn.disabled = false; X.aviso('No se pudo descargar la lista.'); });
      });
    }
  });
  function editarAviso(it, copiar) {
    var nuevo = !it || copiar;
    it = it ? Object.assign({}, it) : { tipo: 'INFO', frecuencia: 'UNA VEZ', paraQuien: 'TODOS', activo: true };
    if (nuevo) { it.id = X.nuevoId(); it.codigo = X.nuevoId(); if (copiar) { it.titulo = 'Copia de ' + it.titulo; it.activo = false; } }
    var u = urlImagen(it);
    var campos = [
      { k: 'titulo', t: 'Título', max: 120, obligatorio: true, ph: 'COMUNICADO OFICIAL - FACTURACIÓN SEMANA 42' },
      { k: 'mensaje', t: 'Mensaje', tipo: 'textarea', filas: 7, max: 2500, ayuda: 'Para negrita escribe **así**. Deja una línea en blanco para otro párrafo. Para una lista, empieza cada línea con «- ».' },
      { k: 'tipo', t: 'Tipo', tipo: 'select', opciones: TIPOS, ayuda: 'Urgente obliga a presionar «Entendido».' },
      { k: 'frecuencia', t: 'Cuántas veces se muestra', tipo: 'select', opciones: FRECUENCIAS },
      { k: 'paraQuien', t: 'Para quién', tipo: 'select', opciones: PARA },
      { k: 'ids', t: 'IDs de Yango', tipo: 'textarea', filas: 2, ayuda: 'Separados por coma.', si: function (v) { return v.paraQuien === 'IDS'; }, obligatorio: true },
      { k: 'archivo', t: 'Imagen (opcional)', tipo: 'archivo', accept: 'image/*', previa: u ? '<img src="' + esc(u) + '" alt="" style="max-height:110px;border-radius:10px">' : '' },
      { k: 'botonTexto', t: 'Texto del botón (opcional)', max: 40, ph: 'Escribir por WhatsApp' },
      { k: 'botonLink', t: 'Link del botón (opcional)', ph: 'https://wa.me/59169021969' },
      { k: 'desde', t: 'Mostrar desde (opcional)', tipo: 'date' },
      { k: 'hasta', t: 'Mostrar hasta (opcional)', tipo: 'date' },
      { k: 'activo', t: 'Publicado', tipo: 'switch' }
    ];
    if (!nuevo) { campos.push({ k: 'repetir', t: 'Volver a mostrarlo a quienes ya lo leyeron', tipo: 'switch' }); it.repetir = false; }
    if (u) campos.push({ k: 'quitarImg', t: 'Quitar la imagen', tipo: 'switch' });
    campos.push({ k: 'push', t: 'Enviar también como notificación al celular', tipo: 'switch' }); it.push = false;
    X.formulario(nuevo ? 'Nuevo aviso' : 'Editar aviso', 'Aparece como ventana al entrar al portal.', campos, it, function (v) {
      var archivo = v.archivo, push = v.push, quitar = v.quitarImg; delete v.archivo; delete v.push; delete v.quitarImg;
      if (v.botonLink && !/^https?:\/\//i.test(v.botonLink)) v.botonLink = 'https://' + v.botonLink;
      if (v.botonLink && !v.botonTexto) v.botonTexto = 'Ver más';
      if (v.paraQuien !== 'IDS') v.ids = '';
      if (v.repetir) v.codigo = X.nuevoId(); delete v.repetir;
      if (quitar) { v.fuente = ''; v.imagen = ''; }
      return subirImagen(archivo).then(function (f) { if (f) { v.fuente = f; v.imagen = ''; } return recargar(); }).then(function () {
        var l = lista('avisos'), i = l.findIndex(function (x) { return x.id === v.id; });
        if (i >= 0) l[i] = v; else l.unshift(v);
        return guardar('avisos', nuevo ? 'Aviso creado' : 'Aviso guardado', v.titulo);
      }).then(function () {
        if (push) return encolarNotif({ titulo: v.titulo, cuerpo: textoPlano(v.mensaje).slice(0, 220), paraQuien: v.paraQuien, ids: v.ids, link: 'inicio' });
      }).then(X.refrescar);
    });
  }

  /* ══════════ PREGUNTAS ══════════ */
  X.pagina('preguntas', {
    t: 'Preguntas', i: 'preguntas', sec: 'Portal de repartidores',
    render: function () {
      var cab = X.titulo('Preguntas frecuentes', 'Las ve el repartidor en «Preguntas» y las usa el asistente con IA.', X.puedeEditar() ? '<button class="btn" id="nuevaPr">' + ic('mas') + 'Nueva pregunta</button>' : '');
      if (!S.portalUsuario) return cab + sinPortal();
      if (!D.contenido) return cab + X.esqueleto(3);
      var l = lista('preguntas').slice().sort(function (a, b) { return String(a.categoria).localeCompare(String(b.categoria)) || (a.orden || 999) - (b.orden || 999); });
      return cab + soloLectura() + '<div class="card">' + (l.length ? X.tabla([
        { t: 'Categoría', html: function (q) { return X.chip('neutro', q.categoria || 'General'); } },
        { t: 'Pregunta', html: function (q) { return '<b>' + esc(q.p) + '</b><span class="sub">' + esc(String(q.r || '').slice(0, 180)) + '</span>'; } },
        { t: 'Estado', html: function (q) { return q.activo === false ? X.chip('neutro', 'Oculta') : X.chip('ok', 'Publicada'); } },
        { t: '', html: function (q) { return X.puedeEditar() ? '<span class="fila-acc"><button class="icono-btn" data-ed data-id="' + q.id + '" aria-label="Editar">' + ic('editar') + '</button><button class="icono-btn" data-bo data-id="' + q.id + '" aria-label="Borrar">' + ic('borrar') + '</button></span>' : ''; } }
      ], l, { tam: 200 }) : X.vacio('Todavía no hay preguntas', '', 'marca/graficos/rel-equipo-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      var b = el.querySelector('#nuevaPr'); if (b) b.addEventListener('click', function () { editarPregunta(null); });
      var de = function (id) { return lista('preguntas').filter(function (x) { return x.id === id; })[0]; };
      enlazar(el, '[data-ed]', function (id) { editarPregunta(de(id)); });
      enlazar(el, '[data-bo]', function (id) { var q = de(id); borrar('preguntas', id, q ? q.p : ''); });
    }
  });
  function editarPregunta(it) {
    var nuevo = !it;
    it = it ? Object.assign({}, it) : { id: X.nuevoId(), activo: true, categoria: '', orden: 999 };
    var cats = []; lista('preguntas').forEach(function (q) { if (q.categoria && cats.indexOf(q.categoria) < 0) cats.push(q.categoria); });
    X.formulario(nuevo ? 'Nueva pregunta' : 'Editar pregunta', '', [
      { k: 'categoria', t: 'Categoría', max: 40, obligatorio: true, ayuda: cats.length ? 'Usa una existente para agruparlas: ' + cats.map(esc).join(', ') : '' },
      { k: 'p', t: 'Pregunta', max: 200, obligatorio: true },
      { k: 'r', t: 'Respuesta', tipo: 'textarea', filas: 5, max: 1500, obligatorio: true },
      { k: 'activo', t: 'Publicada', tipo: 'switch' }
    ], it, function (v) {
      return recargar().then(function () {
        var l = lista('preguntas'), i = l.findIndex(function (x) { return x.id === v.id; });
        if (nuevo) v.orden = l.filter(function (x) { return x.categoria === v.categoria; }).length + 1;
        if (i >= 0) l[i] = v; else l.push(v);
        return guardar('preguntas', nuevo ? 'Pregunta creada' : 'Pregunta guardada', v.p);
      }).then(X.refrescar);
    });
  }

  /* ══════════ NOTIFICACIONES ══════════ */
  var NT = { lista: null, suscritos: null };
  X.pagina('notificaciones', {
    t: 'Notificaciones', i: 'campana', sec: 'Portal de repartidores',
    render: function () {
      var cab = X.titulo('Notificaciones al celular', 'Llegan a los repartidores que las activaron en el portal. Salen en los próximos 15 minutos.', X.puedeEditar() ? '<button class="btn" id="nuevaNt">' + ic('mas') + 'Enviar notificación</button>' : '');
      if (!S.portalUsuario) return cab + sinPortal();
      if (!NT.lista) return cab + X.cargaBarra('Notificaciones', 'Trayendo…');
      return cab + '<div class="rejilla r3 mb"><div class="kpi"><small>Celulares suscritos</small><b class="num">' + (NT.suscritos == null ? '—' : entero(NT.suscritos)) + '</b><em>repartidores con notificaciones activas</em></div></div>' +
        '<div class="card"><div class="h2">Últimas enviadas</div>' + (NT.lista.length ? X.tabla([
          { t: 'Fecha', html: function (n) { return X.fechaHora(n.creado) + (n.quien ? '<span class="sub">' + esc(n.quien) + '</span>' : ''); } },
          { t: 'Notificación', html: function (n) { return '<b>' + esc(n.titulo) + '</b><span class="sub">' + esc(n.cuerpo) + '</span>'; } },
          { t: 'Para', html: function (n) { return esc(nombreDe(PARA, n.paraQuien)); } },
          { t: 'Estado', html: function (n) { return n.estado === 'enviado' ? X.chip('ok', 'Enviada a ' + entero(n.enviados || 0)) : X.chip('pend', 'En cola'); } }
        ], NT.lista, { tam: 50 }) : X.vacio('Todavía no se envió ninguna', '', 'marca/graficos/rel-app-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      if (S.portalUsuario && !NT.lista) {
        var q = X.dbP.collection('notificaciones');
        Promise.all([X.dbP.collection('colaNotif').orderBy('creado', 'desc').limit(40).get(), q.count ? q.count().get().then(function (r) { return r.data().count; }) : Promise.resolve(null)]).then(function (r) {
          NT.lista = []; r[0].forEach(function (d) { NT.lista.push(d.data()); }); NT.suscritos = r[1];
          if (S.pagina === 'notificaciones') X.refrescar();
        }, function (e) { console.error(e); NT.lista = []; if (S.pagina === 'notificaciones') X.refrescar(); });
      }
      var b = el.querySelector('#nuevaNt');
      if (b) b.addEventListener('click', function () {
        X.formulario('Enviar notificación', 'Corta y clara: se lee en la pantalla bloqueada.', [
          { k: 'titulo', t: 'Título', max: 80, obligatorio: true, ph: 'Semana 42 cargada' },
          { k: 'cuerpo', t: 'Mensaje', tipo: 'textarea', filas: 3, max: 240, obligatorio: true, ph: 'Ya puedes ver tus pagos pendientes. Sube tu factura hasta el jueves 18:00.' },
          { k: 'paraQuien', t: 'Para quién', tipo: 'select', opciones: PARA },
          { k: 'ids', t: 'IDs de Yango', tipo: 'textarea', filas: 2, ayuda: 'Separados por coma.', si: function (v) { return v.paraQuien === 'IDS'; }, obligatorio: true },
          { k: 'link', t: 'Al tocarla, abrir', tipo: 'select', opciones: LINKS }
        ], { paraQuien: 'TODOS', link: 'inicio' }, function (v) { return encolarNotif(v).then(function () { NT.lista = null; X.refrescar(); }); }, 'Enviar');
      });
    }
  });

  /* ══════════ CHATS DEL ASISTENTE ══════════
     Pestañas: chats actuales (colección chats) y el archivo de las hojas viejas
     (colección archivo: ChatLog y AvisosLeidos), que antes se veía en el admin del portal. */
  var CH = { lista: null, archivoChats: null, archivoLecturas: null, vista: 'lista', buscar: '' };
  var VISTAS_CH = [['lista', 'Chats del asistente'], ['archivoChats', 'Chats anteriores (ChatLog)'], ['archivoLecturas', 'Lecturas anteriores (AvisosLeidos)']];
  function cargarArchivo() {
    return X.dbP.collection('archivo').get().then(function (q) {
      CH.archivoChats = []; CH.archivoLecturas = [];
      q.forEach(function (d) { var x = d.data(), dest = x.tipo === 'chats' ? CH.archivoChats : CH.archivoLecturas; dest.push.apply(dest, x.filas || []); });
      CH.archivoChats.reverse(); CH.archivoLecturas.reverse();
    }, function (e) { console.error(e); CH.archivoChats = []; CH.archivoLecturas = []; });
  }
  X.pagina('chats', {
    t: 'Chats del asistente', i: 'chat', sec: 'Portal de repartidores',
    render: function () {
      var cab = X.titulo('Chats del asistente', 'Lo que preguntan los repartidores al asistente con IA del portal (últimas 300) y el archivo de las hojas anteriores.', '<button class="btn sec" id="expCh">' + ic('descargar') + 'Excel</button>');
      if (!S.portalUsuario) return cab + sinPortal();
      var pest = '<div class="pestanas" role="tablist">' + VISTAS_CH.map(function (v) { return '<button role="tab" aria-selected="' + (CH.vista === v[0]) + '" data-vch="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>';
      var datos = CH[CH.vista];
      if (!datos) return cab + '<div class="card">' + pest + X.cargaBarra('Chats', 'Trayendo…') + '</div>';
      var b = X.normal(CH.buscar), l = datos.filter(function (c) { return !b || (X.normal(c.nombre) + ' ' + c.id + ' ' + X.normal(c.pregunta) + ' ' + X.normal(c.titulo)).indexOf(b) >= 0; });
      var cols = CH.vista === 'archivoLecturas' ? [
        { t: 'Fecha', html: function (c) { return esc(typeof c.fecha === 'string' ? c.fecha : X.fechaHora(c.fecha)); } },
        { t: 'Repartidor', html: function (c) { return esc(c.nombre) + '<span class="sub num">ID ' + esc(c.id) + '</span>'; } },
        { t: 'Aviso', html: function (c) { return esc(c.titulo); } }
      ] : [
        { t: 'Fecha', html: function (c) { return esc(typeof c.fecha === 'string' ? c.fecha : X.fechaHora(c.fecha)); } },
        { t: 'Repartidor', html: function (c) { return esc(c.nombre) + '<span class="sub num">ID ' + esc(c.id) + '</span>'; } },
        { t: 'Pregunta y respuesta', html: function (c) { return '<b>' + esc(c.pregunta) + '</b><span class="sub">' + esc(String(c.respuesta || '').slice(0, 300)) + '</span>'; } }
      ];
      return cab + '<div class="card">' + pest + '<div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bCh" placeholder="Buscar por ID, nombre o texto" value="' + esc(CH.buscar) + '"></div></div>' +
        (l.length ? X.tabla(cols, l, { tam: 100 }) : X.vacio('No hay registros', '', 'marca/graficos/rel-app-' + (S.oscuro ? 'oscuro' : 'claro') + '.png')) + '</div>';
    },
    despues: function (el) {
      if (S.portalUsuario && !CH.lista) X.dbP.collection('chats').orderBy('fecha', 'desc').limit(300).get().then(function (q) {
        CH.lista = []; q.forEach(function (d) { CH.lista.push(d.data()); }); if (S.pagina === 'chats') X.refrescar();
      }, function (e) { console.error(e); CH.lista = []; if (S.pagina === 'chats') X.refrescar(); });
      if (S.portalUsuario && CH.vista !== 'lista' && !CH[CH.vista]) cargarArchivo().then(function () { if (S.pagina === 'chats') X.refrescar(); });
      el.querySelectorAll('[data-vch]').forEach(function (b) { b.addEventListener('click', function () { CH.vista = b.getAttribute('data-vch'); X.refrescar(); }); });
      var bq = el.querySelector('#bCh'); if (bq) bq.addEventListener('input', X.debounce(function () { CH.buscar = bq.value; X.refrescar(); X.setFoco('#bCh'); }, 300));
      var be = el.querySelector('#expCh');
      if (be) be.addEventListener('click', function () {
        var fecha = function (c) { return typeof c.fecha === 'string' ? c.fecha : X.fechaHora(c.fecha); };
        var hojas = [{ nombre: 'Chats', filas: [['Fecha', 'ID Yango', 'Nombre', 'Pregunta', 'Respuesta']].concat((CH.lista || []).map(function (c) { return [fecha(c), c.id, c.nombre, c.pregunta, c.respuesta]; })) }];
        if (CH.archivoChats) hojas.push({ nombre: 'ChatLog anterior', filas: [['Fecha', 'ID Yango', 'Nombre', 'Pregunta', 'Respuesta']].concat(CH.archivoChats.map(function (c) { return [fecha(c), c.id, c.nombre, c.pregunta, c.respuesta]; })) });
        if (CH.archivoLecturas) hojas.push({ nombre: 'AvisosLeidos anterior', filas: [['Fecha', 'ID Yango', 'Nombre', 'Aviso']].concat(CH.archivoLecturas.map(function (c) { return [fecha(c), c.id, c.nombre, c.titulo]; })) });
        X.excel(hojas, 'Chats-asistente-' + X.hoyISO());
      });
    }
  });
})();
