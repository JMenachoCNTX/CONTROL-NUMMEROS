/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Buscar repartidor / Informe general
   Busca por nombre o ID y arma el «Informe general» del repartidor (como el que
   salía de Google Sheets): datos generales, gráficos de ingresos y de impuestos,
   y el historial de pagos y facturación. Se descarga en PDF para enviárselo.
   Marca CONTAX (es un documento para el repartidor).
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, S = X.S, D = X.D;
  var esc = X.esc, bs = X.bs, ic = X.ic, entero = X.entero;
  var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  var IN = { buscar: '', id: '', perfil: null, perfilDe: '' };
  /* 1.234,56 (formato de Bolivia) */
  function fmt(v, dec) { return (Number(v) || 0).toLocaleString('es-BO', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

  /* ══════════ BÚSQUEDA ══════════ */
  function candidatos() {
    var m = {};
    var pon = function (id, nombre, fuente) {
      id = String(id || '').trim(); if (!id) return;
      var x = m[id] || (m[id] = { id: id, nombre: '', fuentes: {} });
      if (!x.nombre && nombre) x.nombre = nombre;
      x.fuentes[fuente] = 1;
    };
    X.lista().forEach(function (r) { pon(r.id, r.nombre, 'portal'); });
    (D.hist || []).forEach(function (h) { pon(h.id, h.nombre, 'historial'); });
    ((D.bdyango && D.bdyango.lista) || []).forEach(function (b) { pon(b.id, b.nombre, 'bdyango'); });
    return m;
  }
  function buscar(texto) {
    var b = X.normal(texto); if (!b || b.length < 2) return [];
    var c = candidatos(), l = [];
    Object.keys(c).forEach(function (id) { var x = c[id]; if ((X.normal(x.nombre) + ' ' + id).indexOf(b) >= 0) l.push(x); });
    return l.sort(function (a, z) { return (a.id === texto.trim() ? -1 : 0) - (z.id === texto.trim() ? -1 : 0) || X.normal(a.nombre).localeCompare(X.normal(z.nombre)); }).slice(0, 30);
  }

  /* ══════════ DATOS DEL INFORME ══════════ */
  function datos(id) {
    var uid = X.idSeguro(id), r = D.repartidores ? D.repartidores.get(uid) : null;
    var by = ((D.bdyango && D.bdyango.lista) || []).filter(function (b) { return b.id === id; })[0] || {};
    var hist = (D.hist || []).filter(function (h) { return h.id === id; }).sort(function (a, z) { return String(a.fecha).localeCompare(String(z.fecha)); });
    var cta = X.banco ? X.banco.cuentaDe(id) : null, ev = r && (r.pendientes || []).length ? X.evaluar(r) : null;
    var perfil = IN.perfilDe === uid ? IN.perfil : null, cli = r ? X.clienteDe(r) : null;
    var nombre = (r && r.nombre) || by.nombre || (hist[hist.length - 1] || {}).nombre || '';
    var falta = ev ? ev.semanas.filter(function (s) { return s.estado === 'falta' || s.estado === 'observada'; }).length : 0;
    return {
      id: id, uid: uid, r: r, by: by, hist: hist, ev: ev, nombre: nombre,
      razon: (perfil && perfil.razonSocial) || nombre, nit: (perfil && perfil.nit) || by.nit || (hist.filter(function (h) { return h.nit; }).pop() || {}).nit || '',
      telefono: by.telefono || (r && r.celular) || '', correo: by.correo || '',
      banco: cta ? (cta.bancoTexto || cta.banco || (X.banco ? X.banco.nombreBanco(cta) : '')) : '', cuenta: cta ? cta.cuenta : '',
      poliza: r ? !!r.poliza : false, estadoYango: by.estadoYango || '',
      habilitado: r ? r.habilitado !== false : true,
      retenido: ev ? !ev.listo : false, faltaFactura: falta,
      contador: cli ? 'CONTAX' : 'OTRO'
    };
  }
  function mesDe(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})/); return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : ''; }
  function mesFactura(h) {
    var d = X.aFecha(h.fechaFactura);
    return d ? MESES[d.getMonth()] : (h.mes || '');
  }

  /* ══════════ GRÁFICO DE LÍNEAS EN SVG (sirve igual en pantalla y en el PDF) ══════════ */
  function linea(etq, series, alto) {
    var W = 760, H = alto || 210, iz = 56, de = 16, ar = 16, ab = 34, max = 0;
    series.forEach(function (s) { s.datos.forEach(function (v) { if (v > max) max = v; }); });
    if (!etq.length) return '<p class="inf-vacio">Todavía no hay pagos para graficar.</p>';
    var paso = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1)))), tope = Math.ceil((max * 1.15 || 1) / paso) * paso;
    var x = function (i) { return etq.length === 1 ? (iz + W - de) / 2 : iz + i * (W - iz - de) / (etq.length - 1); };
    var y = function (v) { return ar + (H - ar - ab) * (1 - v / tope); };
    var g = '';
    for (var k = 0; k <= 4; k++) {
      var v = tope * k / 4, yy = y(v);
      g += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + yy + '" y2="' + yy + '" stroke="#E3E6EC"/><text x="' + (iz - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="#6B7280">' + fmt(v, 0) + '</text>';
    }
    var cada = Math.ceil(etq.length / 12);
    etq.forEach(function (t, i) { if (i % cada === 0 || i === etq.length - 1) g += '<text x="' + x(i) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="9" fill="#374151">' + esc(t) + '</text>'; });
    series.forEach(function (s) {
      g += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2"' + (s.guion ? ' stroke-dasharray="5 4"' : '') + ' points="' + s.datos.map(function (v, i) { return x(i) + ',' + y(v); }).join(' ') + '"/>';
      s.datos.forEach(function (v, i) {
        g += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3.2" fill="' + s.color + '"/>';
        if (etq.length <= 14) g += '<text x="' + x(i) + '" y="' + (y(v) - 7) + '" text-anchor="middle" font-size="8.5" fill="#374151">' + fmt(v, 2) + '</text>';
      });
    });
    var ley = series.length > 1 ? '<div class="inf-ley">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.nombre) + '</span>'; }).join('') + '</div>' : '';
    return ley + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(series.map(function (s) { return s.nombre; }).join(', ')) + '">' + g + '</svg>';
  }

  var INF_CSS = '.inf{font-family:"Century Gothic","URW Gothic",Futura,Arial,sans-serif;color:#111827;background:#fff;max-width:900px;margin:0 auto;padding:24px 28px;font-size:12px}' +
    '.inf-logo{text-align:center;margin-bottom:10px}.inf-logo img{height:64px}' +
    '.inf-banda{background:#1F2D4D;color:#fff;text-align:center;font-size:26px;letter-spacing:.04em;padding:6px 0;margin:0 0 6px}' +
    '.inf-sub{text-align:center;color:#4B5563;font-size:14px;margin:0 0 10px}' +
    '.inf-gen{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 22px;border-top:2px solid #1F2D4D;border-bottom:2px solid #1F2D4D;padding:10px 0;margin-bottom:12px}' +
    '.inf-gen div{display:flex;gap:8px;align-items:baseline;min-width:0}.inf-gen b{font-size:10.5px;min-width:112px;color:#1F2D4D}.inf-gen span{overflow-wrap:anywhere}' +
    '.inf-gen .grande{font-size:20px;font-weight:700}.inf-ok{color:#15803D;font-weight:700}.inf-mal{color:#B91C1C;font-weight:700}' +
    '.inf-h{text-align:center;font-weight:700;font-size:14px;color:#1F2D4D;border-top:2px solid #1F2D4D;border-bottom:1px solid #9CA3AF;padding:4px 0;margin:14px 0 6px}' +
    '.inf-ht{text-align:center;font-weight:700;font-size:12.5px;margin:8px 0 2px}' +
    '.inf-ley{display:flex;gap:14px;justify-content:center;font-size:10px;color:#374151}.inf-ley i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}' +
    '.inf-tabla{width:100%;border-collapse:collapse;font-size:9.5px}.inf-tabla th{background:#1F2D4D;color:#fff;font-weight:600;padding:5px 4px;text-align:left}' +
    '.inf-tabla .grupo th{font-size:13px;font-weight:400;text-align:center}.inf-tabla td{padding:3px 4px;border-bottom:1px solid #E5E7EB;vertical-align:top}' +
    '.inf-tabla .n{text-align:right;white-space:nowrap}.inf-tabla .aut{max-width:150px;overflow-wrap:anywhere;font-size:8.5px}.inf-tabla tr.ret td{color:#B91C1C}' +
    '.inf .inf-tabla tfoot td{font-weight:700;border-top:2px solid #1F2D4D;background:#F3F4F6!important;color:#111827!important}.inf .inf-tabla th{text-transform:none;letter-spacing:0}.inf-vacio{text-align:center;color:#6B7280;padding:18px}' +
    '.inf-pie{text-align:center;color:#6B7280;font-size:9.5px;margin-top:14px}' +
    '.inf-scroll{overflow-x:auto}.inf-scroll .inf-tabla{min-width:820px}' +
    '@media (max-width:760px){.inf{padding:16px 12px}.inf-gen{grid-template-columns:1fr}.inf-banda{font-size:20px}}' +
    '@media print{@page{size:A4;margin:10mm}.inf{padding:0;max-width:none}.inf-scroll{overflow:visible}.inf-scroll .inf-tabla{min-width:0}.inf-tabla tr{break-inside:avoid}}';

  function htmlInforme(d, base) {
    var hist = d.hist, hoy = X.fecha(new Date());
    // Ingresos por fecha de pago (últimas 12) y por mes
    var porFecha = {}, porMes = {}, imp = {};
    hist.forEach(function (h) {
      porFecha[h.fecha] = (porFecha[h.fecha] || 0) + h.importe;
      var m = String(h.fecha).slice(0, 7); porMes[m] = (porMes[m] || 0) + h.importe;
      var mf = X.aFecha(h.fechaFactura), km = mf ? mf.getFullYear() + '-' + ('0' + (mf.getMonth() + 1)).slice(-2) : m;
      imp[km] = (imp[km] || 0) + h.importe;
    });
    var fechas = Object.keys(porFecha).sort().slice(-12), meses = Object.keys(porMes).sort(), mImp = Object.keys(imp).sort();
    var pend = d.r ? (d.ev ? d.ev.semanas : (d.r.pendientes || []).map(function (p) { return { p: p, estado: 'falta' }; })) : [];
    var est = function (ok, si, no) { return '<span class="' + (ok ? 'inf-ok' : 'inf-mal') + '">' + (ok ? si : no) + (ok ? ' ✓' : ' ✗') + '</span>'; };
    var filasHist = hist.slice().reverse().map(function (h) {
      return '<tr><td>' + esc(h.semana) + '</td><td>' + esc(h.rango) + '</td><td>' + esc(h.nombre) + '</td><td class="n">' + fmt(h.importe, 2) + '</td><td class="n"><b>' + X.fecha(h.fecha) + '</b></td>' +
        '<td class="n">' + esc(h.factura) + '</td><td class="n">' + esc(h.fechaFactura) + '</td><td>' + esc(h.nit) + '</td><td class="aut">' + esc(h.autorizacion) + '</td><td>' + esc(mesFactura(h)) + '</td>' +
        '<td class="n">' + fmt(h.importe * 0.13, 2) + '</td><td class="n">' + fmt(h.importe * 0.03, 2) + '</td></tr>';
    }).join('');
    var filasPend = pend.map(function (s) {
      var p = s.p, t = { lista: 'Listo para pagar', contax: 'Factura CONTAX', excepcion: 'Excepción', revision: 'Factura en revisión', observada: 'Factura observada', tarde: 'Después del corte', porEmitir: 'Por emitir (CONTAX)' }[s.estado] || 'Pago retenido';
      return '<tr class="' + (s.ok ? '' : 'ret') + '"><td>' + esc(p.semana) + '</td><td>' + esc(p.rango || '') + '</td><td>' + esc(d.nombre) + '</td><td class="n">' + fmt(Number(p.importe) || 0, 2) + '</td><td class="n">—</td>' +
        '<td colspan="5">' + esc(t) + '</td><td class="n">' + fmt((Number(p.importe) || 0) * 0.13, 2) + '</td><td class="n">' + fmt((Number(p.importe) || 0) * 0.03, 2) + '</td></tr>';
    }).join('');
    var tot = hist.reduce(function (s, h) { return s + h.importe; }, 0);
    return '<div class="inf">' +
      '<div class="inf-logo"><img src="' + base + 'marca/logos/contax-logo.png" alt="CONTAX"></div>' +
      '<div class="inf-banda">INFORME GENERAL</div><p class="inf-sub">Datos Generales</p>' +
      '<div class="inf-gen">' +
        '<div><b>Código ID:</b><span class="grande">' + esc(d.id) + '</span></div><div><b>Banco:</b><span>' + esc(d.banco || '—') + '</span></div><div><b>Retención Yango:</b>' + est(d.habilitado, 'Habilitado', 'No habilitado') + '</div>' +
        '<div><b>Razón Social:</b><span>' + esc(d.razon || '—') + '</span></div><div><b>Nro Cta. Banco:</b><span>' + esc(d.cuenta || '—') + '</span></div><div><b>Retención MTG:</b>' + est(!d.retenido, 'Sin retención', 'Retención') + '</div>' +
        '<div><b>NIT:</b><span>' + esc(d.nit || '—') + '</span></div><div><b>Póliza de seguro:</b>' + est(d.poliza, 'Registrada', 'No registrada') + '</div><div><b>Facturación MTG:</b>' + est(!d.faltaFactura, 'En orden', 'Falta factura') + '</div>' +
        '<div><b>Teléfono:</b><span>' + esc(d.telefono || '—') + '</span></div><div><b>Estado en Yango:</b><span>' + esc(d.estadoYango || '—') + '</span></div><div><b>Contador:</b><span>' + esc(d.contador) + '</span></div>' +
        '<div><b>Correo:</b><span>' + esc(d.correo || '—') + '</span></div><div><b>Nombre:</b><span>' + esc(d.nombre || '—') + '</span></div><div><b>Pagos recibidos:</b><span>' + entero(hist.length) + ' · ' + bs(tot) + '</span></div>' +
      '</div>' +
      '<div class="inf-h">Informe de Evolución a la fecha ' + hoy + '</div>' +
      '<div class="inf-ht">Ingresos por fecha de pago</div>' + linea(fechas.map(function (f) { return X.fecha(f).slice(0, 5); }), [{ nombre: 'Importe pagado', color: '#1F2D4D', datos: fechas.map(function (f) { return X.redondear(porFecha[f]); }) }]) +
      '<div class="inf-ht">Total ingresos mensuales</div>' + linea(meses.map(mesDe), [{ nombre: 'Total del mes', color: '#1F2D4D', datos: meses.map(function (m) { return X.redondear(porMes[m]); }) }]) +
      '<div class="inf-ht">Proyección impositiva (por mes de la factura)</div>' + linea(mImp.map(mesDe), [
        { nombre: 'Débito Fiscal (13%)', color: '#1F2D4D', datos: mImp.map(function (m) { return X.redondear(imp[m] * 0.13); }) },
        { nombre: 'IT (3%)', color: '#9CA3AF', guion: true, datos: mImp.map(function (m) { return X.redondear(imp[m] * 0.03); }) }]) +
      '<div class="inf-h">Historial Pagos / Facturación MTG Delivery</div>' +
      '<div class="inf-scroll"><table class="inf-tabla"><thead><tr class="grupo"><th colspan="5">Detalle de Pagos</th><th colspan="7">Detalle Facturación</th></tr>' +
        '<tr><th>Semana</th><th>Rango (Días)</th><th>Nombre completo</th><th class="n">Importe total</th><th class="n">Fecha de Pago</th><th class="n">Nro Factura</th><th class="n">Fecha Factura</th><th>NIT Factura</th><th>Nro Autorización</th><th>Mes Declaración</th><th class="n">Débito Fiscal (13%)</th><th class="n">IT (3%)</th></tr></thead>' +
        '<tbody>' + filasPend + filasHist + '</tbody>' +
        (hist.length ? '<tfoot><tr><td colspan="3">Total pagado</td><td class="n">' + fmt(tot, 2) + '</td><td colspan="6"></td><td class="n">' + fmt(tot * 0.13, 2) + '</td><td class="n">' + fmt(tot * 0.03, 2) + '</td></tr></tfoot>' : '') +
      '</table></div>' + (filasPend || filasHist ? '' : '<p class="inf-vacio">Sin pagos registrados.</p>') +
      '<p class="inf-pie">CONTAX · Contabilidad e Impuestos · Informe generado el ' + X.fechaHora(new Date()) + '</p></div>';
  }

  /* PDF: se abre el informe solo en una ventana y se imprime («Guardar como PDF») */
  function pdf(d) {
    var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var w = window.open('', '_blank');
    if (!w) { X.aviso('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ' + esc(d.id) + ' ' + esc(d.nombre) + '</title><style>body{margin:0;background:#fff}' + INF_CSS + '</style></head><body>' +
      htmlInforme(d, base) + '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }

  /* ══════════ PÁGINA ══════════ */
  function cargarPerfil(uid) {
    if (IN.perfilDe === uid || !S.portalUsuario) return;
    IN.perfilDe = uid; IN.perfil = null;
    X.dbP.collection('perfiles').doc(uid).get().then(function (d) {
      if (IN.perfilDe !== uid) return;
      IN.perfil = d.exists ? d.data() : null;
      if (S.pagina === 'informe' && IN.perfil) X.refrescar();
    }, function () { });
  }
  X.pagina('informe', {
    t: 'Buscar repartidor', i: 'persona', orden: 2.5, sec: 'Operación',
    render: function () {
      var cab = X.titulo('Buscar repartidor', 'Escribe el nombre o el ID para ver su informe general (pagos, facturas e impuestos). Lo puedes descargar en PDF y enviárselo.');
      if (!D.repartidores) return cab + X.esqueleto(2);
      var res = buscar(IN.buscar);
      var caja = '<div class="card mb"><div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bInf" placeholder="Nombre o ID del repartidor" value="' + esc(IN.buscar) + '" autocomplete="off"></div>' +
        (IN.id ? '<button class="btn" id="infPdf">' + ic('descargar') + 'Descargar PDF</button>' : '') + '</div>' +
        (IN.buscar && !IN.id ? (res.length ? '<div class="lista-res">' + res.map(function (x) {
          return '<button class="fila-res" data-inf="' + esc(x.id) + '"><b>' + esc(x.nombre || 'Sin nombre') + '</b><span class="num muted">ID ' + esc(x.id) + '</span></button>';
        }).join('') + '</div>' : X.vacio('No encontramos a nadie con «' + esc(IN.buscar) + '»', 'Prueba con otra parte del nombre o con el ID.')) : '') + '</div>';
      if (!IN.id) return cab + caja;
      var d = datos(IN.id); cargarPerfil(d.uid);
      return cab + caja + '<style>' + INF_CSS + '</style><div class="card" style="padding:0;overflow:hidden;background:#fff;max-width:100%">' + htmlInforme(d, '') + '</div>';
    },
    despues: function (el) {
      var b = el.querySelector('#bInf');
      if (b) b.addEventListener('input', X.debounce(function () { IN.buscar = b.value; IN.id = ''; X.refrescar(); X.setFoco('#bInf'); }, 250));
      el.querySelectorAll('[data-inf]').forEach(function (x) { x.addEventListener('click', function () { abrir(x.getAttribute('data-inf')); }); });
      var p = el.querySelector('#infPdf'); if (p) p.addEventListener('click', function () { pdf(datos(IN.id)); });
    }
  });
  function abrir(id) {
    var c = candidatos()[String(id)];
    IN.id = String(id); IN.buscar = c && c.nombre ? c.nombre : String(id);
    if (S.pagina === 'informe') X.refrescar(); else X.ir('informe');
  }

  X.informe = { abrir: abrir, _puro: { buscar: buscar, datos: datos, htmlInforme: htmlInforme } };
})();
