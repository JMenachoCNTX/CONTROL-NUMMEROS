# CONTROL · NUMMEROS

Panel del equipo para manejar todo lo del **Portal de repartidores** (Portal CONTAX).
El portal es para los repartidores (como un "portal de clientes"); **CONTROL es el sistema interno**: ellos nunca lo ven.

- **Página:** https://jmenachocntx.github.io/CONTROL-NUMMEROS/ (y, cuando se configure el DNS, https://controlnummeros.contaxbolivia.com)
- **Acceso:** con el **mismo correo y contraseña del Panel NUMMEROS** (los mismos del CRM). El Panel es la fuente de usuarios de todos los sistemas internos: en **Panel → Usuarios**, la columna **CONTROL** define si cada persona entra como Administrador, Operador, Solo lectura o sin acceso («Automático» lo deduce de su rol: Admin y Supervisor → Administrador, Editor → Operador, Cajero y Lector → Solo lectura, Agente → sin acceso).
- **Datos:** dos proyectos de Firebase
  - `control--nummeros` → lo interno: equipo, clientes CONTAX (con sus accesos), excepciones, notas, planillas generadas, cruces con Impuestos y bitácora.
  - `portal-nummeros` → lo que ven los repartidores: pagos, facturas que suben, anuncios, avisos, preguntas, notificaciones.

```
Google Sheets ──cada 15 min──▶ Portal (portal-nummeros) ◀──── CONTROL (equipo)
                                   ▲  facturas en PDF               │
                         Repartidor ┘                               ▼
                                                      control--nummeros (interno)
```

## Qué hay en cada sección

| Sección | Para qué sirve |
|---|---|
| **Tablero** | Resumen: por pagar, listos para pagar, facturas por revisar, cuenta regresiva al corte (jueves 18:00) y gráficos. |
| **Facturas** | Las que suben los repartidores en «Mis facturas». Ves el PDF, si el importe cuadra con sus semanas, y apruebas, observas o rechazas (con motivo). El repartidor lo ve al instante. Aprobación en lote, registro de facturas emitidas por CONTAX y **cruce con el Excel de Impuestos Nacionales**. |
| **Pagos** | Quién está listo para cobrar y quién queda retenido (regla «todo o nada», excepciones y clientes CONTAX aplicados solos). Descarga la **planilla de pago en Excel** (Pagar, Retenidos, Resumen) y la guarda en «Planillas generadas». |
| **Historial de pagos** | Pagos ya realizados por fecha de pago, con gráfico y Excel. |
| **Repartidores** | Todos los de BDYANGO: situación, pendientes, facturas, historial, trámites, nota interna, WhatsApp y excepción de pago. |
| **Trámites** | Soporte, pólizas, devoluciones y desactivación, todos juntos. |
| **Anuncios / Avisos / Preguntas** | Lo que aparece en el portal (antes estaba dentro del portal como administrador). |
| **Notificaciones** | Mensajes al celular de los repartidores (salen en los próximos 15 min). |
| **Chats del asistente** | Lo que preguntan al asistente con IA. |
| **Clientes CONTAX** | Repartidores a quienes CONTAX emite la factura, con NIT y contraseñas (botón copiar). Se puede importar desde Excel (BDYANGO, columna CONTADOR = CONTAX). |
| **Excepciones** | Pagos que se liberan aunque falte la factura. |
| **Equipo** | Lista de usuarios del Panel y con qué permiso entra cada uno a CONTROL (se cambia en el Panel). |
| **Bitácora** | Quién hizo qué y cuándo. No se puede editar ni borrar. |

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página y su diseño (Manual de marca NUMMEROS v1.1) |
| `config.js` | Datos de los dos proyectos de Firebase, dueños, corte y regla de pago |
| `js/base.js` | Inicio de sesión, menú, ventanas, Excel y pantallas de espera |
| `js/operacion.js` | Tablero, Pagos, Historial, Repartidores y Trámites |
| `js/facturas.js` | Revisión de facturas y cruce con Impuestos |
| `js/portal.js` | Anuncios, Avisos, Preguntas, Notificaciones y Chats |
| `js/gestion.js` | Clientes CONTAX, Excepciones, Equipo, Bitácora y Ayuda |
| `firestore.rules` | Seguridad del proyecto `control--nummeros` |
| `marca/` | Logos, íconos, letras, fotos de los clásicos y de la colaboración NUMMEROS × CONTAX |

## Cambiar la regla de pago
En `config.js`, `reglaPago: 'todo'` (se retiene todo si falta una factura) o `'semana'` (se paga cada semana con su factura aprobada).

## Dominio propio (opcional)
1. En **Squarespace → Dominios → contaxbolivia.com → DNS → Registros personalizados** agrega: Host `controlnummeros`, Tipo `CNAME`, Datos `jmenachocntx.github.io`.
2. En GitHub → este repositorio → **Settings → Pages → Custom domain**: `controlnummeros.contaxbolivia.com` → Save → luego **Enforce HTTPS**.

El dominio ya está autorizado en Firebase (en los dos proyectos).

## Cómo funcionan los accesos únicos
1. La persona escribe su correo y contraseña del Panel. CONTROL entra al proyecto del Panel (`crm-contax`) para verificarla.
2. El puente del Panel (Apps Script «PUENTE RECIBOS NUMMEROS», acción `admin_ctrl_sesion`) revisa que esté activa y su permiso en CONTROL, y crea o actualiza su **cuenta espejo** en `control--nummeros` y en `portal-nummeros` con ese permiso.
3. La cuenta espejo usa una llave al azar que nadie conoce (guardada en `ctrlLlaves`, que ninguna página puede leer).
4. Al cambiar rol, estado o acceso en Panel → Usuarios, el Panel avisa al puente (`admin_ctrl_sync`) y el permiso cambia al instante; si se desactiva, la cuenta espejo se apaga.
