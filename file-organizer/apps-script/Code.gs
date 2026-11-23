/**
 * NV Stills Drive writer — Google Apps Script web app.
 *
 * Deploy once from Jasmine's Google account (see docs/howto/drive-storage.md).
 * Script Properties (Project Settings → Script properties):
 *   STILLS_FOLDER_ID  = Drive folder id for "Stills"
 *   SHARED_SECRET     = same value as Worker secret DRIVE_SHARED_SECRET
 *
 * POST JSON body:
 *   { filename, mimeType, base64, date, secret }
 * Optional action for list:
 *   { action: "list", prefix, secret }
 *
 * Returns JSON: { ok, id, name, url } on upload success.
 * Never hardcode secrets or folder ids in this file.
 */

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('SHARED_SECRET') || '';
    var stillsRoot = props.getProperty('STILLS_FOLDER_ID') || '';
    if (!expected || !stillsRoot) {
      return jsonOut_({
        ok: false,
        error: 'misconfigured',
        message: 'SHARED_SECRET or STILLS_FOLDER_ID missing in Script Properties.',
      }, 503);
    }

    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw) {
      return jsonOut_({ ok: false, error: 'bad_request', message: 'Empty body.' }, 400);
    }

    var body;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return jsonOut_({ ok: false, error: 'bad_request', message: 'Body must be JSON.' }, 400);
    }

    var secret = String(body.secret || '');
    if (!timingSafeEqual_(secret, expected)) {
      return jsonOut_({ ok: false, error: 'unauthorized', message: 'Invalid secret.' }, 401);
    }

    if (body.action === 'list') {
      return handleList_(stillsRoot, String(body.prefix || ''));
    }

    return handleUpload_(stillsRoot, body);
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: 'server_error',
      message: String(err && err.message ? err.message : err),
    }, 500);
  }
}

function doGet() {
  return jsonOut_({ ok: true, service: 'nv-stills-drive-writer' }, 200);
}

function handleUpload_(stillsRoot, body) {
  var filename = sanitizeName_(String(body.filename || 'still'));
  var mimeType = String(body.mimeType || 'application/octet-stream');
  var date = String(body.date || Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonOut_({ ok: false, error: 'bad_request', message: 'date must be YYYY-MM-DD.' }, 400);
  }
  var b64 = String(body.base64 || '');
  if (!b64) {
    return jsonOut_({ ok: false, error: 'bad_request', message: 'base64 required.' }, 400);
  }

  // Practical limit: Apps Script web-app POST is ~50 MB; base64 adds ~33% so ~35 MB raw max.
  // Worker still enforces its own cap before calling us.
  var approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > 35 * 1024 * 1024) {
    return jsonOut_({ ok: false, error: 'too_large', message: 'Decoded payload too large for Apps Script.' }, 413);
  }

  var dayFolder = ensureChildFolder_(stillsRoot, date);
  var uniqueName = uniqueFilename_(dayFolder, filename);

  var blob;
  try {
    blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, uniqueName);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'bad_request', message: 'Invalid base64.' }, 400);
  }

  var file = dayFolder.createFile(blob);
  file.setName(uniqueName);

  return jsonOut_({
    ok: true,
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    folderId: dayFolder.getId(),
    date: date,
  }, 201);
}

function handleList_(stillsRoot, prefix) {
  // prefix like "2026-11-08" or empty for recent across date folders
  var root = DriveApp.getFolderById(stillsRoot);
  var objects = [];
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    var fname = folder.getName();
    if (prefix && fname.indexOf(prefix) !== 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fname)) continue;
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      objects.push({
        key: fname + '/' + f.getName(),
        id: f.getId(),
        name: f.getName(),
        url: f.getUrl(),
        size: f.getSize(),
        mimeType: f.getMimeType(),
      });
      if (objects.length >= 500) break;
    }
    if (objects.length >= 500) break;
  }
  return jsonOut_({ ok: true, prefix: prefix || '', objects: objects }, 200);
}

function ensureChildFolder_(parentId, name) {
  var parent = DriveApp.getFolderById(parentId);
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function uniqueFilename_(folder, filename) {
  var parts = splitName_(filename);
  var candidate = filename;
  if (!folder.getFilesByName(candidate).hasNext()) return candidate;
  for (var n = 2; n < 10000; n++) {
    candidate = parts.stem + '-' + n + parts.ext;
    if (!folder.getFilesByName(candidate).hasNext()) return candidate;
  }
  return parts.stem + '-' + Date.now() + parts.ext;
}

function splitName_(name) {
  var i = name.lastIndexOf('.');
  if (i <= 0) return { stem: name, ext: '' };
  return { stem: name.substring(0, i), ext: name.substring(i) };
}

function sanitizeName_(raw) {
  var base = String(raw).split(/[/\\]/).pop() || 'still';
  var cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .substring(0, 120);
  return cleaned || 'still';
}

/** Constant-time-ish compare (Apps Script has no crypto.subtle). */
function timingSafeEqual_(a, b) {
  a = String(a);
  b = String(b);
  var len = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < len; i++) {
    var x = i < a.length ? a.charCodeAt(i) : 0;
    var y = i < b.length ? b.charCodeAt(i) : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function jsonOut_(obj, _status) {
  // Apps Script web apps cannot set HTTP status freely on all deployments;
  // callers should also check the `ok` / `error` fields.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
