function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('KYS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
