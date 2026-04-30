import React, { useState } from "react";

const PACKAGES = [
  { id: "solo", name: "Solo Blast", desc: "1 cannon", price: 149 },
  { id: "twin", name: "Twin Reveal", desc: "2 cannons, synced", price: 249, popular: true },
  { id: "full", name: "Full Production", desc: "4 cannons + operator", price: 499 },
];

const COLOURS = [
  { id: "pink", label: "Pink", hex: "#F472B6" },
  { id: "blue", label: "Blue", hex: "#60A5FA" },
  { id: "custom", label: "Custom", hex: "linear-gradient(135deg, #F472B6, #60A5FA)" },
];

const GALLERY = [
  { id: 1, label: "Cannon firing pink smoke", bg: "linear-gradient(135deg, #E43F7B, #F472B6)" },
  { id: 2, label: "Kit laid out", bg: "linear-gradient(135deg, #1a1a2e, #374151)" },
  { id: 3, label: "Blue reveal moment", bg: "linear-gradient(135deg, #3B82F6, #60A5FA)" },
  { id: 4, label: "Happy couple reaction", bg: "linear-gradient(135deg, #F59E0B, #FBBF24)" },
  { id: 5, label: "Close-up of cannon", bg: "linear-gradient(135deg, #6B7280, #9CA3AF)" },
];

const REVIEWS = [
  { stars: 5, text: "Absolutely unreal. The smoke was massive and the photos came out insane. Everyone lost it.", name: "Sarah M.", loc: "Sydney", event: "Gender Reveal" },
  { stars: 5, text: "We hired the twin pack and the synced firing was next level. Worth every cent.", name: "Jake & Tina", loc: "Melbourne", event: "Gender Reveal" },
  { stars: 5, text: "Easy pickup, easy setup, easy return. And the video went viral on TikTok!", name: "Chris R.", loc: "Brisbane", event: "Gender Reveal" },
];

const FAQS = [
  { q: "Can I use the cannon indoors?", a: "No, outdoor use only. A safe distance of 10 metres is required from the cannon to any spectators." },
  { q: "What if it rains on my event day?", a: "Postpone for free. Unlimited date changes up to 24 hours before your pickup time." },
  { q: "Is a bond required?", a: "Yes, a $200 refundable bond per kit is required. It is refunded within 48 hours if the kit is returned in good condition." },
  { q: "How far does the powder travel?", a: "Approximately 8 to 12 metres depending on wind conditions. It creates a massive plume that looks incredible on camera." },
  { q: "Is the powder safe for kids and pets?", a: "Yes. Non-toxic, biodegradable cornstarch-based powder. It washes out of clothes easily." },
  { q: "What is your delivery radius?", a: "Free delivery within 30km of our warehouse. Outside that area, a small delivery fee applies or you can self-collect." },
  { q: "Can I keep the footage and photos?", a: "Absolutely. 100% yours. Tag us @genderrevealideas for a $10 store credit." },
  { q: "What if the cannon does not fire?", a: "It has never happened. But if it does, you get a full refund. We test every unit before dispatch." },
];

const TABS = ["Description", "What's Included", "How It Works", "Safety"];

function Stars({ count }) {
  return (
    <span style={{ color: "#F59E0B", fontSize: 16, letterSpacing: 2 }}>
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

export default function CannonRentalPage() {
  const [selectedImg, setSelectedImg] = useState(0);
  const [pkg, setPkg] = useState("twin");
  const [colour, setColour] = useState("pink");
  const [tab, setTab] = useState("Description");
  const [openFaq, setOpenFaq] = useState(null);
  const [eventDate, setEventDate] = useState("");
  const [suburb, setSuburb] = useState("");

  const selectedPkg = PACKAGES.find(p => p.id === pkg);

  const s = {
    page: { background: "#fff", minHeight: "100vh", fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#1a1a2e", overflowY: "auto", maxHeight: "100vh" },
    section: { maxWidth: 1100, margin: "0 auto", padding: "0 24px" },
    sectionAlt: { background: "#F8F9FC" },
  };

  return (
    <div style={s.page}>
      {/* Breadcrumb */}
      <div style={{ ...s.section, padding: "16px 24px" }}>
        <span style={{ fontSize: 13, color: "#7C8DB0" }}>
          Home &rsaquo; Gender Reveals &rsaquo; <span style={{ color: "#1a1a2e", fontWeight: 500 }}>TNT Cannon Kit</span>
        </span>
      </div>

      {/* Product Hero */}
      <div style={{ ...s.section, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, paddingBottom: 48 }}>
        {/* Gallery */}
        <div>
          <div style={{
            width: "100%", aspectRatio: "1", borderRadius: 12, background: GALLERY[selectedImg].bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 18, fontWeight: 600, textShadow: "0 2px 8px rgba(0,0,0,0.3)",
            marginBottom: 12, cursor: "pointer", overflow: "hidden",
          }}>
            {GALLERY[selectedImg].label}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {GALLERY.map((img, i) => (
              <div key={img.id} onClick={() => setSelectedImg(i)} style={{
                width: 72, height: 72, borderRadius: 8, background: img.bg, cursor: "pointer",
                border: selectedImg === i ? "3px solid #E43F7B" : "3px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 9, fontWeight: 600, textAlign: "center",
                transition: "border-color 0.2s",
              }}>
                {img.label}
              </div>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
            TNT Gender Reveal Cannon Kit
          </h1>
          <p style={{ fontSize: 15, color: "#7C8DB0", marginBottom: 12 }}>24-Hour Rental — Delivered Ready to Fire</p>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Stars count={5} />
            <span style={{ fontSize: 13, color: "#7C8DB0" }}>4.9 (47 reviews)</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 24 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: "#E43F7B" }}>${selectedPkg.price}.00</span>
            <span style={{ fontSize: 14, color: "#7C8DB0" }}>AUD</span>
            {selectedPkg.id === "solo" && (
              <span style={{ fontSize: 16, color: "#9CA3AF", textDecoration: "line-through" }}>$199.00</span>
            )}
            <span style={{ fontSize: 12, background: "#FFF0F5", color: "#E43F7B", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }}>24hr hire</span>
          </div>

          {/* Package selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Package</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PACKAGES.map(p => (
                <div key={p.id} onClick={() => setPkg(p.id)} style={{
                  border: pkg === p.id ? "2px solid #E43F7B" : "1px solid #E8ECF4",
                  borderRadius: 10, padding: "12px 16px", cursor: "pointer",
                  background: pkg === p.id ? "#FFF0F5" : "#fff",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  transition: "all 0.15s",
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                    {p.popular && <span style={{ fontSize: 10, fontWeight: 700, background: "#E43F7B", color: "#fff", padding: "2px 6px", borderRadius: 4, marginLeft: 8 }}>MOST BOOKED</span>}
                    <div style={{ fontSize: 12, color: "#7C8DB0", marginTop: 2 }}>{p.desc}</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 16, color: pkg === p.id ? "#E43F7B" : "#1a1a2e" }}>${p.price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Colour selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Colour</label>
            <div style={{ display: "flex", gap: 12 }}>
              {COLOURS.map(c => (
                <div key={c.id} onClick={() => setColour(c.id)} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", background: c.hex,
                    border: colour === c.id ? "3px solid #1a1a2e" : "3px solid #E8ECF4",
                    boxShadow: colour === c.id ? "0 0 0 2px #E43F7B" : "none",
                    transition: "all 0.15s",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: colour === c.id ? 600 : 400, color: colour === c.id ? "#1a1a2e" : "#7C8DB0" }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Date + Location */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#7C8DB0", display: "block", marginBottom: 4 }}>Event date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={{
                width: "100%", padding: "10px 12px", border: "1px solid #E8ECF4", borderRadius: 8,
                fontSize: 14, background: "#F8F9FC", color: "#1a1a2e", boxSizing: "border-box",
              }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#7C8DB0", display: "block", marginBottom: 4 }}>Suburb or postcode</label>
              <input type="text" value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Bondi 2026" style={{
                width: "100%", padding: "10px 12px", border: "1px solid #E8ECF4", borderRadius: 8,
                fontSize: 14, background: "#F8F9FC", color: "#1a1a2e", boxSizing: "border-box",
              }} />
            </div>
          </div>

          {/* CTA */}
          <button onClick={() => {}} style={{
            width: "100%", padding: "16px 24px", background: "linear-gradient(135deg, #E43F7B, #d1356b)",
            color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.5px", marginBottom: 8,
            boxShadow: "0 4px 14px rgba(228,63,123,0.3)", transition: "opacity 0.2s",
          }}>
            BOOK NOW — CHECK AVAILABILITY
          </button>
          <div style={{ textAlign: "center", fontSize: 13, color: "#7C8DB0", marginBottom: 16 }}>
            Or call us: <a href="tel:0412345678" style={{ color: "#E43F7B", fontWeight: 600, textDecoration: "none" }}>0412 345 678</a>
          </div>

          {/* Trust strip */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "14px 16px",
            background: "#F8F9FC", borderRadius: 10, border: "1px solid #E8ECF4", marginBottom: 12,
          }}>
            {["Fully insured", "Safe coloured powder", "500+ reveals fired", "Free delivery within 30km"].map(t => (
              <div key={t} style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#059669", fontWeight: 700 }}>&#10003;</span> {t}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Includes $200 refundable bond per kit</p>
        </div>
      </div>

      {/* Tabs Section */}
      <div style={{ ...s.sectionAlt, padding: "48px 0" }}>
        <div style={s.section}>
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E8ECF4", marginBottom: 24 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "12px 20px", fontSize: 14, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? "#E43F7B" : "#7C8DB0", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #E43F7B" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s", marginBottom: -2,
              }}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Description" && (
            <div style={{ fontSize: 15, lineHeight: 1.7, color: "#374151", maxWidth: 700 }}>
              <p style={{ marginBottom: 12, color: "#374151" }}>
                The TNT Gender Reveal Cannon Kit is the most dramatic way to announce your baby's gender. One pull of the fuse and a massive plume of vibrant coloured powder erupts into the sky — creating an unforgettable moment for you, your guests, and your camera roll.
              </p>
              <p style={{ marginBottom: 12, color: "#374151" }}>
                Completely non-pyrotechnic and safe for outdoor events. No fire, no sparks — just a huge burst of colour that photographs and films beautifully from every angle.
              </p>
              <p style={{ color: "#374151" }}>
                Rent for 24 hours, set up in under 5 minutes, and return the next day. We handle the rest.
              </p>
            </div>
          )}

          {tab === "What's Included" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600 }}>
              {[
                "TNT cannon body",
                "Sturdy tripod stand",
                "Safety goggles (2 pairs)",
                "Coloured powder charge (pink or blue)",
                "Fuse mechanism",
                "Laminated instruction card",
                "Safe distance measuring tape (10m)",
                "Protective carry case",
              ].map(item => (
                <div key={item} style={{ fontSize: 14, color: "#374151", padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#E43F7B", fontWeight: 700 }}>&#10003;</span> {item}
                </div>
              ))}
            </div>
          )}

          {tab === "How It Works" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
              {[
                { num: "1", title: "Pick your date and package", desc: "Choose Solo, Twin, or Full Production. Select your colour and event date." },
                { num: "2", title: "We deliver or you collect", desc: "Free delivery within 30km the day before your event. Or pick up from our warehouse." },
                { num: "3", title: "Pull the fuse", desc: "Set up in 5 minutes. Pull the fuse. Watch the sky explode in colour. Return the kit the next day." },
              ].map(step => (
                <div key={step.num} style={{ textAlign: "center" }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", background: "#E43F7B", color: "#fff",
                    fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 12px",
                  }}>{step.num}</div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{step.title}</h4>
                  <p style={{ fontSize: 13, color: "#7C8DB0", lineHeight: 1.5 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "Safety" && (
            <div style={{ maxWidth: 600 }}>
              {[
                "100% non-pyrotechnic — no fire, no sparks, no explosives",
                "Public liability insurance included with every hire",
                "Approved non-toxic, biodegradable coloured powder",
                "Safe distance guide and measuring tape included",
                "Suitable for outdoor use only — minimum 10m clearance",
                "Tested and inspected before every dispatch",
              ].map(item => (
                <div key={item} style={{ fontSize: 14, color: "#374151", padding: "10px 0", borderBottom: "1px solid #E8ECF4", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#059669", fontSize: 16, fontWeight: 700 }}>&#9679;</span> {item}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Social Proof */}
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={s.section}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#7C8DB0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Trusted by Australian families</p>
          <div style={{ fontSize: 28, color: "#F59E0B", letterSpacing: 4, marginBottom: 4 }}>★★★★★</div>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e" }}>500+ Reveals Fired</p>
          <p style={{ fontSize: 14, color: "#7C8DB0", marginTop: 4 }}>4.9 average rating across all hires</p>
        </div>
      </div>

      {/* Reviews */}
      <div style={{ ...s.sectionAlt, padding: "48px 0" }}>
        <div style={s.section}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, textAlign: "center" }}>What Our Customers Say</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {REVIEWS.map((r, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 12, padding: "24px", border: "1px solid #E8ECF4",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <Stars count={r.stars} />
                <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "12px 0 16px", fontStyle: "italic" }}>
                  "{r.text}"
                </p>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: "#7C8DB0" }}> — {r.loc}</span>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{r.event}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ padding: "48px 0" }}>
        <div style={s.section}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, textAlign: "center" }}>Frequently Asked Questions</h2>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: "1px solid #E8ECF4" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "16px 0", background: "none", border: "none", cursor: "pointer",
                  fontSize: 15, fontWeight: 600, color: "#1a1a2e", textAlign: "left",
                }}>
                  {faq.q}
                  <span style={{ fontSize: 20, color: "#7C8DB0", transition: "transform 0.2s", transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ paddingBottom: 16, fontSize: 14, color: "#7C8DB0", lineHeight: 1.6 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={{
        background: "linear-gradient(135deg, #E43F7B, #d1356b)", padding: "60px 24px", textAlign: "center",
      }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Ready to Make a Statement?</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", marginBottom: 24 }}>
          Book your TNT Cannon Kit now. Pick your date, pick your colour.
        </p>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{
          padding: "14px 40px", background: "#fff", color: "#E43F7B", border: "none",
          borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.15)", transition: "opacity 0.2s",
        }}>
          BOOK NOW
        </button>
      </div>
    </div>
  );
}
