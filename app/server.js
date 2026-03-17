const http = require("http");

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      message: "hello from ecs fargate",
      path: req.url,
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`listening on ${port}`);
});

