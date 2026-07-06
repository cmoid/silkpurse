const fs = require("fs");
const Path = require("path");
const electron = require("electron");
const pull = require("pull-stream");
const { DatabaseSync } = require("node:sqlite");

const createSbot = require("secret-stack")()
  .use(require("ssb-db"))
  .use(require("ssb-conn"))
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
      // rank is fts5 bm25 (more negative = better match); expose it
      // negated as `score` so the renderer's descending sort works. The
      // LIMIT keeps a common term from materializing tens of thousands of
      // rows in this synchronous call and shipping them all over IPC.
      const query = database.prepare(`
        SELECT
          *, -rank AS score
        FROM
          messages
        WHERE
          messages
        MATCH
          ?
        ORDER BY
          rank
        LIMIT 500
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
    const BATCH = 1000;
    let pending = 0; // inserts since the last commit
    let backlog = true; // until the live stream's sync marker arrives

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
      pull.asyncMap((m, cb) => {
        if (m.sync) return cb(null, m);
        try {
          insert.run(m.key, m.content, m.raw, m.timestamp);
        } catch (e) {
          serverlog("[SQLITE] Problem inserting");
          serverlog(JSON.stringify(m, null, 2));
        }
        lastIndexedTimestamp = m.timestamp;

        // While chewing through the backlog, commit in batches and yield
        // to the event loop so IPC and sockets keep flowing; a monolithic
        // synchronous loop here starves them (UDP recvmsg ENOTCONN spam).
        if (backlog && ++pending >= BATCH) {
          database.exec("commit");
          database.exec("begin");
          pending = 0;
          return setImmediate(cb, null, m);
        }
        cb(null, m);
      }),
      pull.drain((m) => {
        if (m.sync) {
          // finished indexing the backlog; live messages keep arriving
          // and are committed individually from here on
          serverlog(
            `SQLITE: finished indexing for now ${lastIndexedTimestamp}`,
          );

          database.exec("commit");
          backlog = false;
          enableSqliteSearch(database);
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
