const fs = require("fs");
const Path = require("path");
const electron = require("electron");
const pull = require("pull-stream");
const { DatabaseSync } = require("node:sqlite");

// This window's only job is the search index.
//
// It used to run an embedded ssb-server — the whole secret-stack, ssb-db
// and the JS reimplementations of every patchwork.* method — and index off
// that.  erlbutt serves all of those now, so what is left is a client:
// connect, follow messagesByType, and keep SQLite current.
//
// LAN discovery went with the server.  erlbutt does its own, and ssb-lan's
// UDP transport needed a wrapper here to survive macOS raising ENOTCONN
// after an ICMP unreachable — a problem that belongs to whoever owns the
// socket, and that is no longer this process.
module.exports = function (ssbConfig) {
  // ssbConfig.erlbutt is resolved once in the main process (env var or the
  // config file's erlbutt block) and handed to us with the config — this
  // window is a separate process and cannot be assumed to inherit the env.
  //
  // Reconnect with backoff if the connection drops; the index cursor
  // survives across reconnects.
  const ssbClient = require("ssb-client");
  const connectAndIndex = () => {
    ssbClient(ssbConfig.keys, {
      remote: ssbConfig.remote,
      caps: ssbConfig.caps,
      manifest: { messagesByType: "source" },
    }, (err, sbot) => {
      if (err) {
        console.log(
          "[SERVER] erlbutt connect failed, retrying in 5s:",
          err.message || err,
        );
        return setTimeout(connectAndIndex, 5000);
      }
      console.log("[SERVER] indexing from erlbutt at", ssbConfig.remote);
      if (sbot.on) {
        sbot.on("closed", () => {
          console.log(
            "[SERVER] erlbutt connection closed; reconnecting in 5s",
          );
          setTimeout(connectAndIndex, 5000);
        });
      }
      startSearchIndexing(sbot, ssbConfig);
    });
  };
  connectAndIndex();
};

/*
== Search Indexing ==========================================================
==
== Full-text search over post messages, kept in a SQLite FTS5 table in the
== ssb data directory. The main window sends "search" / "is-search-available"
== over IPC (relayed through the main process); we answer with
== "search-results" / "search-available" / "search-unavailable".
==
== The feed is sbot.messagesByType({type: 'post', live: true}) — served by
== the embedded sbot in local mode and by erlbutt in remote mode.  Module
== state (cursor, database, enabled flag) is shared across reconnects.
==
== Ported from Poncho Wonky (soapdog/patchwork) commit a2d89a2a.
=============================================================================
*/
let lastIndexedTimestamp = 0;
let sqlitePromise = null; // one database handle, reused across reconnects
let searchEnabled = false;

const serverlog = (...args) => {
  const msg = args.join(" ");
  console.log(`[SERVER] ${msg}`);
};

function startSearchIndexing(sbot, ssbConfig) {
  // The index is keyed on the IDENTITY being indexed, not just on the
  // directory.  erlbutt remote mode swaps ssbConfig.keys but deliberately
  // leaves ssbConfig.path alone, so a fixed filename would put a remote
  // identity's messages into the local identity's index — and because
  // indexing resumes from max(timestamp) below, the second identity to
  // use the file silently skips every message older than whatever the
  // first one had already indexed.  Mixed AND incomplete, with no error.
  //
  // Setting ssb_appname moves ssbConfig.path and so used to be the only
  // way to avoid this; keying the filename makes it impossible instead,
  // which leaves ssb_appname a preference rather than a required
  // workaround.
  const idTag = ssbConfig.keys.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const sqliteIndexPath = Path.join(
    ssbConfig.path,
    `full-text-search.${idTag}.sqlite`,
  );

  // Until the index is warm, answer every query with "unavailable" —
  // but never clobber live handlers on a reconnect.
  if (!searchEnabled) {
    electron.ipcRenderer.on("search", (ev, terms) => {
      electron.ipcRenderer.send("search-unavailable");
    });

    electron.ipcRenderer.on("is-search-available", (ev, terms) => {
      electron.ipcRenderer.send("search-unavailable");
    });

    electron.ipcRenderer.send("search-unavailable");
  }

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

    return { database };
  };

  const enableSqliteSearch = (database) => {
    searchEnabled = true;
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
    // erlbutt ignores gt and streams the whole backlog; skip below the
    // cursor client-side (the embedded sbot filters server-side).
    const resumeFrom = lastIndexedTimestamp;

    database.exec("begin");
    pull(
      sbot.messagesByType({
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
        if (m.timestamp <= resumeFrom) return cb(null, m); // already indexed
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
      }, (err) => {
        // stream over.  Never leave a transaction open — the next run
        // begins a fresh one.
        serverlog(
          "[SQLITE] index stream ended" +
            (err && err !== true ? `: ${err.message || JSON.stringify(err)}` : ""),
        );
        try {
          database.exec("commit");
        } catch (e) { /* no transaction open */ }
        // A CLEAN end before the sync marker means the server answered
        // before the method was registered (erlbutt still booting: an
        // unknown method gets an immediate empty end) — retry on the
        // same connection.  A real error means the connection died and
        // the caller's closed-handler reconnects; don't double up.
        if (backlog && (!err || err === true)) {
          serverlog("[SQLITE] ended before sync (server booting?); retrying in 15s");
          setTimeout(() => loadMessagesIntoSQLite({ database }), 15000);
        }
      }),
    );
  };

  sqlitePromise = sqlitePromise || loadOrCreateSqlite();
  sqlitePromise.then(({ database }) => {
    loadMessagesIntoSQLite({ database });
  }).catch((e) => {
    serverlog("[SQLITE] ERROR");
    console.error(JSON.stringify(e));
  });
}
