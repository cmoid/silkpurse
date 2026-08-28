process.on("uncaughtException", function (err) {
  console.log("uncaughtException, quitting")
  console.log(err);
  process.exit();
});

const fs = require("fs");
const electron = require("electron");
const openWindow = require("./lib/window.js");

const Path = require("path");
const defaultMenu = require("electron-default-menu");
const WindowState = require("electron-window-state");
const Menu = electron.Menu;
const extend = require("xtend");
const ssbKeys = require("ssb-keys");
const resolveErlbutt = require("./lib/erlbutt-config.js");
const rc = require("rc");

require("@electron/remote/main").initialize();

const windows = {
  dialogs: new Set(),
};
let ssbConfig = null;
let quitting = false;

/**
 * It's not possible to run two instances of patchwork as it would create two
 * ssb-server instances that conflict on the same port. Before opening patchwork,
 * we check if it's already running and if it is we focus the existing window
 * rather than opening a new instance.
 */
function quitIfAlreadyRunning() {
  if (!electron.app.requestSingleInstanceLock()) {
    console.log("Silkpurse is already running!");
    console.log(
      "Please close the existing instance before starting a new one.",
    );
    return electron.app.quit();
  }
  electron.app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    if (windows.main) {
      if (windows.main.isMinimized()) windows.main.restore();
      windows.main.focus();
    }
  });
}

quitIfAlreadyRunning();

electron.app.on("ready", () => {
  setupContext(process.env.ssb_appname || "silkpurse", () => {
    const browserWindow = openMainWindow();
    require("@electron/remote/main").enable(browserWindow.webContents)

    browserWindow.on("app-command", (e, cmd) => {
      switch (cmd) {
        case "browser-backward": {
          browserWindow.webContents.send("goBack");
          break;
        }
        case "browser-forward": {
          browserWindow.webContents.send("goForward");
          break;
        }
      }
    });

    const menu = defaultMenu(electron.app, electron.shell);

    menu.splice(4, 0, {
      label: "Navigation",
      submenu: [
        {
          label: "Activate Search Field",
          accelerator: "CmdOrCtrl+L",
          click: () => {
            browserWindow.webContents.send("activateSearch");
          },
        },
        {
          label: "Back",
          accelerator: "CmdOrCtrl+[",
          click: () => {
            browserWindow.webContents.send("goBack");
          },
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+]",
          click: () => {
            browserWindow.webContents.send("goForward");
          },
        },
        {
          type: "separator",
        },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            browserWindow.webContents.send("goToSettings");
          },
        },
        {
          label: "Status",
          accelerator: "CmdOrCtrl+.",
          click: () => {
            browserWindow.webContents.send("goToStatus");
          },
        },
      ],
    });

    const view = menu.find((x) => x.label === "View");
    view.submenu = [
      { role: "reload" },
      { role: "toggledevtools" },
      { type: "separator" },
      { role: "resetzoom" },
      { role: "zoomin", accelerator: "CmdOrCtrl+=" },
      { role: "zoomout", accelerator: "CmdOrCtrl+-" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ];
    const help = menu.find((x) => x.label === "Help");
    help.submenu = [
      {
        label: "Learn More",
        click() {
          require("electron").shell.openExternal("https://scuttlebutt.nz");
        },
      },
    ];
    if (process.platform === "darwin") {
      const win = menu.find((x) => x.label === "Window");
      win.submenu = [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close", label: "Close" },
        { type: "separator" },
        { role: "front" },
      ];
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  });

  electron.app.on("activate", function () {
    if (windows.main) {
      windows.main.show();
    }
  });

  electron.app.on("before-quit", function () {
    quitting = true;
  });

  electron.ipcMain.handle("navigation-menu-popup", (event, data) => {
    const { items, x, y } = data;
    const window = event.sender;
    const factor = event.sender.zoomFactor;
    const menuItems = buildMenu(items, window);
    const menu = electron.Menu.buildFromTemplate(menuItems);
    menu.popup({
      window,
      x: Math.round(x * factor),
      y: Math.round(y * factor) + 4,
    });
  });

  electron.ipcMain.handle("setSpellcheckLangs", (ev, params) => {
    if (!windows.main) return;
    const { langs, enabled } = params;
    windows.main.webContents.session.setSpellCheckerLanguages(
      enabled ? langs : [],
    );
  });
  electron.ipcMain.handle("consoleLog", (ev, o) => console.log(o));
  electron.ipcMain.handle("consoleError", (ev, o) => console.error(o));
  electron.ipcMain.handle("badgeCount", (ev, count) => {
    electron.app.badgeCount = count;
  });
  electron.ipcMain.on("exit", (ev, code) => process.exit(code));
});

function openServerDevTools() {
  if (windows.background) {
    windows.background.webContents.openDevTools({ mode: "detach" });
  }
}

function buildMenu(items, window) {
  const result = [];
  for (let item of items) {
    switch (item.type) {
      case "separator":
        result.push(item);
        break;
      case "submenu":
        result.push({
          ...item,
          submenu: buildMenu(item.submenu, window),
        });
        break;
      case "normal":
        result.push({
          ...item,
          click: () => navigateTo(item.target),
        });
        break;
      default:
        throw Error(
          `Unknown menu item of type "${item.type}": ${
            JSON.stringify(item, null, 2)
          }`,
        );
    }
  }
  return result;
}

function navigateTo(target) {
  if (windows?.main) {
    windows.main.send("navigate-to", target);
  }
}

function openMainWindow() {
    if (!windows.main) {
      const windowState = WindowState({
        defaultWidth: 1024,
        defaultHeight: 768,
      });
      console.log("About to open Window");
      windows.main = openWindow(
        ssbConfig,
        Path.join(__dirname, "lib", "main-window.js"),
        {
          minWidth: 800,
          x: windowState.x,
          y: windowState.y,
          width: windowState.width,
          height: windowState.height,
          titleBarStyle: "hiddenInset",
          autoHideMenuBar: true,
          title: "Silkpurse",
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
          },
          show: true,
          backgroundColor: "#EEE",
          icon: Path.join(__dirname, "assets/icon.png"),
        },
        openServerDevTools,
        navigateTo,
      );

      // erlbutt bring-up: forward the renderer console to the main
      // process stdout so muxrpc / method errors are visible in the log.
      if (ssbConfig.erlbutt) {
        windows.main.webContents.on("console-message",
          (_e, _level, message, line, sourceId) =>
            console.log("[renderer]", message,
                        sourceId ? `(${sourceId}:${line})` : ""));
      }

      windowState.manage(windows.main);
      windows.main.setSheetOffset(40);
      windows.main.on("close", function (e) {
        if (!quitting && process.platform === "darwin") {
          e.preventDefault();
          windows.main.hide();
        }
      });
      windows.main.on("closed", function () {
        windows.main = null;
        if (process.platform !== "darwin") electron.app.quit();
      });
    }
    return windows.main;
}

// A startup failure must be VISIBLE.  A packaged app launched from Finder
// has no terminal, so a console.error alone means the user just sees the
// icon bounce and vanish with no explanation.  showErrorBox is safe to call
// before the app is ready.
function fatal(message) {
  console.error(message);
  electron.dialog.showErrorBox("Silkpurse cannot start", message);
  return electron.app.quit();
}

function setupContext(appName, cb) {
  // Read the config SOURCES only — rc is what ssb-config uses underneath,
  // so this sees the same files, env and argv, but without ssb-config's
  // defaults.  That ordering is deliberate: ssb-config/defaults.js mints a
  // fresh keypair into <path>/secret whenever config.keys is null, and
  // that key is NOT the identity this app uses.  It used to be created on
  // every first run and then immediately overwritten by erlbutt's — a
  // stranger's private key sitting in the data directory looking like it
  // meant something.  Resolving erlbutt first lets us hand inject the real
  // keys, so the branch that would create it never runs.
  const sources = rc(appName, {});

  // erlbutt is the only backend: this app is erlbutt's face, authenticating
  // as erlbutt's own identity and talking muxrpc to it.  Settings come from
  // the environment or from an "erlbutt" block in ~/.silkpurse/config (see
  // lib/erlbutt-config.js).
  let erlbutt;
  try {
    erlbutt = resolveErlbutt(sources);
  } catch (err) {
    return fatal(err.message);
  }

  if (!erlbutt) {
    // There is no embedded server to fall back to, so say what is needed
    // rather than starting into a state that cannot work.  A packaged app
    // has no terminal, which is why this is a dialog and not a log line.
    return fatal(
      "Silkpurse needs an erlbutt backend, and none is configured.\n\n" +
        "Set these in the environment, or as an \"erlbutt\" block in " +
        "~/.silkpurse/config:\n\n" +
        "  ERLBUTT_SECRET  path to erlbutt's secret (ssb-keys JSON)\n" +
        "  ERLBUTT_ADDR    host:port of its listener " +
        "(default 127.0.0.1:8008)\n" +
        "  ERLBUTT_SHS     its network id / caps.shs, if not the default\n\n" +
        "An app launched from Finder inherits no shell environment, so a " +
        "packaged build needs the config file.",
    );
  }

  // Listener, unix socket, room and gossip settings are all gone with the
  // embedded server: nothing here accepts connections any more, it only
  // makes one.
  //
  // The resolved erlbutt block is stored on ssbConfig, so the background
  // window (server-process.js) sees the same decision — it is handed the
  // config, and cannot be assumed to inherit our environment.
  ssbConfig = require("ssb-config/inject")(appName, {
    blobsPort: 8989, // matches the blob shim
    keys: ssbKeys.loadSync(erlbutt.secret),
  });
  ssbConfig.erlbutt = erlbutt;

  // Create the data directory.  This used to happen as a SIDE EFFECT of
  // writing the local secret — ssb-keys' loadOrCreateSync mkdirp's the
  // parent before writing — so removing that unused keypair removed the
  // only mkdir in the app with it.  Nothing else creates the directory,
  // and node:sqlite will not open a database inside one that is missing,
  // so a new ssb_appname meant the search index died with
  // ERR_SQLITE_ERROR in a hidden window: search simply never became
  // available, with nothing on screen to say why.
  fs.mkdirSync(ssbConfig.path, { recursive: true });

  const ek = ssbConfig.keys;
  const epub = ek.id.slice(1).replace(`.${ek.curve}`, "");
  ssbConfig.remote = `net:${erlbutt.addr}~shs:${epub}`;
  if (erlbutt.shs) {
    ssbConfig.caps = extend(ssbConfig.caps, { shs: erlbutt.shs });
  }
  console.log(`[erlbutt] backend (from ${erlbutt.source}):`,
              ssbConfig.remote, "caps.shs:", ssbConfig.caps.shs);

  const redactedConfig = JSON.parse(JSON.stringify(ssbConfig));
  redactedConfig.keys.private = null;
  console.dir(redactedConfig, { depth: null });

  // Start the blob HTTP shim — the renderer's blob URLs need a localhost
  // endpoint, which used to come from the embedded server's ssb-ws — then
  // open the hidden window, where server-process.js runs the search
  // indexer fed from erlbutt over muxrpc.
  require("./lib/erlbutt-shim")(ssbConfig, (err) => {
    if (err) {
      console.log("[erlbutt] blob shim failed to start:", err.message);
    }
    spawnBackgroundWindow();
    cb && cb();
  });

  function spawnBackgroundWindow() {
    windows.background = openWindow(
      ssbConfig,
      Path.join(__dirname, "lib", "server-process.js"),
      {
        connect: false,
        center: true,
        fullscreen: false,
        fullscreenable: false,
        height: 800,
        maximizable: false,
        minimizable: false,
        resizable: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
        show: false,
        skipTaskbar: true,
        title: "patchwork-server",
        useContentSize: true,
        width: 600,
      },
    );
    // windows.background.on('close', (ev) => {
    //   ev.preventDefault()
    //   windows.background.hide()
    // })

    // Relay full-text search IPC between the main window and the hidden
    // server window, which owns the SQLite search index.
    electron.ipcMain.on("search", (ev, terms) => {
      windows.background.webContents.send("search", terms);
    });

    electron.ipcMain.on("is-search-available", (ev, terms) => {
      windows.background.webContents.send("is-search-available", terms);
    });

    electron.ipcMain.on("search-results", (ev, results) => {
      if (windows.main) {
        windows.main.webContents.send("search-results", results);
      }
    });

    electron.ipcMain.on("search-unavailable", (ev) => {
      if (windows.main) {
        windows.main.webContents.send("search-unavailable");
      }
    });

    electron.ipcMain.on("search-available", (ev) => {
      if (windows.main) {
        windows.main.webContents.send("search-available");
      }
    });
  }
}
