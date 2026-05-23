import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Order, InventoryItem } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Flame, AlertTriangle, Coffee, Utensils, ClipboardList, CheckCircle2, Circle, Trash2, Moon, Sun, ShoppingBag } from "lucide-react";

interface SidebarProps {
  onCompleteOrder: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  inventory: InventoryItem[];
}

export default function Sidebar({ onCompleteOrder, onDeleteOrder, inventory }: SidebarProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "completed">("active");

  // Subscribe to real-time Orders
  useEffect(() => {
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const fetchedOrders: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedOrders.push({
          id: doc.id,
          meja: data.meja,
          items: data.items || [],
          status: data.status || "active",
          createdAt: data.createdAt
        });
      });
      setOrders(fetchedOrders);
    }, (error) => {
      console.error("Orders Snapshot unsubscribed:", error);
    });

    return () => unsubscribe();
  }, []);

  // Filtered orders list
  const filteredOrders = orders.filter((o) => {
    if (orderFilter === "all") return true;
    return o.status === orderFilter;
  });

  // Calculate low stock items (qty <= 5)
  const lowStockItems = inventory.filter((item) => item.qty <= 5);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  };

  const formatRupiah = (num: number) => {
    return "Rp " + num.toLocaleString("id-ID");
  };

  const getItemPrice = (itemName: string, orderPrice?: number) => {
    if (orderPrice !== undefined && orderPrice > 0) return orderPrice;
    const match = inventory.find(i => i.name.toLowerCase().trim() === itemName.toLowerCase().trim());
    return match?.price || 0;
  };

  const calculateTotal = (order: Order) => {
    return order.items.reduce((sum, item) => {
      return sum + (item.qty * getItemPrice(item.name, (item as any).price));
    }, 0);
  };

  return (
    <div className="w-full lg:w-96 bg-white border-l border-slate-200 flex flex-col h-full text-slate-800 shadow-sm">
      {/* Header for Active Logs */}
      <div className="px-5 py-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping mr-1" />
          <h2 className="text-sm font-extrabold tracking-wider text-slate-700 uppercase font-sans">PESANAN AKTIF</h2>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-1 bg-slate-100 rounded text-slate-500">
          {orders.filter(o => o.status === 'active').length} AKTIF
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col split-y border-b border-slate-200">
        
        {/* SECTION 1: Low Stock warning with high accessibility */}
        <div>
          <div className="bg-rose-50 px-5 py-3.5 flex items-center justify-between border-b border-rose-100">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-rose-700 flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Stok Menipis ⚠️</span>
            </h3>
            <span className="text-2xs font-bold text-rose-500 bg-rose-100/60 px-1.5 py-0.5 rounded">WARNING</span>
          </div>

          <div className="p-4 bg-slate-50/40">
            <AnimatePresence mode="popLayout">
              {lowStockItems.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 font-medium"
                >
                  Aman bos! Seluruh persediaan menu atau stock berkecukupan.
                </motion.div>
              ) : (
                <div className="space-y-1.5">
                  {lowStockItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layoutId={`alert-${item.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        item.qty === 0 
                          ? 'bg-rose-100/50 border-rose-200 text-rose-900' 
                          : 'bg-amber-100/50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${item.qty === 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} />
                        <div>
                          <p className="text-xs font-bold capitalize">{item.name}</p>
                          <p className="text-3xs text-slate-500 uppercase font-mono tracking-tight">{item.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold rounded bg-amber-200/60 text-amber-900 px-2 py-0.5">
                          SISA {item.qty}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* SECTION 2: Live Monitor List */}
        <div className="flex-1 flex flex-col">
          <div className="bg-slate-50 border-t border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-600 flex items-center space-x-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
              <span>Daftar Pesanan</span>
            </h3>
            <div className="flex bg-slate-200/60 p-0.5 rounded overflow-hidden">
              <button
                onClick={() => setOrderFilter("active")}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase tracking-wider rounded transition ${
                  orderFilter === "active" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Aktif
              </button>
              <button
                onClick={() => setOrderFilter("completed")}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase tracking-wider rounded transition ${
                  orderFilter === "completed" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Selesai
              </button>
              <button
                onClick={() => setOrderFilter("all")}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase tracking-wider rounded transition ${
                  orderFilter === "all" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Semua
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            <AnimatePresence mode="popLayout">
              {filteredOrders.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-slate-400 text-center py-8 font-medium font-mono"
                >
                  Belum ada pesanan {orderFilter === "active" ? "aktif" : orderFilter === "completed" ? "selesai" : ""}.
                </motion.p>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      layoutId={`order-${order.id}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ opacity: { duration: 0.15 } }}
                      className={`p-4 rounded-xl border transition ${
                        order.status === "completed" 
                          ? "bg-slate-50 border-slate-200/60 text-slate-400" 
                          : "bg-white border-slate-200 shadow-xs hover:border-slate-300 text-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className={`inline-block text-2xs font-extrabold px-2 py-0.5 rounded ${
                              order.status === "completed" 
                                ? "bg-slate-100 text-slate-400" 
                                : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            }`}>
                              MEJA {order.meja}
                            </span>
                            <span className="text-3xs font-mono text-slate-400">
                              • {formatTime(order.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => order.id && onCompleteOrder(order.id)}
                            title={order.status === "active" ? "Tandai Selesai" : "Buka Kembali"}
                            className={`p-1.5 rounded transition ${
                              order.status === "completed"
                                ? "bg-slate-100 hover:bg-slate-200 text-slate-500"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"
                            }`}
                          >
                            {order.status === "completed" ? (
                              <Circle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => order.id && onDeleteOrder(order.id)}
                            title="Hapus Pesanan"
                            className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 mt-1 border-t border-slate-100 pt-2.5">
                        {order.items.map((item, idx) => {
                          const price = getItemPrice(item.name, (item as any).price);
                          return (
                            <div key={idx} className="flex justify-between items-start text-xs">
                              <div className="flex flex-col">
                                <span className={`capitalize font-medium ${order.status === "completed" ? "line-through text-slate-300" : "text-slate-700"}`}>
                                  {item.name}
                                </span>
                                {price > 0 && (
                                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    {formatRupiah(price)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2.5">
                                {price > 0 && (
                                  <span className="text-[11px] text-slate-500 font-mono font-bold">
                                    {formatRupiah(price * item.qty)}
                                  </span>
                                )}
                                <span className="font-extrabold text-blue-600 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 font-mono">
                                  x{item.qty}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Display order total */}
                      <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex justify-between items-center text-xs font-bold text-slate-800">
                        <span className="text-slate-500 uppercase tracking-wider text-[10px]">TOTAL HARGA:</span>
                        <span className="text-emerald-700 font-extrabold text-[13px]">{formatRupiah(calculateTotal(order))}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Stable Version Footer conforming to spec */}
      <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 text-center">
        <span className="text-4xs font-mono tracking-widest text-slate-400 uppercase">
          VOICEOPS v2.5.0 • STABLE PLATFORM
        </span>
      </div>
    </div>
  );
}
