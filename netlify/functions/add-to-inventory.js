// Netlify Function: add-to-inventory
//
// Writes a staff-confirmed card record to Airtable. Called after identify-card
// returns its result and staff have set/adjusted condition, quantity, and price.
//
// Required environment variables:
//   AIRTABLE_API_KEY    - Airtable personal access token
//   AIRTABLE_BASE_ID    - the base ID (starts with "app...")
//   AIRTABLE_TABLE_NAME - e.g. "Inventory"

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Airtable is not configured on this deployment yet." }) };
  }

  try {
    const record = JSON.parse(event.body || "{}");
    const tableName = process.env.AIRTABLE_TABLE_NAME || "Inventory";

    const airtableResp = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.AIRTABLE_API_KEY}`
        },
        body: JSON.stringify({
          fields: {
            Name: record.name || "",
            Set: record.set || "",
            Number: record.number || "",
            Rarity: record.rarity || "",
            Image: record.image || "",
            Condition: record.condition || "Near Mint",
            Quantity: record.qty || 1,
            Price: record.price ?? null,
            PokemonTcgId: record.pokemonTcgId || null
          }
        })
      }
    );

    if (!airtableResp.ok) {
      const errText = await airtableResp.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Airtable write failed", detail: errText }) };
    }

    const airtableData = await airtableResp.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, airtableRecordId: airtableData.id }) };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || "Unknown server error" }) };
  }
};
