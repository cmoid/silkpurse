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

    // A new index starts at zero and pages its way up. That is only
    // survivable because the backlog is requested in bounded pages — ask
    // for a whole corpus in one call and the connection dies before it
    // can be answered.
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

  // How many messages one request may ask for.
  //
  // A source is served inside a single 45-second muxrpc call — the sends
  // are serialised because each advances the connection's nonce — so a
  // request that cannot be answered in that time kills the connection it
  // arrived on. Asking for a whole corpus at once is therefore not a slow
  // request, it is one that can never succeed: the client reconnects,
  // finds nothing indexed, and asks for exactly the same thing again.
  //
  // So the backlog is paged. Small enough that a page is answered well
  // inside the timeout, large enough that a big store does not take
  // thousands of round trips.
  const BACKLOG_PAGE = 2000;

  // What goes in the indexed `content` column.
  //
  // `text` is a string by convention and not by rule, and the network is
  // full of clients that got it wrong: posts exist whose text is an
  // object (a private-message envelope written into the wrong field) or a
  // bare `true`. Nullish coalescing does not catch either, and node:sqlite
  // binds only null, number, bigint, string and Buffer — so the insert
  // threw and the message was dropped from the index entirely.
  //
  // Anything that is not a string gets serialised instead. Indexing the
  // JSON is worth more than skipping the message.
  const textOf = (content) => {
    const t = content?.text ?? content?.post;
    if (typeof t === "string") return t;
    if (t === undefined || t === null) return JSON.stringify(content);
    return JSON.stringify(t);
  };

  const shapeRow = (m) => {
    if (m.sync) return m;
    return {
      key: m.key,
      timestamp: m.timestamp,
      content: textOf(m.value?.content),
      raw: JSON.stringify(m),
    };
  };

  const commitQuietly = (database) => {
    try {
      database.exec("commit");
    } catch (e) { /* no transaction open */ }
  };

  // Page through everything already stored, then hand over to the live
  // stream. Each page is its own transaction and its own request.
  const indexBacklog = ({ database }, done) => {
    const insert = database.prepare(
      "INSERT OR REPLACE INTO messages (key, content, raw, timestamp) VALUES (?, ?, ?, ?)",
    );

    const page = (cursor, previousCursor) => {
      // A cursor that did not move means the last page was entirely one
      // timestamp and the overlap below cannot get past it. Stop rather
      // than request the same page forever.
      if (previousCursor !== null && cursor <= previousCursor) return done(null);

      let seen = 0;
      database.exec("begin");
      pull(
        sbot.messagesByType({
          type: "post",
          live: false,
          gt: cursor,
          limit: BACKLOG_PAGE,
        }),
        pull.map(shapeRow),
        pull.asyncMap((m, cb) => {
          seen++;
          try {
            insert.run(m.key, m.content, m.raw, m.timestamp);
          } catch (e) {
            serverlog("[SQLITE] Problem inserting");
            serverlog(JSON.stringify(m, null, 2));
          }
          if (m.timestamp > lastIndexedTimestamp) lastIndexedTimestamp = m.timestamp;
          cb(null, m);
        }),
        pull.drain(() => {}, (err) => {
          commitQuietly(database);
          if (err && err !== true) return done(err);
          if (seen < BACKLOG_PAGE) {
            serverlog(`[SQLITE] backlog indexed to ${lastIndexedTimestamp}`);
            return done(null);
          }
          // Overlap by a millisecond: `gt` is strict, and a page boundary
          // landing inside a run of equal timestamps would otherwise skip
          // the rest of that run. Re-indexing a few rows costs nothing —
          // the insert replaces on key.
          const next = Math.max(0, lastIndexedTimestamp - 1);
          serverlog(`[SQLITE] backlog page done (${seen}), continuing from ${next}`);
          setImmediate(() => page(next, cursor));
        }),
      );
    };

    page(lastIndexedTimestamp, null);
  };

  // The live tail. `old: false` because the backlog is already in.
  const followLive = ({ database }) => {
    const insert = database.prepare(
      "INSERT OR REPLACE INTO messages (key, content, raw, timestamp) VALUES (?, ?, ?, ?)",
    );
    serverlog("[SQLITE] following live from " + lastIndexedTimestamp);
    pull(
      sbot.messagesByType({
        type: "post",
        live: true,
        old: false,
        gt: lastIndexedTimestamp,
      }),
      pull.map(shapeRow),
      pull.drain((m) => {
        if (m.sync) return;
        try {
          insert.run(m.key, m.content, m.raw, m.timestamp);
        } catch (e) {
          serverlog("[SQLITE] Problem inserting");
        }
        if (m.timestamp > lastIndexedTimestamp) lastIndexedTimestamp = m.timestamp;
      }, (err) => {
        serverlog(
          "[SQLITE] live stream ended" +
            (err && err !== true ? `: ${err.message || JSON.stringify(err)}` : ""),
        );
        // A clean end means the method was not registered yet (erlbutt
        // still booting: an unknown method ends immediately). A real
        // error means the connection died and the caller's closed-handler
        // reconnects; do not double up.
        if (!err || err === true) {
          setTimeout(() => followLive({ database }), 15000);
        }
      }),
    );
  };

  const loadMessagesIntoSQLite = ({ database }) => {
    serverlog("[SQLITE] indexing backlog...");
    indexBacklog({ database }, (err) => {
      if (err) {
        // The connection died mid-backlog; the caller's closed-handler
        // reconnects and we start again from the cursor, which has
        // already advanced past everything committed.
        serverlog(
          `[SQLITE] backlog interrupted: ${err.message || JSON.stringify(err)}`,
        );
        return;
      }
      enableSqliteSearch(database);
      followLive({ database });
    });
  };

  sqlitePromise = sqlitePromise || loadOrCreateSqlite();
  sqlitePromise.then(({ database }) => {
    loadMessagesIntoSQLite({ database });
  }).catch((e) => {
    serverlog("[SQLITE] ERROR");
    console.error(JSON.stringify(e));
  });
}
