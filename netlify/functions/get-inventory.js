// Netlify Function: get-inventory
//
// Returns all records from the Airtable Inventory table as JSON, for the
// public storefront to render. Read-only — customers never write here.
//
// Required environment variables:
//   AIRTABLE_API_KEY    - Airtable personal access token
//   AIRTABLE_BASE_ID    - the base ID (starts with "app...")
//   AIRTABLE_TABLE_NAME - e.g. "Inventory"

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Airtable is not configured on this deployment yet." }) };
  }

  try {
    const tableName = process.env.AIRTABLE_TABLE_NAME || "Inventory";
    let records = [];
    let offset = null;

    do {
      const url = new URL(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);

      const resp = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${process.env.AIRTABLE_API_KEY}` }
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Airtable read failed", detail: errText }) };
      }
      const data = await resp.json();
      records = records.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    const cards = records.map(r => ({
      id: r.id,
      name: r.fields.Name || "",
      set: r.fields.Set || "",
      number: r.fields.Number || "",
      rarity: r.fields.Rarity || "",
      image: r.fields.Image || "",
      condition: r.fields.Condition || "Near Mint",
      qty: r.fields.Quantity ?? 1,
      price: r.fields.Price ?? null,
      pokemonTcgId: r.fields.PokemonTcgId || null
    }));

    return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ cards }) };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || "Unknown server error" }) };
  }
};
