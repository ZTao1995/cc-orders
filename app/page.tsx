"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  ref,
  onValue,
  push,
  set,
  remove,
  update,
  off,
} from "firebase/database";

// ============ TYPES ============
type Order = {
  id: string;
  name: string;
  item: string;
  itemDesc: string;
  category: string;
  createdAt: number;
};

type CompletedOrder = Order & { completedAt: number };

type MenuItem = {
  id: string;
  name: string;
  desc: string;
  category: string;
};

// ============ DEFAULT MENU ============
const DEFAULT_MENU: MenuItem[] = [
  { id: "m1", name: "Clarified Pineapple Highball", desc: "clarified pineapple · gin · soda", category: "Carbonated" },
  { id: "m2", name: "Clarified Coffee Spritz", desc: "clarified cold brew · amaro · tonic", category: "Carbonated" },
  { id: "m3", name: "Negroni Sbagliato", desc: "campari · vermouth · prosecco", category: "Classics" },
  { id: "m4", name: "Mezcal Paloma", desc: "mezcal · grapefruit · lime · salt", category: "Classics" },
  { id: "m5", name: "House Martini", desc: "gin · dry vermouth · lemon oil", category: "Classics" },
  { id: "m6", name: "Sparkling Water", desc: "still or sparkling", category: "Non-Alc" },
];

// ============ HELPERS ============
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function elapsedTier(ms: number) {
  const m = ms / 60000;
  if (m < 5) return "fresh";
  if (m < 15) return "warm";
  return "urgent";
}

const BRAND = {
  paper: "#ece6d8",
  paperDeep: "#e3dcca",
  ink: "#2a2823",
  inkSoft: "#5a564c",
  inkFaint: "#a8a294",
  accent: "#a8341f",
};

// ============ ROOT ============
export default function Page() {
  const [view, setView] = useState<"landing" | "customer" | "staff">("landing");
  const [tick, setTick] = useState(0);

  // URL-based view selection: /?view=order or /?view=staff
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v === "order" || v === "customer") setView("customer");
    else if (v === "staff" || v === "admin") setView("staff");
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen w-full paper">
      {view === "landing" && <Landing onNavigate={setView} />}
      {view === "customer" && <CustomerView onBack={() => setView("landing")} />}
      {view === "staff" && <StaffView tick={tick} onBack={() => setView("landing")} />}
    </div>
  );
}

// ============ VERTICAL RULE ============
function VerticalRule({ height = 280, ticks = 16 }: { height?: number; ticks?: number }) {
  const tickArr = Array.from({ length: ticks });
  return (
    <svg width="24" height={height} viewBox={`0 0 24 ${height}`} className="shrink-0">
      <circle cx="12" cy="3" r="2" fill={BRAND.accent} />
      <circle cx="12" cy={height - 3} r="2" fill={BRAND.accent} />
      <line x1="12" y1="3" x2="12" y2={height - 3} stroke={BRAND.ink} strokeWidth="0.5" />
      {tickArr.map((_, i) => {
        const y = 30 + i * 8;
        const long = i % 5 === 0;
        return (
          <line
            key={i}
            x1={long ? 4 : 7}
            y1={y}
            x2={12}
            y2={y}
            stroke={BRAND.ink}
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}

// ============ LANDING ============
function Landing({ onNavigate }: { onNavigate: (v: "landing" | "customer" | "staff") => void }) {
  return (
    <div className="min-h-screen paper relative overflow-hidden">
      <div className="absolute top-12 left-12 hidden sm:block">
        <VerticalRule height={320} ticks={20} />
      </div>

      <div className="min-h-screen flex flex-col items-center justify-center px-8 py-16">
        <div className="text-center max-w-md w-full">
          <div className="mono text-[10px] tracking-[0.4em] mb-12 ink-soft">EST · TASTING SYSTEM</div>
          <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-2">
            CONTROLLED<br />CONDITIONS
          </h1>
          <div className="mt-3 mb-14 mono text-[10px] tracking-[0.3em] ink-soft">— ORDER MANAGEMENT —</div>

          <div className="space-y-2">
            <button onClick={() => onNavigate("customer")} className="w-full block border hairline-strong p-5 transition hover:bg-white/30" style={{ color: BRAND.ink }}>
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="mono text-[10px] tracking-[0.25em] ink-soft mb-1">CUSTOMER</div>
                  <div className="display text-base">Place an order</div>
                </div>
                <div className="text-xl">→</div>
              </div>
            </button>
            <button onClick={() => onNavigate("staff")} className="w-full block border hairline-strong p-5 transition hover:bg-white/30" style={{ color: BRAND.ink }}>
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="mono text-[10px] tracking-[0.25em] ink-soft mb-1">OPERATOR</div>
                  <div className="display text-base">Staff dashboard</div>
                </div>
                <div className="text-xl">→</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ CUSTOMER VIEW ============
function CustomerView({ onBack }: { onBack: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const menuRef = ref(db, "menu");
    const unsub = onValue(menuRef, (snap) => {
      const val = snap.val();
      if (val) {
        const items = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data }));
        setMenu(items);
      } else {
        // Seed default menu on first run
        const updates: Record<string, MenuItem> = {};
        DEFAULT_MENU.forEach((m) => { updates[m.id] = m; });
        set(menuRef, updates);
        setMenu(DEFAULT_MENU);
      }
      setLoading(false);
    });
    return () => off(menuRef);
  }, []);

  async function submit() {
    if (!name.trim() || !selected) return;
    const item = menu.find((m) => m.id === selected);
    if (!item) return;
    const newOrderRef = push(ref(db, "orders"));
    await set(newOrderRef, {
      name: name.trim(),
      item: item.name,
      itemDesc: item.desc,
      category: item.category,
      createdAt: Date.now(),
    });
    setSubmitted(true);
  }

  if (loading) return <div className="p-8 mono text-[10px] tracking-[0.3em] ink-soft paper min-h-screen">LOADING MENU…</div>;

  if (submitted) {
    return (
      <div className="min-h-screen paper flex flex-col items-center justify-center px-8 relative">
        <div className="text-center max-w-sm slidein">
          <div className="mb-8 flex justify-center">
            <div className="w-px h-20 accent-bg"></div>
          </div>
          <div className="mono text-[10px] tracking-[0.35em] accent-color mb-4">— ORDER RECEIVED —</div>
          <h2 className="display text-3xl mb-3">THANK YOU, {name.toUpperCase()}</h2>
          <p className="ink-soft text-sm mb-2">
            Your <span className="font-medium" style={{ color: BRAND.ink }}>
              {menu.find((m) => m.id === selected)?.name}
            </span>
          </p>
          <p className="ink-soft text-sm mb-10">is being prepared.</p>
          <button
            onClick={() => { setSubmitted(false); setName(""); setSelected(null); }}
            className="mono text-[10px] tracking-[0.25em] border-b hairline pb-1"
            style={{ color: BRAND.ink }}
          >
            PLACE ANOTHER ORDER
          </button>
        </div>
      </div>
    );
  }

  const categories = Array.from(new Set(menu.map((m) => m.category)));

  return (
    <div className="min-h-screen paper pb-32">
      <header className="border-b hairline-strong px-5 py-4 flex items-center justify-between sticky top-0" style={{ background: BRAND.paper, zIndex: 10 }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="mono text-[10px] tracking-[0.25em] ink-soft border hairline px-2 py-1">← BACK</button>
          <div>
            <div className="mono text-[9px] tracking-[0.35em] ink-soft">CONTROLLED CONDITIONS</div>
            <div className="display text-sm mt-1">— TASTING MENU —</div>
          </div>
        </div>
      </header>

      <div className="px-5 py-6">
        <label className="mono text-[10px] tracking-[0.25em] ink-soft block mb-2">▸ YOUR NAME</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ziqian"
          className="w-full bg-transparent border-b hairline-strong pb-2 text-2xl font-medium outline-none"
          style={{ color: BRAND.ink }}
        />
      </div>

      {categories.map((cat, ci) => (
        <section key={cat} className="px-5 mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-3">
              <span className="mono text-[10px] tracking-[0.3em] ink-soft">{String(ci + 1).padStart(2, "0")}</span>
              <h2 className="display text-base">{cat}</h2>
            </div>
            <span className="mono text-[10px] tracking-[0.2em] ink-soft">
              {menu.filter((m) => m.category === cat).length} items
            </span>
          </div>
          <div className="h-px w-full mb-3" style={{ background: BRAND.ink }}></div>

          <div className="space-y-1.5">
            {menu.filter((m) => m.category === cat).map((item) => {
              const isSel = selected === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className="w-full text-left p-4 border transition"
                  style={{
                    borderColor: isSel ? BRAND.ink : BRAND.inkFaint,
                    background: isSel ? BRAND.paperDeep : "transparent",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1.5 w-2.5 h-2.5 shrink-0"
                      style={{
                        border: `1px solid ${BRAND.ink}`,
                        background: isSel ? BRAND.accent : "transparent",
                      }}
                    ></div>
                    <div className="flex-1">
                      <div className="font-medium text-base leading-tight">{item.name}</div>
                      <div className="mono text-[11px] ink-soft mt-1">{item.desc}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fixed bottom-0 left-0 right-0 p-4 border-t hairline-strong" style={{ background: BRAND.paper }}>
        <button
          onClick={submit}
          disabled={!name.trim() || !selected}
          className="btn-primary w-full"
        >
          {!name.trim() ? "ENTER YOUR NAME" : !selected ? "SELECT AN ITEM" : "SUBMIT ORDER →"}
        </button>
      </div>
    </div>
  );
}

// ============ STAFF VIEW ============
function StaffView({ tick, onBack }: { tick: number; onBack: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [completed, setCompleted] = useState<CompletedOrder[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState<"active" | "stats" | "menu">("active");
  const [editing, setEditing] = useState(false);
  const lastOrderCount = useRef(0);

  // Subscribe to realtime updates
  useEffect(() => {
    const ordersRef = ref(db, "orders");
    const completedRef = ref(db, "completed");
    const menuRef = ref(db, "menu");

    const unsubOrders = onValue(ordersRef, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data }));

      // Beep on new order
      if (lastOrderCount.current && list.length > lastOrderCount.current) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch {}
      }
      lastOrderCount.current = list.length;
      setOrders(list);
    });

    const unsubCompleted = onValue(completedRef, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data }));
      setCompleted(list);
    });

    const unsubMenu = onValue(menuRef, (snap) => {
      const val = snap.val();
      if (val) {
        const items = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data }));
        setMenu(items);
      } else {
        setMenu(DEFAULT_MENU);
      }
    });

    return () => {
      off(ordersRef);
      off(completedRef);
      off(menuRef);
    };
  }, []);

  async function completeOrder(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const { id, ...orderData } = order;
    await set(ref(db, `completed/${id}`), { ...orderData, completedAt: Date.now() });
    await remove(ref(db, `orders/${orderId}`));
  }

  async function saveMenu(newMenu: MenuItem[]) {
    const updates: Record<string, Omit<MenuItem, "id">> = {};
    newMenu.forEach((m) => {
      const { id, ...rest } = m;
      updates[id] = rest;
    });
    await set(ref(db, "menu"), updates);
    setMenu(newMenu);
  }

  async function seedDemoOrders() {
    const sampleGuests = ["Mei", "Jordan", "Priya", "Theo", "Camille", "Renzo", "Anya", "Lukas", "Sana", "Diego", "Noor", "Iris"];
    const now = Date.now();
    const offsets = [
      5 * 1000, 30 * 1000, 2 * 60 * 1000, 4 * 60 * 1000,
      7 * 60 * 1000, 10 * 60 * 1000, 14 * 60 * 1000, 18 * 60 * 1000,
    ];
    const used = new Set<string>();
    for (let i = 0; i < offsets.length; i++) {
      const item = menu[Math.floor(Math.random() * menu.length)];
      let guest;
      do {
        guest = sampleGuests[Math.floor(Math.random() * sampleGuests.length)];
      } while (used.has(guest) && used.size < sampleGuests.length);
      used.add(guest);
      const newRef = push(ref(db, "orders"));
      await set(newRef, {
        name: guest,
        item: item.name,
        itemDesc: item.desc,
        category: item.category,
        createdAt: now - offsets[i],
      });
    }
  }

  async function clearAllOrders() {
    if (!confirm("Clear all active orders? This won't affect completed history.")) return;
    await set(ref(db, "orders"), null);
  }

  const itemCounts: Record<string, number> = {};
  completed.forEach((o) => {
    itemCounts[o.item] = (itemCounts[o.item] || 0) + 1;
  });
  const sortedCounts = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  if (editing) {
    return <MenuEditor menu={menu} onSave={(m) => { saveMenu(m); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="min-h-screen paper pb-20">
      <header className="border-b hairline-strong px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button onClick={onBack} className="mono text-[10px] tracking-[0.25em] ink-soft border hairline px-2 py-1 mt-1">← BACK</button>
            <div>
              <div className="mono text-[9px] tracking-[0.35em] ink-soft">STAFF · OPERATOR</div>
              <div className="display text-lg mt-1">— ORDER FLOOR —</div>
            </div>
          </div>
          <div className="text-right">
            <div className="display text-3xl leading-none">{String(orders.length).padStart(2, "0")}</div>
            <div className="mono text-[9px] tracking-[0.25em] ink-soft mt-1">ACTIVE</div>
          </div>
        </div>
      </header>

      <div className="flex border-b hairline-strong">
        {[
          { id: "active" as const, label: "Active", count: orders.length },
          { id: "stats" as const, label: "Stats", count: completed.length },
          { id: "menu" as const, label: "Menu", count: menu.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-4 py-3 mono text-[10px] tracking-[0.25em] uppercase transition relative"
            style={{
              color: tab === t.id ? BRAND.ink : BRAND.inkSoft,
              background: tab === t.id ? BRAND.paperDeep : "transparent",
              fontWeight: tab === t.id ? 600 : 400,
            }}
          >
            {t.label} <span className="ink-soft">[{t.count}]</span>
            {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 accent-bg"></div>}
          </button>
        ))}
      </div>

      {tab === "active" && (
        <div>
          {orders.length > 0 && (
            <div className="px-5 py-3 border-b hairline flex items-center justify-end" style={{ background: BRAND.paperDeep }}>
              <button onClick={clearAllOrders} className="btn-ghost">CLEAR ALL</button>
            </div>
          )}
          {orders.length === 0 ? (
            <div className="px-5 py-20 text-center">
              <div className="mono text-[10px] tracking-[0.35em] ink-soft mb-4">— QUEUE EMPTY —</div>
              <div className="display text-xl mb-6">AWAITING ORDERS</div>
              <div className="mono text-[10px] tracking-[0.2em] accent-color mb-8 blink">●</div>
              </div>
            
          ) : (
            <div>
              {orders.sort((a, b) => a.createdAt - b.createdAt).map((o, idx) => (
                <OrderRow key={o.id} order={o} idx={idx + 1} onComplete={() => completeOrder(o.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-2 mb-8">
            <div className="border hairline-strong p-4">
              <div className="mono text-[9px] tracking-[0.25em] ink-soft mb-2">COMPLETED</div>
              <div className="display text-4xl leading-none">{String(completed.length).padStart(3, "0")}</div>
            </div>
            <div className="border hairline-strong p-4">
              <div className="mono text-[9px] tracking-[0.25em] ink-soft mb-2">UNIQUE GUESTS</div>
              <div className="display text-4xl leading-none">{String(new Set(completed.map((c) => c.name.toLowerCase())).size).padStart(3, "0")}</div>
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-3 gap-3">
            <h3 className="display text-sm whitespace-nowrap">— ITEMS SERVED —</h3>
            <div className="h-px flex-1" style={{ background: BRAND.inkFaint }}></div>
            <span className="mono text-[10px] ink-soft whitespace-nowrap">{sortedCounts.length} TYPES</span>
          </div>

          {sortedCounts.length === 0 ? (
            <div className="mono text-[10px] tracking-[0.2em] ink-soft py-8 text-center">NO COMPLETED ORDERS YET</div>
          ) : (
            <div className="space-y-1.5">
              {sortedCounts.map(([item, count], i) => {
                const max = sortedCounts[0][1];
                const pct = (count / max) * 100;
                return (
                  <div key={item} className="relative border hairline-strong p-3 overflow-hidden">
                    <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: BRAND.accent, opacity: 0.12 }}></div>
                    <div className="relative flex justify-between items-center gap-3">
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="mono text-[10px] ink-soft shrink-0">{String(i + 1).padStart(2, "0")}</span>
                        <div className="font-medium truncate">{item}</div>
                      </div>
                      <div className="display text-lg shrink-0">{String(count).padStart(2, "0")}×</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completed.length > 0 && (
            <button
              onClick={async () => {
                if (confirm("Clear all completed order history? Stats will reset.")) {
                  await set(ref(db, "completed"), null);
                }
              }}
              className="mt-10 mono text-[10px] tracking-[0.25em] ink-soft border-b hairline pb-0.5"
            >
              ▸ RESET STATS
            </button>
          )}
        </div>
      )}

      {tab === "menu" && (
        <div className="p-5">
          <button onClick={() => setEditing(true)} className="btn-primary mb-5">▸ EDIT MENU</button>
          <div className="space-y-1.5">
            {menu.map((m, i) => (
              <div key={m.id} className="border hairline-strong p-3">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="mono text-[10px] ink-soft shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <div className="font-medium truncate">{m.name}</div>
                  </div>
                  <span className="tag shrink-0">{m.category}</span>
                </div>
                <div className="mono text-[11px] ink-soft pl-7">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ ORDER ROW ============
function OrderRow({ order, idx, onComplete }: { order: Order; idx: number; onComplete: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - order.createdAt;
  const tier = elapsedTier(elapsed);
  const tierColor = tier === "fresh" ? BRAND.ink : tier === "warm" ? "#b8841f" : BRAND.accent;
  const tierLabel = tier === "fresh" ? "NEW" : tier === "warm" ? "WAITING" : "URGENT";

  return (
    <div className="border-b hairline-strong p-4 slidein relative">
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: tierColor }}></div>
      <div className="flex items-start gap-4 pl-2">
        <div className="display text-2xl ink-soft w-9 shrink-0">{String(idx).padStart(2, "0")}</div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium leading-tight mb-1">{order.item}</div>
          <div className="mono text-[11px] ink-soft mb-2">{order.itemDesc}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tag">{order.category}</span>
            <span className="mono text-[11px] ink-soft">for</span>
            <span className="text-sm font-semibold">{order.name}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="mono text-[9px] tracking-[0.2em]" style={{ color: tierColor }}>
            {tierLabel}{tier === "urgent" && <span className="blink"> ●</span>}
          </div>
          <div className="display text-2xl mt-0.5" style={{ color: tierColor }}>
            {formatElapsed(elapsed)}
          </div>
          <button onClick={onComplete} className="btn-ghost mt-2">✓ DONE</button>
        </div>
      </div>
    </div>
  );
}

// ============ MENU EDITOR ============
function MenuEditor({ menu, onSave, onCancel }: { menu: MenuItem[]; onSave: (m: MenuItem[]) => void; onCancel: () => void }) {
  const [items, setItems] = useState<MenuItem[]>(menu);

  function updateItem(i: number, field: keyof MenuItem, val: string) {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    setItems(next);
  }

  function addItem() {
    setItems([...items, { id: `m_${Date.now()}`, name: "New Item", desc: "description", category: "Other" }]);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="min-h-screen paper pb-32">
      <header className="border-b hairline-strong px-5 py-4 flex justify-between items-center sticky top-0" style={{ background: BRAND.paper, zIndex: 10 }}>
        <div>
          <div className="mono text-[9px] tracking-[0.35em] ink-soft">EDIT</div>
          <div className="display text-lg mt-1">— MENU —</div>
        </div>
        <button onClick={onCancel} className="mono text-[10px] tracking-[0.25em]" style={{ color: BRAND.ink }}>CANCEL</button>
      </header>

      <div className="p-5 space-y-2">
        {items.map((item, i) => (
          <div key={item.id} className="border hairline-strong p-3 space-y-2">
            <div className="flex gap-2 items-start">
              <span className="mono text-[10px] ink-soft pt-1">{String(i + 1).padStart(2, "0")}</span>
              <input
                className="flex-1 bg-transparent border-b hairline text-base font-medium outline-none pb-1"
                value={item.name}
                onChange={(e) => updateItem(i, "name", e.target.value)}
                placeholder="Item name"
                style={{ color: BRAND.ink }}
              />
              <button onClick={() => removeItem(i)} className="mono text-[10px] tracking-[0.2em] accent-color px-1">✕</button>
            </div>
            <input
              className="w-full bg-transparent mono text-[11px] ink-soft outline-none pl-7"
              value={item.desc}
              onChange={(e) => updateItem(i, "desc", e.target.value)}
              placeholder="ingredients · description"
            />
            <input
              className="w-full bg-transparent mono text-[10px] tracking-[0.25em] uppercase ink-soft outline-none pl-7"
              value={item.category}
              onChange={(e) => updateItem(i, "category", e.target.value)}
              placeholder="CATEGORY"
            />
          </div>
        ))}

        <button onClick={addItem} className="w-full border hairline border-dashed p-4 mono text-[10px] tracking-[0.25em] ink-soft">
          + ADD ITEM
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 border-t hairline-strong" style={{ background: BRAND.paper }}>
        <button onClick={() => onSave(items)} className="btn-primary w-full">▸ SAVE MENU</button>
      </div>
    </div>
  );
}
