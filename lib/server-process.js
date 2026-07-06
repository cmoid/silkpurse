const fs = require("fs");
const Path = require("path");
const electron = require("electron");
const spawn = require("child_process").spawn;
const fixPath = require("fix-path");
const pull = require("pull-stream");
const { DatabaseSync } = require("node:sqlite");

const createSbot = require("secret-stack")()
  .use(require("ssb-db"))
  .use(require("ssb-conn"))
  .use(require("ssb-lan"))
  .use(require("ssb-logging"))
  .use(require("ssb-master"))
  .use(require("ssb-no-auth"))
  .use(require("ssb-replicate"))
  .use(require("ssb-unix-socket"))
  .use(require("ssb-friends")) // not strictly required, but helps ssb-conn a lot
  .use(require("ssb-blobs"))
  .use(require("ssb-backlinks"))
  .use(
    require("ssb-social-index")({
      namespace: "about",
      type: "about",
      destField: "about",
    }),
  )
  .use(require("ssb-private"))
  .use(require("ssb-room/tunnel/client"))
  .use(require("ssb-invite"))
  .use(require("ssb-query"))
  .use(require("ssb-ws"))
  .use(require("ssb-ebt"))
  .use(require("./plugins"));

fixPath();

module.exports = function (ssbConfig) {
  console.log("creating sbot")
  const context = {
    sbot: createSbot(ssbConfig),
    config: ssbConfig,
  };
  ssbConfig.manifest = context.sbot.getManifest();
  fs.writeFileSync(
    Path.join(ssbConfig.path, "manifest.json"),
    JSON.stringify(ssbConfig.manifest),
  );
  console.log("emit");
  try {
    electron.ipcRenderer.send("server-started", ssbConfig);
  } catch (e) {
    console.log("e", e);
  }

  // check if we are using a custom ssb path (which would break git-ssb-web)
  if (!ssbConfig.customPath) {
    // attempt to run git-ssb if it is installed and in path
    const gitSsb = spawn("git-ssb", ["web"], {
      stdio: "inherit",
    });
    gitSsb.on("error", () => {
      console.log("git-ssb is not installed, or not available in path");
    });
    process.on("exit", () => {
      gitSsb.kill();
    });
  }

  /*
  == Search Indexing ==========================================================
  ==
  == Full-text search over post messages, kept in a SQLite FTS5 table in the
  == ssb data directory. The main window sends "search" / "is-search-available"
  == over IPC (relayed through the main process); we answer with
  == "search-results" / "search-available" / "search-unavailable".
  ==
  == Ported from Poncho Wonky (soapdog/patchwork) commit a2d89a2a.
  =============================================================================
  */
  let lastIndexedTimestamp = 0;

  const serverlog = (...args) => {
    const msg = args.join(" ");
    console.log(`[SERVER] ${msg}`);
  };

  const sqliteIndexPath = Path.join(
    ssbConfig.path,
    "full-text-search.sqlite",
  );

  // Until the index is warm, answer every query with "unavailable".

  electron.ipcRenderer.on("search", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.on("is-search-available", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.send("search-unavailable");

  const loadOrCreateSqlite = async () => {
    serverlog("load or create SQLITE");
    const indexExisted = fs.existsSync(sqliteIndexPath);
    const database = new DatabaseSync(sqliteIndexPath);

    serverlog("[SQLITE] creating virtual table.");
    database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts5(key, content, raw, timestamp);
      `);

    if (indexExisted) {
      // load previous saved work.
      const lastTimeStampQuery = database.prepare(
        `SELECT max(timestamp) as max FROM messages`,
      );

      lastIndexedTimestamp = lastTimeStampQuery.all()[0]["max"] || 0;
      serverlog(`LAST TIMESTAMP: ${lastIndexedTimestamp}`);
    }

    if (lastIndexedTimestamp > 0) {
      enableSqliteSearch(database);
    }

    return { database, lastIndexedTimestamp };
  };

  const enableSqliteSearch = (database) => {
    // handle searches
    electron.ipcRenderer.removeAllListeners("search");
    electron.ipcRenderer.removeAllListeners("is-search-available");
    electron.ipcRenderer.on("is-search-available", (ev, terms) => {
      electron.ipcRenderer.send("search-available");
    });

    electron.ipcRenderer.send("search-available");

    electron.ipcRenderer.on("search", (ev, terms) => {
      const query = database.prepare(`
        SELECT
          *
        FROM
          messages
        WHERE
          messages
        MATCH
          ?
      `);
      const results = query.all(terms);
      serverlog(`result count: ${results.length}`);
      electron.ipcRenderer.send("search-results", results);
    });
  };

  const loadMessagesIntoSQLite = ({ database }) => {
    serverlog("[SQLITE] Starting message indexing pull stream...");
    const insert = database.prepare(
      "INSERT OR REPLACE INTO messages (key, content, raw, timestamp) VALUES (?, ?, ?, ?)",
    );
    database.exec("begin");
    pull(
      context.sbot.messagesByType({
        type: "post",
        live: true,
        gt: lastIndexedTimestamp,
      }),
      pull.map((m) => {
        if (m.sync) return m;
        return {
          key: m.key,
          timestamp: m.timestamp,
          content: m.value?.content?.text ?? m.value?.content?.post ??
            JSON.stringify(m.value?.content),
          raw: JSON.stringify(m),
        };
      }),
      pull.drain((m) => {
        if (m.sync) {
          // finished indexing the backlog; live messages keep arriving
          serverlog(
            `SQLITE: finished indexing for now ${lastIndexedTimestamp}`,
          );

          database.exec("commit");
          enableSqliteSearch(database);
          return;
        } else {
          try {
            insert.run(m.key, m.content, m.raw, m.timestamp);
          } catch (e) {
            serverlog("[SQLITE] Problem inserting");
            serverlog(JSON.stringify(m, null, 2));
          }

          lastIndexedTimestamp = m.timestamp;
        }
      }),
    );
  };

  loadOrCreateSqlite().then(({ database }) => {
    loadMessagesIntoSQLite({ database });
  }).catch((e) => {
    serverlog("[SQLITE] ERROR");
    console.error(JSON.stringify(e));
  });
};
