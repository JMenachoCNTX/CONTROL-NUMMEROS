# CONTROL · NUMMEROS

## Para qué sirve
Panel **interno** del equipo de CONTAX para manejar el **Portal de repartidores** (repo `PortalNUMMEROS`).
Los repartidores nunca lo ven. Desde aquí se revisan las facturas que suben, se arma la planilla de pago,
se publican anuncios/avisos/preguntas y notificaciones, y se ven los chats del asistente con IA.

Secciones: Tablero, Facturas (incluye cruce con el Excel de Impuestos Nacionales), Pagos pendientes (con botón «Códigos de banco»), Historial de pagos,
Repartidores (al tocar uno se abre su informe con PDF), DBYango, Trámites, Anuncios / Avisos / Preguntas, Notificaciones, Chats del asistente,
Clientes CONTAX, Excepciones, Equipo y Bitácora. El detalle de cada una está en `README.md`.

## Para qué empresa
CONTAX (sistema NUMMEROS by CONTAX). Los pagos a repartidores (Yango) los hace **MILTHAGOR S.R.L.**
(razón social y NIT en `config.js`). Corte semanal de facturas: jueves 18:00 (hora de Bolivia).

## Cómo está armado (archivos principales)
- `index.html` — la página y todo el diseño (marca NUMMEROS).
- `config.js` — versión, datos de los 3 proyectos de Firebase, URL del puente, corte, regla de pago (`reglaPago: 'todo'` o `'semana'`) y **`fuentePagos`** (`'sheets'` = los pagos salen de Google Sheets como antes; `'control'` = salen de la colección `semanas`).
- `js/base.js` — inicio de sesión, menú, ventanas, Excel (SheetJS desde cdnjs) y carga de datos.
- `js/operacion.js` — Tablero, Pagos, Historial, Repartidores, Trámites.
- `js/facturas.js` — revisión de facturas y cruce con Impuestos.
- `js/portal.js` — Anuncios, Avisos, Preguntas, Notificaciones, Chats.
- `js/gestion.js` — Clientes CONTAX, Excepciones, Equipo, Bitácora, Ayuda.
- `js/semanas.js` — semanas de pago: importar las 3 planillas semanales de Yango/MTG («Milthagor Santa Cruz 19.10.26-25.10.26.xlsx»: se paga la columna **Y «Importe total»**; con importe 0 = no habilitado, **se guardan todas las filas** con sus ganancias (W) e importe del periodo anterior (X) para que el repartidor vea cada semana), migración única desde Sheets, marcar semanas «en planilla», confirmar pago, anular planilla, deshacer importación y reporte con gráficos.
- `js/documentos.js` — página Documentos: lo que suben los repartidores en «Mis documentos» (NIT, matrícula con vigencia, ROE, declaraciones mensuales, EEFF); filtros Por revisar / Incompletos / Matrícula vencida; aprobar u observar cada uno.
- `js/banco.js` — cuentas bancarias de los repartidores, planilla de carga masiva del **Banco Ganadero** (una fila por semana pagada; glosa `Pago MTG - ID Rider: {id} Fact.Nro.{n} - SEM43G2026`; forma 1 = Ganadero, 3 = ACH con código de entidad), «Detalle Pagos {fecha}» en Excel (mismo formato que se manda a Milthagor) y conciliación con el extracto (ACEP/PROCESADO = pagado, VENCIDO u otro = rebotado y vuelve a pendientes).
- `firestore.rules` — reglas del proyecto `control--nummeros`.
- `marca/` — logos, íconos, fuentes y fotos de la marca (copia de la misma carpeta de los otros repos).
- No hay paso de compilación: son archivos HTML/JS planos con Firebase "compat" 10.12 desde gstatic.

## Dónde se guardan los datos
Usa **tres** proyectos de Firebase a la vez:
- `control--nummeros` (propio): colecciones `clientes`, `excepciones`, `notas`, `cruces`, `pagos` (planillas generadas, con estado `enviada` / `pagada` / `anulada`), `importaciones` (cada planilla semanal cargada), `cuentas` (cuenta bancaria de cada repartidor, id = ID Yango; datos sensibles, solo admin/operador), `config`, `bitacora` (no se edita ni borra).
- `portal-nummeros` (el del Portal): lee `repartidores`, `publico/portal` y `publico/contenido`, `privado/estado`; revisa `facturas` y `facturasPdf`; escribe `imagenes`, `colaNotif`; lee `chats`, `notificaciones`.
  Escribe **`semanas`** (una por repartidor y semana; id `{idYango}_{año}-{semana}`; estados `pendiente` / `no_habilitado` / `en_planilla` / `pagado`). La estructura y las reglas están acordadas en `../INTEGRACION-NUCLEO-YANGO.md`: no cambiarlas sin actualizar ese documento.
- `crm-contax` (Panel NUMMEROS): solo para **iniciar sesión** y leer la lista `users` (sección Equipo).

## Cómo se entra (accesos únicos)
Se entra con el **mismo correo y contraseña del Panel NUMMEROS** (repo `NUMMEROS_CRM`).
El puente de Apps Script del Panel (acción `admin_ctrl_sesion`, en `PASARELA.gs` de `NUMMEROS_CRM`) crea una
"cuenta espejo" en `control--nummeros` y `portal-nummeros` con el permiso (`nm`, `rol` = admin / operador / lectura).
El permiso se elige en **Panel → Usuarios → columna CONTROL**. Las reglas de este repo confían en ese permiso.

## Cómo se publica
- GitHub Pages desde la rama `main` (raíz): https://jmenachocntx.github.io/CONTROL-NUMMEROS/
- Todavía **no hay archivo `CNAME`**. El dominio previsto es `controlnummeros.contaxbolivia.com` (pasos en `README.md`).
- `firestore.rules` **no se publica solo**: hay que copiarlo y pegarlo en la consola de Firebase del proyecto `control--nummeros` → Firestore → Reglas → Publicar.
- Versiones: `version` en `config.js` (hoy 2.2), el `?v=` de los scripts en `index.html` y el mensaje del commit dice la versión (ej. "... (v1.4)").

## Cuidados importantes
- **El repositorio es PÚBLICO.** Nunca subir contraseñas, archivos `.json` de cuentas de servicio ni datos de clientes.
- Los datos de Firebase de `config.js` no son secretos (la seguridad la dan las reglas); no cambiarlos sin motivo.
- **Clientes CONTAX** = clientes «Activos» de Panel → Clientes (`bdclientes` de `crm-contax`, títulos con número adelante como «2. NIT»; se leen al abrir la pestaña, ~1.000 lecturas). Solo lectura: se editan en el Panel. Se marca quién es repartidor de Yango por NIT (BDYango) o celular. La colección propia `clientes` de CONTROL (vacía) sigue siendo la que usa `clienteDe` para «CONTAX debe emitir» en Pagos. Muestra contraseñas: datos sensibles.
- Si cambias reglas que afectan al Portal, el archivo correcto es `firestore.rules` de `PortalNUMMEROS`, no este.
- Este panel depende del puente del Panel NUMMEROS: si se cambia la URL `/exec` del puente, actualizar `puenteUrl` en `config.js`.
- Agregar un `.gitignore` con `.DS_Store` antes de subir archivos desde la Mac.
- **Cruce con Impuestos (Registro de Compras de MILTHAGOR, mejor en .xlsx):** una factura solo queda verificada si coinciden **NIT del emisor + N.º + importe** (los números se repiten entre repartidores). Sin NIT (facturas antiguas): N.º + importe + fecha + nombre del emisor; si no alcanza, «revisar a mano». Las de otro mes no se marcan como faltantes. Las verificadas guardan `verificacion` y aprobar a mano una sin verificar pide confirmación.
- **NIT de cada repartidor** (`portal-nummeros/perfiles/{uid}`: `nit`, `razonSocial`): lo registra él una sola vez en el Portal; solo el equipo lo corrige (detalle del repartidor → «Corregir NIT»). Las facturas leídas por IA traen `autorizacion` (CUF), `razonEmisor` y `leidaIA`; el cruce busca primero por el código de autorización.
- **Corte de facturas: jueves 18:00 (Bolivia).** Una factura aprobada subida después del último corte queda «después del corte» y entra a la planilla siguiente (las emitidas por CONTAX no tienen corte).
- **Datos bancarios: salen de BDYango** («BOL Registro Activación», hojas Activation/Deactivation SCZ, CBBA, LPZ). **Se lee en vivo** al abrir CONTROL por el puente del Panel (acción `admin_ctrl_hoja`, `hoja: 'bdyango'`) y se ve en la pestaña **DBYango**; la planilla usa esas cuentas sin apretar nada (una cuenta corregida a mano en «Cuentas bancarias», `origen: 'manual'`, manda sobre BDYango). «Importar BDYango» (Excel) queda como respaldo. Usa ID, Nombre/Apellido, CI, NIT, Teléfono, Banco, Cta Banco y Telegram; la última fila de cada ID manda. Bancos → código: BNB 1001, BMSC 1003, BCP 1005, BISA 1009, Unión 1014, Económico 1016, Sol 1017, FIE 1033, Fortaleza 1034; Ganadero y Yolo = Banco Ganadero (forma 1). Si a un repartidor listo le falta nombre, carnet, banco o cuenta, no entra a la planilla y su semana guarda `fueraDePlanilla.motivo`, que el repartidor ve en su portal.
- **`fuentePagos: 'control'` desde el 31/10/2026 (v2.0)** en CONTROL y en el Portal: ya no se usan PPendientes ni HistPagosMTG (no volver a 'sheets'). Única hoja que se sigue leyendo: BDYango (la mantiene Yango). Lo demás (ASEGURADOS, Habilitados, trámites…) todavía viene del robot y se migrará después.
- **Historial de pagos propio** (ya no la hoja HistPagosMTG): colección `historialPagos` del Portal, un documento por fecha de pago (`{fecha}_{parte}`, máx. 2000 pagos; `{fecha}_c` = confirmados en CONTROL) con los pagos en `filas` (texto JSON, columnas de HistPagosMTG: semana, rango, ID, nombre, importe, comentarios, N.º/fecha/NIT/autorización de factura, nro, mes de pago, gestión) para ahorrar escrituras. Cada repartidor tiene `historialRider/{uid}` (lo lee su portal). Cada vez que se abre CONTROL se leen ~5 mil documentos (repartidores, semanas abiertas, historial): Firebase está en plan **Spark** (20 mil escrituras y 50 mil lecturas por día), no guardar un documento por pago. Pagos → «Migrar desde Sheets» lee HistPagosMTG y PPendientes en vivo (`admin_ctrl_hoja`, `hoja: 'pagos'`, solo admin), reescribe el historial y pasa los pendientes a `semanas`. Migrado el 31/10/2026: 31.766 pagos · Bs 28.755.672,67 y 1.100 pendientes · Bs 254.614,46 (igual a las hojas).
- **Códigos de banco:** cuadro «Códigos de Banco para Envío vía ACH» en `TABLA_BANCOS` de `js/banco.js` (página oculta del menú; se abre desde Pagos pendientes → «Códigos de banco»). Yape = BCP 1005; Yolo = Ganadero. «Banco no reconocido» = el texto de BDYango no está en el cuadro.
- **Menú plegable** (solo escritorio): se guarda en el navegador (`ctrl_menu_mini`). Plegado, al pasar el cursor muestra el nombre (`.menu-tip`) y el contenido usa todo el ancho. Páginas con `oculta: true` no tienen botón en el menú; `padre` dice qué botón queda marcado.
- **Gráficos en 3D:** todos pasan por `X.grafico` (Chart.js + plugin `nm3d` en `js/base.js`: barras con cara de arriba y costado, líneas/tortas con sombra, animación; clic en el gráfico = verlo en grande, se cierra con Esc o clic fuera). En SVG (reporte de pago y PDF) usar `X.barraSvg`.
- **Historial de pagos:** subpestañas «Gráficos», «Fechas de pago» y «Todos los pagos» (las dos últimas con las 13 columnas de HistPagosMTG).
- **Repartidores + informe (antes «Buscar repartidor»):** al tocar un repartidor se abre su informe (página `informe`, oculta del menú) con el diseño del sistema; «Descargar PDF» arma el informe con formato NUMMEROS y logo de CONTAX.
- **Fotos de colaboración** (`marca/colaboracion/`): la fuente es `EdiThor-Nummeros/colaboracion/`.
