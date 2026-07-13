import React, { useEffect, useState } from "react";

// Verrou d'accès — code personnel (mêmes codes que Planning Congés)
const SUPABASE_URL = "https://lypeksjzahbrbjhnvmsy.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cGVrc2p6YWhicmJqaG52bXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjQ3MDIsImV4cCI6MjA5NzQ0MDcwMn0.h8dgG4V_BgdYhoduaol_NIcJvqVsD5BNe0bxNh-eI0g";
const KEY = "sh_portail_acces";
const H = { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ((typeof window!=="undefined" && window.__SB_TOKEN) || ANON) };

export default function AccessGate({ children }) {
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || "null");
      if (j && j.exp > Date.now()) setOk(true);
    } catch (e) {}
    setReady(true);
  }, []);

  if (!ready) return null;
  if (ok) return children;

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/verifier_code_perso", { method: "POST", headers: H, body: JSON.stringify({ p_code: (code || "").trim() }) });
      const d = await r.json();
      if (d && d.nom) {
        const rec = { exp: Date.now() + 12 * 3600 * 1000, nom: d.nom, libelle: d.libelle };
        try { localStorage.setItem(KEY, JSON.stringify(rec)); sessionStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {}
        setOk(true);
      } else setErr("Code incorrect");
    } catch (e) { setErr("Service indisponible"); }
    setBusy(false);
  }

  const wrap = { position: "fixed", inset: 0, zIndex: 99999, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#0F2747,#183D6A)", fontFamily: "Inter,system-ui,-apple-system,'Segoe UI',sans-serif" };
  const card = { background: "#fff", padding: "30px 28px", borderRadius: 18, width: "min(360px,92vw)", boxShadow: "0 24px 60px rgba(0,0,0,.35)" };
  const inp = { width: "100%", padding: 12, border: "1px solid #CBD8E6", borderRadius: 10, fontSize: 16, textAlign: "center", letterSpacing: 4, boxSizing: "border-box" };
  const btn = { width: "100%", marginTop: 10, padding: 12, border: "none", borderRadius: 10, background: "#1E4E8C", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" };

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <img src="https://habitat-portail.vercel.app/logo-ville.png" alt="Ville de Saint-Denis"
          style={{ width: 66, height: 66, objectFit: "contain", background: "#fff", borderRadius: 14, margin: "0 auto 12px", display: "block" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <h1 style={{ margin: "0 0 4px", fontSize: 17, textAlign: "center", color: "#0F2747" }}>Compte rendu — Service Habitat</h1>
        <p style={{ margin: "0 0 18px", textAlign: "center", color: "#5B7089", fontSize: 13 }}>Accès réservé — entrez votre code</p>
        <input type="password" inputMode="numeric" autoComplete="off" placeholder="Votre code" value={code} onChange={(e) => setCode(e.target.value)} style={inp} autoFocus />
        <p style={{ color: "#B4232A", fontSize: 13, minHeight: 18, margin: "8px 0 0", textAlign: "center" }}>{err}</p>
        <button type="submit" disabled={busy} style={btn}>Entrer</button>
      </form>
    </div>
  );
}
