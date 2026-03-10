import { useState, useRef, useEffect } from "react";
import Head from "next/head";

// ─── POSTCODE LOGIC ───────────────────────────────────────────────────────────
function classifyPostcode(pc) {
  const n = parseInt(pc, 10);
  if (isNaN(n)) return null;
  const sydneyRanges = [[1000,1999],[2000,2249],[2555,2574],[2740,2786],[2765,2770]];
  const sydneyExtras = [2900,2901,2902,2903,2904,2905,2906,2907,2908,2909,2910,2911,2912,2913,2914,2916,2917,2918,2919,2920];
  for (const [lo, hi] of sydneyRanges) { if (n >= lo && n <= hi) return "sydney"; }
  if (sydneyExtras.includes(n)) return "sydney";
  if ((n >= 2250 && n <= 2554) || (n >= 2575 && n <= 2739) || (n >= 2787 && n <= 2999)) return "regional_nsw";
  if (n >= 1000 && n <= 9999) return "interstate";
  return null;
}

const LOGO_URL = "https://static.wixstatic.com/media/95e22f_6045e47c405a41cb9574ffee27beb464~mv2.png/v1/fill/w_480,h_58,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/LUXE%20logo_RGB_480x100%20no%20tag.png";

const WELCOME = {
  role: "assistant",
  content: `Hello and welcome! I'm your Luxe Cantilever pricing assistant — here to help you explore our three models, get a price estimate, and answer any questions.\n\nTo show you accurate 2026 pricing, could you share your **postcode**? This lets me apply the right pricing for your area.`,
};

const QUICK_PROMPTS = [
  "What's the price for a 4x3m pergola?",
  "Which model suits a carport?",
  "Can I bolt it to an existing slab?",
  "What's included in the installed price?",
];

export default function Home() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState(null);
  const [suburb, setSuburb] = useState(null);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadData, setLeadData] = useState({ name: "", email: "", phone: "" });
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, showLeadForm]);

  const lookupSuburb = async (postcode) => {
    try {
      const res = await fetch(`/api/suburb?postcode=${postcode}`);
      const data = await res.json();
      if (data.suburb) setSuburb(data.suburb);
    } catch {
      // Silent fail — suburb display is non-critical
    }
  };

  const regionTag = (r) => {
    if (r === "sydney") return "[REGION: GREATER_SYDNEY]";
    if (r === "regional_nsw") return "[REGION: REGIONAL_NSW]";
    if (r === "interstate") return "[REGION: INTERSTATE]";
    return "[REGION: UNKNOWN]";
  };

  const regionLabel = (r) => {
    if (r === "sydney") return "Greater Sydney";
    if (r === "regional_nsw") return "Regional NSW";
    if (r === "interstate") return "Interstate";
    return "";
  };

  const sendMessage = async (overrideText) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading) return;
    setInput("");

    let activeRegion = region;
    if (!region) {
      const m = text.match(/\b(\d{4})\b/);
      if (m) {
        const classified = classifyPostcode(m[1]);
        if (classified) {
          activeRegion = classified;
          setRegion(classified);
          lookupSuburb(m[1]); // fire suburb lookup in background
        }
      }
    }

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);
    const newCount = exchangeCount + 1;
    setExchangeCount(newCount);

    try {
      // Build API messages with region tag injected
      const apiMessages = newMessages.map((m, i) => ({
        role: m.role,
        content: (m.role === "user" && i === newMessages.length - 1 && activeRegion)
          ? `${regionTag(activeRegion)} ${m.content}`
          : m.content,
      }));

      // Call our secure backend route — API key never touches the browser
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      const mentionsForm = /fill in your details|leave your details|details below|pop your details|lead form|your details below/i.test(data.reply);
      if (!leadCaptured && (mentionsForm || newCount >= 3)) {
        setTimeout(() => setShowLeadForm(true), 700);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Sorry, something went wrong. Please call us on **0450 285 238** or email **sales@luxecantilever.com.au**",
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const submitLead = async () => {
    if (!leadData.name || !leadData.email) return;
    setLeadSubmitted(true);
    setLeadCaptured(true);
    setShowLeadForm(false);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: `Thank you, **${leadData.name}**! Our team will be in touch with you shortly to follow up with a formal quote. Feel free to keep asking questions in the meantime.`,
    }]);

    // Build a short summary of what was discussed from the chat history
    const chatSummary = messages
      .filter(m => m.role === "user")
      .map(m => m.content.replace(/\[REGION:[^\]]+\]/g, "").trim())
      .slice(-5) // last 5 user messages
      .join(" | ");

    // Fire notification email — runs in background, customer sees success regardless
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          region,
          suburb,
          summary: chatSummary,
        }),
      });
    } catch {
      // Silent fail — don't surface email errors to the customer
    }
  };

  const render = (text) => text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n- /g, "<br/>• ")
    .replace(/\n/g, "<br/>");

  return (
    <>
      <Head>
        <title>Luxe Cantilever — Pricing Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Lora:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #f0ede8; font-family: 'Montserrat', sans-serif; }

        .lx-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }

        .lx-card { width: 100%; max-width: 680px; background: #ffffff; border: 1px solid #e2ddd8; display: flex; flex-direction: column; height: 92vh; max-height: 860px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06); }

        .lx-header { padding: 20px 28px 16px; border-bottom: 1px solid #ece8e2; background: #ffffff; }
        .lx-header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .lx-logo { height: 32px; width: auto; object-fit: contain; object-position: left; }
        .lx-status { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #5a8a4e; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }
        .lx-dot { width: 6px; height: 6px; background: #5a8a4e; border-radius: 50%; animation: blink 2.5s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
        .lx-tagline { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a9590; font-weight: 400; border-top: 1px solid #ece8e2; padding-top: 12px; display: flex; align-items: center; justify-content: space-between; }
        .lx-region-pill { display: inline-flex; align-items: center; gap: 5px; background: #f5f2ee; border: 1px solid #ddd9d3; padding: 3px 10px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #5a5550; font-weight: 500; animation: fadeUp 0.35s ease; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        .lx-msgs { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; background: #fdfcfb; scrollbar-width: thin; scrollbar-color: #ddd8d2 transparent; }
        .lx-msgs::-webkit-scrollbar { width: 3px; }
        .lx-msgs::-webkit-scrollbar-thumb { background: #ddd8d2; }

        .lx-msg { display: flex; gap: 12px; animation: fadeUp 0.28s ease; }
        .lx-msg-user { flex-direction: row-reverse; }

        .lx-icon { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; font-weight: 600; }
        .lx-icon-ai { background: #1a1a1a; color: #ffffff; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; }
        .lx-icon-user { background: #f0ede8; border: 1px solid #ddd9d3; color: #9a9590; font-size: 13px; }

        .lx-bubble { max-width: 78%; padding: 13px 17px; font-size: 13.5px; line-height: 1.72; font-weight: 400; }
        .lx-bubble-ai { background: #ffffff; color: #2a2520; border: 1px solid #e8e3dc; border-left: 3px solid #1a1a1a; }
        .lx-bubble-user { background: #1a1a1a; color: #e8e3dc; font-weight: 300; }
        .lx-bubble strong { font-weight: 600; color: #1a1a1a; }
        .lx-bubble-user strong { color: #ffffff; }

        .lx-typing { display: flex; gap: 4px; padding: 3px 0; }
        .lx-typing span { width: 5px; height: 5px; background: #9a9590; border-radius: 50%; animation: bob 1.2s infinite; opacity: 0.5; }
        .lx-typing span:nth-child(2){animation-delay:.2s}
        .lx-typing span:nth-child(3){animation-delay:.4s}
        @keyframes bob{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}

        .lx-quickbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 28px 16px; background: #fdfcfb; }
        .lx-qbtn { background: transparent; border: 1px solid #ddd9d3; color: #6a6560; padding: 6px 13px; font-size: 11.5px; font-family: 'Montserrat', sans-serif; font-weight: 400; letter-spacing: 0.04em; cursor: pointer; transition: all 0.18s; }
        .lx-qbtn:hover { border-color: #1a1a1a; color: #1a1a1a; background: #f8f5f0; }

        .lx-lead { margin: 0 28px 16px; padding: 20px 22px; background: #f8f5f0; border: 1px solid #e2ddd8; border-top: 3px solid #1a1a1a; animation: fadeUp 0.4s ease; }
        .lx-lead-title { font-family: 'Lora', serif; font-size: 16px; color: #1a1a1a; font-weight: 500; margin-bottom: 3px; }
        .lx-lead-sub { font-size: 11.5px; color: #8a8580; margin-bottom: 14px; letter-spacing: 0.03em; }
        .lx-lead-row { display: flex; gap: 8px; margin-bottom: 8px; }
        .lx-finput { flex: 1; background: #ffffff; border: 1px solid #ddd9d3; color: #2a2520; padding: 10px 13px; font-size: 12.5px; font-family: 'Montserrat', sans-serif; font-weight: 400; outline: none; transition: border-color 0.2s; width: 100%; }
        .lx-finput:focus { border-color: #1a1a1a; }
        .lx-finput::placeholder { color: #b0ada8; }
        .lx-fsubmit { width: 100%; background: #1a1a1a; color: #ffffff; border: none; padding: 12px; font-size: 11.5px; font-family: 'Montserrat', sans-serif; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: background 0.2s; margin-top: 4px; }
        .lx-fsubmit:hover { background: #333; }
        .lx-fskip { display: block; width: 100%; text-align: center; background: none; border: none; color: #aaa8a3; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; padding: 8px 0 0; font-family: 'Montserrat', sans-serif; transition: color 0.2s; }
        .lx-fskip:hover { color: #6a6560; }

        .lx-inputbar { padding: 14px 28px 18px; border-top: 1px solid #ece8e2; background: #ffffff; display: flex; gap: 10px; align-items: flex-end; }
        .lx-textarea { flex: 1; background: #fdfcfb; border: 1px solid #ddd9d3; color: #2a2520; padding: 11px 15px; font-size: 13.5px; font-family: 'Montserrat', sans-serif; font-weight: 400; outline: none; resize: none; min-height: 44px; max-height: 110px; line-height: 1.5; transition: border-color 0.2s; }
        .lx-textarea:focus { border-color: #1a1a1a; }
        .lx-textarea::placeholder { color: #b0ada8; }
        .lx-send { background: #1a1a1a; border: none; color: #ffffff; width: 44px; height: 44px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s, transform 0.1s; }
        .lx-send:hover { background: #333; }
        .lx-send:active { transform: scale(0.95); }
        .lx-send:disabled { background: #ccc; cursor: not-allowed; }

        .lx-footer { text-align: center; padding: 8px; font-size: 9.5px; color: #b8b5b0; letter-spacing: 0.1em; text-transform: uppercase; border-top: 1px solid #ece8e2; background: #ffffff; }

        @media (max-width: 600px) {
          .lx-card { height: 100vh; max-height: 100vh; border: none; }
          .lx-wrap { padding: 0; align-items: stretch; }
          .lx-bubble { max-width: 88%; }
        }
      `}</style>

      <div className="lx-wrap">
        <div className="lx-card">

          {/* Header */}
          <div className="lx-header">
            <div className="lx-header-top">
              <img src={LOGO_URL} alt="Luxe Cantilever" className="lx-logo" />
              <div className="lx-status">
                <div className="lx-dot" />
                Online
              </div>
            </div>
            <div className="lx-tagline">
              <span>Pricing & Design Assistant · 2026</span>
              {region && (
                <span className="lx-region-pill">
                  📍 {suburb ? `${suburb} · ${regionLabel(region)}` : regionLabel(region)}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="lx-msgs">
            {messages.map((msg, i) => (
              <div key={i} className={`lx-msg ${msg.role === "user" ? "lx-msg-user" : ""}`}>
                <div className={`lx-icon ${msg.role === "assistant" ? "lx-icon-ai" : "lx-icon-user"}`}>
                  {msg.role === "assistant" ? "LC" : "→"}
                </div>
                <div
                  className={`lx-bubble ${msg.role === "assistant" ? "lx-bubble-ai" : "lx-bubble-user"}`}
                  dangerouslySetInnerHTML={{ __html: render(msg.content) }}
                />
              </div>
            ))}
            {loading && (
              <div className="lx-msg">
                <div className="lx-icon lx-icon-ai">LC</div>
                <div className="lx-bubble lx-bubble-ai">
                  <div className="lx-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && !loading && (
            <div className="lx-quickbar">
              {QUICK_PROMPTS.map((q, i) => (
                <button key={i} className="lx-qbtn" onClick={() => { setInput(q); inputRef.current?.focus(); }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Lead form */}
          {showLeadForm && !leadSubmitted && (
            <div className="lx-lead">
              <div className="lx-lead-title">Get a Formal Quote</div>
              <div className="lx-lead-sub">Leave your details and our team will follow up with exact pricing.</div>
              <div className="lx-lead-row">
                <input className="lx-finput" placeholder="Your name *" value={leadData.name} onChange={e => setLeadData({...leadData, name: e.target.value})} />
                <input className="lx-finput" placeholder="Phone (optional)" value={leadData.phone} onChange={e => setLeadData({...leadData, phone: e.target.value})} />
              </div>
              <input className="lx-finput" placeholder="Email address *" type="email" value={leadData.email} onChange={e => setLeadData({...leadData, email: e.target.value})} style={{marginBottom: 0}} />
              <button className="lx-fsubmit" onClick={submitLead}>Request a Formal Quote</button>
              <button className="lx-fskip" onClick={() => { setShowLeadForm(false); setLeadCaptured(true); }}>No thanks, keep chatting</button>
            </div>
          )}

          {/* Input */}
          <div className="lx-inputbar">
            <textarea
              ref={inputRef}
              className="lx-textarea"
              placeholder="Ask about pricing, models, or sizing..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className="lx-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <div className="lx-footer">Luxe Cantilever® · All prices + GST · 2026 Guide Pricing · Australia</div>
        </div>
      </div>
    </>
  );
}
