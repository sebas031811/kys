var KYS_CONFIG = {
  BUSINESS: {
    name: 'KYS',
    whatsapp: '+573002683732',
    email: 'kyscred@gmail.com',
    address: 'Itagui, Antioquia',
  },
  SHEETS: {
    USERS: 'Usuarios',
    CLIENTS: 'Clientes',
    ACCOUNTS: 'Cuentas',
    SALES: 'Ventas',
    INSTALLMENTS: 'Cuotas',
    PAYMENTS: 'Pagos',
  },
  SPREADSHEET_ID_PROPERTY: 'KYS_SPREADSHEET_ID',
};

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(KYS_CONFIG.SPREADSHEET_ID_PROPERTY);
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setSpreadsheetId_(id) {
  PropertiesService.getScriptProperties().setProperty(KYS_CONFIG.SPREADSHEET_ID_PROPERTY, id);
}
