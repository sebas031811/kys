function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('KYS')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return HtmlService.createHtmlOutput(
      '<h1>KYS</h1><p>Index.html is missing or invalid in Apps Script.</p>' +
        '<p>On your PC run <code>npm run build</code>, then upload <code>google/kys-app/Index.html</code> ' +
        '(or <code>npm run gas:push</code> when clasp works).</p><pre>' + msg + '</pre>'
    ).setTitle('KYS — setup required');
  }
}
