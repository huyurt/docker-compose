const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const axios = require('axios');

try {
  require('dotenv').config();
} catch (e) {
  console.warn('[Config] dotenv not available, relying on OS env vars:', e.message);
}

const app = express();

const PORT = 3000;
const CONFIG = {
  port: PORT,
  testAppHost: process.env.TEST_APP_HOST,
  testAppPublicHost: process.env.TEST_APP_PUBLIC_HOST || process.env.TEST_APP_HOST,
  onlyOfficePublicUrl: process.env.ONLYOFFICE_PUBLIC_URL,
  jitsiDomain: process.env.JITSI_DOMAIN
};

console.log('[Config] Loaded:', JSON.stringify(CONFIG, null, 2));

// Disable SSL certificate errors for local self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Store for WOPI file locks
const fileLocks = new Map();

// Helper to get consistent document key for collaborative editing
function getDocumentKey(fileName) {
  const filePath = path.join(__dirname, 'files', fileName);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const cleanName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `${cleanName}_${Math.floor(stat.mtimeMs)}`;
  }
  return `${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}_1`;
}

// Middleware
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '100mb' }));
app.use('/files', express.static(path.join(__dirname, 'files')));
app.use('/plugins', express.static(path.join(__dirname, 'plugins')));

// ----------------------------------------------------
// 1. DASHBOARD & UI
// ----------------------------------------------------
app.get('/', (req, res) => {
  const filesDir = path.join(__dirname, 'files');
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
  }
  const files = fs.readdirSync(filesDir);

  const fileRows = files.map(f => {
    const stat = fs.statSync(path.join(filesDir, f));
    const sizeKb = (stat.size / 1024).toFixed(1) + ' KB';
    const modified = new Date(stat.mtime).toLocaleString('tr-TR');
    return `
      <tr>
        <td><strong>${f}</strong></td>
        <td>${sizeKb}</td>
        <td>${modified}</td>
        <td style="white-space: nowrap;">
          <a class="btn btn-blue" href="/editor?file=${encodeURIComponent(f)}&user=Ahmet">👤 Editor (Ahmet)</a>
          <a class="btn btn-purple" href="/editor?file=${encodeURIComponent(f)}&user=Mehmet" target="_blank">👥 Open Collaboratively (Mehmet)</a>
          <a class="btn btn-green" style="display: none;" href="/wopi-editor?file=${encodeURIComponent(f)}&user=Ahmet">🌐 WOPI Editor</a>
        </td>
      </tr>
    `;
  }).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>ONLYOFFICE & WOPI & Jitsi Test Portal</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 24px; color: #1c1e21; }
        .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 10px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        h1 { color: #1a73e8; margin-top: 0; display: flex; align-items: center; gap: 10px; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #e8f0fe; color: #1a73e8; }
        .info-card { background: #e8f4fd; border-left: 4px solid #1a73e8; padding: 14px 18px; margin-bottom: 20px; border-radius: 4px; font-size: 14px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e1e4e8; }
        th { background: #f6f8fa; font-weight: 600; }
        .btn { display: inline-block; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; margin-right: 4px; transition: opacity 0.2s; }
        .btn:hover { opacity: 0.85; }
        .btn-blue { background: #0066cc; color: white; }
        .btn-purple { background: #6f42c1; color: white; }
        .btn-green { background: #28a745; color: white; }
      </style>
    </head>
    <body>
      <div class="container">
        <h3>📁 Documents</h3>
        <table>
          <thead>
            <tr>
              <th>File Name</th>
              <th>Size</th>
              <th>Last Modified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});

// ----------------------------------------------------
// 2. ONLYOFFICE DOCS API EDITOR
// ----------------------------------------------------
app.get('/editor', (req, res) => {
  const fileName = req.query.file || "test.docx";
  const userName = req.query.user || "Ahmet";
  const userId = req.query.user === "Mehmet" ? "user_mehmet_2" : (req.query.user === "Ayse" ? "user_ayse_3" : "user_ahmet_1");

  const fileUrl = `http://${CONFIG.testAppHost}:${PORT}/files/${encodeURIComponent(fileName)}`;
  const ext = path.extname(fileName).substring(1).toLowerCase();
  const docKey = getDocumentKey(fileName);

  // Document Server Callback URL - includes the file parameter so backend knows which file to update
  const callbackUrl = `http://${CONFIG.testAppHost}:${PORT}/callback?file=${encodeURIComponent(fileName)}`;

  // Determine documentType
  let documentType = 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) documentType = 'cell';
  else if (['ppt', 'pptx', 'odp'].includes(ext)) documentType = 'slide';
  else if (['pdf'].includes(ext)) documentType = 'pdf';

  const config = {
    documentType: documentType,
    document: {
      fileType: ext,
      key: docKey,
      title: fileName,
      url: fileUrl,
      permissions: {
        comment: true,
        copy: true,
        download: true,
        edit: true,
        print: true,
        review: true
      }
    },
    editorConfig: {
      callbackUrl: callbackUrl,
      mode: "edit",
      lang: "tr",
      user: {
        id: userId,
        name: userName
      },
      coEditing: {
        mode: "fast",
        change: true
      },
      customization: {
        autosave: true,
        forcesave: true,
        chat: true,
        comments: true,
        plugins: true,
        pluginsData: {
          jitsi: {
            domain: CONFIG.jitsiDomain,
            roomName: `DocRoom_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
            userName: userName
          }
        }
      },
      plugins: {
        autostart: [
          "asc.{7645D461-84BC-4FB0-A42C-98118C14A1CD}"
        ],
        pluginsData: [
          `http://${CONFIG.testAppHost}:${PORT}/plugins/jitsi/config.json`
        ]
      }
    }
  };

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>ONLYOFFICE Editor - ${fileName} (${userName})</title>
        <script src="https://${CONFIG.onlyOfficePublicUrl.replace(/^https?:\/\//, '')}/web-apps/apps/api/documents/api.js"></script>
        <style>
          html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .top-bar { height: 42px; background: #2c3e50; color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 13px; }
          .top-bar a { color: #3498db; text-decoration: none; font-weight: 500; }
          .user-tag { background: #27ae60; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px; font-weight: 600; }
          #placeholder { height: calc(100vh - 42px); width: 100%; }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div>
            <a href="/">⬅ Back to Portal</a> | <strong>${fileName}</strong>
            <span class="user-tag">👤 Active User: ${userName}</span>
            <span style="margin-left: 10px; color: #bdc3c7;">Key: <code>${docKey}</code></span>
          </div>
          <div>
            <span>For collaborative testing: </span>
            <a href="/editor?file=${encodeURIComponent(fileName)}&user=Ahmet" target="_blank" style="color:#74b9ff; margin-right: 6px;">[Open as Ahmet]</a>
            <a href="/editor?file=${encodeURIComponent(fileName)}&user=Mehmet" target="_blank" style="color:#a29bfe; margin-right: 6px;">[Open as Mehmet]</a>
            <a href="/editor?file=${encodeURIComponent(fileName)}&user=Ayse" target="_blank" style="color:#55efc4;">[Open as Ayse]</a>
          </div>
        </div>
        <div id="placeholder"></div>
        <script>
          var docEditor = new DocsAPI.DocEditor("placeholder", ${JSON.stringify(config)});
        </script>
      </body>
    </html>
  `);
});

// ----------------------------------------------------
// 3. ONLYOFFICE CALLBACK HANDLER (FIX FOR SAVING ERROR)
// ----------------------------------------------------
app.post('/callback', async (req, res) => {
  const body = req.body;
  const fileName = req.query.file;

  console.log(`[ONLYOFFICE Callback] Status: ${body.status}, Key: ${body.key}, File: ${fileName || 'N/A'}`);

  // Status codes:
  // 1 - Document is being edited
  // 2 - Document is ready for saving (after editing session ends)
  // 3 - Document saving error
  // 4 - Document is closed with no changes
  // 6 - Document is being edited, but the current document state is saved (force save)
  // 7 - Error has occurred while force saving

  if (body.status === 2 || body.status === 6) {
    let downloadUrl = body.url;
    console.log(`[ONLYOFFICE Callback] Saving document from URL: ${downloadUrl}`);

    if (downloadUrl) {
      try {
        // Resolve internal docker network routing if needed
        let targetUrl = downloadUrl;
        const onlyOfficeHost = CONFIG.onlyOfficePublicUrl.replace(/^https?:\/\//, '');
        if (targetUrl.includes(onlyOfficeHost)) {
          // Inside docker network, the ONLYOFFICE public host can be reached via NPM proxy or onlyoffice container
          // Keeping https URL with rejectUnauthorized=false works with proxy
        }

        const response = await axios({
          method: 'GET',
          url: targetUrl,
          responseType: 'stream',
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          httpAgent: new http.Agent()
        });

        // Determine target file path
        let saveFileName = fileName;
        if (!saveFileName && body.key) {
          // Extract file name from key (key format: filename_timestamp)
          const parts = body.key.split('_');
          saveFileName = parts.slice(0, -1).join('_');
        }
        if (!saveFileName) saveFileName = "test.docx";

        const filePath = path.join(__dirname, 'files', saveFileName);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log(`[ONLYOFFICE Callback] Successfully saved file to: ${filePath}`);
      } catch (err) {
        console.error(`[ONLYOFFICE Callback Error] Failed to download/save file:`, err.message);
        // Even on error, OnlyOffice protocol expects json
        return res.json({ error: 1 });
      }
    }
  }

  // IMPORTANT: ONLYOFFICE strictly requires { "error": 0 }
  return res.json({ error: 0 });
});

// ----------------------------------------------------
// 4. WOPI HOST IMPLEMENTATION (MICROSOFT / ONLYOFFICE WOPI)
// ----------------------------------------------------

// WOPI CheckFileInfo: GET /wopi/files/:file_id
app.get('/wopi/files/:file_id', (req, res) => {
  const fileName = req.params.file_id;
  const filePath = path.join(__dirname, 'files', fileName);

  console.log(`[WOPI CheckFileInfo] File: ${fileName}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  const stat = fs.statSync(filePath);
  const userName = req.query.user || (req.query.access_token ? `User_${req.query.access_token}` : "Ahmet");
  const userId = req.query.user_id || "wopi_user_1";

  const checkFileInfo = {
    BaseFileName: fileName,
    OwnerId: "admin",
    Size: stat.size,
    UserId: userId,
    UserFriendlyName: userName,
    Version: String(stat.mtimeMs),
    UserCanWrite: true,
    UserCanNotWriteRelative: false,
    SupportsUpdate: true,
    SupportsLocks: true,
    SupportsGetLock: true,
    SupportsExtendedLockLength: true,
    SupportsUserInfo: true,
    SupportsCoauth: true,
    BreadcrumbBrandName: "ONLYOFFICE WOPI Portal",
    BreadcrumbDocName: fileName
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(checkFileInfo);
});

// WOPI GetFile: GET /wopi/files/:file_id/contents
app.get('/wopi/files/:file_id/contents', (req, res) => {
  const fileName = req.params.file_id;
  const filePath = path.join(__dirname, 'files', fileName);

  console.log(`[WOPI GetFile] Streaming: ${fileName}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('X-WOPI-ItemVersion', String(stat.mtimeMs));

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// WOPI PutFile: POST /wopi/files/:file_id/contents
app.post('/wopi/files/:file_id/contents', (req, res) => {
  const fileName = req.params.file_id;
  const filePath = path.join(__dirname, 'files', fileName);

  console.log(`[WOPI PutFile] Saving file: ${fileName}, Bytes received: ${req.body ? req.body.length : 0}`);

  try {
    fs.writeFileSync(filePath, req.body);
    const stat = fs.statSync(filePath);
    const version = String(stat.mtimeMs);

    res.setHeader('X-WOPI-ItemVersion', version);
    return res.status(200).json({ ItemVersion: version });
  } catch (err) {
    console.error(`[WOPI PutFile Error]:`, err);
    return res.status(500).json({ message: err.message });
  }
});

// WOPI Locks & Operations: POST /wopi/files/:file_id
app.post('/wopi/files/:file_id', (req, res) => {
  const fileName = req.params.file_id;
  const override = req.headers['x-wopi-override'];
  const lock = req.headers['x-wopi-lock'];
  const oldLock = req.headers['x-wopi-oldlock'];

  console.log(`[WOPI Operation] File: ${fileName}, Override: ${override}, Lock: ${lock}`);

  const currentLock = fileLocks.get(fileName);

  if (override === 'LOCK') {
    if (!currentLock || currentLock === lock) {
      fileLocks.set(fileName, lock);
      return res.status(200).end();
    } else {
      res.setHeader('X-WOPI-Lock', currentLock);
      return res.status(409).json({ message: "Lock mismatch" });
    }
  } else if (override === 'GET_LOCK') {
    if (currentLock) {
      res.setHeader('X-WOPI-Lock', currentLock);
    }
    return res.status(200).end();
  } else if (override === 'REFRESH_LOCK') {
    if (currentLock === lock) {
      return res.status(200).end();
    } else {
      res.setHeader('X-WOPI-Lock', currentLock || "");
      return res.status(409).json({ message: "Lock mismatch" });
    }
  } else if (override === 'UNLOCK') {
    if (currentLock === lock) {
      fileLocks.delete(fileName);
      return res.status(200).end();
    } else {
      res.setHeader('X-WOPI-Lock', currentLock || "");
      return res.status(409).json({ message: "Lock mismatch" });
    }
  }

  return res.status(200).end();
});

// ----------------------------------------------------
// 5. WOPI EDITOR VIEW (IFRAME)
// ----------------------------------------------------
app.get('/wopi-editor', (req, res) => {
  const fileName = req.query.file || "test.docx";
  const userName = req.query.user || "Ahmet";
  const token = `token_${Date.now()}`;

  // ONLYOFFICE WOPI action URL
  const wopiSrc = `https://${CONFIG.testAppPublicHost}/wopi/files/${encodeURIComponent(fileName)}`;
  const onlyOfficeWopiUrl = `https://${CONFIG.onlyOfficePublicUrl.replace(/^https?:\/\//, '')}/wopi/files/${encodeURIComponent(fileName)}?access_token=${token}&WOPISrc=${encodeURIComponent(wopiSrc)}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>ONLYOFFICE WOPI Editor - ${fileName}</title>
        <style>
          html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .top-bar { height: 42px; background: #1b4f72; color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 13px; }
          .top-bar a { color: #85c1e9; text-decoration: none; font-weight: 500; }
          .badge { background: #2e86c1; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px; }
          iframe { width: 100%; height: calc(100vh - 42px); border: none; }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div>
            <a href="/">⬅ Back to Portal</a> | <strong>${fileName}</strong>
            <span class="badge">🌐 Mode: WOPI Client</span>
          </div>
          <div>
            <span>WOPISrc: <code>${wopiSrc}</code></span>
          </div>
        </div>
        <iframe src="${onlyOfficeWopiUrl}" allowfullscreen></iframe>
      </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=============================================`);
  console.log(`ONLYOFFICE Test App running on port ${PORT}`);
  console.log(`Docs API Editor: https://${CONFIG.testAppPublicHost}:${PORT}/editor`);
  console.log(`WOPI Endpoints:  https://${CONFIG.testAppPublicHost}:${PORT}/wopi/files/:file_id`);
  console.log(`ONLYOFFICE:      ${CONFIG.onlyOfficePublicUrl}`);
  console.log(`Jitsi:           ${CONFIG.jitsiDomain}`);
  console.log(`=============================================`);
});
