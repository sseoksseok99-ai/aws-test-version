const http = require("http");
const client = require("prom-client");

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "ecommerce_app_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "ecommerce_app_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const server = http.createServer((req, res) => {
  const startNs = process.hrtime.bigint();
  const method = req.method || "GET";
  const route = req.url || "/";

  const finish = () => {
    const statusCode = String(res.statusCode || 0);
    const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe(
      { method, route, status_code: statusCode },
      durationSeconds
    );
  };

  res.on("finish", finish);

  if (route === "/metrics") {
    register
      .metrics()
      .then((body) => {
        res.writeHead(200, { "Content-Type": register.contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("metrics error");
      });
    return;
  }

  if (route === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      message: "hello from ecs fargate",
      path: route,
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`listening on ${port}`);
});

