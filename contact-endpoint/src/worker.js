export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowedOrigin),
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    }

    // Only accept from our site
    if (!origin || origin !== allowedOrigin) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    }

    // Accept name OR first/last from the form
    const first = (data.first_name || "").toString().trim();
    const last  = (data.last_name  || "").toString().trim();
    const name  = ((data.name || `${first} ${last}`).trim()) || "Anonymous";

    const email   = (data._replyto || data.email || "").toString().trim();
    const company = (data.company || "").toString().trim();
    const message = (data.message || "").toString().trim();

    // Require email + message; name now optional
    if (!email || !message) {
      return new Response(JSON.stringify({ error: "email and message are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    }

    const subject = `New message from ${name}${company ? " @ " + company : ""}`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif; line-height:1.5">
        <h2>New Contact Form Message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ""}
        <p><strong>Message:</strong></p>
        <pre style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:8px">${escapeHtml(message)}</pre>
      </div>
    `;

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: env.TO_EMAIL,
          subject,
          html,
          reply_to: email,
        }),
      });

      if (!r.ok) {
        const errTxt = await r.text();
        return new Response(JSON.stringify({ error: "Resend error", details: errTxt }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Network error", details: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowedOrigin) },
      });
    }
  }
};

function corsHeaders(origin, allowed) {
  const isAllowed = origin && origin === allowed;
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // allow Accept as well; some browsers include it in preflight
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Vary": "Origin",
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}
