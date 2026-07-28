// Netlify Function: identify-card
//
// Receives a photo (base64 JPEG) from the staff scan tool and identifies the
// card with Claude's vision, then enriches it with pokemontcg.io pricing.
// Does NOT write to Airtable — that happens in add-to-inventory.js once staff
// confirm condition/quantity/price. This runs server-side, so the Anthropic
// API key stays out of the browser.
//
// Required environment variables (set in Netlify dashboard -> Site settings ->
// Environment variables):
//   ANTHROPIC_API_KEY   - your Anthropic API key (console.anthropic.com)

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

  try {
    const { imageBase64, mediaType } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing imageBase64" }) };
    }

    // 1. Identify the card with Claude vision
    const idResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: "Identify this Pokemon trading card. Respond with ONLY a JSON object, no markdown fences, no preamble, in this exact shape: {\"name\": string, \"set\": string, \"number\": string, \"confidence\": \"high\"|\"medium\"|\"low\", \"notFound\": boolean}. If the image is not a Pokemon card or you cannot identify it, set notFound to true." }
          ]
        }]
      })
    });

    if (!idResp.ok) {
      const errText = await idResp.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Identification service error", detail: errText }) };
    }

    const idData = await idResp.json();
    const textBlock = (idData.content || []).find(b => b.type === "text");
    let parsed;
    try {
      parsed = JSON.parse((textBlock?.text || "").replace(/```json|```/g, "").trim());
    } catch (e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: "Could not parse card identification. Try a clearer photo." }) };
    }
    if (!textBlock || parsed.notFound) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: "Couldn't identify a Pokemon card in that photo." }) };
    }

    // 2. Enrich with pokemontcg.io (catalog + market price)
    let matchedCard = null;
    try {
      const query = `name:"${parsed.name}"`;
      const searchResp = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=20`);
      const searchData = await searchResp.json();
      const candidates = searchData.data || [];
      matchedCard = candidates.find(c =>
        c.set?.name?.toLowerCase().includes((parsed.set || "").toLowerCase()) ||
        (parsed.set || "").toLowerCase().includes((c.set?.name || "").toLowerCase())
      ) || candidates.find(c => c.number === parsed.number) || candidates[0] || null;
    } catch (e) {
      // pokemontcg.io lookup is best-effort; identification still succeeds without it
    }

    const marketPrice = (() => {
      const p = matchedCard?.tcgplayer?.prices;
      if (!p) return null;
      const variant = p.holofoil || p.reverseHolofoil || p.normal || p.unlimited || Object.values(p)[0];
      return variant?.market || variant?.mid || null;
    })();

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        name: matchedCard?.name || parsed.name,
        set: matchedCard?.set?.name || parsed.set || "",
        number: matchedCard?.number || parsed.number || "",
        rarity: matchedCard?.rarity || "",
        image: matchedCard?.images?.small || matchedCard?.images?.large || "",
        marketPrice,
        pokemonTcgId: matchedCard?.id || null,
        confidence: parsed.confidence
      })
    };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || "Unknown server error" }) };
  }
};

