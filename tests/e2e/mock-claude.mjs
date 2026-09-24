// Faux serveur de l'API Claude (Batches) pour les tests de bout en bout.
// Une demande se termine après ~1,5 s avec la leçon de
// tests/fixtures/generated-lesson.js, sauf si le texte du parent contient :
//   « LENT »  → ne se termine jamais (pour tester « Arrêter »)
//   « REFUS » → Claude refuse
//   « PAUSE » → première réponse en pause (recherche web), puis la leçon
import http from "node:http";
import lesson from "../fixtures/generated-lesson.js";

const PORT = Number(process.env.MOCK_CLAUDE_PORT || 4319);
const batches = new Map();
let last = null;
let grades = 0; // nombre de corrections de réponses libres demandées
let n = 0;

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

function batchView(b) {
  const ended = b.canceled || (!b.slow && Date.now() - b.created > 1500);
  return {
    id: b.id,
    type: "message_batch",
    processing_status: ended ? "ended" : b.canceled === "pending" ? "canceling" : "in_progress",
    request_counts: { processing: ended ? 0 : 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
    results_url: ended ? `http://localhost:${PORT}/v1/messages/batches/${b.id}/results` : null,
    created_at: new Date(b.created).toISOString(),
  };
}

function resultOf(b) {
  const req = b.request;
  if (b.canceled) return { type: "canceled" };
  const text = req.params.messages[0].content.find((c) => c.type === "text").text;
  const usage = { input_tokens: 20000, output_tokens: 30000, server_tool_use: { web_search_requests: 1 } };
  const message = (content, stop_reason) => ({ id: "msg", type: "message", role: "assistant", model: req.params.model, content, stop_reason, usage });
  if (text.includes("REFUS")) return { type: "succeeded", message: message([], "refusal") };
  if (text.includes("PAUSE") && req.params.messages.length === 1)
    return { type: "succeeded", message: message([{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "programme" } }], "pause_turn") };
  return {
    type: "succeeded",
    message: message(
      [
        { type: "text", text: "Je consulte le programme officiel." },
        { type: "server_tool_use", id: "srvtoolu_2", name: "web_search", input: { query: "programme officiel" } },
        { type: "web_search_tool_result", tool_use_id: "srvtoolu_2", content: [] },
        { type: "text", text: JSON.stringify(lesson) },
      ],
      "end_turn",
    ),
  };
}

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const url = req.url.split("?")[0];
    if (req.method === "GET" && url === "/last") return send(res, 200, last);
    if (req.method === "GET" && url === "/grades") return send(res, 200, { grades });
    // correction d'une réponse libre (appel direct, non différé)
    if (req.method === "POST" && url === "/v1/messages") {
      const body = JSON.parse(raw);
      grades++;
      return send(res, 200, {
        id: "msg_grade",
        type: "message",
        role: "assistant",
        model: body.model,
        stop_reason: "end_turn",
        usage: { input_tokens: 800, output_tokens: 200 },
        content: [{ type: "text", text: JSON.stringify({ score: 1, feedback: "Correction IA de test : très bonne explication.", found: [], missing: [] }) }],
      });
    }
    if (req.method === "POST" && url === "/v1/messages/batches") {
      const body = JSON.parse(raw);
      const r = body.requests[0];
      const content = r.params.messages[0].content;
      const text = content.find((c) => c.type === "text").text;
      last = {
        apiKey: req.headers["x-api-key"],
        model: r.params.model,
        images: content.filter((c) => c.type === "image").length,
        text,
        tools: (r.params.tools || []).map((t) => t.type),
        domains: r.params.tools?.[0]?.allowed_domains,
        turns: r.params.messages.length,
      };
      const id = `msgbatch_${++n}`;
      batches.set(id, { id, created: Date.now(), request: r, slow: text.includes("LENT") });
      return send(res, 200, batchView(batches.get(id)));
    }
    const m = url.match(/^\/v1\/messages\/batches\/([^/]+)(\/results|\/cancel)?$/);
    const b = m && batches.get(m[1]);
    if (!b) return send(res, 404, { type: "error", error: { type: "not_found_error" } });
    if (m[2] === "/cancel") {
      b.canceled = true;
      return send(res, 200, batchView(b));
    }
    if (m[2] === "/results") {
      res.writeHead(200, { "content-type": "application/binary" });
      return res.end(JSON.stringify({ custom_id: b.request.custom_id, result: resultOf(b) }) + "\n");
    }
    return send(res, 200, batchView(b));
  })
  .listen(PORT, () => console.log(`mock Claude on ${PORT}`));
