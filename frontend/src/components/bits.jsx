export function Loading({ text = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-brand-700" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />{text}
    </div>
  );
}

const STYLES = {
  error: "border-red-200 bg-red-50 text-red-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};
export function Note({ kind = "info", children, className = "" }) {
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${STYLES[kind]} ${className}`}>{children}</div>;
}

const STATUS = {
  urgent: ["Order now", "bg-red-100 text-red-800"],
  "order soon": ["Order soon", "bg-amber-100 text-amber-900"],
  ok: ["OK", "bg-emerald-100 text-emerald-800"],
};
export function Status({ value }) {
  const [label, cls] = STATUS[value] || [value, "bg-ink-100"];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function Stat({ label, value, sub, good }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {sub && <p className={`mt-1 text-sm ${good === true ? "text-emerald-700" : good === false ? "text-red-700" : "text-ink-500"}`}>{sub}</p>}
    </div>
  );
}

/** Download text as a file in the browser. */
export function saveFile(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
