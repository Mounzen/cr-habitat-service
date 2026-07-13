import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, FilePlus2, History, ListChecks, Plus, Trash2,
  ChevronRight, ChevronDown, Calendar, Users, Save,
  AlertTriangle, CheckCircle2, Circle, Clock, Search, X,
  Settings, Printer, RefreshCw, Wifi, WifiOff, CornerDownRight,
  Lightbulb, Inbox, Check, XCircle, Tag, Wallet
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const POLES = {
  CV: { label: "Cadre de Vie", short: "CV", color: "#2D6E64", tint: "#EAF2F0" },
  OD: { label: "Offre et Demande", short: "OD", color: "#3A5A8C", tint: "#EAEEF5" },
  LTS: { label: "LTS — Gestion locative, Ventes, Travaux", short: "LTS", color: "#B5502A", tint: "#F6EBE4" },
  DIV: { label: "Points transversaux / Divers", short: "DIV", color: "#6B6558", tint: "#F0EFEB" },
};
const POLE_ORDER = ["CV", "OD", "LTS", "DIV"];

const STATUTS = {
  a_faire: { label: "À faire", color: "#8A8478", icon: Circle },
  en_cours: { label: "En cours", color: "#D98E2B", icon: Clock },
  fait: { label: "Fait", color: "#2D6E64", icon: CheckCircle2 },
  retard: { label: "En retard", color: "#B5502A", icon: AlertTriangle },
};

const PRIORITES = {
  normale: { label: "Normale", color: "#8A8478" },
  haute: { label: "Haute", color: "#D98E2B" },
  urgente: { label: "Urgente", color: "#B5502A" },
};

const TABLE = "service_habitat_cr";
const COUNTERS_ID = "__counters__";
const PROPOSALS_ID = "__proposals__";
const BUDGET_ID = "__budget_enveloppes__";

const uid = () => Math.random().toString(36).slice(2, 10);

const MOODS = {
  soleil:   { emoji: "☀️", label: "Au top" },
  eclaircie:{ emoji: "🌤️", label: "Ça va" },
  nuage:    { emoji: "☁️", label: "Mitigé" },
  pluie:    { emoji: "🌧️", label: "Difficile" },
  orage:    { emoji: "⛈️", label: "Compliqué" },
};
const MOOD_ORDER = ["soleil", "eclaircie", "nuage", "pluie", "orage"];

function emptyCR() {
  return {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    heure: "09:00",
    lieu: "",
    redacteur: "",
    animateur: "",
    participants: { CV: "", OD: "", LTS: "", DIV: "" },
    meteo: [],
    points: { CV: [], OD: [], LTS: [], DIV: [] },
    createdAt: new Date().toISOString(),
  };
}

const PREDEFINED_THEMES = [
  "Budget de fonctionnement", "Budget d'investissement", "BS",
  "Chèque primo-accession", "Consommations travaux", "Garanties d'emprunt",
  "Dossiers ASIP", "Réunions partenaires", "Police du logement",
];

const BUDGET_CATEGORIES = [
  "Budget de fonctionnement", "Budget d'investissement", "BS",
  "Chèque primo-accession", "Consommations travaux", "Garanties d'emprunt",
];
const BUDGET_COLORS = {
  "Budget de fonctionnement": "#3A5A8C",
  "Budget d'investissement": "#2D6E64",
  "BS": "#B5502A",
  "Chèque primo-accession": "#8A6FBF",
  "Consommations travaux": "#D98E2B",
  "Garanties d'emprunt": "#6B6558",
};

function moisActuel() { return new Date().toISOString().slice(0, 7); }

function emptyBudgetLigne() {
  return { id: uid(), categorie: "", poste: "", mois: moisActuel(), engage: "", consomme: "" };
}

function emptyPoint() {
  return {
    id: uid(),
    sujet: "",
    discussion: "",
    decision: "",
    action: "",
    responsable: "",
    echeance: "",
    priorite: "normale",
    statut: "a_faire",
    ref: null,
    reporteDe: null,
    proposePar: null,
    themes: [],
    budgetLignes: [],
  };
}

function buildReportedPoint(orig) {
  return {
    ...emptyPoint(),
    sujet: orig.sujet,
    action: orig.action,
    responsable: orig.responsable,
    echeance: orig.echeance,
    priorite: orig.priorite,
    statut: orig.statut === "retard" ? "en_cours" : orig.statut,
    ref: orig.ref,
    reporteDe: orig.crDate,
  };
}

function computeReportables(allActions) {
  const latestByRef = {};
  allActions.forEach((a) => {
    if (!a.ref) return;
    if (!latestByRef[a.ref] || a.crDate > latestByRef[a.ref].crDate) latestByRef[a.ref] = a;
  });
  return Object.values(latestByRef).filter((a) => a.statut !== "fait");
}

function emptyProposal() {
  return {
    id: uid(),
    pole: "CV",
    sujet: "",
    description: "",
    proposePar: "",
    urgence: "normale",
    date: new Date().toISOString().slice(0, 10),
    statut: "en_attente", // en_attente | integre | ecarte
    crId: null,
  };
}

function buildPointFromProposal(prop) {
  return {
    ...emptyPoint(),
    sujet: prop.sujet,
    discussion: prop.description || "",
    priorite: prop.urgence === "haute" ? "haute" : "normale",
    proposePar: prop.proposePar,
    fromProposalId: prop.id,
  };
}

// ---------------------------------------------------------------------------
// Storage adapter — local (browser localStorage) or Supabase REST, same interface
// ---------------------------------------------------------------------------
const LS_PREFIX = "cr-habitat:";

function lsGet(key) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v === null ? null : JSON.parse(v);
  } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch {}
}
function lsRemove(key) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch {}
}

async function loadSupabaseConfig() { return lsGet("supabase-config"); }

// ---------------------------------------------------------------------------
// Authentification — PIN partagé avec Habitat Dispatch et Planning Congés
// (même table conges_agents, mêmes codes, zéro dépendance à un envoi d'e-mail)
// ---------------------------------------------------------------------------
const AGENTS_TABLE = "conges_agents";

async function verifierPinAgent(cfg, pin) {
  const headers = { apikey: cfg.key, Authorization: `Bearer ${(typeof window!=="undefined" && window.__SB_TOKEN) || cfg.key}` };
  const res = await fetch(
    `${cfg.url.replace(/\/$/, "")}/rest/v1/${AGENTS_TABLE}?select=id,nom,prenom,pole,role&pin=eq.${encodeURIComponent(pin)}&actif=eq.true`,
    { headers }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Erreur ${res.status}: ${t || res.statusText}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

function loadAgentSession() { return lsGet("agent-session"); }
function saveAgentSession(s) { lsSet("agent-session", s); }
function clearAgentSession() { lsRemove("agent-session"); }
async function saveSupabaseConfig(cfg) { lsSet("supabase-config", cfg); }
async function clearSupabaseConfig() { lsRemove("supabase-config"); }

function makeLocalStore() {
  async function loadIndex() { return lsGet("cr-index") || []; }
  async function saveIndex(idx) { lsSet("cr-index", idx); }
  return {
    mode: "local",
    async loadIndex() { return loadIndex(); },
    async loadAllFull() {
      const idx = await loadIndex();
      const map = {};
      idx.forEach((r) => { const full = lsGet(`cr:${r.id}`); if (full) map[r.id] = full; });
      return map;
    },
    async loadCR(id) { return lsGet(`cr:${id}`); },
    async saveCR(cr) {
      lsSet(`cr:${cr.id}`, cr);
      const idx = await loadIndex();
      const others = idx.filter((r) => r.id !== cr.id);
      await saveIndex([...others, { id: cr.id, date: cr.date, lieu: cr.lieu, redacteur: cr.redacteur, nbPoints: cr.nbPoints || 0 }]);
    },
    async deleteCR(id) {
      lsRemove(`cr:${id}`);
      const idx = await loadIndex();
      await saveIndex(idx.filter((r) => r.id !== id));
    },
    async loadCounters() { return lsGet("ref-counters") || { CV: 0, OD: 0, LTS: 0, DIV: 0 }; },
    async saveCounters(c) { lsSet("ref-counters", c); },
    async loadProposals() { return lsGet("proposals") || []; },
    async saveProposals(list) { lsSet("proposals", list); },
    async loadBudgetEnveloppes() { return lsGet("budget-enveloppes") || {}; },
    async saveBudgetEnveloppes(env) { lsSet("budget-enveloppes", env); },
  };
}

function makeSupabaseStore(cfg) {
  const headers = { apikey: cfg.key, Authorization: `Bearer ${(typeof window!=="undefined" && window.__SB_TOKEN) || cfg.key}`, "Content-Type": "application/json" };
  async function req(path, opts = {}) {
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`Supabase ${res.status}: ${t || res.statusText}`); }
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  return {
    mode: "supabase",
    async loadIndex() {
      const rows = await req(`${TABLE}?select=id,payload&id=not.in.(${COUNTERS_ID},${PROPOSALS_ID},${BUDGET_ID})`);
      return rows.map((r) => ({ id: r.id, date: r.payload.date, lieu: r.payload.lieu, redacteur: r.payload.redacteur, nbPoints: r.payload.nbPoints || 0 }));
    },
    async loadAllFull() {
      const rows = await req(`${TABLE}?select=id,payload&id=not.in.(${COUNTERS_ID},${PROPOSALS_ID},${BUDGET_ID})`);
      const map = {};
      rows.forEach((r) => { map[r.id] = r.payload; });
      return map;
    },
    async loadCR(id) {
      const rows = await req(`${TABLE}?select=payload&id=eq.${id}`);
      return rows[0]?.payload || null;
    },
    async saveCR(cr) {
      await req(TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: cr.id, payload: cr, updated_at: new Date().toISOString() }]) });
    },
    async deleteCR(id) { await req(`${TABLE}?id=eq.${id}`, { method: "DELETE" }); },
    async loadCounters() {
      const rows = await req(`${TABLE}?select=payload&id=eq.${COUNTERS_ID}`);
      return rows[0]?.payload || { CV: 0, OD: 0, LTS: 0, DIV: 0 };
    },
    async saveCounters(c) {
      await req(TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: COUNTERS_ID, payload: c, updated_at: new Date().toISOString() }]) });
    },
    async loadProposals() {
      const rows = await req(`${TABLE}?select=payload&id=eq.${PROPOSALS_ID}`);
      return rows[0]?.payload || [];
    },
    async saveProposals(list) {
      await req(TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: PROPOSALS_ID, payload: list, updated_at: new Date().toISOString() }]) });
    },
    async testConnection() { await req(`${TABLE}?select=id&limit=1`); },
    async loadBudgetEnveloppes() {
      const rows = await req(`${TABLE}?select=payload&id=eq.${BUDGET_ID}`);
      return rows[0]?.payload || {};
    },
    async saveBudgetEnveloppes(env) {
      await req(TABLE, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: BUDGET_ID, payload: env, updated_at: new Date().toISOString() }]) });
    },
  };
}

const SQL_SNIPPET = `create table if not exists service_habitat_cr (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table service_habitat_cr enable row level security;
create policy "allow all" on service_habitat_cr for all using (true) with check (true);`;

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------
function StatusPill({ statut }) {
  const s = STATUTS[statut];
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${s.color}17`, color: s.color }}>
      <Icon size={11} strokeWidth={2.5} />{s.label}
    </span>
  );
}
function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ index, allActions, pendingProposals, onOpen, onNew, onGoProposals }) {
  const totalCR = index.length;
  const totalActions = allActions.length;
  const done = allActions.filter((a) => a.statut === "fait").length;
  const late = allActions.filter((a) => a.statut === "retard").length;
  const tauxCompletion = totalActions ? Math.round((done / totalActions) * 100) : 0;
  const parPole = POLE_ORDER.map((code) => ({ pole: POLES[code].short, points: allActions.filter((a) => a.pole === code).length, color: POLES[code].color }));
  const recent = [...index].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const urgentOpen = allActions.filter((a) => a.statut !== "fait" && (a.priorite === "urgente" || a.statut === "retard")).slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-[26px] leading-tight text-stone-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-stone-500">Service Habitat — Direction de l'Habitat et du Logement</p>
      </div>

      {pendingProposals.length > 0 && (
        <button onClick={onGoProposals} className="flex w-full items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-left hover:bg-sky-100">
          <span className="flex items-center gap-2 text-sm font-medium text-sky-800">
            <Lightbulb size={16} /> {pendingProposals.length} sujet(s) proposé(s) par des agents, en attente d'intégration
          </span>
          <ChevronRight size={16} className="text-sky-500" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Comptes rendus", value: totalCR },
          { label: "Actions ouvertes", value: totalActions - done },
          { label: "Taux de complétion", value: `${tauxCompletion}%` },
          { label: "En retard", value: late, alert: late > 0 },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="font-mono text-2xl font-semibold" style={{ color: k.alert ? "#B5502A" : "#1C2521" }}>{k.value}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-stone-500">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-stone-200 bg-white p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-stone-700">Points traités par pôle</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={parPole} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E4DD" />
              <XAxis dataKey="pole" tick={{ fontSize: 12, fill: "#78716C" }} axisLine={{ stroke: "#D6D3CB" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#F5F6F2" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E7E4DD" }} />
              <Bar dataKey="points" radius={[4, 4, 0, 0]}>
                {parPole.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">À traiter en priorité</h2>
          {urgentOpen.length === 0 ? (
            <p className="text-sm text-stone-400">Aucune action urgente ou en retard.</p>
          ) : (
            <ul className="space-y-2">
              {urgentOpen.map((a) => (
                <li key={a.id} className="flex items-start gap-2 border-l-2 pl-2" style={{ borderColor: POLES[a.pole].color }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-stone-800">{a.action || a.sujet}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
                      <span className="font-mono">{a.ref}</span>{a.responsable && <span>· {a.responsable}</span>}
                    </div>
                  </div>
                  <StatusPill statut={a.statut} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Réunions récentes</h2>
          <button onClick={onNew} className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
            <Plus size={14} /> Nouveau CR
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-stone-400">Aucun compte rendu enregistré pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((r) => (
              <li key={r.id}>
                <button onClick={() => onOpen(r.id)} className="flex w-full items-center justify-between py-2.5 text-left hover:bg-stone-50">
                  <div>
                    <div className="text-sm font-medium text-stone-800">{r.lieu || "Réunion"} <span className="text-stone-400">— {r.date}</span></div>
                    <div className="text-[11px] text-stone-500">{r.nbPoints} point(s) · réd. {r.redacteur || "—"}</div>
                  </div>
                  <ChevronRight size={16} className="text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposer un sujet (agents) + gestion des propositions
// ---------------------------------------------------------------------------
function ProposalsView({ proposals, store, onProposalsChanged }) {
  const [form, setForm] = useState(emptyProposal());
  const [submitting, setSubmitting] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");

  const pending = proposals.filter((p) => p.statut === "en_attente").sort((a, b) => (a.date < b.date ? 1 : -1));
  const resolved = proposals.filter((p) => p.statut !== "en_attente").sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  const submit = async () => {
    if (!form.sujet.trim()) return;
    setSubmitting(true);
    const next = [...proposals, { ...form, id: uid() }];
    await store.saveProposals(next);
    onProposalsChanged(next);
    setForm(emptyProposal());
    setSubmitting(false);
    setConfirmMsg("Sujet transmis — il sera proposé au rédacteur pour la prochaine réunion.");
    setTimeout(() => setConfirmMsg(""), 3000);
  };

  const setStatut = async (id, statut) => {
    const next = proposals.map((p) => (p.id === id ? { ...p, statut } : p));
    await store.saveProposals(next);
    onProposalsChanged(next);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-[26px] text-stone-900">Proposer un sujet</h1>
        <p className="mt-1 text-sm text-stone-500">Tout agent peut déposer un point à aborder avant la prochaine réunion de service.</p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pôle concerné">
            <select className={inputCls} value={form.pole} onChange={(e) => setForm({ ...form, pole: e.target.value })}>
              {POLE_ORDER.map((c) => <option key={c} value={c}>{POLES[c].label}</option>)}
            </select>
          </Field>
          <Field label="Proposé par">
            <input className={inputCls} value={form.proposePar} onChange={(e) => setForm({ ...form, proposePar: e.target.value })} placeholder="Ton nom" />
          </Field>
          <Field label="Sujet" className="sm:col-span-2">
            <input className={inputCls} value={form.sujet} onChange={(e) => setForm({ ...form, sujet: e.target.value })} placeholder="Ex : Point sur le dossier X" />
          </Field>
          <Field label="Précisions (facultatif)" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Contexte, ce qui bloque, ce qui est attendu de la réunion…" />
          </Field>
          <Field label="Urgence">
            <select className={inputCls} value={form.urgence} onChange={(e) => setForm({ ...form, urgence: e.target.value })}>
              <option value="normale">Normale — peut attendre la prochaine réunion</option>
              <option value="haute">Haute — à traiter rapidement</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={submit} disabled={submitting || !form.sujet.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40">
            <Plus size={15} /> Déposer le sujet
          </button>
          {confirmMsg && <span className="text-xs text-emerald-700">{confirmMsg}</span>}
        </div>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-700">
          <Inbox size={15} /> En attente d'intégration ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-stone-400">Aucun sujet en attente. Les prochains sujets déposés apparaîtront ici et seront proposés automatiquement au rédacteur du prochain CR.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-stone-200 bg-white p-3" style={{ borderLeft: `3px solid ${POLES[p.pole].color}` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: POLES[p.pole].color }}>{POLES[p.pole].short}</span>
                    {p.urgence === "haute" && <span className="text-[11px] font-medium text-amber-700">Urgent</span>}
                    <span className="text-[11px] text-stone-400">{p.date}</span>
                  </div>
                  <div className="text-sm font-medium text-stone-800">{p.sujet}</div>
                  {p.description && <p className="mt-0.5 text-sm text-stone-500">{p.description}</p>}
                  <div className="mt-1 text-[11px] text-stone-400">Proposé par {p.proposePar || "un agent"}</div>
                </div>
                <button onClick={() => setStatut(p.id, "ecarte")} title="Écarter" className="shrink-0 text-stone-300 hover:text-red-600">
                  <XCircle size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Historique récent</h2>
          <ul className="space-y-1">
            {resolved.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs text-stone-500">
                {p.statut === "integre" ? <Check size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-stone-400" />}
                <span className="truncate">{p.sujet}</span>
                <span className="text-stone-400">— {p.statut === "integre" ? "intégré au CR" : "écarté"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New / Edit CR form
// ---------------------------------------------------------------------------
function ThemePicker({ themes, onChange }) {
  const [nouveau, setNouveau] = useState("");
  const toggle = (t) => {
    if (themes.includes(t)) onChange(themes.filter((x) => x !== t));
    else onChange([...themes, t]);
  };
  const ajouterCustom = () => {
    const t = nouveau.trim();
    if (!t || themes.includes(t)) return;
    onChange([...themes, t]);
    setNouveau("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PREDEFINED_THEMES.map((t) => (
          <button
            key={t} type="button" onClick={() => toggle(t)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${themes.includes(t) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}
          >
            {t}
          </button>
        ))}
        {themes.filter((t) => !PREDEFINED_THEMES.includes(t)).map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} className="rounded-full border border-stone-900 bg-stone-900 px-2.5 py-1 text-[11px] text-white">
            {t} ×
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          className={`${inputCls} text-xs`}
          placeholder="Ajouter un thème…"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ajouterCustom())}
        />
        <button type="button" onClick={ajouterCustom} className="shrink-0 rounded-md bg-stone-200 px-3 text-xs font-medium text-stone-700 hover:bg-stone-300">+</button>
      </div>
    </div>
  );
}

function BudgetLignesEditor({ lignes, onChange }) {
  const add = () => onChange([...lignes, emptyBudgetLigne()]);
  const remove = (id) => onChange(lignes.filter((l) => l.id !== id));
  const update = (id, patch) => onChange(lignes.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <div className="mt-2 rounded-md border border-dashed border-stone-300 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">💰 Suivi budgétaire (facultatif)</span>
        <button onClick={add} className="text-[11px] font-medium text-stone-600 hover:underline">+ Ajouter une ligne</button>
      </div>
      {lignes.length === 0 ? (
        <p className="text-[11px] text-stone-400">Aucune ligne budgétaire sur ce point.</p>
      ) : (
        <div className="space-y-2">
          {lignes.map((l) => (
            <div key={l.id} className="grid grid-cols-2 gap-2 rounded border border-stone-200 bg-stone-50 p-2 sm:grid-cols-5">
              <select className={`${inputCls} text-xs`} value={l.categorie} onChange={(e) => update(l.id, { categorie: e.target.value })}>
                <option value="">Catégorie…</option>
                {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className={`${inputCls} text-xs`} placeholder="Poste (ex : fournitures, études…)" value={l.poste} onChange={(e) => update(l.id, { poste: e.target.value })} />
              <input type="month" className={`${inputCls} text-xs`} value={l.mois} onChange={(e) => update(l.id, { mois: e.target.value })} />
              <input type="number" min="0" step="0.01" className={`${inputCls} text-xs`} placeholder="Engagé €" value={l.engage} onChange={(e) => update(l.id, { engage: e.target.value })} />
              <div className="flex gap-1">
                <input type="number" min="0" step="0.01" className={`${inputCls} text-xs`} placeholder="Consommé €" value={l.consomme} onChange={(e) => update(l.id, { consomme: e.target.value })} />
                <button onClick={() => remove(l.id)} className="shrink-0 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PoleSection({ code, points, onChange }) {
  const p = POLES[code];
  const [open, setOpen] = useState(true);
  const addPoint = () => onChange([...points, emptyPoint()]);
  const removePoint = (id) => onChange(points.filter((pt) => pt.id !== id));
  const updatePoint = (id, patch) => onChange(points.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)));

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3" style={{ background: p.tint }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-sm font-semibold" style={{ color: p.color }}>{p.label}</span>
          <span className="text-xs text-stone-500">({points.length})</span>
        </div>
        {open ? <ChevronDown size={16} className="text-stone-500" /> : <ChevronRight size={16} className="text-stone-500" />}
      </button>
      {open && (
        <div className="space-y-3 p-4">
          {points.map((pt, i) => (
            <div key={pt.id} className="rounded-md border border-stone-200 p-3" style={{ borderLeft: `3px solid ${p.color}` }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-stone-400">{pt.ref || `${p.short}-nouveau-${i + 1}`}</span>
                  {pt.reporteDe && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      <CornerDownRight size={10} /> Reporté du {pt.reporteDe}
                    </span>
                  )}
                  {pt.proposePar && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                      <Lightbulb size={10} /> Proposé par {pt.proposePar}
                    </span>
                  )}
                </div>
                <button onClick={() => removePoint(pt.id)} className="text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Sujet" className="sm:col-span-2">
                  <input className={inputCls} value={pt.sujet} onChange={(e) => updatePoint(pt.id, { sujet: e.target.value })} placeholder="Ex : Dossier CESC Alamandas" />
                </Field>
                <Field label="Éléments abordés" className="sm:col-span-2">
                  <textarea className={inputCls} rows={2} value={pt.discussion} onChange={(e) => updatePoint(pt.id, { discussion: e.target.value })} placeholder="Résumé des échanges" />
                </Field>
                <Field label="Décision"><input className={inputCls} value={pt.decision} onChange={(e) => updatePoint(pt.id, { decision: e.target.value })} /></Field>
                <Field label="Action à mener"><input className={inputCls} value={pt.action} onChange={(e) => updatePoint(pt.id, { action: e.target.value })} /></Field>
                <Field label="Responsable"><input className={inputCls} value={pt.responsable} onChange={(e) => updatePoint(pt.id, { responsable: e.target.value })} /></Field>
                <Field label="Échéance"><input type="date" className={inputCls} value={pt.echeance} onChange={(e) => updatePoint(pt.id, { echeance: e.target.value })} /></Field>
                <Field label="Priorité">
                  <select className={inputCls} value={pt.priorite} onChange={(e) => updatePoint(pt.id, { priorite: e.target.value })}>
                    {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="Statut">
                  <select className={inputCls} value={pt.statut} onChange={(e) => updatePoint(pt.id, { statut: e.target.value })}>
                    {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="Thèmes récurrents" className="sm:col-span-2">
                  <ThemePicker themes={pt.themes || []} onChange={(themes) => updatePoint(pt.id, { themes })} />
                </Field>
              </div>

              <BudgetLignesEditor
                lignes={pt.budgetLignes || []}
                onChange={(budgetLignes) => {
                  // Cohérence automatique : toute catégorie budgétaire utilisée devient aussi un thème coché sur le point
                  const categoriesUtilisees = budgetLignes.map((l) => l.categorie).filter(Boolean);
                  const themesActuels = pt.themes || [];
                  const themesSynced = Array.from(new Set([...themesActuels, ...categoriesUtilisees]));
                  updatePoint(pt.id, { budgetLignes, themes: themesSynced });
                }}
              />
            </div>
          ))}
          <button onClick={addPoint} className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline" style={{ color: p.color }}>
            <Plus size={14} /> Ajouter un point pour {p.short}
          </button>
        </div>
      )}
    </div>
  );
}

function MeteoDuJour({ meteo, onChange }) {
  const [nom, setNom] = useState("");
  const [humeur, setHumeur] = useState(null);

  const add = () => {
    if (!nom.trim() || !humeur) return;
    onChange([...meteo, { id: uid(), nom: nom.trim(), humeur }]);
    setNom(""); setHumeur(null);
  };
  const remove = (id) => onChange(meteo.filter((m) => m.id !== id));

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="px-4 py-3" style={{ background: "#FDF6EC" }}>
        <span className="text-sm font-semibold text-amber-800">☀️ Météo du jour</span>
        <span className="ml-2 text-[11px] text-amber-700/70">Visible par toute l'équipe, comme le reste du CR</span>
      </div>
      <div className="space-y-3 p-4">
        {meteo.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {meteo.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pl-2.5 pr-1.5 text-sm">
                <span>{MOODS[m.humeur].emoji}</span>
                <span className="text-stone-700">{m.nom}</span>
                <button onClick={() => remove(m.id)} className="text-stone-300 hover:text-red-600"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} max-w-[180px]`}
            placeholder="Nom de l'agent"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <div className="flex gap-1">
            {MOOD_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                title={MOODS[k].label}
                onClick={() => setHumeur(k)}
                className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-colors ${humeur === k ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:bg-stone-50"}`}
              >
                {MOODS[k].emoji}
              </button>
            ))}
          </div>
          <button
            onClick={add}
            disabled={!nom.trim() || !humeur}
            className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-30"
          >
            <Plus size={13} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

const DRAFT_KEY = "cr-habitat:draft-en-cours";

function CRForm({ initial, counters, store, nbFromProposals, onSaved, onCancel }) {
  const [cr, setCr] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [draftRestoreMsg, setDraftRestoreMsg] = useState("");

  // Restauration d'un brouillon non enregistré (crash, fermeture accidentelle, etc.)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.id && draft.id === initial.id) {
          setCr(draft);
          setDraftRestoreMsg("Brouillon non enregistré restauré automatiquement.");
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sauvegarde automatique du brouillon en cours (débounce léger)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(cr)); } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [cr]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  const nbReported = POLE_ORDER.reduce((n, c) => n + cr.points[c].filter((p) => p.reporteDe).length, 0);
  const setPoints = (code, pts) => setCr((c) => ({ ...c, points: { ...c.points, [code]: pts } }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // On relit les compteurs juste avant d'enregistrer pour réduire (sans l'éliminer complètement)
      // le risque de collision de référence si un autre agent enregistre un CR au même moment.
      let freshCounters = counters;
      try { freshCounters = await store.loadCounters(); } catch {}
      const newCounters = { ...freshCounters };
      const withRefs = { ...cr, points: { ...cr.points } };
      POLE_ORDER.forEach((code) => {
        withRefs.points[code] = withRefs.points[code].map((pt) => {
          if (pt.ref) return pt;
          newCounters[code] = (newCounters[code] || 0) + 1;
          return { ...pt, ref: `${code}-${String(newCounters[code]).padStart(3, "0")}` };
        });
      });
      const nbPoints = POLE_ORDER.reduce((n, c) => n + withRefs.points[c].length, 0);
      withRefs.nbPoints = nbPoints;
      withRefs.historique = [...(withRefs.historique || []), { date: new Date().toISOString(), action: "Compte rendu créé" }];
      await store.saveCR(withRefs);
      await store.saveCounters(newCounters);
      clearDraft();
      setSavedMsg("Compte rendu enregistré.");
      setTimeout(() => setSavedMsg(""), 2000);
      onSaved(withRefs, nbPoints, newCounters);
    } catch (e) {
      setError(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[26px] text-stone-900">Nouveau compte rendu</h1>
          {(nbReported > 0 || nbFromProposals > 0) && (
            <div className="mt-1 space-y-0.5">
              {nbReported > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <CornerDownRight size={13} /> {nbReported} action(s) non terminée(s) reportée(s) automatiquement.
                </p>
              )}
              {nbFromProposals > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-sky-700">
                  <Lightbulb size={13} /> {nbFromProposals} sujet(s) proposé(s) par des agents, ajoutés à l'ordre du jour.
                </p>
              )}
              {draftRestoreMsg && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <RefreshCw size={13} /> {draftRestoreMsg}
                </p>
              )}
            </div>
          )}
        </div>
        <button onClick={() => { clearDraft(); onCancel(); }} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date"><input type="date" className={inputCls} value={cr.date} onChange={(e) => setCr({ ...cr, date: e.target.value })} /></Field>
          <Field label="Heure"><input type="time" className={inputCls} value={cr.heure} onChange={(e) => setCr({ ...cr, heure: e.target.value })} /></Field>
          <Field label="Lieu" className="lg:col-span-2"><input className={inputCls} value={cr.lieu} onChange={(e) => setCr({ ...cr, lieu: e.target.value })} placeholder="Ex : Salle de réunion, Direction Habitat" /></Field>
          <Field label="Rédacteur"><input className={inputCls} value={cr.redacteur} onChange={(e) => setCr({ ...cr, redacteur: e.target.value })} /></Field>
          <Field label="Animateur / Président de séance"><input className={inputCls} value={cr.animateur} onChange={(e) => setCr({ ...cr, animateur: e.target.value })} /></Field>
          {POLE_ORDER.filter((c) => c !== "DIV").map((code) => (
            <Field key={code} label={`Présents — ${POLES[code].short}`}>
              <input className={inputCls} value={cr.participants[code]} onChange={(e) => setCr({ ...cr, participants: { ...cr.participants, [code]: e.target.value } })} placeholder="Noms séparés par une virgule" />
            </Field>
          ))}
        </div>
      </div>

      <MeteoDuJour meteo={cr.meteo} onChange={(meteo) => setCr((c) => ({ ...c, meteo }))} />

      <div className="space-y-4">
        {POLE_ORDER.map((code) => (
          <PoleSection key={code} code={code} points={cr.points[code]} onChange={(pts) => setPoints(code, pts)} />
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-stone-200 bg-white/95 backdrop-blur px-4 py-3 sm:pl-64">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {savedMsg && <span className="text-xs text-emerald-700">{savedMsg}</span>}
          <button onClick={() => { clearDraft(); onCancel(); }} className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
            <Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer le compte rendu"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historique + detail view
// ---------------------------------------------------------------------------
function CRDetail({ cr, onBack, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
          <ChevronRight size={14} className="rotate-180" /> Retour à l'historique
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
          <Printer size={14} /> Exporter en PDF
        </button>
      </div>

      <div className="print-only mb-6 hidden text-center">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Ville de Saint-Denis</div>
        <div className="text-sm text-stone-600">Direction de l'Habitat et du Logement — Service Habitat</div>
        <div className="mt-3 font-serif text-2xl text-stone-900">Compte rendu de réunion</div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5 print-block">
        <h1 className="font-serif text-2xl text-stone-900">{cr.lieu || "Réunion"}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-stone-500">
          <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {cr.date} à {cr.heure}</span>
          <span className="inline-flex items-center gap-1.5"><Users size={14} /> Rédacteur : {cr.redacteur || "—"}</span>
        </div>
        {cr.meteo?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            {cr.meteo.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                <span>{MOODS[m.humeur]?.emoji}</span>{m.nom}
              </span>
            ))}
          </div>
        )}
      </div>

      {POLE_ORDER.filter((code) => cr.points[code]?.length).map((code) => (
        <div key={code} className="overflow-hidden rounded-lg border border-stone-200 bg-white print-block">
          <div className="px-4 py-2.5" style={{ background: POLES[code].tint }}>
            <span className="text-sm font-semibold" style={{ color: POLES[code].color }}>{POLES[code].label}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {cr.points[code].map((pt) => (
              <div key={pt.id} className="p-4" style={{ borderLeft: `3px solid ${POLES[code].color}` }}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-stone-400">{pt.ref}</span>
                  <StatusPill statut={pt.statut} />
                  {pt.priorite !== "normale" && <span className="text-[11px] font-medium" style={{ color: PRIORITES[pt.priorite].color }}>{PRIORITES[pt.priorite].label}</span>}
                  {pt.reporteDe && <span className="text-[11px] text-amber-700">Reporté du {pt.reporteDe}</span>}
                  {pt.proposePar && <span className="text-[11px] text-sky-700">Proposé par {pt.proposePar}</span>}
                </div>
                {pt.themes?.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {pt.themes.map((t) => (
                      <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">{t}</span>
                    ))}
                  </div>
                )}
                <div className="text-sm font-medium text-stone-800">{pt.sujet}</div>
                {pt.discussion && <p className="mt-1 text-sm text-stone-600">{pt.discussion}</p>}
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {pt.decision && <div><span className="text-stone-400">Décision : </span>{pt.decision}</div>}
                  {pt.action && <div><span className="text-stone-400">Action : </span>{pt.action}</div>}
                  {pt.responsable && <div><span className="text-stone-400">Responsable : </span>{pt.responsable}</div>}
                  {pt.echeance && <div><span className="text-stone-400">Échéance : </span>{pt.echeance}</div>}
                </div>
                {pt.budgetLignes?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pt.budgetLignes.map((l) => (
                      <div key={l.id} className="rounded-md bg-stone-50 px-3 py-1.5 text-sm">
                        <span className="font-medium" style={{ color: BUDGET_COLORS[l.categorie] }}>💰 {l.categorie}</span>
                        {l.poste && <span className="ml-2 text-stone-500">— {l.poste}</span>}
                        <span className="ml-2 text-[11px] text-stone-400">{l.mois}</span>
                        {l.engage && <span className="ml-3 text-stone-600">Engagé : <strong>{Number(l.engage).toLocaleString("fr-FR")} €</strong></span>}
                        {l.consomme && <span className="ml-3 text-stone-600">Consommé : <strong>{Number(l.consomme).toLocaleString("fr-FR")} €</strong></span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cr.historique?.length > 0 && (
        <details className="no-print rounded-lg border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-stone-700">Historique des modifications ({cr.historique.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-stone-500">
            {cr.historique.slice().reverse().map((h, i) => (
              <li key={i}>{new Date(h.date).toLocaleString("fr-FR")} — {h.action}</li>
            ))}
          </ul>
        </details>
      )}

      {confirmDelete ? (
        <div className="no-print flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs">
          <span className="text-red-700">Supprimer définitivement ce compte rendu ? Cette action est irréversible.</span>
          <button onClick={() => onDelete(cr.id)} className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">Oui, supprimer</button>
          <button onClick={() => setConfirmDelete(false)} className="text-stone-500 hover:text-stone-700">Annuler</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="no-print inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-red-600">
          <Trash2 size={13} /> Supprimer ce compte rendu
        </button>
      )}
    </div>
  );
}

function Historique({ index, allCRs, onOpen, loadingId }) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();

  const contenuTexte = (id) => {
    const full = allCRs[id];
    if (!full) return "";
    return POLE_ORDER.flatMap((code) => (full.points?.[code] || [])).map((pt) =>
      [pt.sujet, pt.discussion, pt.decision, pt.action, pt.responsable, pt.ref, ...(pt.themes || [])].join(" ")
    ).join(" ").toLowerCase();
  };

  const filtered = index.filter((r) => {
    if (!q) return true;
    const meta = (r.lieu + r.redacteur + r.date).toLowerCase();
    return meta.includes(q) || contenuTexte(r.id).includes(q);
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-[26px] text-stone-900">Historique des réunions</h1>
      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un lieu, un sujet, une action, un montant…" className={`${inputCls} pl-9`} />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400">Aucun compte rendu trouvé.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {filtered.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-stone-50">
                <div>
                  <div className="text-sm font-medium text-stone-800">{r.lieu || "Réunion"} <span className="font-normal text-stone-400">— {r.date}</span></div>
                  <div className="text-[11px] text-stone-500">{r.nbPoints} point(s) traité(s) · réd. {r.redacteur || "—"}</div>
                </div>
                {loadingId === r.id ? <span className="text-xs text-stone-400">Chargement…</span> : <ChevronRight size={16} className="text-stone-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suivi des actions (cross-CR)
// ---------------------------------------------------------------------------
function nomMois(moisStr) {
  if (!moisStr) return "—";
  const [y, m] = moisStr.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function shadeForIndex(hexColor, index) {
  // Décline une teinte de la couleur de la catégorie pour chaque poste (couronne extérieure)
  const opacities = ["FF", "CC", "99", "77", "55"];
  const op = opacities[index % opacities.length];
  return hexColor + op;
}

function migrerEnveloppes(raw) {
  // Ancien format : { [categorie]: montant }. Nouveau format : { [annee]: { [categorie]: montant } }.
  const anneeActuelle = String(new Date().getFullYear());
  const cles = Object.keys(raw || {});
  const estAncienFormat = cles.some((k) => BUDGET_CATEGORIES.includes(k));
  if (estAncienFormat) return { [anneeActuelle]: raw };
  return raw || {};
}

function BudgetView({ allCRs, enveloppes, store, onEnveloppesChanged }) {
  const enveloppesMigrees = useMemo(() => migrerEnveloppes(enveloppes), [enveloppes]);
  const anneeActuelle = String(new Date().getFullYear());
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(anneeActuelle);
  const [editEnveloppes, setEditEnveloppes] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [moisFiltre, setMoisFiltre] = useState("TOUT");
  const [metrique, setMetrique] = useState("consomme"); // "engage" | "consomme"

  const toutesLignes = useMemo(() => {
    const list = [];
    Object.values(allCRs).forEach((cr) => {
      POLE_ORDER.forEach((code) => {
        (cr.points?.[code] || []).forEach((pt) => {
          (pt.budgetLignes || []).forEach((l) => {
            if (!l.categorie) return;
            list.push({
              ...l,
              engage: Number(l.engage) || 0,
              consomme: Number(l.consomme) || 0,
              ref: pt.ref, sujet: pt.sujet, crDate: cr.date, crLieu: cr.lieu,
            });
          });
        });
      });
    });
    return list.sort((a, b) => (a.mois < b.mois ? 1 : -1));
  }, [allCRs]);

  const anneesDisponibles = useMemo(() => {
    const set = new Set([anneeActuelle, ...Object.keys(enveloppesMigrees)]);
    toutesLignes.forEach((l) => { if (l.mois) set.add(l.mois.slice(0, 4)); });
    return Array.from(set).sort().reverse();
  }, [enveloppesMigrees, toutesLignes]);

  const enveloppesAnnee = enveloppesMigrees[anneeSelectionnee] || {};

  const lignesAnnee = toutesLignes.filter((l) => !l.mois || l.mois.startsWith(anneeSelectionnee));
  const moisDisponibles = useMemo(() => {
    const set = new Set(lignesAnnee.map((l) => l.mois).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [lignesAnnee]);

  const lignes = moisFiltre === "TOUT" ? lignesAnnee : lignesAnnee.filter((l) => l.mois === moisFiltre);

  const parCategorie = BUDGET_CATEGORIES.map((cat) => {
    const items = lignes.filter((l) => l.categorie === cat);
    const postesMap = {};
    items.forEach((l) => {
      const poste = l.poste?.trim() || "Sans poste précisé";
      if (!postesMap[poste]) postesMap[poste] = { poste, engage: 0, consomme: 0 };
      postesMap[poste].engage += l.engage;
      postesMap[poste].consomme += l.consomme;
    });
    return {
      categorie: cat,
      engage: items.reduce((s, l) => s + l.engage, 0),
      consomme: items.reduce((s, l) => s + l.consomme, 0),
      enveloppe: Number(enveloppesAnnee[cat]) || 0,
      color: BUDGET_COLORS[cat],
      postes: Object.values(postesMap).sort((a, b) => b[metrique] - a[metrique]),
    };
  });

  const totalEnveloppe = parCategorie.reduce((s, c) => s + c.enveloppe, 0);
  const totalEngage = parCategorie.reduce((s, c) => s + c.engage, 0);
  const totalConsomme = parCategorie.reduce((s, c) => s + c.consomme, 0);

  const fmt = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

  // Camembert imbriqué : anneau intérieur = catégories, anneau extérieur = postes
  const innerData = parCategorie
    .filter((c) => c[metrique] > 0)
    .map((c) => ({ name: c.categorie, value: c[metrique], color: c.color }));
  const outerData = [];
  parCategorie.forEach((c) => {
    c.postes.forEach((p, i) => {
      if (p[metrique] > 0) outerData.push({ name: `${c.categorie} — ${p.poste}`, value: p[metrique], color: shadeForIndex(c.color, i) });
    });
  });

  // Tendance mensuelle sur l'année sélectionnée
  const tendance = useMemo(() => {
    const parMois = {};
    lignesAnnee.forEach((l) => {
      if (!l.mois) return;
      if (!parMois[l.mois]) parMois[l.mois] = { mois: l.mois, engage: 0, consomme: 0 };
      parMois[l.mois].engage += l.engage;
      parMois[l.mois].consomme += l.consomme;
    });
    return Object.values(parMois).sort((a, b) => (a.mois < b.mois ? -1 : 1)).map((m) => ({ ...m, label: nomMois(m.mois) }));
  }, [lignesAnnee]);

  const saveEnveloppes = async () => {
    setSaving(true);
    try {
      const next = { ...enveloppesMigrees, [anneeSelectionnee]: draft };
      await store.saveBudgetEnveloppes(next);
      onEnveloppesChanged(next);
      setEditEnveloppes(false);
    } finally { setSaving(false); }
  };

  const exporterCSV = () => {
    const lignesCsv = ["Année;Mois;Catégorie;Poste;Référence CR;Sujet;Engagé;Consommé"];
    lignesAnnee.forEach((l) => {
      lignesCsv.push(`${anneeSelectionnee};${l.mois || ""};${l.categorie};${(l.poste || "").replace(/;/g, ",")};${l.ref || ""};${(l.sujet || "").replace(/;/g, ",")};${l.engage};${l.consomme}`);
    });
    const blob = new Blob(["\ufeff" + lignesCsv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-service-habitat-${anneeSelectionnee}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-[26px] text-stone-900">Budget du service</h1>
          <p className="mt-1 text-sm text-stone-500">Basé sur les lignes budgétaires saisies dans les comptes rendus</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exporterCSV} className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
            ⬇ Export CSV ({anneeSelectionnee})
          </button>
          <button onClick={() => { setDraft(enveloppesAnnee); setEditEnveloppes(true); }} className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
            Régler les enveloppes {anneeSelectionnee}
          </button>
        </div>
      </div>

      <Field label="Année budgétaire">
        <select className={`${inputCls} w-auto`} value={anneeSelectionnee} onChange={(e) => { setAnneeSelectionnee(e.target.value); setMoisFiltre("TOUT"); }}>
          {anneesDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Field>

      {editEnveloppes && (
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Enveloppes annuelles par catégorie</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUDGET_CATEGORIES.map((cat) => (
              <Field key={cat} label={cat}>
                <input type="number" min="0" className={inputCls} value={draft[cat] ?? ""} onChange={(e) => setDraft({ ...draft, [cat]: e.target.value })} placeholder="0" />
              </Field>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditEnveloppes(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-600">Annuler</button>
            <button onClick={saveEnveloppes} disabled={saving} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <Field label="Période">
          <select className={`${inputCls} w-auto`} value={moisFiltre} onChange={(e) => setMoisFiltre(e.target.value)}>
            <option value="TOUT">Toute la période</option>
            {moisDisponibles.map((m) => <option key={m} value={m}>{nomMois(m)}</option>)}
          </select>
        </Field>
        <Field label="Indicateur affiché">
          <div className="flex gap-1">
            <button onClick={() => setMetrique("engage")} className={`rounded-md border px-3 py-2 text-xs font-medium ${metrique === "engage" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600"}`}>Engagé</button>
            <button onClick={() => setMetrique("consomme")} className={`rounded-md border px-3 py-2 text-xs font-medium ${metrique === "consomme" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600"}`}>Consommé</button>
          </div>
        </Field>
      </div>

      {/* Vue globale : enveloppe totale vs consommé total (toujours sur l'année entière) */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-stone-700">Vue globale — Budget {anneeSelectionnee}</h2>
        <div className="grid gap-3 sm:grid-cols-4 mb-5">
          {[
            { label: "Enveloppe totale", value: fmt(totalEnveloppe), color: "#1C2521" },
            { label: "Engagé (année)", value: fmt(parCategorie.reduce((s,c) => s + c.engage, 0)), color: "#3A5A8C" },
            { label: "Consommé (année)", value: fmt(parCategorie.reduce((s,c) => s + c.consomme, 0)), color: "#B5502A" },
            { label: "Reste disponible", value: fmt(totalEnveloppe - parCategorie.reduce((s,c) => s + c.consomme, 0)), color: totalEnveloppe - parCategorie.reduce((s,c) => s + c.consomme, 0) < 0 ? "#B5502A" : "#2D6E64" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-stone-100 bg-stone-50 p-4">
              <div className="font-mono text-xl font-semibold" style={{ color: k.color }}>{k.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-stone-500">{k.label}</div>
            </div>
          ))}
        </div>
        {/* Barres globales par catégorie */}
        <div className="space-y-2">
          {parCategorie.filter((c) => c.enveloppe > 0 || c.engage > 0 || c.consomme > 0).map((c) => {
            const pctConsomme = c.enveloppe > 0 ? Math.min(100, Math.round((c.consomme / c.enveloppe) * 100)) : 0;
            const pctEngage = c.enveloppe > 0 ? Math.min(100, Math.round((c.engage / c.enveloppe) * 100)) : 0;
            const depasse = c.enveloppe > 0 && c.consomme > c.enveloppe;
            return (
              <div key={c.categorie}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold" style={{ color: c.color }}>{c.categorie}</span>
                  <span className="text-stone-400">{fmt(c.consomme)} consommé · {fmt(c.engage)} engagé · {c.enveloppe > 0 ? fmt(c.enveloppe) : "—"} enveloppe</span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-stone-100">
                  <div className="absolute h-full rounded-full opacity-40" style={{ width: `${Math.max(2, pctEngage)}%`, background: c.color }} />
                  <div className="absolute h-full rounded-full" style={{ width: `${Math.max(2, pctConsomme)}%`, background: depasse ? "#B5502A" : c.color }} />
                </div>
              </div>
            );
          })}
          {parCategorie.every((c) => c.enveloppe === 0 && c.consomme === 0 && c.engage === 0) && (
            <p className="text-sm text-stone-400">Aucune donnée pour l'instant.</p>
          )}
        </div>
      </div>

      {/* KPI filtrés (par mois si filtre actif) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: moisFiltre === "TOUT" ? "Enveloppe annuelle" : "Enveloppe annuelle (référence)", value: fmt(totalEnveloppe) },
          { label: "Engagé" + (moisFiltre !== "TOUT" ? " (mois)" : ""), value: fmt(totalEngage) },
          { label: "Consommé" + (moisFiltre !== "TOUT" ? " (mois)" : ""), value: fmt(totalConsomme) },
          {
            label: "Reste sur l'année",
            value: fmt(totalEnveloppe - parCategorie.reduce((s,c) => s + c.consomme, 0)),
            alert: totalEnveloppe - parCategorie.reduce((s,c) => s + c.consomme, 0) < 0
          },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="font-mono text-xl font-semibold" style={{ color: k.alert ? "#B5502A" : "#1C2521" }}>{k.value}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-stone-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Camembert imbriqué : catégorie (intérieur) + poste (extérieur) */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-stone-700">
          Répartition {metrique === "engage" ? "de l'engagé" : "du consommé"} — {moisFiltre === "TOUT" ? "toute la période" : nomMois(moisFiltre)}
        </h2>
        <p className="mb-3 text-[11px] text-stone-400">Anneau intérieur = catégorie · anneau extérieur = poste précis</p>
        {innerData.length === 0 ? (
          <p className="text-sm text-stone-400">Aucune donnée pour cette période.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={innerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={0} outerRadius={75}>
                  {innerData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Pie data={outerData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={83} outerRadius={120}>
                  {outerData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E7E4DD", maxWidth: 280 }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Légende lisible en dessous */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {innerData.map((e) => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs text-stone-700">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: e.color }} />
                  <span className="font-medium">{e.name}</span>
                  <span className="text-stone-400">{fmt(e.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tendance mensuelle */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Évolution mois par mois</h2>
        {tendance.length === 0 ? (
          <p className="text-sm text-stone-400">Pas encore assez de données pour une tendance.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tendance} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E4DD" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716C" }} axisLine={{ stroke: "#D6D3CB" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E7E4DD" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="engage" name="Engagé" fill="#8A8478" radius={[4, 4, 0, 0]} />
              <Bar dataKey="consomme" name="Consommé" fill="#B5502A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Détail par catégorie et poste, enveloppe */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Détail par catégorie et poste (enveloppe annuelle)</h2>
        <div className="space-y-4">
          {parCategorie.filter((c) => c.enveloppe > 0 || c.consomme > 0 || c.engage > 0).map((c) => {
            const pct = c.enveloppe > 0 ? Math.min(100, Math.round((c.consomme / c.enveloppe) * 100)) : 0;
            const depasse = c.enveloppe > 0 && c.consomme > c.enveloppe;
            return (
              <div key={c.categorie}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold" style={{ color: c.color }}>{c.categorie}</span>
                  <span className="text-stone-500">{fmt(c.consomme)} consommé / {c.enveloppe > 0 ? fmt(c.enveloppe) : "—"} enveloppe</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: depasse ? "#B5502A" : c.color }} />
                </div>
                {c.postes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 pl-3 text-[12px] text-stone-600">
                    {c.postes.map((p) => (
                      <li key={p.poste} className="flex justify-between">
                        <span>— {p.poste}</span>
                        <span className="font-mono text-stone-500">{fmt(p.engage)} engagé · {fmt(p.consomme)} consommé</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {parCategorie.every((c) => c.enveloppe === 0 && c.consomme === 0 && c.engage === 0) && <p className="text-sm text-stone-400">Aucune donnée pour l'instant.</p>}
        </div>
      </div>

      {/* Historique complet */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Historique des lignes budgétaires{moisFiltre !== "TOUT" ? ` — ${nomMois(moisFiltre)}` : ""}</h2>
        {lignes.length === 0 ? (
          <p className="text-sm text-stone-400">Aucune ligne budgétaire pour cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Mois</th>
                  <th className="py-2 pr-3 font-medium">Catégorie</th>
                  <th className="py-2 pr-3 font-medium">Poste</th>
                  <th className="py-2 pr-3 font-medium">Sujet (CR)</th>
                  <th className="py-2 pr-3 font-medium text-right">Engagé</th>
                  <th className="py-2 font-medium text-right">Consommé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-stone-500">{nomMois(l.mois)}</td>
                    <td className="py-2 pr-3"><span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: `${BUDGET_COLORS[l.categorie]}17`, color: BUDGET_COLORS[l.categorie] }}>{l.categorie}</span></td>
                    <td className="py-2 pr-3 text-stone-600">{l.poste || "—"}</td>
                    <td className="py-2 pr-3 text-stone-700">{l.sujet} <span className="text-stone-400">({l.ref})</span></td>
                    <td className="py-2 pr-3 text-right font-mono">{l.engage ? fmt(l.engage) : "—"}</td>
                    <td className="py-2 text-right font-mono">{l.consomme ? fmt(l.consomme) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemesTracker({ allCRs }) {
  const [filtreTheme, setFiltreTheme] = useState(null);

  const occurrences = useMemo(() => {
    const map = {};
    Object.values(allCRs).forEach((cr) => {
      POLE_ORDER.forEach((code) => {
        (cr.points?.[code] || []).forEach((pt) => {
          (pt.themes || []).forEach((t) => {
            if (!map[t]) map[t] = [];
            map[t].push({ ...pt, pole: code, crDate: cr.date, crLieu: cr.lieu });
          });
        });
      });
    });
    return map;
  }, [allCRs]);

  const data = Object.entries(occurrences)
    .map(([theme, items]) => ({ theme, count: items.length }))
    .sort((a, b) => b.count - a.count);

  const detailItems = filtreTheme ? (occurrences[filtreTheme] || []).sort((a, b) => (a.crDate < b.crDate ? 1 : -1)) : [];

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-[26px] text-stone-900">Thèmes récurrents</h1>
      <p className="text-sm text-stone-500">Ce qui revient le plus souvent d'une réunion à l'autre — budget, ventes, ASIP, partenaires…</p>

      {data.length === 0 ? (
        <p className="text-sm text-stone-400">Aucun thème renseigné pour l'instant. Coche des thèmes sur les points de tes comptes rendus pour les voir apparaître ici.</p>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7E4DD" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="theme" width={190} tick={{ fontSize: 12, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#F5F6F2" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #E7E4DD" }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#8A8478" onClick={(d) => setFiltreTheme(d.theme)} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-stone-400">Clique une barre pour voir le détail des points concernés.</p>
        </div>
      )}

      {filtreTheme && (
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">« {filtreTheme} » — {detailItems.length} mention(s)</h2>
            <button onClick={() => setFiltreTheme(null)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
          </div>
          <ul className="divide-y divide-stone-100">
            {detailItems.map((pt) => (
              <li key={pt.id} className="py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-stone-400">
                  <span className="font-mono">{pt.ref}</span>
                  <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ background: POLES[pt.pole].tint, color: POLES[pt.pole].color }}>{POLES[pt.pole].short}</span>
                  <span>{pt.crDate} · {pt.crLieu}</span>
                </div>
                <div className="text-sm text-stone-800">{pt.sujet}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionsTracker({ allActions, onToggle }) {
  const [filterPole, setFilterPole] = useState("ALL");
  const [filterStatut, setFilterStatut] = useState("ALL");
  const filtered = allActions.filter((a) => (filterPole === "ALL" || a.pole === filterPole) && (filterStatut === "ALL" || a.statut === filterStatut));
  return (
    <div className="space-y-5">
      <h1 className="font-serif text-[26px] text-stone-900">Suivi des actions</h1>
      <div className="flex flex-wrap gap-2">
        <select className={`${inputCls} w-auto`} value={filterPole} onChange={(e) => setFilterPole(e.target.value)}>
          <option value="ALL">Tous les pôles</option>
          {POLE_ORDER.map((c) => <option key={c} value={c}>{POLES[c].label}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
          <option value="ALL">Tous les statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400">Aucune action pour ces filtres.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
                <th className="px-3 py-2 font-medium">Réf.</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 font-medium">Échéance</th>
                <th className="px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((a) => (
                <tr key={a.id} style={{ borderLeft: `3px solid ${POLES[a.pole].color}` }}>
                  <td className="px-3 py-2 font-mono text-[11px] text-stone-400">{a.ref}</td>
                  <td className="px-3 py-2 text-stone-800">{a.action || a.sujet}</td>
                  <td className="px-3 py-2 text-stone-600">{a.responsable || "—"}</td>
                  <td className="px-3 py-2 text-stone-600">{a.echeance || "—"}</td>
                  <td className="px-3 py-2"><button onClick={() => onToggle(a)}><StatusPill statut={a.statut} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paramètres / connexion Supabase
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Écran de connexion (PIN partagé avec les autres outils)
// ---------------------------------------------------------------------------
function LoginScreen({ cfg, onDisconnect, onLoggedIn }) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("idle"); // idle | verifying | error
  const [errMsg, setErrMsg] = useState("");

  const submit = async () => {
    if (pin.length !== 4) return;
    setStatus("verifying"); setErrMsg("");
    try {
      const agent = await verifierPinAgent(cfg, pin);
      if (!agent) {
        setStatus("error");
        setErrMsg("Code PIN incorrect.");
        return;
      }
      saveAgentSession(agent);
      onLoggedIn(agent);
    } catch (e) {
      setStatus("error");
      setErrMsg(e.message || "Erreur de connexion.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6F2] px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-stone-400">Ville de Saint-Denis</div>
        <h1 className="font-serif text-xl text-stone-900" style={{ fontFamily: "'Fraunces', serif" }}>Service Habitat — Connexion</h1>
        <p className="mt-2 text-sm text-stone-500">Ton code PIN personnel — le même que pour Habitat Dispatch et Planning Congés.</p>

        <div className="mt-5 space-y-3">
          <Field label="Code PIN">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              className={`${inputCls} text-center text-lg tracking-[0.4em]`}
              placeholder="0000"
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setStatus("idle"); setErrMsg(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          </Field>
          <button
            onClick={submit}
            disabled={status === "verifying" || pin.length !== 4}
            className="w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
          >
            {status === "verifying" ? "Vérification…" : "Se connecter"}
          </button>
          {status === "error" && <p className="text-xs text-red-600">{errMsg}</p>}
        </div>

        <button onClick={onDisconnect} className="mt-6 text-xs text-stone-400 hover:text-stone-600">
          Utiliser le mode local à la place (sans compte)
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({ cfg, onSave, onDisconnect }) {
  const [url, setUrl] = useState(cfg?.url || "");
  const [key, setKey] = useState(cfg?.key || "");
  const [status, setStatus] = useState(cfg ? "connected" : "idle");
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const test = async (u, k) => {
    setStatus("testing"); setErrMsg("");
    try {
      const store = makeSupabaseStore({ url: u, key: k });
      await store.testConnection();
      setStatus("connected");
      return true;
    } catch (e) {
      setStatus("error"); setErrMsg(e.message || "Connexion impossible.");
      return false;
    }
  };

  const handleSave = async () => {
    if (!url || !key) return;
    const ok = await test(url, key);
    if (ok) onSave({ url, key });
  };

  const copySQL = async () => {
    try { await navigator.clipboard.writeText(SQL_SNIPPET); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-[26px] text-stone-900">Paramètres</h1>
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          {cfg ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-stone-400" />}
          <h2 className="text-sm font-semibold text-stone-700">Connexion Supabase (partage d'équipe)</h2>
        </div>
        <p className="mb-4 text-sm text-stone-500">
          Par défaut, les comptes rendus et les sujets proposés sont enregistrés localement et visibles uniquement par toi.
          Connecte ton projet Supabase (<span className="font-mono text-[12px]">lypeksjzahbrbjhnvmsy</span>) pour que toute
          l'équipe du Service Habitat lise et alimente les mêmes données, comme sur le portail.
        </p>
        <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">1. Créer la table (une fois, dans l'éditeur SQL Supabase)</div>
          <pre className="overflow-x-auto rounded bg-stone-900 p-3 text-[11px] leading-relaxed text-stone-100">{SQL_SNIPPET}</pre>
          <button onClick={copySQL} className="mt-2 text-xs font-medium text-stone-600 hover:underline">{copied ? "Copié !" : "Copier le script SQL"}</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="URL du projet"><input className={inputCls} placeholder="https://lypeksjzahbrbjhnvmsy.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Clé API (legacy anon, eyJ…)"><input className={inputCls} type="password" placeholder="eyJhbGciOi…" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
        </div>
        <p className="mt-1 text-[11px] text-stone-400">Utilise la clé legacy « anon » (eyJ…) — les nouvelles clés sb_publishable_ ne fonctionnent pas en appel REST direct.</p>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSave} disabled={status === "testing"} className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
            <RefreshCw size={14} className={status === "testing" ? "animate-spin" : ""} /> {status === "testing" ? "Test en cours…" : "Se connecter"}
          </button>
          {cfg && <button onClick={onDisconnect} className="text-sm text-stone-500 hover:text-red-600">Revenir en mode local</button>}
        </div>
        {status === "connected" && <p className="mt-2 text-xs text-emerald-700">Connecté — les données sont désormais partagées via Supabase.</p>}
        {status === "error" && <p className="mt-2 text-xs text-red-600">{errMsg}</p>}
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Note sécurité : le script ci-dessus ouvre la table en lecture/écriture libre (comme le reste de l'écosystème
        zéro-infra). À restreindre plus tard avec une policy RLS liée à un compte agent si besoin.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------
export default function CRHabitatApp() {
  const [view, setView] = useState("dashboard");
  const [cfg, setCfg] = useState(undefined);
  const [agentSession, setAgentSession] = useState(undefined); // undefined = chargement, null = non connecté
  const [index, setIndex] = useState([]);
  const [counters, setCounters] = useState({ CV: 0, OD: 0, LTS: 0, DIV: 0 });
  const [allCRs, setAllCRs] = useState({});
  const [proposals, setProposals] = useState([]);
  const [enveloppes, setEnveloppes] = useState({});
  const [currentCR, setCurrentCR] = useState(null);
  const [draftCR, setDraftCR] = useState(null);
  const [draftProposalIds, setDraftProposalIds] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const store = useMemo(
    () => (cfg ? makeSupabaseStore(cfg) : makeLocalStore()),
    [cfg]
  );

  useEffect(() => { (async () => setCfg(await loadSupabaseConfig()))(); }, []);

  // Cycle de vie de la session : PIN déjà validé et mémorisé sur cet appareil, ou aucune session
  useEffect(() => {
    if (cfg === undefined) return;
    if (!cfg) { setAgentSession(null); return; } // mode local : pas d'auth nécessaire
    setAgentSession(loadAgentSession() || null);
  }, [cfg]);

  const logout = () => { clearAgentSession(); setAgentSession(null); };

  useEffect(() => {
    if (cfg === undefined) return;
    if (cfg && !agentSession) return; // en attente de connexion
    (async () => {
      setReady(false); setLoadError("");
      try {
        const idx = await store.loadIndex();
        const ctr = await store.loadCounters();
        const cache = await store.loadAllFull();
        const props = await store.loadProposals();
        const env = await store.loadBudgetEnveloppes();
        setIndex(idx); setCounters(ctr); setAllCRs(cache); setProposals(props); setEnveloppes(env);
      } catch (e) {
        setLoadError(e.message || "Erreur de chargement.");
        setIndex([]); setAllCRs({}); setProposals([]);
      } finally {
        setReady(true);
      }
    })();
  }, [cfg, agentSession, store]);

  const allActions = useMemo(() => {
    const list = [];
    Object.values(allCRs).forEach((cr) => {
      POLE_ORDER.forEach((code) => {
        (cr.points?.[code] || []).forEach((pt) => {
          if (pt.action || pt.sujet) list.push({ ...pt, pole: code, crId: cr.id, crDate: cr.date });
        });
      });
    });
    return list.sort((a, b) => (a.echeance || "9999").localeCompare(b.echeance || "9999"));
  }, [allCRs]);

  const pendingProposals = useMemo(() => proposals.filter((p) => p.statut === "en_attente"), [proposals]);

  const openCR = async (id) => {
    setLoadingId(id);
    const full = allCRs[id] || (await store.loadCR(id));
    setLoadingId(null);
    if (full) { setCurrentCR(full); setView("detail"); }
  };

  const startNewCR = () => {
    // Si un brouillon non enregistré existe (crash, fermeture accidentelle), on le reprend
    // plutôt que d'en écraser le contenu avec un CR tout neuf.
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.id && draft.points) {
          setDraftCR(draft);
          setDraftProposalIds([]); // les propositions déjà intégrées au brouillon ne doivent pas être re-consommées
          setView("new");
          return;
        }
      }
    } catch {}
    const reportables = computeReportables(allActions);
    const base = emptyCR();
    reportables.forEach((a) => base.points[a.pole].push(buildReportedPoint(a)));
    pendingProposals.forEach((p) => base.points[p.pole].push(buildPointFromProposal(p)));
    setDraftCR(base);
    setDraftProposalIds(pendingProposals.map((p) => p.id));
    setView("new");
  };

  const handleSaved = async (cr, nbPoints, newCounters) => {
    setCounters(newCounters);
    setAllCRs((prev) => ({ ...prev, [cr.id]: cr }));
    setIndex((prev) => {
      const others = prev.filter((r) => r.id !== cr.id);
      return [...others, { id: cr.id, date: cr.date, lieu: cr.lieu, redacteur: cr.redacteur, nbPoints }];
    });
    if (draftProposalIds.length) {
      const nextProposals = proposals.map((p) => (draftProposalIds.includes(p.id) ? { ...p, statut: "integre", crId: cr.id } : p));
      await store.saveProposals(nextProposals);
      setProposals(nextProposals);
    }
    setDraftCR(null); setDraftProposalIds([]);
    setCurrentCR(cr);
    setView("detail");
  };

  const handleDelete = async (id) => {
    await store.deleteCR(id);
    setIndex((prev) => prev.filter((r) => r.id !== id));
    setAllCRs((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setView("historique");
  };

  const toggleAction = async (a) => {
    // On relit la version la plus récente du CR avant d'écrire, pour éviter d'écraser
    // une modification faite entre-temps par un autre agent (protection partielle, pas une transaction atomique).
    let cr = allCRs[a.crId];
    try {
      const fresh = await store.loadCR(a.crId);
      if (fresh) cr = fresh;
    } catch {}
    if (!cr) return;
    const order = ["a_faire", "en_cours", "fait", "retard"];
    const next = order[(order.indexOf(a.statut) + 1) % order.length];
    const updated = {
      ...cr,
      points: { ...cr.points, [a.pole]: cr.points[a.pole].map((pt) => (pt.id === a.id ? { ...pt, statut: next } : pt)) },
      historique: [...(cr.historique || []), { date: new Date().toISOString(), action: `Statut de ${a.ref} → ${STATUTS[next].label}` }],
    };
    await store.saveCR(updated);
    setAllCRs((prev) => ({ ...prev, [cr.id]: updated }));
  };

  const handleSupabaseSave = async (newCfg) => { await saveSupabaseConfig(newCfg); setCfg(newCfg); };
  const handleSupabaseDisconnect = async () => { await clearSupabaseConfig(); clearAgentSession(); setAgentSession(null); setCfg(null); };

  const navItems = [
    { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { key: "proposals", label: "Proposer un sujet", icon: Lightbulb, badge: pendingProposals.length },
    { key: "new", label: "Nouveau CR", icon: FilePlus2 },
    { key: "historique", label: "Historique", icon: History },
    { key: "actions", label: "Suivi des actions", icon: ListChecks },
    { key: "themes", label: "Thèmes récurrents", icon: Tag },
    { key: "budget", label: "Budget", icon: Wallet },
    { key: "settings", label: "Paramètres", icon: Settings },
  ];

  // Porte d'authentification : en mode Supabase, il faut une session valide avant d'afficher quoi que ce soit
  if (cfg === undefined || agentSession === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F5F6F2] text-sm text-stone-400">Chargement…</div>;
  }
  if (cfg && !agentSession) {
    return <LoginScreen cfg={cfg} onDisconnect={handleSupabaseDisconnect} onLoggedIn={setAgentSession} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F6F2] text-[#1C2521]" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-serif { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .print-only { display: none; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside, .mobile-nav { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .print-block { break-inside: avoid; border-color: #ccc !important; }
        }
      `}</style>

      <div className="mx-auto flex max-w-6xl">
        <aside className="no-print fixed bottom-0 left-0 top-0 z-10 hidden w-56 flex-col border-r border-stone-200 bg-[#1B2A38] px-4 py-6 sm:flex">
          <div className="mb-8">
            <div className="text-[10px] uppercase tracking-widest text-stone-400">Ville de Saint-Denis</div>
            <div className="mt-0.5 font-serif text-lg text-white">Service Habitat</div>
            <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
              {cfg ? <Wifi size={11} className="text-emerald-400" /> : <WifiOff size={11} />}
              {cfg ? "Partagé (Supabase)" : "Local"}
            </div>
            {cfg && agentSession && (
              <div className="mt-2 flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5">
                <span className="truncate text-[11px] text-stone-300">{agentSession.prenom} {agentSession.nom}</span>
                <button onClick={logout} className="ml-2 shrink-0 text-[10px] text-stone-400 hover:text-white">Déconnexion</button>
              </div>
            )}
          </div>
          <nav className="space-y-1">
            {navItems.map((n) => {
              const Icon = n.icon;
              const active = view === n.key || (n.key === "historique" && view === "detail");
              return (
                <button key={n.key} onClick={() => (n.key === "new" ? startNewCR() : setView(n.key))} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-white/10 text-white" : "text-stone-300 hover:bg-white/5 hover:text-white"}`}>
                  <span className="flex items-center gap-2.5"><Icon size={16} />{n.label}</span>
                  {!!n.badge && <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n.badge}</span>}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-4 text-[11px] text-stone-500">{index.length} compte(s) rendu(s) enregistré(s)</div>
        </aside>

        <div className="no-print mobile-nav fixed inset-x-0 top-0 z-10 flex justify-around overflow-x-auto border-b border-stone-200 bg-[#1B2A38] py-2 sm:hidden">
          {navItems.map((n) => {
            const Icon = n.icon;
            const active = view === n.key || (n.key === "historique" && view === "detail");
            return (
              <button key={n.key} onClick={() => (n.key === "new" ? startNewCR() : setView(n.key))} className={`relative flex shrink-0 flex-col items-center gap-0.5 px-2 text-[9px] ${active ? "text-white" : "text-stone-400"}`}>
                <Icon size={15} />
                {n.label}
                {!!n.badge && <span className="absolute -top-0.5 right-0 h-1.5 w-1.5 rounded-full bg-sky-500" />}
              </button>
            );
          })}
        </div>

        <main className="min-h-screen w-full px-4 py-6 pt-16 sm:ml-56 sm:px-8 sm:py-8 sm:pt-8">
          {!ready ? (
            <div className="flex h-64 items-center justify-center text-sm text-stone-400">Chargement…</div>
          ) : loadError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
              <div className="mt-2"><button onClick={() => setView("settings")} className="underline">Vérifier la connexion Supabase</button></div>
            </div>
          ) : view === "dashboard" ? (
            <Dashboard index={index} allActions={allActions} pendingProposals={pendingProposals} onOpen={openCR} onNew={startNewCR} onGoProposals={() => setView("proposals")} />
          ) : view === "proposals" ? (
            <ProposalsView proposals={proposals} store={store} onProposalsChanged={setProposals} />
          ) : view === "new" ? (
            <CRForm initial={draftCR || emptyCR()} counters={counters} store={store} nbFromProposals={draftProposalIds.length} onSaved={handleSaved} onCancel={() => { setDraftCR(null); setDraftProposalIds([]); setView("dashboard"); }} />
          ) : view === "historique" ? (
            <Historique index={index} allCRs={allCRs} onOpen={openCR} loadingId={loadingId} />
          ) : view === "detail" && currentCR ? (
            <CRDetail cr={currentCR} onBack={() => setView("historique")} onDelete={handleDelete} />
          ) : view === "actions" ? (
            <ActionsTracker allActions={allActions} onToggle={toggleAction} />
          ) : view === "themes" ? (
            <ThemesTracker allCRs={allCRs} />
          ) : view === "budget" ? (
            <BudgetView allCRs={allCRs} enveloppes={enveloppes} store={store} onEnveloppesChanged={setEnveloppes} />
          ) : view === "settings" ? (
            <SettingsPanel cfg={cfg} onSave={handleSupabaseSave} onDisconnect={handleSupabaseDisconnect} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
