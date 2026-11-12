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
    if (msg === 'No autenticado' || msg === 'Unauthorized' || msg === 'Not authenticated') status = 401;
    if (msg === 'Acceso denegado' || msg === 'Forbidden' || msg === 'Solo administrador' || msg === 'Admin only') status = 403;
    if (msg.indexOf('no encontrada') !== -1 || msg.indexOf('not found') !== -1) status = 404;
    return { error: msg, status: status };
  }
}

function routeApi_(method, path, body, token) {
  if (method === 'POST' && path === '/api/auth/login') {
    return authLogin_(body.email, body.password);
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    destroySession_(token);
    return { message: 'Sesión cerrada' };
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

  if (method === 'GET' && path === '/api/accounts/summary') {
    requireUser_(token);
    return listAccountsSummary_(token);
  }
  if (method === 'GET' && path === '/api/accounts') {
    requireUser_(token);
    return listAccounts_();
  }
  if (method === 'POST' && path === '/api/accounts') return createAccount_(body, token);
  if (method === 'POST' && path === '/api/accounts/transfers') {
    requireUser_(token);
    return recordAccountTransfer_(body, token);
  }

  var accountMatch = path.match(/^\/api\/accounts\/(\d+)$/);
  if (accountMatch && method === 'PATCH') {
    requireUser_(token);
    return updateAccount_(accountMatch[1], body, token);
  }

  if (method === 'POST' && path === '/api/pricing/preview') {
    requireUser_(token);
    return computeSalePricing_(body);
  }

  if (method === 'GET' && path === '/api/sales/dashboard/seller') return sellerDashboard_(token);

  if (method === 'GET' && (path === '/api/sales' || path.indexOf('/api/sales?') === 0)) {
    var q = parseQuery_(path);
    var estado = q.estado_registro || q.record_status || null;
    return listSales_(token, estado);
  }
  if (method === 'POST' && path === '/api/sales') {
    requireUser_(token);
    return createSale_(token, body);
  }

  var salePaymentMatch = path.match(/^\/api\/sales\/(\d+)\/payments\/(\d+)$/);
  if (salePaymentMatch) {
    if (method === 'PATCH') {
      return updatePayment_(token, salePaymentMatch[1], salePaymentMatch[2], body);
    }
    if (method === 'DELETE') {
      return deletePayment_(token, salePaymentMatch[1], salePaymentMatch[2]);
    }
  }

  var saleMatch = path.match(/^\/api\/sales\/(\d+)(\/confirm|\/payments)?$/);
  if (saleMatch) {
    var saleId = saleMatch[1];
    var sub = saleMatch[2];
    if (method === 'GET' && !sub) return getSale_(token, saleId);
    if (method === 'DELETE' && !sub) return deleteSale_(token, saleId);
    if (method === 'PATCH' && !sub) return updateSale_(token, saleId, body);
    if (method === 'POST' && sub === '/confirm') return confirmSale_(token, saleId, body);
    if (method === 'POST' && sub === '/payments') return recordPayment_(token, saleId, body);
  }

  var quoteMatch = path.match(/^\/api\/quotes\/(\d+)\/print$/);
  if (method === 'GET' && quoteMatch) {
    return { html: quotePrintHtml_(token, quoteMatch[1]) };
  }

  throw new Error('Ruta desconocida: ' + method + ' ' + path);
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
