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
  if (!user || String(user.is_active) === 'false') throw new Error('Invalid credentials');
  if (user.password_hash !== hashPassword_(password)) throw new Error('Invalid credentials');
  return { token: createSession_(user.email), user: userOut_(user) };
}

function authMe_(token) {
  var email = sessionEmail_(token);
  if (!email) throw new Error('Unauthorized');
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.USERS));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase() === String(email).toLowerCase()) {
      return userOut_(rows[i]);
    }
  }
  throw new Error('Unauthorized');
}

function requireUser_(token) {
  return authMe_(token);
}

function userOut_(row) {
  return {
    id: Number(row.id),
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    is_active: String(row.is_active) !== 'false',
  };
}

function listUsers_(token) {
  var me = requireUser_(token);
  if (me.role !== 'admin') throw new Error('Admin only');
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.USERS)).map(userOut_);
}

function seedAdminIfEmpty_() {
  var sh = getSheet_(KYS_CONFIG.SHEETS.USERS);
  if (sheetToObjects_(sh).length > 0) return;
  appendObject_(sh, {
    email: 'admin@kyscred.com',
    password_hash: hashPassword_('admin123'),
    display_name: 'Admin',
    role: 'admin',
    is_active: true,
  });
}
