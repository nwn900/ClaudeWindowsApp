const path = require('path')
const { app, BrowserWindow, Menu, Tray, shell } = require('electron')

const CLAUDE_URL = 'https://claude.ai/new'
const IN_APP_HOST_SUFFIXES = [
  'claude.ai',
  'anthropic.com',
  'google.com',
  'googleusercontent.com'
]

let mainWindow = null
let tray = null
let isQuitting = false

if (typeof app.userAgentFallback === 'string') {
  app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/[^\s]+/, '')
}

function isMatchingHost(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

function shouldStayInApp(urlString) {
  if (urlString === 'about:blank') {
    return true
  }

  try {
    const url = new URL(urlString)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return false
    }

    return IN_APP_HOST_SUFFIXES.some((suffix) => isMatchingHost(url.hostname, suffix))
  } catch {
    return false
  }
}

function openExternal(urlString) {
  if (!urlString) {
    return
  }

  shell.openExternal(urlString)
}

function configureWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldStayInApp(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          width: 520,
          height: 760,
          parent: win
        }
      }
    }

    openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (shouldStayInApp(url)) {
      return
    }

    event.preventDefault()
    openExternal(url)
  })

  win.webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenuBarVisibility(false)
    configureWindow(childWindow)
  })
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
}

function hideToTray(win) {
  if (!win || win.isDestroyed()) {
    return
  }

  win.hide()
}

function createTray() {
  if (tray) {
    return
  }

  tray = new Tray(path.join(__dirname, 'icon.ico'))
  tray.setToolTip('Claude')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Claude',
      click: showMainWindow
    },
    { type: 'separator' },
    {
      label: 'Close Claude',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]))
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow = win
  configureWindow(win)
  win.loadURL(CLAUDE_URL)

  win.on('minimize', (event) => {
    event.preventDefault()
    hideToTray(win)
  })

  win.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    hideToTray(win)
  })

  win.on('closed', () => {
    mainWindow = null
  })

  return win
}

app.whenReady().then(() => {
  createTray()
  createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {})

app.on('activate', () => {
  showMainWindow()
})
