/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Buscar repartidor / Informe general
   Busca por nombre o ID y arma el «Informe general» del repartidor (como el que
   salía de Google Sheets): datos generales, gráficos de ingresos y de impuestos,
   y el historial de pagos y facturación. En pantalla se ve como el resto del sistema;
   «Descargar PDF» arma el documento con formato NUMMEROS y el logo de CONTAX.
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
  function mesFactura(h) {
    var d = X.aFecha(h.fechaFactura);
    return d ? MESES[d.getMonth()] : (h.mes || '');
  }

  /* ══════════ CIFRAS DEL INFORME (las usan la pantalla y el PDF) ══════════ */
  function cifras(d) {
    var porFecha = {}, porMes = {}, imp = {};
    d.hist.forEach(function (h) {
      porFecha[h.fecha] = (porFecha[h.fecha] || 0) + h.importe;
      var m = String(h.fecha).slice(0, 7); porMes[m] = (porMes[m] || 0) + h.importe;
      var mf = X.aFecha(h.fechaFactura), km = mf ? mf.getFullYear() + '-' + ('0' + (mf.getMonth() + 1)).slice(-2) : m;
      imp[km] = (imp[km] || 0) + h.importe;
    });
    var fechas = Object.keys(porFecha).sort().slice(-12), meses = Object.keys(porMes).sort().slice(-12), mImp = Object.keys(imp).sort().slice(-12);
    var pend = d.r ? (d.ev ? d.ev.semanas : (d.r.pendientes || []).map(function (p) { return { p: p, estado: 'falta' }; })) : [];
    var tot = X.redondear(d.hist.reduce(function (s, h) { return s + h.importe; }, 0));
    var totPend = X.redondear(pend.reduce(function (s, x) { return s + (Number(x.p.importe) || 0); }, 0));
    // Filas de la tabla: primero los pendientes (pago retenido), luego lo pagado (lo más nuevo arriba)
    var filas = pend.map(function (x) {
      var p = x.p, t = { lista: 'Listo para pagar', contax: 'Factura CONTAX', excepcion: 'Excepción', revision: 'Factura en revisión', observada: 'Factura observada', tarde: 'Después del corte', porEmitir: 'Por emitir (CONTAX)' }[x.estado] || 'Pago retenido';
      return { pend: true, ok: !!x.ok, estado: t, semana: p.semana, rango: p.rango || '', nombre: d.nombre, importe: Number(p.importe) || 0, fecha: '', factura: '', fechaFactura: '', nit: '', autorizacion: '', mes: '' };
    }).concat(d.hist.slice().reverse().map(function (h) {
      return { pend: false, ok: true, estado: 'Pagado', semana: h.semana, rango: h.rango, nombre: h.nombre, importe: h.importe, fecha: h.fecha, factura: h.factura, fechaFactura: h.fechaFactura, nit: h.nit, autorizacion: h.autorizacion, mes: mesFactura(h) };
    }));
    return {
      tot: tot, totPend: totPend, pend: pend, filas: filas, ultimo: d.hist[d.hist.length - 1] || null,
      fechas: { etq: fechas.map(function (f) { return X.fecha(f).slice(0, 5); }), v: fechas.map(function (f) { return X.redondear(porFecha[f]); }) },
      meses: { etq: meses.map(mesCorto), v: meses.map(function (m) { return X.redondear(porMes[m]); }) },
      imp: { etq: mImp.map(mesCorto), df: mImp.map(function (m) { return X.redondear(imp[m] * 0.13); }), it: mImp.map(function (m) { return X.redondear(imp[m] * 0.03); }) }
    };
  }
  function mesCorto(k) { var m = String(k).match(/^(\d{4})-(\d{2})/); return m ? MESES[Number(m[2]) - 1].slice(0, 3).charAt(0) + MESES[Number(m[2]) - 1].slice(1, 3).toLowerCase() + ' ' + m[1].slice(2) : k; }

  /* ══════════ PDF (formato NUMMEROS, con el logo de CONTAX) ══════════ */
  /* Barras 3D en SVG: una o dos series (agrupadas) */
  function barrasSvg(etq, series, ancho) {
    if (!etq.length) return '<p class="inf-vacio">Todavía no hay pagos para graficar.</p>';
    var W = ancho || 760, H = ancho ? 250 : 230, iz = 50, de = 22, ar = 26, ab = 30, max = 0;
    series.forEach(function (s) { s.v.forEach(function (v) { if (v > max) max = v; }); });
    var paso = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1)))), tope = Math.ceil((max * 1.15 || 1) / paso) * paso;
    var y = function (v) { return ar + (H - ar - ab) * (1 - v / tope); }, hueco = (W - iz - de) / etq.length;
    var bw = Math.min(46, hueco * .62 / series.length), g = '';
    for (var k = 0; k <= 4; k++) { var v = tope * k / 4, yy = y(v); g += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + yy + '" y2="' + yy + '" stroke="#DAF1DE"/><text x="' + (iz - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="#557363">' + fmt(v, 0) + '</text>'; }
    etq.forEach(function (t, i) {
      var cx = iz + hueco * i + hueco / 2, x0 = cx - bw * series.length / 2;
      series.forEach(function (s, j) {
        var v = s.v[i] || 0, yy = y(v), x = x0 + j * bw;
        g += X.barraSvg(x, yy, bw - (series.length > 1 ? 3 : 0), y(0) - yy, s.color);
        if (etq.length <= 12) g += '<text x="' + (x + bw / 2) + '" y="' + (yy - 12) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="#163832">' + fmt(v, v >= 1000 ? 0 : 2) + '</text>';
      });
      g += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle" font-size="9" fill="#335F4F">' + esc(t) + '</text>';
    });
    var ley = series.length > 1 ? '<div class="inf-ley">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.nombre) + '</span>'; }).join('') + '</div>' : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(series.map(function (s) { return s.nombre; }).join(', ')) + '">' + g + '</svg>' + ley;
  }

  var INF_CSS = '@font-face{font-family:Akshar;font-weight:700;src:url(BASEmarca/fuentes/Akshar-700.woff2) format("woff2")}@font-face{font-family:Akshar;font-weight:600;src:url(BASEmarca/fuentes/Akshar-600.woff2) format("woff2")}@font-face{font-family:Questrial;src:url(BASEmarca/fuentes/Questrial-400.woff2) format("woff2")}' +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}' +
    '.inf{font-family:Questrial,"Century Gothic",Arial,sans-serif;color:#051F20;background:#fff;max-width:900px;margin:0 auto;padding:22px 26px;font-size:11.5px}' +
    '.inf-cab{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:3px solid #235347}.inf-cab img{height:34px}.inf-cab .ctx{height:40px}.inf-cab b{font:700 13px Akshar,sans-serif;color:#557363;letter-spacing:.2em}' +
    '.inf-banda{position:relative;overflow:hidden;background:#163832;color:#fff;border-radius:12px;padding:14px 18px;margin:14px 0 12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}' +
    '.inf-banda h1{margin:0;font:700 26px Akshar,sans-serif;letter-spacing:.05em;color:#fff}.inf-banda p{margin:2px 0 0;color:#DAF1DE;font-size:12px}.inf-banda .id{font:700 22px Akshar,sans-serif;color:#8EB69B;text-align:right}.inf-banda .id small{display:block;font-size:10px;letter-spacing:.15em;color:#DAF1DE}' +
    '.inf-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.inf-kpis div{border:1px solid #DAF1DE;background:#F4FAF5;border-radius:10px;padding:8px 10px}.inf-kpis small{display:block;font:600 9px Akshar,sans-serif;letter-spacing:.12em;color:#557363;text-transform:uppercase}.inf-kpis b{display:block;font:700 17px Akshar,sans-serif;color:#163832}' +
    '.inf-gen{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;border:1px solid #DAF1DE;border-radius:10px;padding:10px 12px;margin-bottom:12px}' +
    '.inf-gen div{min-width:0}.inf-gen b{display:block;font:600 9px Akshar,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#557363}.inf-gen span{overflow-wrap:anywhere;font-size:12px}' +
    '.inf-ok{color:#1F7A4D;font-weight:700}.inf-mal{color:#B42318;font-weight:700}' +
    '.inf-h{font:700 15px Akshar,sans-serif;color:#163832;letter-spacing:.04em;border-left:4px solid #235347;padding:2px 0 2px 8px;margin:16px 0 8px}' +
    '.inf-graf{display:grid;grid-template-columns:1fr 1fr;gap:10px}.inf-graf>div{border:1px solid #DAF1DE;border-radius:10px;padding:8px}.inf-graf>div.ancho{grid-column:1/-1}' +
    '.inf-ht{font:600 12px Akshar,sans-serif;color:#235347;letter-spacing:.04em;margin:0 0 2px}' +
    '.inf-ley{display:flex;gap:14px;justify-content:center;font-size:10px;color:#335F4F}.inf-ley i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}' +
    '.inf-tabla{width:100%;border-collapse:collapse;font-size:9px}.inf-tabla th{background:#163832;color:#fff;font:600 9.5px Akshar,sans-serif;letter-spacing:.03em;padding:5px 4px;text-align:left}' +
    '.inf-tabla .grupo th{background:#235347;font-size:11px;text-align:center}.inf-tabla td{padding:3px 4px;border-bottom:1px solid #DAF1DE;vertical-align:top}.inf-tabla tbody tr:nth-child(even) td{background:#F4FAF5}' +
    '.inf-tabla .n{text-align:right;white-space:nowrap}.inf-tabla .aut{max-width:150px;overflow-wrap:anywhere;font-size:8px}.inf-tabla tr.ret td{color:#B42318}' +
    '.inf-tabla tfoot td{font-weight:700;border-top:2px solid #235347;background:#DAF1DE}.inf-vacio{text-align:center;color:#557363;padding:18px}' +
    '.inf-pie{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#557363;font-size:9px;margin-top:14px;border-top:1px solid #DAF1DE;padding-top:8px}.inf-pie img{height:16px}' +
    '@media print{@page{size:A4;margin:10mm}.inf{padding:0;max-width:none}.inf-tabla tr,.inf-graf>div{break-inside:avoid}}';

  function htmlPdf(d, base) {
    var c = cifras(d), hoy = X.fecha(new Date());
    var est = function (ok, si, no) { return '<span class="' + (ok ? 'inf-ok' : 'inf-mal') + '">' + (ok ? si + ' ✓' : no + ' ✗') + '</span>'; };
    var filas = c.filas.map(function (f) {
      return '<tr class="' + (f.pend && !f.ok ? 'ret' : '') + '"><td>' + esc(f.semana) + '</td><td>' + esc(f.rango) + '</td><td class="n">' + fmt(f.importe, 2) + '</td><td class="n"><b>' + (f.pend ? esc(f.estado) : X.fecha(f.fecha)) + '</b></td>' +
        '<td class="n">' + esc(f.factura) + '</td><td class="n">' + esc(f.fechaFactura) + '</td><td>' + esc(f.nit) + '</td><td class="aut">' + esc(f.autorizacion) + '</td><td>' + esc(f.mes) + '</td>' +
        '<td class="n">' + fmt(f.importe * 0.13, 2) + '</td><td class="n">' + fmt(f.importe * 0.03, 2) + '</td></tr>';
    }).join('');
    return '<div class="inf">' +
      '<div class="inf-cab"><img src="' + base + 'marca/logos/nummeros-logotipo-horizontal-principal.svg" alt="NUMMEROS"><b>INFORME GENERAL</b><img class="ctx" src="' + base + 'marca/logos/contax-logo.png" alt="CONTAX"></div>' +
      '<div class="inf-banda"><div><h1>' + esc(d.nombre || 'Repartidor') + '</h1><p>Informe de pagos y facturación al ' + hoy + ' · MTG Delivery (MILTHAGOR S.R.L.)</p></div><div class="id"><small>ID YANGO</small>' + esc(d.id) + '</div></div>' +
      '<div class="inf-kpis"><div><small>Total cobrado</small><b>' + bs(c.tot) + '</b></div><div><small>Pagos recibidos</small><b>' + entero(d.hist.length) + '</b></div><div><small>Pendiente</small><b>' + bs(c.totPend) + '</b></div><div><small>Último pago</small><b>' + (c.ultimo ? X.fecha(c.ultimo.fecha) : '—') + '</b></div></div>' +
      '<div class="inf-gen">' +
        '<div><b>Razón social</b><span>' + esc(d.razon || '—') + '</span></div><div><b>NIT</b><span>' + esc(d.nit || '—') + '</span></div><div><b>Teléfono</b><span>' + esc(d.telefono || '—') + '</span></div>' +
        '<div><b>Correo</b><span>' + esc(d.correo || '—') + '</span></div><div><b>Banco</b><span>' + esc(d.banco || '—') + '</span></div><div><b>N.º de cuenta</b><span>' + esc(d.cuenta || '—') + '</span></div>' +
        '<div><b>Retención Yango</b>' + est(d.habilitado, 'Habilitado', 'No habilitado') + '</div><div><b>Retención MTG</b>' + est(!d.retenido, 'Sin retención', 'Retención') + '</div><div><b>Facturación MTG</b>' + est(!d.faltaFactura, 'En orden', 'Falta factura') + '</div>' +
        '<div><b>Póliza de seguro</b>' + est(d.poliza, 'Registrada', 'No registrada') + '</div><div><b>Estado en Yango</b><span>' + esc(d.estadoYango || '—') + '</span></div><div><b>Contador</b><span>' + esc(d.contador) + '</span></div>' +
      '</div>' +
      '<div class="inf-h">Evolución</div><div class="inf-graf">' +
        '<div><p class="inf-ht">Ingresos por fecha de pago</p>' + barrasSvg(c.fechas.etq, [{ nombre: 'Pagado', color: '#235347', v: c.fechas.v }], 400) + '</div>' +
        '<div><p class="inf-ht">Ingresos por mes</p>' + barrasSvg(c.meses.etq, [{ nombre: 'Total del mes', color: '#2F6F5A', v: c.meses.v }], 400) + '</div>' +
        '<div class="ancho"><p class="inf-ht">Proyección impositiva (por mes de la factura)</p>' + barrasSvg(c.imp.etq, [{ nombre: 'Débito Fiscal (13%)', color: '#235347', v: c.imp.df }, { nombre: 'IT (3%)', color: '#8EB69B', v: c.imp.it }]) + '</div>' +
      '</div>' +
      '<div class="inf-h">Historial de pagos y facturación</div>' +
      '<table class="inf-tabla"><thead><tr class="grupo"><th colspan="4">Detalle de pagos</th><th colspan="7">Detalle de facturación</th></tr>' +
        '<tr><th>Semana</th><th>Rango (días)</th><th class="n">Importe</th><th class="n">Fecha de pago</th><th class="n">N.º factura</th><th class="n">Fecha factura</th><th>NIT factura</th><th>N.º autorización</th><th>Mes declaración</th><th class="n">Débito fiscal 13%</th><th class="n">IT 3%</th></tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
        (d.hist.length ? '<tfoot><tr><td colspan="2">Total pagado</td><td class="n">' + fmt(c.tot, 2) + '</td><td colspan="6"></td><td class="n">' + fmt(c.tot * 0.13, 2) + '</td><td class="n">' + fmt(c.tot * 0.03, 2) + '</td></tr></tfoot>' : '') +
      '</table>' + (filas ? '' : '<p class="inf-vacio">Sin pagos registrados.</p>') +
      '<div class="inf-pie"><img src="' + base + 'marca/logos/nummeros-logotipo-firma-principal.svg" alt="NUMMEROS by CONTAX"><span>CONTAX · Contabilidad e Impuestos · generado el ' + X.fechaHora(new Date()) + '</span></div></div>';
  }

  /* PDF: se abre el informe solo en una ventana y se imprime («Guardar como PDF») */
  function pdf(d) {
    var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var w = window.open('', '_blank');
    if (!w) { X.aviso('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ' + esc(d.id) + ' ' + esc(d.nombre) + '</title><style>body{margin:0;background:#fff}' + INF_CSS.replace(/BASE/g, base) + '</style></head><body>' +
      htmlPdf(d, base) + '<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)})}<\/script></body></html>');
    w.document.close();
  }

  /* ══════════ VISTA EN PANTALLA (como el resto del sistema) ══════════ */
  function vista(d) {
    var c = cifras(d), dato = function (t, v) { return '<div class="dato"><small>' + t + '</small><b>' + v + '</b></div>'; };
    var ini = String(d.nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
    IN.filas = c.filas;
    return '<div class="card mb inf-ficha"><div class="inf-ini">' + esc(ini || '?') + '</div><div class="inf-nom"><h2>' + esc(d.nombre || 'Sin nombre') + '</h2><span class="num muted">ID Yango ' + esc(d.id) + '</span>' +
        '<div class="fila-acc" style="margin-top:8px">' + (d.habilitado ? X.chip('ok', 'Habilitado en Yango') : X.chip('mal', 'No habilitado')) + ' ' + (d.retenido ? X.chip('mal', 'Pago retenido') : X.chip('ok', 'Sin retención')) + ' ' +
          (d.faltaFactura ? X.chip('pend', 'Falta factura') : X.chip('ok', 'Facturación en orden')) + ' ' + (d.poliza ? X.chip('ok', 'Con póliza') : X.chip('pend', 'Sin póliza')) + ' ' + (d.contador === 'CONTAX' ? X.chip('contax', 'Cliente CONTAX') : '') + '</div></div>' +
        '<div class="fila-acc inf-acc"><button class="btn" id="infPdf">' + ic('descargar') + 'Descargar PDF</button>' +
          (d.telefono ? '<a class="btn sec" href="' + X.wa(d.telefono, 'Hola ' + String(d.nombre || '').split(' ')[0] + ', te escribimos de CONTAX.') + '" target="_blank" rel="noopener">' + ic('whatsapp') + 'WhatsApp</a>' : '') +
          (d.r ? '<button class="btn sec" id="infFicha">' + ic('ojo') + 'Ficha completa</button>' : '') + '</div></div>' +
      '<div class="rejilla r4 mb">' +
        '<div class="kpi"><small>Total cobrado</small><b class="num">' + bs(c.tot) + '</b><em>' + entero(d.hist.length) + ' pagos recibidos</em></div>' +
        '<div class="kpi' + (c.totPend ? ' alerta' : '') + '"><small>Pendiente</small><b class="num">' + bs(c.totPend) + '</b><em>' + entero(c.pend.length) + ' semanas' + (d.retenido ? ' · retenido' : '') + '</em></div>' +
        '<div class="kpi"><small>Último pago</small><b class="num">' + (c.ultimo ? bs(c.ultimo.importe) : '—') + '</b><em>' + (c.ultimo ? X.fecha(c.ultimo.fecha) + ' · ' + esc(c.ultimo.semana) : 'sin pagos') + '</em></div>' +
        '<div class="kpi"><small>Promedio por pago</small><b class="num">' + bs(d.hist.length ? c.tot / d.hist.length : 0) + '</b><em>Débito fiscal 13%: ' + bs(c.tot * 0.13) + '</em></div>' +
      '</div>' +
      '<div class="card mb"><div class="h2">Datos generales</div><div class="datos" style="margin:0">' +
        dato('Razón social', esc(d.razon || '—')) + dato('NIT', '<span class="num">' + esc(d.nit || '—') + '</span>') + dato('Teléfono', '<span class="num">' + esc(d.telefono || '—') + '</span>') + dato('Correo', esc(d.correo || '—')) +
        dato('Banco', esc(d.banco || '—')) + dato('N.º de cuenta', '<span class="num">' + esc(d.cuenta || '—') + '</span>') + dato('Estado en Yango', esc(d.estadoYango || '—')) + dato('Contador', esc(d.contador)) +
      '</div></div>' +
      '<div class="graf-rejilla mb">' +
        '<div class="card"><div class="h2">Ingresos por fecha de pago <small>últimas 12</small></div><div class="grafico"><canvas id="gInfF"></canvas></div></div>' +
        '<div class="card"><div class="h2">Ingresos por mes <small>últimos 12 meses</small></div><div class="grafico"><canvas id="gInfM"></canvas></div></div>' +
      '</div>' +
      '<div class="card mb"><div class="h2">Proyección impositiva <small>por mes de la factura</small></div><div class="grafico"><canvas id="gInfI"></canvas></div></div>' +
      '<div class="card"><div class="h2">Historial de pagos y facturación <small>' + entero(c.filas.length) + ' filas · ' + bs(c.tot) + ' pagado</small></div>' +
        (c.filas.length ? '<div class="tabla-ancha">' + X.tabla([
          { t: 'Estado', html: function (f) { return f.pend ? X.chip(f.ok ? 'pend' : 'mal', f.estado) : X.chip('ok', 'Pagado'); } },
          { t: 'Semana', html: function (f) { return '<b class="num">' + esc(f.semana) + '</b>'; } },
          { t: 'Rango (días)', html: function (f) { return '<span style="white-space:nowrap">' + esc(f.rango) + '</span>'; } },
          { t: 'Importe', clase: 'monto', html: function (f) { return bs(f.importe); } },
          { t: 'Fecha de pago', html: function (f) { return f.fecha ? '<span class="num">' + X.fecha(f.fecha) + '</span>' : '<span class="muted">—</span>'; } },
          { t: 'N.º factura', html: function (f) { return esc(f.factura); } },
          { t: 'Fecha factura', html: function (f) { return esc(f.fechaFactura); } },
          { t: 'NIT factura', html: function (f) { return '<span class="num">' + esc(f.nit) + '</span>'; } },
          { t: 'N.º autorización', html: function (f) { return '<span class="sub num" style="max-width:180px;display:block;overflow:hidden;text-overflow:ellipsis" title="' + esc(f.autorizacion) + '">' + esc(f.autorizacion) + '</span>'; } },
          { t: 'Mes declaración', html: function (f) { return esc(f.mes); } },
          { t: 'Débito fiscal 13%', clase: 'monto', html: function (f) { return bs(f.importe * 0.13); } },
          { t: 'IT 3%', clase: 'monto', html: function (f) { return bs(f.importe * 0.03); } }
        ], c.filas, { tam: 50, pag: IN.pag || 0, pie: d.hist.length ? '<td colspan="3">Total pagado</td><td class="monto">' + bs(c.tot) + '</td><td colspan="6"></td><td class="monto">' + bs(c.tot * 0.13) + '</td><td class="monto">' + bs(c.tot * 0.03) + '</td>' : '' }) + '</div>' : X.vacio('Sin pagos registrados')) +
      '</div>';
  }
  function graficos(el, d) {
    var c = cifras(d), col = X.colores(), tip = { callbacks: { label: function (x) { return x.dataset.label + ': ' + bs(x.parsed.y); } } };
    var eje = { y: { ticks: { callback: function (v) { return 'Bs ' + entero(v); } } } };
    var g = function (id, etq, sets, ley) {
      var cv = el.querySelector(id); if (!cv) return;
      X.grafico(cv, { type: 'bar', data: { labels: etq, datasets: sets }, options: { maintainAspectRatio: false, plugins: { legend: { display: !!ley, position: 'bottom' }, tooltip: tip }, scales: eje } });
    };
    g('#gInfF', c.fechas.etq, [{ label: 'Pagado', data: c.fechas.v, backgroundColor: col.fuerte }]);
    g('#gInfM', c.meses.etq, [{ label: 'Total del mes', data: c.meses.v, backgroundColor: col.medio }]);
    g('#gInfI', c.imp.etq, [{ label: 'Débito fiscal (13%)', data: c.imp.df, backgroundColor: col.fuerte }, { label: 'IT (3%)', data: c.imp.it, backgroundColor: col.medio }], true);
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
      var cab = X.titulo('Buscar repartidor', 'Escribe el nombre o el ID para ver su informe general (pagos, facturas e impuestos). Con «Descargar PDF» sale el informe para enviárselo.');
      if (!D.repartidores) return cab + X.esqueleto(2);
      var res = buscar(IN.buscar);
      var caja = '<div class="card mb"><div class="herr"><div class="buscar">' + ic('buscar') + '<input type="search" id="bInf" placeholder="Nombre o ID del repartidor" value="' + esc(IN.buscar) + '" autocomplete="off"></div>' +
        '</div>' +
        (IN.buscar && !IN.id ? (res.length ? '<div class="lista-res">' + res.map(function (x) {
          return '<button class="fila-res" data-inf="' + esc(x.id) + '"><b>' + esc(x.nombre || 'Sin nombre') + '</b><span class="num muted">ID ' + esc(x.id) + '</span></button>';
        }).join('') + '</div>' : X.vacio('No encontramos a nadie con «' + esc(IN.buscar) + '»', 'Prueba con otra parte del nombre o con el ID.')) : '') + '</div>';
      if (!IN.id) return cab + caja;
      var d = datos(IN.id); cargarPerfil(d.uid);
      return cab + caja + vista(d);
    },
    despues: function (el) {
      var b = el.querySelector('#bInf');
      if (b) b.addEventListener('input', X.debounce(function () { IN.buscar = b.value; IN.id = ''; X.refrescar(); X.setFoco('#bInf'); }, 250));
      el.querySelectorAll('[data-inf]').forEach(function (x) { x.addEventListener('click', function () { abrir(x.getAttribute('data-inf')); }); });
      var p = el.querySelector('#infPdf'); if (p) p.addEventListener('click', function () { pdf(datos(IN.id)); });
      if (!IN.id || !D.repartidores) return;
      var d = datos(IN.id); graficos(el, d);
      var fi = el.querySelector('#infFicha'); if (fi) fi.addEventListener('click', function () { X.detalleRepartidor(d.uid); });
      el.querySelectorAll('.tabla-ancha [data-pag]').forEach(function (b) { b.addEventListener('click', function () { IN.pag = Number(b.getAttribute('data-pag')); X.refrescar(); }); });
    }
  });
  function abrir(id) {
    var c = candidatos()[String(id)];
    IN.id = String(id); IN.pag = 0; IN.buscar = c && c.nombre ? c.nombre : String(id);
    if (S.pagina === 'informe') X.refrescar(); else X.ir('informe');
  }

  X.informe = { abrir: abrir, _puro: { buscar: buscar, datos: datos, htmlPdf: htmlPdf, cifras: cifras, css: function (b) { return INF_CSS.replace(/BASE/g, b); } } };
})();
