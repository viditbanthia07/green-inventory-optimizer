import { useState } from "react";
import { api, money, num } from "../api";
import { Loading, Note, Status } from "../components/bits";
import { useCheck, useStore } from "../store";

const FIELDS = [
  ["name", "Item name", "text", "e.g. Steel sheets"],
  ["unit", "Unit", "text", "e.g. sheets, kg, boxes"],
  ["stock", "Current stock", "number", ""],
  ["weekly_demand", "Used per week", "number", ""],
  ["price", "Price per unit (₹)", "number", ""],
  ["order_cost", "Cost of placing one order (₹)", "number", "paperwork, handling"],
  ["weight_kg", "Weight of one unit (kg)", "number", ""],
  ["lead_time_weeks", "Delivery time (weeks)", "number", ""],
  ["distance_km", "Supplier distance (km)", "number", "use Delivery & CO₂ page to find it"],
];
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, ""]));

function validate(f, items, id) {
  const n = (k) => Number(f[k]);
  if (!String(f.name).trim() || !String(f.unit).trim()) return "Name and unit are required.";
  if (items.some((it) => it.id !== id && it.name.trim().toLowerCase() === String(f.name).trim().toLowerCase())) return `An item called '${f.name}' already exists.`;
  if (FIELDS.some(([k, , t]) => t === "number" && (f[k] === "" || Number.isNaN(n(k)) || n(k) < 0))) return "All numbers must be filled in and not negative.";
  if (n("weekly_demand") <= 0 || n("price") <= 0 || n("weight_kg") <= 0) return "Weekly use, price and weight must be more than 0.";
  if (!Number.isInteger(n("lead_time_weeks")) || n("lead_time_weeks") > 12) return "Delivery time must be a whole number of weeks (0–12).";
  if (n("distance_km") > 10000) return "Distance must be 10,000 km or less.";
  return null;
}

function ItemForm({ initial, items, onSave, onCancel }) {
  const [f, setF] = useState(initial || EMPTY);
  const [err, setErr] = useState(null);
  const save = (e) => {
    e.preventDefault();
    const problem = validate(f, items, initial?.id);
    if (problem) { setErr(problem); return; }
    const clean = Object.fromEntries(FIELDS.map(([k, , t]) => [k, t === "number" ? Number(f[k]) : String(f[k]).trim()]));
    onSave({ ...clean, id: initial?.id ?? Math.max(0, ...items.map((i) => i.id)) + 1 });
  };
  return (
    <form onSubmit={save} className="card" noValidate>
      <h2>{initial?.id ? `Edit ${initial.name}` : "Add an item"}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(([k, label, type, hint]) => (
          <div key={k}>
            <label className="label" htmlFor={k}>{label}</label>
            <input id={k} type={type} step="any" min={type === "number" ? 0 : undefined} className="input" placeholder={hint}
              value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {err && <Note kind="error" className="mt-4">{err}</Note>}
      <div className="mt-4 flex gap-2">
        <button className="btn">Save item</button>
        <button type="button" className="btn-light" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const SETTING_FIELDS = [
  ["plant_city", "Factory location", "text", null], ["weeks", "Plan ahead (weeks)", "number", [2, 26]],
  ["fuel_price", "Diesel price (₹/litre)", "number", [1, 1000]], ["holding_pct", "Storage cost (% of price per year)", "number", [0, 100]],
  ["demand_variation_pct", "Demand varies by about (%)", "number", [0, 100]], ["service_level_pct", "Avoid running out (% confidence)", "number", [50, 99.9]],
];

function SettingsBox() {
  const { settings, setSettings } = useStore();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState(null);
  const save = (e) => {
    e.preventDefault();
    for (const [k, label, type, range] of SETTING_FIELDS) {
      if (type === "number" && (s[k] === "" || Number(s[k]) < range[0] || Number(s[k]) > range[1])) { setMsg(["error", `${label} must be between ${range[0]} and ${range[1]}.`]); return; }
      if (type === "text" && String(s[k]).trim().length < 2) { setMsg(["error", `${label} is required.`]); return; }
    }
    setSettings(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof settings[k] === "number" ? Number(v) : v])));
    setMsg(["ok", "Saved. Create a new plan to use the new settings."]);
  };
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">Settings</summary>
      <form onSubmit={save} className="mt-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SETTING_FIELDS.map(([k, label, type]) => (
            <div key={k}><label className="label" htmlFor={`s-${k}`}>{label}</label>
              <input id={`s-${k}`} type={type} step="any" className="input" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></div>
          ))}
        </div>
        {msg && <Note kind={msg[0]} className="mt-4">{msg[1]}</Note>}
        <button className="btn mt-4">Save settings</button>
      </form>
    </details>
  );
}

export default function Items() {
  const { items, setItems, loadSample } = useStore();
  const { data, error } = useCheck();
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Replace all items with the items in this file?")) return;
    const form = new FormData();
    form.append("file", file);
    try { const r = await api("/api/items/parse-csv", "POST", form); setItems(r.items); setMsg(["ok", `Imported ${r.items.length} items.`]); }
    catch (e2) { setMsg(["error", e2.message]); }
  };
  const save = (item) => {
    setItems(items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
    setEditing(null);
    setMsg(["ok", `${item.name} saved.`]);
  };
  const remove = (it) => { if (window.confirm(`Delete ${it.name}?`)) setItems(items.filter((i) => i.id !== it.id)); };
  const sample = async () => {
    if (!window.confirm("Replace all items with the example items?")) return;
    try { await loadSample(); setMsg(["ok", "Example items loaded."]); } catch (e2) { setMsg(["error", e2.message]); }
  };
  const rows = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1>My Items</h1><p className="mt-1 text-ink-600">The raw materials you buy. Add them one by one or upload a CSV file.</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setEditing({})}>+ Add item</button>
          <label className="btn-light cursor-pointer">Upload CSV<input type="file" accept=".csv" className="sr-only" onChange={upload} /></label>
          <a className="btn-light" href="/api/items/template.csv">CSV template</a>
          <button className="btn-light" onClick={sample}>Load example items</button>
        </div>
      </div>
      {msg && <Note kind={msg[0]}>{msg[1]}</Note>}
      {editing && <ItemForm initial={editing.id ? editing : null} items={items} onSave={save} onCancel={() => setEditing(null)} />}
      {error && <Note kind="error">{error}</Note>}

      <div className="card overflow-x-auto p-0">
        {!data && items.length > 0 && !error ? <Loading /> : (
          <table className="tbl">
            <thead><tr>
              <th>Item</th><th className="num">Stock</th><th className="num">Used / week</th><th className="num">Price</th><th className="num">Delivery</th>
              <th className="num">Distance</th><th className="num">Best order size (EOQ)</th><th className="num">Safety stock</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.id}>
                  <td className="font-medium">{it.name}</td><td className="num">{num(it.stock)} {it.unit}</td><td className="num">{num(it.weekly_demand)}</td>
                  <td className="num">{money(it.price)}</td><td className="num">{it.lead_time_weeks} wk</td><td className="num">{num(it.distance_km)} km</td>
                  <td className="num">{num(it.eoq)}</td><td className="num">{num(it.safety_stock)}</td><td><Status value={it.status} /></td>
                  <td className="whitespace-nowrap text-sm"><button className="text-brand-700 underline" onClick={() => setEditing(items.find((i) => i.id === it.id))}>Edit</button>{" "}
                    <button className="ml-2 text-red-700 underline" onClick={() => remove(it)}>Delete</button></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={10} className="py-10 text-center text-ink-500">No items yet. Add one or load the example items.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card text-sm text-ink-600">
        <h2 className="mb-2 text-base">How the numbers are worked out</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Best order size (EOQ)</b> = √(2 × yearly use × order cost ÷ yearly storage cost per unit). It balances ordering often against holding stock.</li>
          <li><b>Safety stock</b> = extra stock kept in case demand is higher than usual (based on the settings below).</li>
          <li><b>Order now</b> = stock will run out before a new delivery can arrive. <b>Order soon</b> = stock is at or below the reorder level.</li>
        </ul>
      </div>
      <SettingsBox />
    </div>
  );
}
