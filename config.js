/* ══════════════════════════════════════════════════════════
   CONTROL · NUMMEROS — configuración
   Lo único que normalmente se cambia a mano está aquí.
   Los datos de Firebase NO son secretos: Google los diseñó para ir
   en la página. La seguridad la dan las reglas (firestore.rules).
   ══════════════════════════════════════════════════════════ */
window.CONTROL = {
  version: '1.2',

  /* Proyecto propio de CONTROL (equipo, clientes CONTAX, excepciones, bitácora) */
  firebaseControl: {
    apiKey: 'AIzaSyCtMUF21_dROzI4HBBlR-eB1-JKED36PrA',
    authDomain: 'control--nummeros.firebaseapp.com',
    projectId: 'control--nummeros',
    storageBucket: 'control--nummeros.firebasestorage.app',
    messagingSenderId: '849078323735',
    appId: '1:849078323735:web:e1cec4f2ca846097ce6a52'
  },

  /* Proyecto del Portal de repartidores (lo que ven ellos) */
  firebasePortal: {
    apiKey: 'AIzaSyBh_NxhM5h6x--ZwxwoUCYf0yhW7Mt9k_A',
    authDomain: 'portal-nummeros.firebaseapp.com',
    projectId: 'portal-nummeros',
    storageBucket: 'portal-nummeros.firebasestorage.app',
    messagingSenderId: '924886635369',
    appId: '1:924886635369:web:48f940d324d4dfb518e3f8'
  },

  /* El PANEL NUMMEROS es la fuente de usuarios de todos los sistemas internos.
     Se entra a CONTROL con el mismo correo y contraseña del Panel (y del CRM).
     El permiso en CONTROL se elige en Panel → Usuarios → columna CONTROL. */
  firebasePanel: {
    apiKey: 'AIzaSyBPUgVMi3IQCow6pJiQwaC-WsH_mMf_arI',
    authDomain: 'crm-contax.firebaseapp.com',
    projectId: 'crm-contax',
    storageBucket: 'crm-contax.firebasestorage.app',
    messagingSenderId: '954647268749',
    appId: '1:954647268749:web:247ec1c576ddd2a50181c4'
  },
  panelUrl: 'https://nummerospanel.contaxbolivia.com',
  /* Puente seguro (Apps Script "PUENTE RECIBOS NUMMEROS", el mismo del Panel) */
  puenteUrl: 'https://script.google.com/macros/s/AKfycbz5vQn78Hmcw_NwIIg0c33WEsmrXrYRgARwlmrJqOjM_h-yz-whXbAeoaqWCdI_3TqK2A/exec',

  portalUrl: 'https://portalnummeros.contaxbolivia.com',

  /* Corte semanal de facturas: jueves 18:00 (hora de Bolivia) */
  corte: { dia: 4, hora: 18 },

  facturacion: { razonSocial: 'MILTHAGOR S.R.L.', nit: '550276028' },

  /* Regla de pago: 'todo' = si falta una factura se retienen todos sus pagos.
     'semana' = se paga cada semana que tenga su factura aprobada. */
  reglaPago: 'todo'
};
