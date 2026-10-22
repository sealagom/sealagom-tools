#!/usr/bin/env node
/**
 * A ready-to-run Telegram bot on the free SeaLagom API helpers (../js/api.mjs), nothing else: no
 * dependency beyond Node 18+'s built-in fetch. It answers the same kind of questions as
 * @sealagom_bot on sealagom.com, but it is your own bot, your own token, and your own chat - there
 * is no account linking, watch list, billing or crypto invoice here, because those belong to that
 * one deployment, not to a tool everyone can run. Fork it and add what your own bot needs next.
 *
 * Get a token from @BotFather (https://t.me/BotFather, /newbot), then:
 *
 *   TELEGRAM_BOT_TOKEN=123456:AA... node telegram/bot.mjs
 *
 * /weather and /route need a SeaLagom API key (free Developer key covers active warnings; get one
 * at https://www.sealagom.com/profile/?tab=api):
 *
 *   TELEGRAM_BOT_TOKEN=123456:AA... SEALAGOM_API_KEY=sk_... node telegram/bot.mjs
 *
 * Commands: /near <lat> <lon> [nm], /port <name>, /vessel <name|MMSI>, /stations <lat> <lon>,
 * /weather <lat> <lon>, /route <lat,lon;lat,lon;...> [knots], /help
 */
import { warningsNear, searchPorts, port as portDetail, findVessel, stationsNear, weatherAt, analyseRoute } from "../js/api.mjs";
import { parseCommand, parseNumbers, parseWaypoints, formatWarnings, formatPort, formatVessel, formatStations, formatWeather, formatRoute, formatError } from "./format.mjs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.SEALAGOM_API_KEY || "";
if (!TOKEN) {
  console.error("Set TELEGRAM_BOT_TOKEN first - get one from @BotFather on Telegram.");
  process.exit(1);
}
const TG = `https://api.telegram.org/bot${TOKEN}`;

async function send(chatId, text) {
  const r = await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!r.ok) console.error("sendMessage failed:", r.status, await r.text().catch(() => ""));
}

const HELP = [
  "SeaLagom tools bot (open source: github.com/sealagom/sealagom-tools). Commands:",
  "/near <lat> <lon> [nm] – warnings in force around a position (default 30 NM)",
  "/port <name> – a port: VTS, pilotage, limits, anchorages, terminals",
  "/vessel <name|MMSI> – warnings naming a vessel, and its known rows",
  "/stations <lat> <lon> – rescue centres and DSC coast stations near a position",
  "/weather <lat> <lon> – wind, sea and the forecast now (needs SEALAGOM_API_KEY)",
  "/route <lat,lon;lat,lon;...> [knots] – NAVAREAs crossed, warnings in the corridor (needs a key)",
  "The warning text is the authority: www.sealagom.com",
].join("\n");

async function handle(text, chatId) {
  const parsed = parseCommand(text);
  if (!parsed) return send(chatId, "A command, please. /help lists them.");
  const { cmd, args } = parsed;
  try {
    if (cmd === "start" || cmd === "help") return send(chatId, HELP);
    if (cmd === "near") {
      const [lat, lon, nm] = parseNumbers(args, 2, ["latitude", "longitude"]);
      return send(chatId, formatWarnings(await warningsNear(lat, lon, nm || 30)));
    }
    if (cmd === "port") {
      if (!args) return send(chatId, "/port <name>");
      const hits = await searchPorts(args);
      const hit = (hits.results || hits)[0];
      if (!hit) return send(chatId, "No port by that name.");
      return send(chatId, formatPort(await portDetail(hit.slug)));
    }
    if (cmd === "vessel") {
      if (!args) return send(chatId, "/vessel <name or MMSI>");
      return send(chatId, formatVessel(await findVessel(args)));
    }
    if (cmd === "stations") {
      const [lat, lon] = parseNumbers(args, 2, ["latitude", "longitude"]);
      return send(chatId, formatStations(await stationsNear(lat, lon)));
    }
    if (cmd === "weather") {
      if (!API_KEY) return send(chatId, "This bot has no SEALAGOM_API_KEY set, so /weather is off. Get a free key: https://www.sealagom.com/profile/?tab=api");
      const [lat, lon] = parseNumbers(args, 2, ["latitude", "longitude"]);
      return send(chatId, formatWeather(await weatherAt(lat, lon, { key: API_KEY })));
    }
    if (cmd === "route") {
      if (!API_KEY) return send(chatId, "This bot has no SEALAGOM_API_KEY set, so /route is off. Get a free key: https://www.sealagom.com/profile/?tab=api");
      const [wptText, knText] = args.split(/\s+(?=[\d.]+$)/);
      const waypoints = parseWaypoints(wptText || args);
      return send(chatId, formatRoute(await analyseRoute(waypoints, { speedKn: Number(knText) || 12, key: API_KEY })));
    }
    return send(chatId, "Unknown command. /help");
  } catch (e) {
    return send(chatId, formatError(e));
  }
}

let offset = 0;
async function pollOnce() {
  const r = await fetch(`${TG}/getUpdates?timeout=30&offset=${offset}`);
  const data = await r.json();
  for (const update of data.result || []) {
    offset = update.update_id + 1;
    const msg = update.message;
    if (msg?.text) await handle(msg.text, msg.chat.id).catch((e) => console.error("handler failed:", e));
  }
}

console.log("SeaLagom tools bot: polling Telegram. Ctrl+C to stop.");
for (;;) {
  try {
    await pollOnce();
  } catch (e) {
    console.error("poll failed, retrying in 2s:", e.message);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
