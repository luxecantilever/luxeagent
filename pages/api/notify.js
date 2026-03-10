// pages/api/notify.js
// Fires when a customer submits the lead form.
// Sends an alert email to both Luxe Cantilever team addresses.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, phone, region, suburb, summary } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const regionLabel = {
    sydney: "Greater Sydney",
    regional_nsw: "Regional NSW",
    interstate: "Interstate",
  }[region] || "Unknown";

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9f9f9;">
      <div style="background: #ffffff; border: 1px solid #e0e0e0; border-top: 4px solid #1a1a1a; padding: 32px;">
        <img src="https://static.wixstatic.com/media/95e22f_6045e47c405a41cb9574ffee27beb464~mv2.png/v1/fill/w_480,h_58,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/LUXE%20logo_RGB_480x100%20no%20tag.png"
          alt="Luxe Cantilever" style="height: 36px; margin-bottom: 24px; display: block;" />

        <h2 style="font-size: 18px; color: #1a1a1a; margin: 0 0 8px;">New Enquiry from Pricing Assistant</h2>
        <p style="color: #666; font-size: 13px; margin: 0 0 28px;">A customer submitted their details via the AI pricing assistant on the Luxe Cantilever website.</p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px 0; color: #888; width: 140px;">Name</td>
            <td style="padding: 10px 0; color: #1a1a1a; font-weight: 600;">${name}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px 0; color: #888;">Email</td>
            <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #1a1a1a;">${email}</a></td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px 0; color: #888;">Phone</td>
            <td style="padding: 10px 0; color: #1a1a1a;">${phone || "Not provided"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px 0; color: #888;">Region</td>
            <td style="padding: 10px 0; color: #1a1a1a;">${suburb ? `${suburb} · ` : ""}${regionLabel}</td>
          </tr>
          ${summary ? `
          <tr>
            <td style="padding: 10px 0; color: #888; vertical-align: top;">Chat summary</td>
            <td style="padding: 10px 0; color: #1a1a1a;">${summary}</td>
          </tr>` : ""}
        </table>

        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f0f0f0;">
          <a href="mailto:${email}?subject=Your Luxe Cantilever Quote Enquiry"
            style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">
            Reply to ${name} →
          </a>
        </div>
      </div>
      <p style="text-align: center; color: #bbb; font-size: 11px; margin-top: 16px;">
        Luxe Cantilever® · Kirrawee NSW 2232 · Automated notification from the AI Pricing Assistant
      </p>
    </div>
  `;

  const emailText = `
New Enquiry from Luxe Cantilever Pricing Assistant

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}
Region: ${regionLabel}
${summary ? `Chat summary: ${summary}` : ""}

Reply directly to: ${email}
  `.trim();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Luxe Cantilever Agent <noreply@luxecantilever.com.au>",
        to: ["sales@luxecantilever.com.au", "hello@benandgab.com.au"],
        reply_to: email,
        subject: `New Enquiry: ${name} — ${regionLabel}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend error:", data);
      // Still return 200 to the user — don't show email failures to customers
      return res.status(200).json({ ok: true, warning: "Email delivery issue" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Notify error:", err);
    // Fail silently to customer
    return res.status(200).json({ ok: true, warning: "Email delivery issue" });
  }
}
