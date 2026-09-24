// Faux serveur de l'API Claude pour les tests de bout en bout : renvoie en
// streaming (SSE) la leçon de tests/fixtures/generated-lesson.js.
// Si les précisions contiennent « REFUS », simule un refus.
import http from "node:http";
import lesson from "../fixtures/generated-lesson.js";

const PORT = Number(process.env.MOCK_CLAUDE_PORT || 4319);
let last = null;

const ev = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/last") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify(last));
    }
    if (req.method !== "POST" || req.url !== "/v1/messages") {
      res.statusCode = 404;
      return res.end();
    }
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const content = body.messages[0].content;
    last = {
      model: body.model,
      apiKey: req.headers["x-api-key"],
      images: content.filter((c) => c.type === "image").length,
      text: content.find((c) => c.type === "text").text,
    };
    res.writeHead(200, { "content-type": "text/event-stream" });
    ev(res, "message_start", { message: { id: "msg_test", model: body.model } });
    ev(res, "content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } });
    await wait(300);
    ev(res, "content_block_stop", { index: 0 });
    if (last.text.includes("REFUS")) {
      ev(res, "message_delta", { delta: { stop_reason: "refusal" } });
      ev(res, "message_stop", {});
      return res.end();
    }
    ev(res, "content_block_start", { index: 1, content_block: { type: "text", text: "" } });
    const json = JSON.stringify(lesson);
    for (let i = 0; i < json.length; i += 400) {
      ev(res, "content_block_delta", { index: 1, delta: { type: "text_delta", text: json.slice(i, i + 400) } });
      await wait(15);
    }
    ev(res, "content_block_stop", { index: 1 });
    ev(res, "message_delta", { delta: { stop_reason: "end_turn" } });
    ev(res, "message_stop", {});
    res.end();
  })
  .listen(PORT, () => console.log(`mock Claude on ${PORT}`));
