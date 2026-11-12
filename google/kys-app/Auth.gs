function hashPassword_(password) {
  var salt = PropertiesService.getScriptProperties().getProperty('KYS_PWD_SALT') || 'kys-change-salt-in-production';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return Utilities.base64Encode(digest);
}

function createSession_(email) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('kys_sess_' + token, email, 604800);
  return token;
}

function sessionEmail_(token) {
  if (!token) return null;
  return CacheService.getScriptCache().get('kys_sess_' + token);
}

function destroySession_(token) {
  if (token) CacheService.getScriptCache().remove('kys_sess_' + token);
}

function authLogin_(email, password) {
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.USERS));
  var user = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase() === String(email).toLowerCase()) {
      user = rows[i];
      break;
    }
  }
  if (!user || String(user.activo) === 'false') throw new Error('Credenciales inválidas');
  if (user.password_hash !== hashPassword_(password)) throw new Error('Credenciales inválidas');
  return { token: createSession_(user.email), user: userOut_(user) };
}

function authMe_(token) {
  var email = sessionEmail_(token);
  if (!email) throw new Error('No autenticado');
  var cache = CacheService.getScriptCache();
  var cacheKey = 'kys_user_profile_' + String(email).toLowerCase();
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.USERS));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase() === String(email).toLowerCase()) {
      var user = userOut_(rows[i]);
      cache.put(cacheKey, JSON.stringify(user), 300);
      return user;
    }
  }
  throw new Error('No autenticado');
}

function requireUser_(token) {
  return authMe_(token);
}

function userOut_(row) {
  var nombre = row.nombre_visible || row.display_name;
  var rol = row.rol || row.role;
  var activo = row.activo != null ? row.activo : row.is_active;
  return {
    id: Number(row.id),
    email: row.email,
    nombre_visible: nombre,
    rol: rol,
    activo: String(activo) !== 'false',
    tema: String(row.tema) === 'light' ? 'light' : 'dark',
  };
}

function patchUserPrefs_(token, body) {
  var me = requireUser_(token);
  var tema = body && body.tema === 'light' ? 'light' : 'dark';
  var sh = getSheet_(KYS_CONFIG.SHEETS.USERS);
  var u = KYS_FIELDS.USUARIO;
  var patch = {};
  patch[u.tema] = tema;
  var row = updateById_(sh, me.id, patch);
  CacheService.getScriptCache().remove('kys_user_profile_' + String(me.email).toLowerCase());
  return userOut_(row);
}

function listUsers_(token) {
  var me = requireUser_(token);
  if (me.rol !== 'admin') throw new Error('Solo administrador');
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.USERS)).map(userOut_);
}

function ensureUserByEmail_(sh, email, nombreVisible, rol) {
  var rows = sheetToObjects_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase() === String(email).toLowerCase()) return;
  }
  appendObject_(sh, {
    email: email,
    password_hash: hashPassword_('admin123'),
    nombre_visible: nombreVisible,
    rol: rol,
    activo: true,
  });
}

function seedAdminIfEmpty_() {
  var sh = getSheet_(KYS_CONFIG.SHEETS.USERS);
  ensureUserByEmail_(sh, 'admin@kyscred.com', 'Admin', 'admin');
  ensureUserByEmail_(sh, 'vivi@kyscred.com', 'Vivi', 'seller');
  ensureUserByEmail_(sh, 'sebas@kyscred.com', 'Sebas', 'seller');
  ensureUserByEmail_(sh, 'karen@kyscred.com', 'Karen', 'seller');
  ensureUserByEmail_(sh, 'otro@kyscred.com', 'Otro', 'seller');
}
