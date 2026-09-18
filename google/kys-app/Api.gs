function apiDispatch(req) {
  try {
    req = req || {};
    var method = String(req.method || 'GET').toUpperCase();
    var path = String(req.path || '/');
    var body = req.body || null;
    var token = req.token || '';

    var data = routeApi_(method, path, body, token);
    return { data: data };
  } catch (e) {
    var msg = e.message || String(e);
    var status = 400;
    if (msg === 'Unauthorized' || msg === 'Not authenticated') status = 401;
    if (msg === 'Forbidden' || msg === 'Admin only') status = 403;
    if (msg.indexOf('not found') !== -1) status = 404;
    return { error: msg, status: status };
  }
}

function routeApi_(method, path, body, token) {
  if (method === 'POST' && path === '/api/auth/login') {
    return authLogin_(body.email, body.password);
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    destroySession_(token);
    return { message: 'logged out' };
  }
  if (method === 'GET' && path === '/api/auth/me') {
    return authMe_(token);
  }
  if (method === 'GET' && path === '/api/auth/users') {
    return listUsers_(token);
  }

  if (method === 'GET' && path === '/api/clients') {
    requireUser_(token);
    return listClients_();
  }
  if (method === 'POST' && path === '/api/clients') {
    requireUser_(token);
    return createClient_(body);
  }
  if (method === 'POST' && path === '/api/clients/parse') {
    requireUser_(token);
    return parseClientRequest_(body);
  }

  if (method === 'GET' && path === '/api/accounts') {
    requireUser_(token);
    return listAccounts_();
  }
  if (method === 'POST' && path === '/api/accounts') return createAccount_(body, token);

  if (method === 'POST' && path === '/api/pricing/preview') {
    requireUser_(token);
    return computeSalePricing_(body);
  }

  if (method === 'GET' && path === '/api/sales/dashboard/seller') return sellerDashboard_(token);

  if (method === 'GET' && (path === '/api/sales' || path.indexOf('/api/sales?') === 0)) {
    var q = parseQuery_(path);
    return listSales_(token, q.record_status || null);
  }

  var saleMatch = path.match(/^\/api\/sales\/(\d+)(\/confirm|\/payments)?$/);
  if (saleMatch) {
    var saleId = saleMatch[1];
    var sub = saleMatch[2];
    if (method === 'GET' && !sub) return getSale_(token, saleId);
    if (method === 'PATCH' && !sub) return updateSale_(token, saleId, body);
    if (method === 'POST' && sub === '/confirm') return confirmSale_(token, saleId, body);
    if (method === 'POST' && sub === '/payments') return recordPayment_(token, saleId, body);
  }

  var quoteMatch = path.match(/^\/api\/quotes\/(\d+)\/print$/);
  if (method === 'GET' && quoteMatch) {
    return { html: quotePrintHtml_(token, quoteMatch[1]) };
  }

  throw new Error('Unknown route: ' + method + ' ' + path);
}

function parseQuery_(path) {
  var q = {};
  var i = path.indexOf('?');
  if (i === -1) return q;
  path.substring(i + 1).split('&').forEach(function (pair) {
    var p = pair.split('=');
    q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
  });
  return q;
}
