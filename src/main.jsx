import React from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import App from "./App.jsx";
import AccessGate from "./AccessGate.jsx";
import "./index.css";

const SUPABASE_URL = "https://lypeksjzahbrbjhnvmsy.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cGVrc2p6YWhicmJqaG52bXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjQ3MDIsImV4cCI6MjA5NzQ0MDcwMn0.h8dgG4V_BgdYhoduaol_NIcJvqVsD5BNe0bxNh-eI0g";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
window.__SB_CLIENT = supabase;

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }
  window.__SB_TOKEN = session.access_token;
  supabase.auth.onAuthStateChange((_e, s) => { window.__SB_TOKEN = s ? s.access_token : null; });
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode><AccessGate><App /></AccessGate></React.StrictMode>
  );
})();
