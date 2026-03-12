const path = require('path')
const { app, BrowserWindow, Menu, Tray, shell } = require('electron')

const CLAUDE_URL = 'https://claude.ai/new'
const IN_APP_HOST_SUFFIXES = [
  'claude.ai',
  'anthropic.com',
  'google.com',
  'googleusercontent.com'
]
const STARTUP_ARG = '--launch-at-startup'
const SUPPORTS_LOGIN_ITEM_SETTINGS = ['darwin', 'win32'].includes(process.platform)

let mainWindow = null
let tray = null
let isQuitting = false

if (typeof app.userAgentFallback === 'string') {
  app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/[^\s]+/, '')
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

function isMatchingHost(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

function getLoginItemArgs() {
  if (!process.defaultApp) {
    return [STARTUP_ARG]
  }

  return [app.getAppPath(), STARTUP_ARG]
}

function getLoginItemSettingsQuery() {
  return {
    path: process.execPath,
    args: getLoginItemArgs()
  }
}

function getLoginItemOptions(openAtLogin) {
  return {
    openAtLogin,
    ...getLoginItemSettingsQuery()
  }
}

function opensAtLogin() {
  if (!SUPPORTS_LOGIN_ITEM_SETTINGS) {
    return false
  }

  return app.getLoginItemSettings(getLoginItemSettingsQuery()).openAtLogin
}

function createStartupMenuItem() {
  return {
    label: 'Launch at system startup',
    type: 'checkbox',
    checked: opensAtLogin(),
    enabled: SUPPORTS_LOGIN_ITEM_SETTINGS,
    click: (menuItem) => {
      if (!SUPPORTS_LOGIN_ITEM_SETTINGS) {
        return
      }

      app.setLoginItemSettings(getLoginItemOptions(menuItem.checked))
      refreshMenus()
    }
  }
}

function refreshMenus() {
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Open Claude',
        click: showMainWindow
      },
      createStartupMenuItem(),
      { type: 'separator' },
      {
        label: 'Close Claude',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ]))
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Claude',
      submenu: [
        {
          label: 'Open Claude',
          click: showMainWindow
        },
        createStartupMenuItem(),
        { type: 'separator' },
        {
          label: 'Close Claude',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open claude.ai',
          click: () => {
            openExternal(CLAUDE_URL)
          }
        }
      ]
    }
  ]))
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
  refreshMenus()
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

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    createTray()
    refreshMenus()

    if (!process.argv.includes(STARTUP_ARG)) {
      createWindow()
    }
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {})

app.on('activate', () => {
  showMainWindow()
})
