/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — Reporte de pago en PDF
   Resumen y gráficos de una planilla del banco. Es un PDF real que se
   descarga solo (sin ventana de impresión). Usa los mismos números que
   el «Detalle de pagos» en Excel: X.banco.resumenPlanilla.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var X = window.CTRL, C = X.C, bs = X.bs, entero = X.entero;
  var TINTA = '#051F20', SUAVE = '#557363', LINEA = '#DAF1DE', PRINCIPAL = '#235347', CLARO = '#8EB69B', RETENIDO = '#B54708';
  var NOMBRE = { SC: 'Santa Cruz', CBBA: 'Cochabamba', LP: 'La Paz', '': 'Sin ciudad' };
  var ANCHO = 215.9, ALTO = 279.4, M = 16, UTIL = ANCHO - M * 2, TOPE = 31, PIE = 260; // hoja carta, como la hoja membretada del manual de marca

  var LOGO_N = 539 / 2000, LOGO_C = 159 / 600; // alto ÷ ancho de cada logo
  var cargado = null;
  function cargarPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
    if (!cargado) cargado = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = function () { ok(window.jspdf.jsPDF); };
      s.onerror = function () { cargado = null; mal(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
    return cargado;
  }
  /* jsPDF no lee SVG: el logo se pasa a imagen en el navegador. Si no carga, el PDF sale igual, sin ese logo. */
  function logo(url, w, h) {
    return new Promise(function (ok) {
      var i = new Image();
      i.onload = function () {
        try { var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h); ok(c.toDataURL('image/png')); } catch (e) { ok(null); }
      };
      i.onerror = function () { ok(null); };
      i.src = url;
    });
  }
  function semCorta(k) { var m = String(k).match(/^SEM(\d+)G\d{2}(\d{2})$/); return m ? 'Sem ' + m[1] + '/' + m[2] : String(k); }
  function pct(v, t) { return t ? (v / t * 100).toFixed(1).replace('.', ',') + ' %' : '—'; }
  function pagos(n) { return entero(n) + (n === 1 ? ' pago' : ' pagos'); }
  function ordenCiudades(o) { return ['SC', 'CBBA', 'LP', ''].filter(function (k) { return o[k]; }); }
  /* «Sem 42: Falta factura · Sem 41: Factura observada» → cuántas semanas retenidas hay por cada motivo */
  function motivos(ret) {
    var c = {};
    ret.forEach(function (r) {
      String(r.motivo || 'Sin detalle').split(' · ').forEach(function (m) { var k = m.replace(/^[^:]*:\s*/, '') || 'Sin detalle'; c[k] = (c[k] || 0) + 1; });
    });
    var l = Object.keys(c).map(function (k) { return { k: k, n: c[k] }; }).sort(function (a, b) { return b.n - a.n; });
    if (l.length > 7) { var resto = l.slice(6).reduce(function (s, x) { return s + x.n; }, 0); l = l.slice(0, 6).concat([{ k: 'Otros motivos', n: resto }]); }
    return l;
  }

  function armar(Pdf, p, logos) {
    var doc = new Pdf({ unit: 'mm', format: 'letter' }), y = TOPE, R = X.banco.resumenPlanilla(p), pl = R.planilla, ret = p.retenidosDet || [], sc = p.sinCuenta || [];
    var pagada = p.estado === 'pagada', verbo = pagada ? 'pagado' : 'a pagar', Verbo = pagada ? 'Pagado' : 'A pagar';
    var letra = function (t, n, color, gruesa) { doc.setFont('helvetica', gruesa ? 'bold' : 'normal'); doc.setFontSize(n); doc.setTextColor(color || TINTA); return t; };
    var espacio = function (h) { if (y + h > PIE) { doc.addPage(); y = TOPE; } };
    var seccion = function (t, sub, h) {
      espacio(h + 12); y += 5;
      doc.text(letra(t, 12, PRINCIPAL, true), M, y); y += 4.5;
      if (sub) { doc.text(letra(sub, 8.5, SUAVE), M, y); y += 4.5; }
      y += 1;
    };
    var barra = function (x, yy, w, h, color) { doc.setFillColor(color); doc.roundedRect(x, yy, Math.max(w, 0.7), h, Math.min(0.8, w / 2), Math.min(0.8, h / 2), 'F'); };
    /* Barras horizontales: nombre a la izquierda y el valor escrito al final de cada barra */
    var barras = function (datos) {
      var eti = 28, val = 54, max = Math.max.apply(null, datos.map(function (d) { return d.v; }).concat([1])), alto = 7, largo = UTIL - eti - val;
      datos.forEach(function (d) {
        espacio(alto);
        var w = d.v / max * largo;
        doc.text(letra(d.k, 9, TINTA), M + eti - 3, y + 3.6, { align: 'right' });
        barra(M + eti, y, w, 4.6, d.color || PRINCIPAL);
        doc.text(letra(d.txt, 9, TINTA), M + eti + w + 2, y + 3.6);
        y += alto;
      });
    };
    var leyenda = function (l) {
      var x = M;
      l.forEach(function (i) {
        doc.setFillColor(i.color); doc.roundedRect(x, y - 2.6, 3, 3, 0.6, 0.6, 'F');
        doc.text(letra(i.t, 8.5, SUAVE), x + 4.2, y); x += 4.2 + doc.getTextWidth(i.t) + 6;
      });
      y += 4.5;
    };
    /* Tabla simple. cols: [{t, w, der}]; la última fila puede ir en negrita */
    var tabla = function (cols, filas, conTotal) {
      var fila = function (celdas, gruesa, color) {
        espacio(6.2);
        var x = M;
        cols.forEach(function (c, i) {
          doc.text(letra(String(celdas[i]), 9, color, gruesa), c.der ? x + c.w - 1 : x + 1, y + 4, c.der ? { align: 'right' } : undefined);
          x += c.w;
        });
        y += 6.2;
        doc.setDrawColor(LINEA); doc.setLineWidth(0.2); doc.line(M, y, M + UTIL, y);
      };
      fila(cols.map(function (c) { return c.t; }), true, PRINCIPAL);
      filas.forEach(function (f, i) { fila(f, conTotal && i === filas.length - 1); });
    };

    /* ── Encabezado ── */
    doc.text(letra('Reporte de pago a repartidores', 19, TINTA, true), M, y + 4); y += 11;
    var fechaP = p.fechaPago || p.fechaProgramada || p.fecha;
    var estado = pagada ? 'Pagada' : p.estado === 'anulada' ? 'Anulada' : 'Pago por confirmar';
    doc.text(letra(((C.facturacion || {}).razonSocial || 'MILTHAGOR S.R.L.') + '  ·  Fecha de pago ' + X.fecha(fechaP) + '  ·  ' + R.principal + '  ·  ' + estado, 9.5, SUAVE), M, y); y += 6;

    /* ── Cifras principales ── */
    var totRet = pl ? X.redondear(pl.retenido.t) : X.redondear(ret.reduce(function (s, r) { return s + (Number(r.importe) || 0); }, 0));
    var kpis = [
      { t: 'Total ' + verbo, v: bs(p.total), s: pagos((p.lineas || []).length) },
      { t: 'Repartidores', v: entero(p.cantidad), s: 'en esta planilla' }
    ].concat(pl ? [
      { t: 'Planilla ' + semCorta(R.principal), v: bs(pl.t), s: entero(pl.n) + ' repartidores' },
      { t: 'Retenido ' + semCorta(R.principal), v: bs(totRet), s: entero(pl.retenido.n) + ' repartidores' }
    ] : [
      { t: 'Retenidos', v: entero(p.retenidos || ret.length), s: 'repartidores' },
      { t: 'Importe retenido', v: bs(totRet), s: 'todas las semanas' }
    ]);
    var kw = (UTIL - 9) / 4;
    kpis.forEach(function (k, i) {
      var x = M + i * (kw + 3);
      doc.setDrawColor(LINEA); doc.setLineWidth(0.4); doc.roundedRect(x, y, kw, 20, 1.5, 1.5, 'S');
      doc.text(letra(k.t, 8, SUAVE), x + 3, y + 5.5);
      doc.text(letra(k.v, 11, TINTA, true), x + 3, y + 11.5);
      doc.text(letra(k.s, 8, SUAVE), x + 3, y + 16.5);
    });
    y += 23;

    /* ── Gráficos ── */
    var ciu = ordenCiudades(R.ciudades);
    seccion(Verbo + ' por ciudad', 'Todas las semanas incluidas en esta planilla.', ciu.length * 7);
    barras(ciu.map(function (k) { var c = R.ciudades[k]; return { k: NOMBRE[k], v: c.t, txt: bs(c.t) + ' · ' + pagos(c.n) }; }));

    if (pl) {
      var cp = ordenCiudades(pl.ciudades);
      seccion('Planilla de la ' + semCorta(R.principal) + ' por ciudad', 'Cuánto de la semana sale en planilla y cuánto queda retenido.', cp.length * 11 + 5);
      leyenda([{ color: PRINCIPAL, t: Verbo }, { color: RETENIDO, t: 'Retenido' }]);
      var maxC = Math.max.apply(null, cp.map(function (k) { return pl.ciudades[k].t; }).concat([1])), eti = 28, largo = UTIL - eti - 2;
      cp.forEach(function (k) {
        var c = pl.ciudades[k], wP = (c.t - c.ret) / maxC * largo, wR = c.ret / maxC * largo;
        doc.text(letra(NOMBRE[k], 9, TINTA), M + eti - 3, y + 3.6, { align: 'right' });
        if (wP > 0) barra(M + eti, y, wP - (wR > 0 ? 0.5 : 0), 4.6, PRINCIPAL);
        if (wR > 0) barra(M + eti + wP, y, wR, 4.6, RETENIDO);
        doc.text(letra(Verbo + ' ' + bs(c.t - c.ret) + '  ·  Retenido ' + bs(c.ret) + ' (' + pct(c.ret, c.t) + ')', 8.5, SUAVE), M + eti, y + 8);
        y += 11;
      });

      seccion('Estado de la ' + semCorta(R.principal), 'Repartidores de la semana según su situación de pago.', 18);
      var est = [{ k: 'Habilitados', g: pl.habilitado, color: PRINCIPAL }, { k: 'Con excepción', g: pl.excepcion, color: CLARO }, { k: 'Retenidos', g: pl.retenido, color: RETENIDO }]
        .filter(function (e) { return e.g.n; });
      var x = M;
      est.forEach(function (e) { var w = e.g.n / pl.n * UTIL; barra(x, y, w - 0.5, 6, e.color); x += w; });
      y += 10;
      leyenda(est.map(function (e) { return { color: e.color, t: e.k + ': ' + entero(e.g.n) + ' (' + pct(e.g.n, pl.n) + ')' }; }));
    }

    seccion(Verbo + ' por semana', 'Cada semana incluida en esta planilla.', Math.min(R.semanas.length, 8) * 7);
    barras(R.semanas.map(function (s) { return { k: semCorta(s.sem), v: s.t, txt: bs(s.t) + ' · ' + pagos(s.n) }; }));

    /* ── Cuadros ── */
    espacio(50); y += 8;
    doc.text(letra('Resumen en cifras', 15, TINTA, true), M, y + 3); y += 7;
    seccion('Detalle por semana', '', 20);
    tabla([{ t: 'Semana', w: 70 }, { t: 'Cant', w: 28, der: true }, { t: 'Importe', w: 46, der: true }, { t: '% del total', w: UTIL - 144, der: true }],
      R.semanas.map(function (s) { return [s.sem, entero(s.n), bs(s.t), pct(s.t, p.total)]; }).concat([['TOTAL ' + (pagada ? 'PAGADO' : 'A PAGAR'), entero((p.lineas || []).length), bs(p.total), '100,0 %']]), true);
    if (pl) {
      seccion('Planilla de la ' + semCorta(R.principal) + ' por ciudad', '', 20);
      tabla([{ t: 'Ciudad', w: 70 }, { t: 'Cant', w: 28, der: true }, { t: 'Importe', w: 46, der: true }, { t: 'Retenido', w: UTIL - 144, der: true }],
        ordenCiudades(pl.ciudades).map(function (k) { var c = pl.ciudades[k]; return ['PLANILLA ' + (k || 'SIN CIUDAD'), entero(c.n), bs(c.t), bs(c.ret)]; })
          .concat([['TOTAL PLANILLA', entero(pl.n), bs(pl.t), bs(totRet)]]), true);
    }
    if (ret.length) {
      var mo = motivos(ret);
      seccion('Motivos de retención', entero(ret.length) + ' repartidores retenidos. Cada uno puede tener varias semanas con motivos distintos.', 20);
      tabla([{ t: 'Motivo', w: 130 }, { t: 'Semanas', w: UTIL - 130, der: true }], mo.map(function (m) { return [m.k, entero(m.n)]; }));
    }
    if (sc.length) {
      var tsc = X.redondear(sc.reduce(function (s, r) { return s + (Number(r.importe) || 0); }, 0));
      seccion('Sin cuenta bancaria', '', 10);
      doc.text(letra(entero(sc.length) + ' repartidores listos para cobrar quedaron fuera por no tener cuenta completa: ' + bs(tsc) + '.', 9.5, TINTA), M, y + 2); y += 6;
    }

    /* ── Hoja membretada en cada página: logos arriba; datos y franja verde abajo ── */
    var total = doc.getNumberOfPages(), cuando = X.fechaHora(new Date());
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      if (logos[0]) doc.addImage(logos[0], 'PNG', M, 11, 35, 35 * LOGO_N, 'nummeros', 'FAST');
      if (logos[1]) doc.addImage(logos[1], 'PNG', ANCHO - M - 36, 11, 36, 36 * LOGO_C, 'contax', 'FAST');
      doc.setDrawColor(LINEA); doc.setLineWidth(0.3); doc.line(M, ALTO - 15.5, ANCHO - M, ALTO - 15.5);
      doc.text(letra('NUMMEROS by CONTAX', 8, TINTA, true), M, ALTO - 11.5);
      var ancho = doc.getTextWidth('NUMMEROS by CONTAX');
      doc.text(letra('  ·  info@contaxbolivia.com  ·  Santa Cruz, Bolivia  ·  Generado el ' + cuando, 8, SUAVE), M + ancho, ALTO - 11.5);
      doc.text(letra('Página ' + i + ' de ' + total, 8, SUAVE), ANCHO - M, ALTO - 11.5, { align: 'right' });
      doc.setFillColor(PRINCIPAL); doc.rect(0, ALTO - 4, ANCHO, 4, 'F');
    }
    return doc;
  }

  X.reportePdf = function (p) {
    return Promise.all([cargarPdf(), logo('marca/logos/nummeros-logotipo-firma-principal.svg', 1000, Math.round(1000 * LOGO_N)), logo('marca/logos/contax-logo.png', 600, 159)]).then(function (r) {
      var titulo = X.banco.tituloPlanilla(p);
      armar(r[0], p, [r[1], r[2]]).save('Reporte Pagos ' + titulo + '.pdf');
      X.bitacora('Descargó reporte de pago en PDF', titulo);
    });
  };
})();
