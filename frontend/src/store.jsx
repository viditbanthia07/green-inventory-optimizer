import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

// Items, settings and the latest plan live in the user's browser (localStorage).
// The server only does calculations, so the app works on Vercel without a database.
const KEY = "gio-data-v1";
const Store = createContext(null);
export const useStore = () => useContext(Store);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (state) return;
    api("/api/defaults").then((d) => setState({ items: d.items, settings: d.settings, plan: null })).catch((e) => setError(e.message));
  }, [state]);

  useEffect(() => {
    if (state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked: keep working in memory */ } }
  }, [state]);

  const value = state && {
    ...state,
    error,
    // changing items or settings makes the old plan out of date, so it is cleared
    setItems: (items) => setState((s) => ({ ...s, items, plan: null })),
    setSettings: (settings) => setState((s) => ({ ...s, settings, plan: null })),
    setPlan: (plan) => setState((s) => ({ ...s, plan })),
    loadSample: async () => { const d = await api("/api/defaults"); setState((s) => ({ ...s, items: d.items, plan: null })); },
  };
  return <Store.Provider value={value || { error, loading: true }}>{children}</Store.Provider>;
}

/** Stock analysis (EOQ, safety stock, status) for the current items, from the server. */
export function useCheck() {
  const store = useStore();
  const [res, setRes] = useState({ data: null, error: null });
  const items = store?.items, settings = store?.settings;
  useEffect(() => {
    if (!items) return;
    let live = true;
    api("/api/items/check", "POST", { items, settings })
      .then((data) => live && setRes({ data, error: null }))
      .catch((e) => live && setRes({ data: null, error: e.message }));
    return () => { live = false; };
  }, [items, settings]);
  return res;
}
