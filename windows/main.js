// تطبيق Windows لنظام جمعية الخير للجميع: يفتح نفس واجهة www محليًا (كما في تطبيق Android)
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function isExternal(u) {
  return /^(https?:|mailto:|tel:|whatsapp:)/i.test(u) && !/^https:\/\/[a-z0-9-]+\.supabase\.co\//i.test(u);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600,
    title: 'جمعية الخير للجميع',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  // روابط واتساب والمواقع الخارجية تُفتح في المتصفح/التطبيق الافتراضي
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };   // نوافذ الطباعة وPDF والاستمارات
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isExternal(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // لا أذونات (كاميرا/موقع/إشعارات) إلا ما يلزم
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['clipboard-sanitized-write', 'fullscreen'].includes(perm)));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
