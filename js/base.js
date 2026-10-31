/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — base del panel
   Inicio de sesión con Google, conexión a los dos proyectos de
   Firebase (CONTROL y Portal), menú, navegación y ayudantes.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var C = window.CONTROL || {};
  var raiz = document.getElementById('raiz');

  /* ── Estado general ── */
  var S = {
    usuario: null,        // cuenta de Google (proyecto CONTROL)
    portalUsuario: null,  // la misma cuenta en el proyecto del Portal
    rol: null,            // admin | operador | lectura
    nombre: '',
    pagina: 'tablero',
    oscuro: leer('ctrl_oscuro') === '1',
    menuAbierto: false
  };
  /* ── Datos en memoria ── */
  var D = {
    repartidores: null,   // Map uid → documento del portal
    cargadoEn: null,
    facturas: null,       // lista (en vivo)
    contenido: null,      // anuncios, avisos y preguntas del portal
    sync: null,           // estado de la sincronización Sheets → Firebase
    clientes: null,       // clientes CONTAX (proyecto CONTROL)
    excepciones: null,
    usuarios: null
  };

  var appC, appP, appPn, authC, authP, authPn, dbC, dbP, dbPn;

  /* ══════════ AYUDANTES ══════════ */
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var t = String(v == null ? '' : v).trim();
    if (!t) return null;
    t = t.replace(/[^\d,.-]/g, '');
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.indexOf(',') >= 0) t = t.replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  /* Formato boliviano: Bs 48.250,00 · negativos con signo: −Bs 1.200,00 */
  function bs(v, sinBs) {
    var n = numero(v);
    if (n === null) return '—';
    var neg = n < 0; n = Math.abs(n);
    var p = n.toFixed(2).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + (sinBs ? '' : 'Bs ') + p[0] + ',' + p[1];
  }
  function entero(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function z(x) { return (x < 10 ? '0' : '') + x; }
  function aFecha(f) {
    if (!f) return null;
    if (f.toDate) return f.toDate();
    if (f instanceof Date) return f;
    if (typeof f === 'number') return new Date(f);
    var t = String(f), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) return new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { var iso = new Date(t); if (!isNaN(iso)) return iso; }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(t);
    return isNaN(d) ? null : d;
  }
  function fecha(f) { var d = aFecha(f); return d ? z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
  function fechaHora(f) { var d = aFecha(f); return d ? fecha(d) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) : '—'; }
  function hace(f) {
    var d = aFecha(f); if (!d) return '—';
    var m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
    return fechaHora(d);
  }
  function hoyISO() { return new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); }
  function normal(t) { return String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function idSeguro(id) { return String(id == null ? '' : id).trim().replace(/[^a-zA-Z0-9._-]/g, '_'); }
  function nuevoId() {
    var a = new Uint8Array(6); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }
  function telVisible(c) { var t = String(c || '').replace(/\D/g, ''); if (t.length === 11 && t.indexOf('591') === 0) t = t.slice(3); return t; }
  function wa(cel, texto) { var t = String(cel || '').replace(/\D/g, ''); if (t.length === 8) t = '591' + t; return 'https://wa.me/' + t + (texto ? '?text=' + encodeURIComponent(texto) : ''); }
  function aviso(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  }
  function copiar(texto) {
    var listo = function () { aviso('Copiado'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, function () { copiaVieja(texto); listo(); });
    else { copiaVieja(texto); listo(); }
  }
  function copiaVieja(texto) {
    var a = document.createElement('textarea'); a.value = texto; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); } catch (e) { } a.remove();
  }
  function servidor() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function puedeEditar() { return S.rol === 'admin' || S.rol === 'operador'; }
  function esAdmin() { return S.rol === 'admin'; }
  function esDueno() { return esAdmin(); }

  /* ── Íconos de línea (la marca no usa emojis) ── */
  var T = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var IC = {
    tablero: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    factura: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    pagos: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    historial: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.5"/>',
    repartidor: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    equipo: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
    tramites: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
    imagen: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    megafono: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
    preguntas: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
    campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    cliente: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>',
    excepcion: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    bitacora: '<path d="M5 3h11l3 3v15H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    ayuda: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    salir: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    recargar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    subir: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    borrar: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z"/><path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1-1.2 1.8.8c-.2 1-1 1.7-2 1.6-3-.3-5.7-3-6-6-.1-1 .6-1.8 1.6-2l.8 1.8z"/>',
    flecha: '<path d="m9 6 6 6-6 6"/>',
    cruzar: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    portal: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    grafico: '<path d="M4 20V11M10 20V5M16 20v-8M21 20H3"/>',
    filtro: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
  };
  function ic(n, extra) { return '<svg class="ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" ' + T + ' aria-hidden="true">' + (IC[n] || IC.flecha) + '</svg>'; }

  /* ══════════ PANTALLAS DE ESPERA (manual de marca) ══════════ */
  var N_PATH = 'M0 427 L0 728 L136 728 L136 634 Z M410 0 L410 85 L546 292 L546 0 Z M0 0 L148 0 L410 458.5 L410 341 L546 548 L546 728 L401.71 728 L136 263 L136 379 L0 172 Z';
  var idOla = 0;
  /* 1 · La N se llena (uso general) */
  function cargaN(titulo, paso) {
    var id = 'nmLlenado' + (++idOla);
    return '<div class="nm-carga"><svg class="nm-n" viewBox="0 0 546 728" role="img" aria-label="Cargando"><clipPath id="' + id + '"><rect class="nm-ola" x="0" y="0" width="546" height="728"></rect></clipPath>' +
      '<path class="nm-n-base" d="' + N_PATH + '"></path><path class="nm-n-fill" clip-path="url(#' + id + ')" d="' + N_PATH + '"></path></svg>' +
      '<p class="nm-titulo">' + esc(titulo || 'Actualizando datos') + '</p>' + (paso ? '<p class="nm-paso">' + esc(paso) + '</p>' : '') + '</div>';
  }
  /* 2 · Cifras que cuadran (montos que se calculan) */
  function cargaCifras(paso) {
    var rod = function (v) { return '<span class="nm-rod nm-v' + v + '"><span class="nm-tira">0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9<br>0</span></span>'; };
    return '<div class="nm-carga nm-cifras"><div class="nm-monto" role="img" aria-label="Calculando montos"><span class="nm-bs">Bs</span>' +
      rod(1) + rod(3) + '<span class="nm-sep">.</span>' + rod(2) + rod(4) + rod(1) + '<span class="nm-sep">,</span>' + rod(3) + rod(2) +
      '</div><p class="nm-paso">' + esc(paso || 'Calculando…') + '</p></div>';
  }
  /* 3 · Barra con el ángulo de la marca (tablas que se refrescan) */
  function cargaBarra(titulo, paso) {
    return '<div class="nm-barra-bloque"><div class="nm-barra-fila"><b>' + esc(titulo) + '</b><span>' + esc(paso || 'Actualizando…') + '</span></div>' +
      '<div class="nm-barra" role="progressbar" aria-label="Actualizando datos"></div></div>';
  }
  /* 4 · Anillo con la N (botones y acciones cortas) */
  function anillo(texto) {
    return '<span class="nm-mini"><span class="nm-anillo"><svg class="nm-giro" viewBox="0 0 36 36" aria-hidden="true"><circle class="nm-pista" cx="18" cy="18" r="15.9"></circle><circle class="nm-arco" cx="18" cy="18" r="15.9"></circle></svg>' +
      '<span class="nm-n-centro"><svg viewBox="0 0 546 728" role="img" aria-label="Cargando"><path d="' + N_PATH + '"></path></svg></span></span><span>' + esc(texto || 'Guardando…') + '</span></span>';
  }
  function anilloBoton() {
    return '<span class="nm-anillo nm-anillo-chico"><svg class="nm-giro" viewBox="0 0 36 36" aria-hidden="true"><circle class="nm-pista" cx="18" cy="18" r="15.9"></circle><circle class="nm-arco" cx="18" cy="18" r="15.9"></circle></svg></span>';
  }
  /* 5 · Esqueleto de tarjeta (primera carga) */
  function esqueleto(n) {
    var b = '<div class="nm-esqueleto" aria-hidden="true"><div class="nm-linea corta"></div><div class="nm-linea alta"></div><div class="nm-fila-esq"><div class="nm-linea"></div><div class="nm-linea" style="max-width:70px"></div></div><div class="nm-fila-esq"><div class="nm-linea media"></div><div class="nm-linea" style="max-width:70px"></div></div></div>';
    var s = ''; for (var i = 0; i < (n || 3); i++) s += b;
    return '<div class="rejilla r3">' + s + '</div>';
  }
  /* 6 · Los clásicos trabajando (arranque y procesos largos) */
  var CLASICOS = [
    { foto: 'pitagoras-tablet', nombre: 'Pitágoras', frase: 'Pitágoras está contando los pagos de la semana…' },
    { foto: 'pitagoras-celular', nombre: 'Pitágoras', frase: 'Pitágoras está revisando los celulares registrados…' },
    { foto: 'euclides-compas', nombre: 'Euclides', frase: 'Euclides está ordenando los reportes…' },
    { foto: 'euclides-laptop', nombre: 'Euclides', frase: 'Euclides está trayendo los datos del portal…' },
    { foto: 'arquimedes-balanza', nombre: 'Arquímedes', frase: 'Arquímedes está cuadrando las cuentas…' },
    { foto: 'arquimedes-pensando', nombre: 'Arquímedes', frase: 'Arquímedes está cruzando facturas y pagos…' },
    { foto: 'los-tres-reunion', nombre: 'Los tres clásicos', frase: 'Los clásicos están preparando tu tablero…' }
  ];
  var cargaDesde = 0;
  function clasicos(mostrar, frase) {
    var capa = document.getElementById('nmCargando');
    if (mostrar) {
      var c = CLASICOS[Math.floor(Math.random() * CLASICOS.length)];
      var img = document.getElementById('nmRetrato');
      img.src = 'marca/clasicos/' + c.foto + '.jpg'; img.alt = c.nombre;
      document.getElementById('nmNombre').textContent = c.nombre;
      document.getElementById('nmPaso').textContent = frase || c.frase;
      document.getElementById('nmLogoCarga').src = 'marca/logos/nummeros-logotipo-horizontal-' + (S.oscuro ? 'claro' : 'principal') + '.svg';
      capa.hidden = false; cargaDesde = Date.now();
    } else {
      var espera = Math.max(0, 500 - (Date.now() - cargaDesde));   // mínimo 500 ms en pantalla
      setTimeout(function () { capa.hidden = true; }, espera);
    }
  }
  function textoClasicos(t) { var p = document.getElementById('nmPaso'); if (p) p.textContent = t; }

  /* ══════════ VENTANAS ══════════ */
  function cajon(titulo, sub, cuerpo, alAbrir) {
    var v = document.createElement('div');
    v.className = 'velo';
    v.innerHTML = '<aside class="cajon" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '">' +
      '<div class="cajon-cab"><div><h2>' + titulo + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      '<button class="icono-btn cerrar" data-cerrar aria-label="Cerrar">' + ic('cerrar') + '</button></div>' +
      '<div class="cajon-cuerpo">' + cuerpo + '</div></aside>';
    document.body.appendChild(v);
    var cerrar = function () { v.remove(); document.removeEventListener('keydown', tecla); };
    var tecla = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    v.addEventListener('click', function (e) { if (e.target === v || e.target.closest('[data-cerrar]')) cerrar(); });
    activarComunes(v);
    if (alAbrir) alAbrir(v.querySelector('.cajon-cuerpo'), cerrar);
    return { el: v, cerrar: cerrar, cuerpo: v.querySelector('.cajon-cuerpo') };
  }
  function ventana(titulo, sub, cuerpo, botones, alAbrir) {
    var v = document.createElement('div');
    v.className = 'velo centro';
    v.innerHTML = '<div class="ventana" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '">' +
      '<div class="ventana-cab"><h3>' + titulo + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      '<div class="ventana-cuerpo">' + cuerpo + '</div>' +
      '<div class="ventana-pie">' + (botones || '<button class="btn sec" data-cerrar>Cerrar</button>') + '</div></div>';
    document.body.appendChild(v);
    var cerrar = function () { v.remove(); document.removeEventListener('keydown', tecla); };
    var tecla = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    v.addEventListener('click', function (e) { if (e.target === v || e.target.closest('[data-cerrar]')) cerrar(); });
    activarComunes(v);
    if (alAbrir) alAbrir(v.querySelector('.ventana'), cerrar);
    var primero = v.querySelector('input,select,textarea');
    if (primero) setTimeout(function () { primero.focus(); }, 30);
    return { el: v, cerrar: cerrar };
  }
  function confirmar(titulo, texto, si, textoSi, peligro) {
    ventana(titulo, '', '<p style="margin:0">' + texto + '</p>',
      '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn' + (peligro ? ' peligro' : '') + '" data-si>' + esc(textoSi || 'Confirmar') + '</button>',
      function (el, cerrar) { el.querySelector('[data-si]').addEventListener('click', function () { cerrar(); si(); }); });
  }
  /* Formulario genérico: campos [{k, t, tipo, opciones, max, ph, ayuda, obligatorio, si}] */
  function formulario(titulo, sub, campos, item, alGuardar, textoGuardar) {
    item = item || {};
    var html = '<form class="fm" novalidate>' + campos.map(function (c) {
      var id = 'f_' + c.k, v = item[c.k] == null ? (c.def == null ? '' : c.def) : item[c.k];
      var oculto = c.si && !c.si(item) ? ' hidden' : '';
      var cuerpo;
      if (c.tipo === 'switch') return '<div class="fila" data-campo="' + c.k + '"' + oculto + '><label class="interruptor"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '>' + c.t + '</label>' + (c.ayuda ? '<small>' + c.ayuda + '</small>' : '') + '</div>';
      if (c.tipo === 'select') cuerpo = '<select id="' + id + '">' + c.opciones.map(function (o) { o = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
      else if (c.tipo === 'archivo') cuerpo = (c.previa ? '<div style="margin-bottom:8px">' + c.previa + '</div>' : '') + '<input id="' + id + '" type="file" accept="' + esc(c.accept || '*') + '">';
      else if (c.tipo === 'nota') return '<div class="fila" data-campo="' + c.k + '"' + oculto + '>' + c.t + '</div>';
      else if (c.tipo === 'textarea') cuerpo = '<textarea id="' + id + '" rows="' + (c.filas || 3) + '"' + (c.max ? ' maxlength="' + c.max + '"' : '') + ' placeholder="' + esc(c.ph || '') + '">' + esc(v) + '</textarea>';
      else cuerpo = '<input id="' + id + '" type="' + (c.tipo || 'text') + '"' + (c.max ? ' maxlength="' + c.max + '"' : '') + (c.tipo === 'number' ? ' step="0.01"' : '') + ' value="' + esc(v) + '" placeholder="' + esc(c.ph || '') + '"' + (c.auto ? ' autocomplete="' + c.auto + '"' : '') + '>';
      return '<div class="fila" data-campo="' + c.k + '"' + oculto + '><label for="' + id + '">' + c.t + (c.obligatorio ? '' : '') + '</label>' + cuerpo + (c.ayuda ? '<small>' + c.ayuda + '</small>' : '') + '</div>';
    }).join('') + '<p class="login-err" data-err role="alert"></p></form>';
    ventana(titulo, sub, html, '<button class="btn sec" data-cerrar>Cancelar</button><button class="btn" data-guardar>' + esc(textoGuardar || 'Guardar') + '</button>', function (el, cerrar) {
      var leerV = function () {
        var v = Object.assign({}, item);
        campos.forEach(function (c) {
          var e = el.querySelector('#f_' + c.k); if (!e) return;
          if (c.tipo === 'switch') v[c.k] = e.checked;
          else if (c.tipo === 'archivo') v[c.k] = e.files && e.files[0] ? e.files[0] : null;
          else if (c.tipo === 'number') v[c.k] = numero(e.value);
          else v[c.k] = e.value.trim();
        });
        return v;
      };
      var visibles = function () { var v = leerV(); campos.forEach(function (c) { if (c.si) el.querySelector('[data-campo="' + c.k + '"]').hidden = !c.si(v); }); };
      el.querySelectorAll('select,input[type=checkbox]').forEach(function (e) { e.addEventListener('change', visibles); });
      var btn = el.querySelector('[data-guardar]'), err = el.querySelector('[data-err]');
      var enviar = function () {
        var v = leerV();
        var falta = campos.filter(function (c) { return c.obligatorio && c.tipo !== 'archivo' && (v[c.k] === '' || v[c.k] == null) && (!c.si || c.si(v)); })[0];
        if (falta) { err.textContent = 'Falta: ' + falta.t.replace(/<[^>]+>/g, ''); return; }
        btn.disabled = true; var txt = btn.innerHTML; btn.innerHTML = anilloBoton() + 'Guardando';
        Promise.resolve().then(function () { return alGuardar(v); }).then(cerrar, function (e) {
          console.error(e); btn.disabled = false; btn.innerHTML = txt;
          err.textContent = e && e.message && !/permission|insufficient/i.test(e.message) ? e.message : 'No se pudo guardar. Revisa tu conexión o tus permisos.';
        });
      };
      btn.addEventListener('click', enviar);
      el.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); enviar(); });
    });
  }
  /* Botones de copiar, WhatsApp, etc. en cualquier bloque */
  function activarComunes(el) {
    el.querySelectorAll('[data-copiar]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); copiar(b.getAttribute('data-copiar')); });
    });
  }

  /* ══════════ EXPORTAR ══════════ */
  function bajarArchivo(contenido, nombre, tipo) {
    var blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function csv(filas, nombre) {
    var txt = filas.map(function (f) { return f.map(function (c) { c = c == null ? '' : String(c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n');
    bajarArchivo('﻿' + txt, nombre + '.csv', 'text/csv;charset=utf-8');
  }
  var xlsxListo = null;
  function cargarXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxListo) xlsxListo = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = function () { ok(window.XLSX); }; s.onerror = function () { xlsxListo = null; mal(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
    return xlsxListo;
  }
  /* hojas = [{nombre, filas:[[...]]}] → archivo .xlsx */
  function excel(hojas, nombre) {
    return cargarXLSX().then(function (X) {
      var lb = X.utils.book_new();
      hojas.forEach(function (h) {
        var ws = X.utils.aoa_to_sheet(h.filas);
        ws['!cols'] = (h.filas[0] || []).map(function (_, i) {
          var ancho = 10; h.filas.slice(0, 200).forEach(function (f) { ancho = Math.max(ancho, String(f[i] == null ? '' : f[i]).length + 2); });
          return { wch: Math.min(ancho, 48) };
        });
        X.utils.book_append_sheet(lb, ws, String(h.nombre).slice(0, 31));
      });
      X.writeFile(lb, nombre + '.xlsx');
    });
  }

  /* ══════════ BITÁCORA ══════════ */
  function bitacora(que, detalle) {
    if (!dbC || !S.usuario) return Promise.resolve();
    return dbC.collection('bitacora').add({
      quien: String(S.usuario.email || '').toLowerCase(), nombre: S.nombre || '', que: String(que).slice(0, 120),
      detalle: String(detalle || '').slice(0, 600), cuando: servidor()
    }).catch(function (e) { console.warn('Bitácora:', e); });
  }

  /* ══════════ PÁGINAS Y MENÚ ══════════ */
  var PAG = {};
  /* opciones: { t: título en el menú, i: ícono, sec: sección, render(), despues(el), cuenta(), soloAdmin } */
  function pagina(id, o) { PAG[id] = o; }
  var SECCIONES = ['Operación', 'Portal de repartidores', 'CONTAX', 'Sistema'];

  function pintarMenu() {
    var m = document.getElementById('menu'); if (!m) return;
    var html = '<a class="menu-logo" href="#/tablero" data-ir="tablero"><img src="marca/logos/nummeros-logotipo-horizontal-' + (S.oscuro ? 'claro' : 'principal') + '.svg" alt="NUMMEROS"><small>CONTROL</small></a>';
    SECCIONES.forEach(function (sec) {
      var items = Object.keys(PAG).filter(function (k) { return PAG[k].sec === sec && (!PAG[k].soloAdmin || esAdmin()); });
      items.sort(function (a, b) { return (PAG[a].orden || 50) - (PAG[b].orden || 50); });
      if (!items.length) return;
      html += '<span class="menu-sec">' + sec + '</span>';
      items.forEach(function (k) {
        var p = PAG[k], n = p.cuenta ? p.cuenta() : 0;
        html += '<button class="menu-link' + (S.pagina === k ? ' activo' : '') + '" data-ir="' + k + '">' + ic(p.i) + '<span>' + p.t + '</span>' + (n ? '<span class="cuenta num">' + n + '</span>' : '') + '</button>';
      });
    });
    html += '<div class="menu-pie"><img src="marca/logos/nummeros-logotipo-firma-' + (S.oscuro ? 'claro' : 'principal') + '.svg" alt="NUMMEROS by CONTAX">CONTROL · v' + esc(C.version) + '</div>';
    m.innerHTML = html;
  }
  function pintarCabecera() {
    var c = document.getElementById('cabEstado'); if (!c) return;
    var sync = D.sync && D.sync.ultima ? 'Sheets → portal ' + hace(D.sync.ultima) : '';
    c.innerHTML = (D.cargadoEn ? '<span><b>' + entero(D.repartidores ? D.repartidores.size : 0) + '</b> repartidores · datos traídos ' + hace(D.cargadoEn) + '</span>' : '') +
      (sync ? '<span class="muted">· ' + esc(sync) + '</span>' : '');
  }
  function ir(p, sinHistorial) {
    if (!PAG[p] || (PAG[p].soloAdmin && !esAdmin())) p = 'tablero';
    S.pagina = p;
    document.querySelectorAll('.velo').forEach(function (v) { v.remove(); });
    if (CTRL.graficos) { CTRL.graficos.forEach(function (g) { try { g.destroy(); } catch (e) { } }); CTRL.graficos = []; }
    var el = document.getElementById('pagina');
    if (!el) return;
    el.innerHTML = PAG[p].render();
    activarComunes(el);
    if (PAG[p].despues) PAG[p].despues(el);
    pintarMenu(); pintarCabecera();
    document.title = PAG[p].t.replace(/<[^>]+>/g, '') + ' · CONTROL NUMMEROS';
    if (!sinHistorial) history.pushState(null, '', '#/' + p);
    else history.replaceState(null, '', '#/' + p);
    document.querySelector('.app').classList.remove('menu-abierto');
    window.scrollTo(0, 0);
  }
  function refrescar() { ir(S.pagina, true); }
  window.addEventListener('popstate', function () {
    if (!S.rol) return;
    var h = (location.hash || '').replace('#/', '').split('?')[0];
    ir(PAG[h] ? h : 'tablero', true);
  });
  function titulo(t, sub, acciones) {
    return '<div class="pg-tit"><div><h1>' + t + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acciones ? '<div class="pg-acc">' + acciones + '</div>' : '') + '</div>';
  }
  function vacio(t, sub, img) {
    return '<div class="vacio">' + (img ? '<img src="' + img + '" alt="">' : '') + '<b>' + t + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
  }
  function chip(clase, texto) { return '<span class="chip ' + clase + '">' + esc(texto) + '</span>'; }

  /* Tabla con paginado simple. cols = [{t, k?, clase?, html(fila)}] */
  function tabla(cols, filas, o) {
    o = o || {};
    var tam = o.tam || 50, pag = o.pag || 0, total = filas.length;
    var trozo = filas.slice(pag * tam, pag * tam + tam);
    var h = '<div class="tabla"><table><thead><tr>' + cols.map(function (c) { return '<th' + (c.clase ? ' class="' + c.clase + '"' : '') + '>' + c.t + '</th>'; }).join('') + '</tr></thead><tbody>' +
      trozo.map(function (f, i) {
        return '<tr' + (o.clic ? ' class="clic" data-fila="' + (pag * tam + i) + '"' : '') + '>' + cols.map(function (c) {
          return '<td' + (c.clase ? ' class="' + c.clase + '"' : '') + '>' + (c.html ? c.html(f) : esc(f[c.k])) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>' + (o.pie ? '<tfoot><tr>' + o.pie + '</tr></tfoot>' : '') + '</table></div>';
    if (total > tam) {
      var paginas = Math.ceil(total / tam);
      h += '<div class="paginador"><span>Mostrando ' + entero(pag * tam + 1) + '–' + entero(Math.min(total, pag * tam + tam)) + ' de ' + entero(total) + '</span>' +
        '<span class="fila-acc"><button class="btn sec chico" data-pag="' + (pag - 1) + '"' + (pag <= 0 ? ' disabled' : '') + '>Anterior</button>' +
        '<button class="btn sec chico" data-pag="' + (pag + 1) + '"' + (pag >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button></span></div>';
    }
    return h;
  }

  /* Gráficos con los colores de la marca */
  function grafico(canvas, config) {
    var hacer = function () {
      if (!window.Chart) return setTimeout(hacer, 150);
      var oscuro = S.oscuro;
      Chart.defaults.font.family = 'Questrial, "Century Gothic", sans-serif';
      Chart.defaults.color = oscuro ? '#8EB69B' : '#557363';
      Chart.defaults.borderColor = oscuro ? '#235347' : '#DAF1DE';
      var g = new Chart(canvas, config);
      CTRL.graficos.push(g);
    };
    hacer();
  }
  function colores() {
    return S.oscuro ? { fuerte: '#8EB69B', medio: '#DAF1DE', suave: '#235347', alerta: '#FDB022' } : { fuerte: '#235347', medio: '#8EB69B', suave: '#DAF1DE', alerta: '#B54708' };
  }

  /* ══════════ INICIO DE SESIÓN ══════════ */
  var FOTOS_LOGIN = [
    { f: 'reunion-sala', n: 'Los tres clásicos', s: 'y el Contador Virtual de CONTAX', pos: '50% 40%' },
    { f: 'los-cuatro-oscuro', n: 'Pitágoras, Euclides y Arquímedes', s: 'con el Contador Virtual', pos: '50% 35%' },
    { f: 'contrato-euclides-oscuro', n: 'Euclides', s: 'cierra el acuerdo con CONTAX', pos: '50% 35%' },
    { f: 'pitagoras-muestra-sistema', n: 'Pitágoras', s: 'muestra el sistema', pos: '50% 35%' },
    { f: 'apreton-arquimedes', n: 'Arquímedes', s: 'y el Contador Virtual', pos: '50% 35%' },
    { f: 'pitagoras-saludo-oscuro', n: 'Pitágoras', s: 'saluda al Contador Virtual', pos: '50% 35%' },
    { f: 'arquimedes-saludo-claro', n: 'Arquímedes', s: 'saluda al Contador Virtual', pos: '50% 35%' }
  ];
  function pintarLogin(error, correo) {
    var c = FOTOS_LOGIN[Math.floor(Math.random() * FOTOS_LOGIN.length)];
    raiz.innerHTML = '<main class="login">' +
      '<section class="login-panel"><div class="patron" aria-hidden="true"></div><div class="login-caja">' +
        '<img class="login-logo" src="marca/logos/nummeros-logotipo-apilado-' + (S.oscuro ? 'claro' : 'principal') + '.svg" alt="NUMMEROS">' +
        '<span class="etiqueta"><i><img src="marca/logos/nummeros-isotipo-blanco.svg" alt=""></i>Solo para el equipo</span>' +
        '<h1>CONTROL<em>Portal de repartidores</em></h1>' +
        '<p class="texto">Entra con <b>el mismo correo y contraseña del Panel NUMMEROS</b> (los mismos del CRM).</p>' +
        '<form class="fm" id="fmLogin" novalidate>' +
          '<div class="fila"><label for="lgCorreo">Correo</label><input id="lgCorreo" type="email" autocomplete="username" value="' + esc(correo || leer('ctrl_ultimo_correo') || '') + '" required></div>' +
          '<div class="fila"><label for="lgClave">Contraseña</label><input id="lgClave" type="password" autocomplete="current-password" required></div>' +
          '<button class="btn ancho" type="submit" id="btnEntrar" style="min-height:48px;font-size:17px">' + ic('candado') + 'Entrar</button>' +
        '</form>' +
        '<p class="login-err" id="loginErr" role="alert">' + esc(error || '') + '</p>' +
        '<p class="muted" style="font-size:13px;margin:0">¿Olvidaste tu contraseña? Pide al administrador que la restablezca en <a href="' + esc(C.panelUrl) + '" target="_blank" rel="noopener">Panel → Usuarios</a>.</p>' +
        '<div class="login-pie"><img src="marca/logos/nummeros-logotipo-firma-' + (S.oscuro ? 'claro' : 'principal') + '.svg" alt="NUMMEROS by CONTAX"><span>Santa Cruz de la Sierra, Bolivia · v' + esc(C.version) + '</span></div>' +
      '</div></section>' +
      '<figure class="login-foto"><div class="fondo-foto" style="background-image:url(marca/colaboracion/' + c.f + '.jpg)"></div><img class="foto" src="marca/colaboracion/' + c.f + '.jpg" alt="' + esc(c.n + ' ' + c.s) + '">' +
        '<figcaption><div class="insignia"><i><img src="marca/logos/nummeros-isotipo-blanco.svg" alt=""></i>' + esc(c.n) + '<span>' + esc(c.s) + '</span></div>' +
        '<div class="alianza"><img src="marca/logos/nummeros-logotipo-horizontal-principal.svg" alt="NUMMEROS"><b>×</b><img src="marca/logos/contax-logo.png" alt="CONTAX"></div></figcaption>' +
      '</figure></main>';
    var fm = document.getElementById('fmLogin');
    fm.addEventListener('submit', function (e) { e.preventDefault(); entrar(); });
    var f = document.getElementById(document.getElementById('lgCorreo').value ? 'lgClave' : 'lgCorreo'); if (f) f.focus();
  }
  function traducirError(e) {
    var c = (e && e.code) || '', m = (e && e.message) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Correo o contraseña incorrectos (son los mismos del Panel).';
    if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos o pide que te restablezcan la contraseña en el Panel.';
    if (/network-request-failed/.test(c)) return 'Sin conexión. Revisa tu internet.';
    if (/user-disabled/.test(c)) return 'Tu acceso está desactivado. Pide al administrador que lo revise en Panel → Usuarios.';
    if (/invalid-email/.test(c)) return 'Ese correo no es válido.';
    return m ? m.replace(/^Firebase:\s*/, '') : 'No se pudo entrar. Intenta de nuevo' + (c ? ' (' + c + ')' : '') + '.';
  }
  /* El puente (Apps Script del Panel) verifica al usuario y entrega su llave para CONTROL y el Portal */
  function pedirLlave(reponer) {
    return authPn.currentUser.getIdToken(true).then(function (idToken) {
      return fetch(C.puenteUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'admin_ctrl_sesion', idToken: idToken, reponer: !!reponer }) });
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'El Panel no respondió. Intenta de nuevo.');
      return r;
    });
  }
  function abrirEspejos(r) {
    return Promise.all([authC.signInWithEmailAndPassword(r.correo, r.llave), authP.signInWithEmailAndPassword(r.correo, r.llave)]);
  }
  function entrar() {
    var btn = document.getElementById('btnEntrar'), err = document.getElementById('loginErr');
    var correo = document.getElementById('lgCorreo').value.trim().toLowerCase(), clave = document.getElementById('lgClave').value;
    if (!correo || !clave) { err.textContent = 'Escribe tu correo y tu contraseña.'; return; }
    btn.disabled = true; btn.innerHTML = anilloBoton() + 'Verificando con el Panel…'; err.textContent = '';
    guardarLocal('ctrl_ultimo_correo', correo);
    entrando = true;
    authPn.signInWithEmailAndPassword(correo, clave).then(function () { return pedirLlave(false); }).then(function (r) {
      btn.innerHTML = anilloBoton() + 'Abriendo CONTROL…';
      return abrirEspejos(r).catch(function () { return pedirLlave(true).then(abrirEspejos); });
    }).then(function () { entrando = false; revisarSesion(); }).catch(function (e) {
      console.error(e); entrando = false;
      Promise.all([authPn.signOut(), authC.signOut(), authP.signOut()]).catch(function () { }).then(function () { pintarLogin(traducirError(e), correo); });
    });
  }
  function salir() {
    if (D.escuchaFacturas) { D.escuchaFacturas(); D.escuchaFacturas = null; }
    Promise.all([authC.signOut(), authP.signOut(), authPn.signOut()]).then(function () { location.hash = ''; location.reload(); });
  }

  /* ¿Esta sesión tiene permiso en CONTROL? (el permiso viaja en la cuenta, lo pone el Panel) */
  function verificarAcceso(u) {
    return u.getIdTokenResult(true).then(function (t) {
      var c = t.claims || {};
      if (c.nm === true && /^(admin|operador|lectura)$/.test(c.rol || '')) return { rol: c.rol, nombre: u.displayName || u.email };
      return null;
    }, function (e) { console.warn('Acceso:', e && e.code); return null; });
  }
  /* ══════════ ARMADO DEL PANEL ══════════ */
  function pintarApp() {
    var u = S.usuario, foto = u.photoURL;
    raiz.innerHTML = '<div class="app">' +
      '<nav class="menu" id="menu" aria-label="Menú principal"></nav>' +
      '<div class="cuerpo">' +
        '<header class="cab"><button class="icono-btn hamb" data-accion="menu" aria-label="Abrir menú">' + ic('menu') + '</button>' +
          '<div class="cab-estado" id="cabEstado"></div>' +
          '<div class="cab-r">' +
            '<button class="icono-btn" data-accion="recargar" title="Traer datos nuevos del portal" aria-label="Actualizar datos">' + ic('recargar') + '</button>' +
            '<button class="icono-btn" data-accion="tema" title="Modo claro u oscuro" aria-label="Cambiar modo claro u oscuro">' + ic(S.oscuro ? 'sol' : 'luna') + '</button>' +
            '<div class="usuario">' + (foto ? '<img src="' + esc(foto) + '" alt="" referrerpolicy="no-referrer">' : '<span class="ini">' + esc((S.nombre || '?').charAt(0).toUpperCase()) + '</span>') +
              '<span>' + esc(S.nombre) + ' <em>' + esc({ admin: 'Administrador', operador: 'Operador', lectura: 'Solo lectura' }[S.rol] || '') + '</em></span></div>' +
            '<button class="icono-btn" data-accion="salir" title="Salir" aria-label="Salir">' + ic('salir') + '</button>' +
          '</div></header>' +
        '<div id="avisoPortal"></div>' +
        '<main class="contenido" id="pagina"></main>' +
      '</div></div>';
    pintarMenu();
  }
  function avisoPortal() {
    var el = document.getElementById('avisoPortal'); if (!el) return;
    if (S.portalUsuario) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="contenido" style="padding-bottom:0"><div class="aviso-caja alerta">' + ic('candado') +
      '<div style="flex:1"><b>Falta la conexión con el Portal de repartidores</b>Sal y vuelve a entrar con tu usuario del Panel.</div>' +
      '<button class="btn" data-accion="salir">Volver a entrar</button></div></div>';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ir]');
    if (a) { e.preventDefault(); ir(a.getAttribute('data-ir')); return; }
    var acc = e.target.closest('[data-accion]');
    if (!acc) return;
    var k = acc.getAttribute('data-accion');
    if (k === 'salir') salir();
    else if (k === 'menu') document.querySelector('.app').classList.toggle('menu-abierto');
    else if (k === 'tema') { S.oscuro = !S.oscuro; guardarLocal('ctrl_oscuro', S.oscuro ? '1' : '0'); aplicarTema(); pintarApp(); avisoPortal(); ir(S.pagina, true); }
    else if (k === 'recargar') { recargarTodo(true); }
  });
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('app') === false && document.querySelector('.app.menu-abierto') && !e.target.closest('.menu') && !e.target.closest('[data-accion="menu"]'))
      document.querySelector('.app').classList.remove('menu-abierto');
  });
  function aplicarTema() {
    document.documentElement.setAttribute('data-theme', S.oscuro ? 'oscuro' : 'claro');
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.oscuro ? '#051F20' : '#F4FAF5';
  }

  /* ══════════ DATOS ══════════ */
  function cargarRepartidores() {
    if (!S.portalUsuario) { D.repartidores = new Map(); return Promise.resolve(); }
    return dbP.collection('repartidores').get().then(function (q) {
      var m = new Map();
      q.forEach(function (d) { var x = d.data(); x.uid = d.id; m.set(d.id, x); });
      D.repartidores = m; D.cargadoEn = new Date();
      // Con fuentePagos 'control', pendientes e historial salen de «semanas» (js/semanas.js)
      return CTRL.semanas ? CTRL.semanas.cargar() : null;
    });
  }
  function cargarSync() {
    if (!S.portalUsuario) return Promise.resolve();
    return Promise.all([
      dbP.collection('privado').doc('estado').get().then(function (d) { var x = d.exists ? d.data() : {}; D.sync = { ultima: x.ultima || null, total: x.total || 0 }; }, function () { D.sync = null; }),
      dbP.collection('publico').doc('portal').get().then(function (d) { D.portal = d.exists ? d.data() : {}; }, function () { D.portal = {}; })
    ]);
  }
  function cargarContenido() {
    if (!S.portalUsuario) { D.contenido = {}; return Promise.resolve(); }
    return dbP.collection('publico').doc('contenido').get().then(function (d) { D.contenido = d.exists ? d.data() : {}; });
  }
  function escucharFacturas() {
    if (!S.portalUsuario || D.escuchaFacturas) return;
    D.escuchaFacturas = dbP.collection('facturas').onSnapshot(function (q) {
      var l = [];
      q.forEach(function (d) { var x = d.data(); x._id = d.id; x.subidoF = aFecha(x.subido); l.push(x); });
      l.sort(function (a, b) { return (b.subidoF || 0) - (a.subidoF || 0); });
      D.facturas = l;
      pintarMenu();
      if (CTRL.alCambiarFacturas) CTRL.alCambiarFacturas();
    }, function (e) { console.error('Facturas:', e); D.facturas = D.facturas || []; });
  }
  function cargarControl() {
    return Promise.all([
      dbC.collection('clientes').get().then(function (q) { D.clientes = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; D.clientes.push(x); }); }, function (e) { console.warn(e); D.clientes = []; }),
      dbC.collection('excepciones').get().then(function (q) { D.excepciones = []; q.forEach(function (d) { var x = d.data(); x._id = d.id; D.excepciones.push(x); }); }, function (e) { console.warn(e); D.excepciones = []; }),
      dbC.collection('notas').get().then(function (q) { D.notas = {}; q.forEach(function (d) { D.notas[d.id] = d.data(); }); }, function () { D.notas = {}; }),
      // Cuentas bancarias de los repartidores (js/banco.js)
      CTRL.banco ? CTRL.banco.cargar() : null
    ]);
  }
  function recargarTodo(conAviso) {
    clasicos(true);
    textoClasicos('Trayendo los datos del portal…');
    return Promise.all([cargarRepartidores(), cargarSync(), cargarContenido(), cargarControl()]).then(function () {
      escucharFacturas();
      clasicos(false);
      refrescar();
      if (conAviso) aviso('Datos actualizados');
    }, function (e) {
      console.error(e); clasicos(false);
      aviso(/permission|insufficient/i.test(e && e.message) ? 'Sin permiso para leer el portal. Revisa tu rol o las reglas.' : 'No se pudieron traer los datos. Revisa tu conexión.');
      refrescar();
    });
  }

  /* Cliente CONTAX de un repartidor (por ID de Yango o celular) */
  function clienteDe(r) {
    if (!r || !D.clientes) return null;
    var id = String(r.id || ''), cel = String(r.celular || '').replace(/\D/g, '').slice(-8);
    for (var i = 0; i < D.clientes.length; i++) {
      var c = D.clientes[i];
      if (c.estado === 'INACTIVO') continue;
      if ((c.idYango && String(c.idYango).trim() === id) || (cel && c.celular && String(c.celular).replace(/\D/g, '').slice(-8) === cel)) return c;
    }
    return null;
  }

  /* ══════════ ARRANQUE ══════════ */
  var entrando = false, arrancado = false, listos = { c: false, p: false, pn: false };
  function revisarSesion() {
    if (entrando || !listos.c || !listos.p || !listos.pn) return;
    var u = S.usuario;
    if (!u) { arrancado = false; S.rol = null; pintarLogin(); return; }
    if (S.portalUsuario && String(S.portalUsuario.email).toLowerCase() !== String(u.email).toLowerCase()) { authP.signOut(); return; }
    if (arrancado) { avisoPortal(); if (S.portalUsuario && !D.cargadoEn) recargarTodo(); return; }
    arrancado = true;
    verificarAcceso(u).then(function (acc) {
      if (!acc) {
        arrancado = false;
        Promise.all([authC.signOut(), authP.signOut(), authPn.signOut()]).catch(function () { }).then(function () {
          pintarLogin('Tu usuario ya no tiene acceso a CONTROL. Pide al administrador que lo revise en Panel → Usuarios.');
        });
        return;
      }
      S.rol = acc.rol; S.nombre = acc.nombre;
      pintarApp(); avisoPortal();
      var h = (location.hash || '').replace('#/', '').split('?')[0];
      S.pagina = PAG[h] ? h : 'tablero';
      document.getElementById('pagina').innerHTML = esqueleto(6);
      if (!sessionStorage.getItem('ctrl_bitacora_entrada')) { try { sessionStorage.setItem('ctrl_bitacora_entrada', '1'); } catch (e) { } bitacora('Entró a CONTROL', ''); }
      recargarTodo();
    });
  }
  function iniciar() {
    aplicarTema();
    if (!window.firebase) { raiz.innerHTML = '<div class="contenido">' + vacio('No se pudo cargar el sistema', 'Revisa tu conexión a internet y recarga la página.') + '</div>'; return; }
    appC = firebase.initializeApp(C.firebaseControl);
    appP = firebase.initializeApp(C.firebasePortal, 'portal');
    appPn = firebase.initializeApp(C.firebasePanel, 'panel');
    authC = appC.auth(); authP = appP.auth(); authPn = appPn.auth(); dbC = appC.firestore(); dbP = appP.firestore(); dbPn = appPn.firestore();
    CTRL.dbC = dbC; CTRL.dbP = dbP; CTRL.dbPn = dbPn; CTRL.authPn = authPn;
    raiz.innerHTML = cargaN('CONTROL', 'Abriendo el panel…');
    authC.onAuthStateChanged(function (u) { S.usuario = u; listos.c = true; revisarSesion(); });
    authP.onAuthStateChanged(function (u) { S.portalUsuario = u; listos.p = true; if (u) D.cargadoEn = null; revisarSesion(); });
    authPn.onAuthStateChanged(function (u) { S.panelUsuario = u; listos.pn = true; revisarSesion(); });
  }

  window.CTRL = {
    C: C, S: S, D: D, graficos: [],
    iniciar: iniciar, pagina: pagina, ir: ir, refrescar: refrescar, pintarMenu: pintarMenu, recargarTodo: recargarTodo,
    cargarRepartidores: cargarRepartidores, cargarContenido: cargarContenido, cargarControl: cargarControl,
    esc: esc, bs: bs, entero: entero, numero: numero, redondear: redondear, fecha: fecha, fechaHora: fechaHora, hace: hace, aFecha: aFecha,
    hoyISO: hoyISO, normal: normal, idSeguro: idSeguro, nuevoId: nuevoId, telVisible: telVisible, wa: wa, aviso: aviso, copiar: copiar,
    servidor: servidor, puedeEditar: puedeEditar, esAdmin: esAdmin, esDueno: esDueno, ic: ic,
    cargaN: cargaN, cargaCifras: cargaCifras, cargaBarra: cargaBarra, anillo: anillo, anilloBoton: anilloBoton, esqueleto: esqueleto, clasicos: clasicos, textoClasicos: textoClasicos,
    cajon: cajon, ventana: ventana, confirmar: confirmar, formulario: formulario, activarComunes: activarComunes,
    csv: csv, excel: excel, cargarXLSX: cargarXLSX, bajarArchivo: bajarArchivo, bitacora: bitacora,
    titulo: titulo, vacio: vacio, chip: chip, tabla: tabla, grafico: grafico, colores: colores, clienteDe: clienteDe
  };
})();
