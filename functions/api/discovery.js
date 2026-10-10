export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://ricca-operations.pages.dev",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const respond = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!env.HUBSPOT_SERVICE_KEY) {
    return respond({ error: "HubSpot integration is not configured." }, 500);
  }

  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ error: "A valid email address is required." }, 400);
    }

    const name = String(body.name || "").trim();
    const parts = name.split(/\s+/);
    const properties = {
      email,
      ...(parts[0] ? { firstname: parts[0] } : {}),
      ...(parts.length > 1 ? { lastname: parts.slice(1).join(" ") } : {}),
      ...(body.company_name
        ? { company: String(body.company_name).slice(0, 200) }
        : {}),
      ...(body.website
        ? { website: String(body.website).slice(0, 300) }
        : {}),
    };

    const headers = {
      Authorization: `Bearer ${env.HUBSPOT_SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    const searchResponse = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: "email",
              operator: "EQ",
              value: email,
            }],
          }],
          properties: ["email"],
          limit: 1,
        }),
      }
    );

    if (!searchResponse.ok) {
      return respond({ error: "HubSpot contact lookup failed." }, 502);
    }

    const searchData = await searchResponse.json();
    const existing = searchData.results?.[0];
    const url = existing
      ? `https://api.hubapi.com/crm/v3/objects/contacts/${existing.id}`
      : "https://api.hubapi.com/crm/v3/objects/contacts";

    const saveResponse = await fetch(url, {
      method: existing ? "PATCH" : "POST",
      headers,
      body: JSON.stringify({ properties }),
    });

    if (!saveResponse.ok) {
      return respond({ error: "HubSpot could not save the contact." }, 502);
    }

    return respond({ success: true });
  } catch {
    return respond({ error: "Unable to process the submission." }, 400);
  }
}
