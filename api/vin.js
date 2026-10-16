// VIN -> year / make / model, using the free NHTSA vPIC database (no key needed).
import { send } from "./_lib.js";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  const url = new URL(req.url, "http://x");
  const vin = String(url.searchParams.get("vin") || "").trim().toUpperCase();
  if (!VIN_RE.test(vin)) return send(res, 400, { error: "A VIN is 17 letters and numbers (no I, O or Q)." });
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("lookup failed");
    const j = await r.json();
    const d = (j.Results && j.Results[0]) || {};
    const year = parseInt(d.ModelYear, 10) || null;
    const out = {
      vin,
      year,
      make: d.Make ? titleCase(d.Make) : null,
      model: d.Model || null,
      trim: d.Trim || d.Series || null,
      body: d.BodyClass || null,
      found: Boolean(d.Make && d.Model),
    };
    res.setHeader("Cache-Control", "public, max-age=86400");
    return send(res, 200, out);
  } catch {
    return send(res, 502, { error: "Could not reach the VIN database. Enter year, make and model by hand." });
  }
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bBmw\b/, "BMW").replace(/\bGmc\b/, "GMC");
}
