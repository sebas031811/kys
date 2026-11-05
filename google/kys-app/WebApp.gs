function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('KYS')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return HtmlService.createHtmlOutput(
      '<h1>KYS</h1><p>Falta Index.html en Apps Script o el archivo no es válido.</p>' +
        '<p>En tu PC ejecuta <code>npm run build</code> o <code>npm run gas:push</code>, ' +
        'luego sube <code>google/kys-app/Index.html</code>.</p><pre>' + msg + '</pre>'
    ).setTitle('KYS — configuración');
  }
}
