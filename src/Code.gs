/** AICHEATCODE Prompt Vault — Google Apps Script backend.
 * Deploy: Execute as Me, Who has access: Anyone.
 * Admin access uses a server-verified password + short-lived cache session.
 * IMPORTANT: Apps Script is not suitable for high-security or very large databases.
 */
const VAULT = { SHEET: 'Prompts', HEADERS: ['id','title','category','language','prompt','tags','status','createdAt','updatedAt'], PAGE_SIZE: 24, MAX_ROWS: 20000 };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('AICHEATCODE | Prompt Vault')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupVault_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('VAULT_SHEET_ID');
  let ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('AICHEATCODE Prompt Vault Database');
    props.setProperty('VAULT_SHEET_ID', ss.getId());
  }
  let sh = ss.getSheetByName(VAULT.SHEET);
  if (!sh) sh = ss.insertSheet(VAULT.SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(VAULT.HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,VAULT.HEADERS.length).setFontWeight('bold');
  } else {
    const header = sh.getRange(1,1,1,VAULT.HEADERS.length).getValues()[0];
    if (header.join('|') !== VAULT.HEADERS.join('|')) throw new Error('Existing sheet columns do not match the expected schema. No data was changed.');
  }
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  return ss.getUrl();
}

/** Run only from the Apps Script editor. Never call this from the public UI. */
function setAdminPassword_(password) {
  if (typeof password !== 'string' || password.length < 16) throw new Error('Use an admin password of at least 16 characters.');
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  props.setProperties({ ADMIN_SALT: salt, ADMIN_HASH: digest_(salt + ':' + password), ADMIN_PASSWORD_UPDATED: new Date().toISOString() });
  return 'Admin password configured. Remove any temporary setup function containing your password.';
}

/** One-time private bootstrap: add INITIAL_ADMIN_PASSWORD under Script properties, then run this in the Apps Script editor. */
function initializeAdminFromProperty_() {
  const props = PropertiesService.getScriptProperties();
  const password = props.getProperty('INITIAL_ADMIN_PASSWORD');
  if (!password) throw new Error('Set INITIAL_ADMIN_PASSWORD in Script properties first.');
  const result = setAdminPassword_(password);
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  return result;
}

function digest_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}
function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('VAULT_SHEET_ID');
  if (!id) throw new Error('Run setupVault() from the editor first.');
  const sh = SpreadsheetApp.openById(id).getSheetByName(VAULT.SHEET);
  if (!sh) throw new Error('Prompts sheet is missing.');
  return sh;
}
function rows_() {
  const sh = db_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  if (last - 1 > VAULT.MAX_ROWS) throw new Error('Dataset exceeds the Google Sheets application limit. Migrate to a database for larger collections.');
  return sh.getRange(2,1,last-1,VAULT.HEADERS.length).getValues().map((row,i) => {
    const obj = { _row: i+2 };
    VAULT.HEADERS.forEach((h,j) => obj[h] = String(row[j] == null ? '' : row[j]));
    return obj;
  });
}
function publicRow_(r) {
  return { id:r.id, title:r.title, category:r.category, language:r.language, prompt:r.prompt, tags:r.tags, updatedAt:r.updatedAt };
}
function listPrompts(query, category, page) {
  const q = String(query || '').trim().toLocaleLowerCase().slice(0,120);
  const cat = String(category || '').trim();
  const p = Math.max(1,Math.min(10000,Math.floor(Number(page)||1)));
  const published = rows_().filter(r => r.status === 'published');
  const categories = [...new Set(published.map(r => r.category).filter(Boolean))].sort();
  const filtered = published.filter(r => (!cat || r.category === cat) && (!q || [r.title,r.category,r.tags,r.prompt].some(v => v.toLocaleLowerCase().includes(q))));
  const start = (p-1)*VAULT.PAGE_SIZE;
  return { items: filtered.slice(start,start+VAULT.PAGE_SIZE).map(publicRow_), total:filtered.length, page:p, pageSize:VAULT.PAGE_SIZE, categories };
}
function getPrompt(id) {
  const r = rows_().find(x => x.id === String(id) && x.status === 'published');
  if (!r) throw new Error('Prompt not found.');
  return publicRow_(r);
}

// Sessions are stored server-side in Apps Script CacheService (up to six hours).
function adminLogin(password) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('ADMIN_SALT');
  const hash = props.getProperty('ADMIN_HASH');
  if (!salt || !hash) throw new Error('Admin password has not been configured.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = 'login_attempts';
    const attempts = Number(cache.get(key)||0);
    if (attempts >= 8) throw new Error('Too many login attempts. Try again in 15 minutes.');
    if (typeof password !== 'string' || digest_(salt+':'+password) !== hash) {
      cache.put(key,String(attempts+1),900);
      throw new Error('Invalid admin password.');
    }
    cache.remove(key);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('session_' + digest_(token), 'admin', 21600);
    return { token:token, expiresInSeconds:21600 };
  } finally { lock.releaseLock(); }
}
function requireAdmin_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/.test(token)) throw new Error('Admin login required.');
  if (CacheService.getScriptCache().get('session_' + digest_(token)) !== 'admin') throw new Error('Admin session expired. Please log in again.');
}
function adminLogout(token) {
  requireAdmin_(token);
  CacheService.getScriptCache().remove('session_' + digest_(token));
  return true;
}
function adminList(token) {
  requireAdmin_(token);
  return rows_().reverse().map(r => ({ id:r.id, title:r.title, category:r.category, language:r.language, prompt:r.prompt, tags:r.tags, status:r.status, createdAt:r.createdAt, updatedAt:r.updatedAt }));
}
function validatePrompt_(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid prompt data.');
  const clean = {
    title: String(data.title||'').trim(), category:String(data.category||'').trim(),
    language:String(data.language||'BM').trim(), prompt:String(data.prompt||'').trim(),
    tags:String(data.tags||'').trim(), status:String(data.status||'draft').trim()
  };
  if (!clean.title || clean.title.length > 180) throw new Error('Title is required (maximum 180 characters).');
  if (!clean.category || clean.category.length > 80) throw new Error('Category is required (maximum 80 characters).');
  if (!['BM','EN'].includes(clean.language)) throw new Error('Language must be BM or EN.');
  if (!clean.prompt || clean.prompt.length > 30000) throw new Error('Prompt is required (maximum 30,000 characters).');
  if (clean.tags.length > 500) throw new Error('Tags are too long.');
  if (!['draft','published'].includes(clean.status)) throw new Error('Invalid status.');
  return clean;
}
function safeCell_(value) {
  const s = String(value == null ? '' : value);
  // Prevent Sheets formula injection, even for user-authored text.
  return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
}
function adminSave(token, data) {
  requireAdmin_(token);
  const clean = validatePrompt_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = db_();
    const existing = data.id ? rows_().find(r=>r.id===String(data.id)) : null;
    if (data.id && !existing) throw new Error('Prompt to edit was not found.');
    const now = new Date().toISOString();
    const values = [existing ? existing.id : Utilities.getUuid(),clean.title,clean.category,clean.language,clean.prompt,clean.tags,clean.status,existing ? existing.createdAt : now,now].map(safeCell_);
    if (existing) sh.getRange(existing._row,1,1,VAULT.HEADERS.length).setValues([values]);
    else sh.appendRow(values);
    return { id: values[0], saved:true };
  } finally { lock.releaseLock(); }
}
function adminDelete(token,id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = rows_().find(x=>x.id===String(id));
    if (!r) throw new Error('Prompt not found.');
    db_().deleteRow(r._row);
    return { deleted:true };
  } finally { lock.releaseLock(); }
}