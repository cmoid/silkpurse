const http = require("http");
const pull = require("pull-stream");
const ref = require("ssb-ref");

/*
 * Blob HTTP shim for erlbutt remote mode.
 *
 * The renderer turns every blob link into an HTTP URL (blob.sync.url);
 * normally the embedded server's ssb-ws serves those on localhost.  In
 * erlbutt mode there is no embedded server, so this shim listens on an
 * ephemeral localhost port in the Electron main process and answers
 * /blobs/get/<id> by streaming blobs.get over an authenticated muxrpc
 * connection to erlbutt.  It sets ssbConfig.blobsPrefix so the renderer
 * builds its URLs against the shim — no renderer changes needed.
 *
 * Not supported (yet): the ?unbox= query serve-blobs honours for
 * private attachment blobs; such blobs are served still boxed.
 */
module.exports = function startBlobShim(ssbConfig, cb) {
  let sbot = null;
  let waiting = null; // callbacks queued while a connect is in flight

  function connect(done) {
    if (sbot) return done(null, sbot);
    if (waiting) return waiting.push(done);
    waiting = [done];
    require("ssb-client")(ssbConfig.keys, {
      remote: ssbConfig.remote,
      caps: ssbConfig.caps,
      manifest: { blobs: { get: "source" } },
    }, (err, s) => {
      const queued = waiting;
      waiting = null;
      if (!err) {
        sbot = s;
        if (s.on) s.on("closed", () => { sbot = null; });
      }
      queued.forEach((f) => f(err, s));
    });
  }

  const server = http.createServer((req, res) => {
    const match = /^\/blobs\/get\/([^?]+)(?:\?(.*))?$/.exec(req.url);
    const id = match && decodeURIComponent(match[1]);
    if (!id || !ref.isBlob(id)) {
      res.writeHead(404);
      return res.end("not a blob id");
    }
    const query = new URLSearchParams(match[2] || "");
    connect((err, s) => {
      if (err) {
        console.log("[erlbutt] blob shim connect failed:", err.message || err);
        res.writeHead(502);
        return res.end("no backend");
      }
      let started = false;
      pull(
        s.blobs.get(id),
        pull.drain((chunk) => {
          if (!started) {
            started = true;
            res.writeHead(200, {
              "content-type": query.get("contentType") ||
                "application/octet-stream",
              // content-addressed: the body for an id can never change
              "cache-control": "public, max-age=31536000, immutable",
            });
          }
          res.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }, (streamErr) => {
          if (streamErr && streamErr !== true && !started) {
            res.writeHead(404);
            return res.end("blob not found");
          }
          res.end();
        }),
      );
    });
  });

  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    ssbConfig.blobsPrefix = `http://127.0.0.1:${port}/blobs/get`;
    console.log("[erlbutt] blob shim serving", ssbConfig.blobsPrefix);
    cb(null, server);
  });
  server.on("error", (err) => cb(err));
};
