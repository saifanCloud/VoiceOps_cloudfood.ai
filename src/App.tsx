import { useState, useEffect, useRef, FormEvent } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { InventoryItem, VoiceStatus, Order } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, MicOff, MessageSquareCode, Plus, Edit2, Trash2, 
  Sparkles, Keyboard, HelpCircle, RefreshCw, Volume2, 
  CheckCircle, ShieldAlert, Package, X, ArrowRight, ClipboardList,
  Coffee, Utensils, Flame, CheckCircle2, Circle
} from "lucide-react";

export default function App() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<string>("Halo bosku! Aku Sisca, siap membantu operasional warungmu. Tekan tombol di bawah untuk mulai!");
  const [lastAction, setLastAction] = useState<{ action: string; voice_response: string } | null>(null);

  // Audio Recording states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual stock editing controls
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formQty, setFormQty] = useState(1);
  const [formPrice, setFormPrice] = useState(0);
  const [formCategory, setFormCategory] = useState("makanan");
  const [inventoryFormError, setInventoryFormError] = useState("");

  // Manual order editing states
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderFormMeja, setOrderFormMeja] = useState("");
  const [orderFormItems, setOrderFormItems] = useState<{ name: string; qty: number }[]>([]);
  const [orderFormAddItemName, setOrderFormAddItemName] = useState("");
  const [orderFormAddItemQty, setOrderFormAddItemQty] = useState(1);
  const [orderFormError, setOrderFormError] = useState("");

  // Custom confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: "menu" | "order"; label: string } | null>(null);

  // Shop Name & Editable Controls
  const [shopName, setShopName] = useState(() => {
    return localStorage.getItem("cloudfood_shop_name") || "Warung Selera Ibu";
  });
  const [isEditingShopName, setIsEditingShopName] = useState(false);
  const [tempShopName, setTempShopName] = useState(shopName);

  // Real-time Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<"active" | "completed">("active");

  // Subscribe to real-time Inventory
  useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: InventoryItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name,
          qty: data.qty,
          price: data.price || 0,
          category: data.category
        });
      });
      setInventory(items);
    }, (error) => {
      console.error("Inventory sub failed:", error);
    });

    return () => unsubscribe();
  }, []);

  // Save Shop Name
  const saveShopName = () => {
    const trimmed = tempShopName.trim();
    if (trimmed) {
      setShopName(trimmed);
      localStorage.setItem("cloudfood_shop_name", trimmed);
    }
    setIsEditingShopName(false);
  };

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

  // Indonesia Voice Output Synthesis helper (Friendly, warm female voice Sisca)
  const speakVoice = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    
    // Stop speaking any current text
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Prioritize Indonesian locale
    const idVoices = voices.filter(v => v.lang.toLowerCase().startsWith("id") || v.lang.toLowerCase().includes("id"));
    
    // Try to find known female voices for Indonesian
    let selectedVoice = idVoices.find(v => 
      v.name.toLowerCase().includes("female") || 
      v.name.toLowerCase().includes("jessa") || 
      v.name.toLowerCase().includes("damayanti") || 
      v.name.toLowerCase().includes("gisella") || 
      v.name.toLowerCase().includes("dina") || 
      v.name.toLowerCase().includes("dwi") ||
      v.name.toLowerCase().includes("yuna") ||
      v.name.toLowerCase().includes("sari") ||
      v.name.toLowerCase().includes("zira") ||
      v.name.toLowerCase().includes("gadis") ||
      v.name.toLowerCase().includes("susan") ||
      v.name.toLowerCase().includes("google")
    );
    
    if (!selectedVoice && idVoices.length > 0) {
      selectedVoice = idVoices[0];
    }
    
    // Fallback to any general female voice if no indonesian voice found
    if (!selectedVoice) {
      selectedVoice = voices.find(v => 
        (v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("siri") || v.name.toLowerCase().includes("zira")) &&
        (v.lang.toLowerCase().startsWith("en") || v.lang.toLowerCase().startsWith("id"))
      );
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    // Tuning values for extremely friendly, cheerful, fast and natural speaking style:
    utterance.rate = 1.25;  // Fast, natural, enthusiastic speaking rate (not stiff or dragging)
    utterance.pitch = 1.32; // Higher pitch to make Sisca sound cheerful, bright, warm and engaging!
    
    window.speechSynthesis.speak(utterance);
  };

  // Warm up speechSynthesis on mount so voices are loaded faster
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      };
    }
  }, []);

  // Keyboard shortcut Spacebar triggers voice recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is filling a form field
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        toggleVoiceRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording]);

  // Duration Timer count
  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      setStatus("listening");
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm"
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250); // Slice size
      setIsRecording(true);
    } catch (err: any) {
      console.error("Mic initialization failed:", err);
      setTranscript("Error: Gagal mengakses mikrofon bos. Pastikan izin sudah diberikan!");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Turn off microphone tracks to clear state indicator
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Upload Audio blob to backend for processing
  const sendAudioToBackend = async (blob: Blob) => {
    try {
      setStatus("processing");
      setTranscript("Memikirkan printah suara bos...");

      const formData = new FormData();
      formData.append("audio", blob, "instruction.webm");

      const response = await fetch("/api/process-voice", {
        method: "POST",
        body: formData
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const errData = await response.json();
          throw new Error(errData.error || "Gagal memproses audio di server.");
        }
        throw new Error(`Server Express mengalami error (HTTP ${response.status}).`);
      }

      if (!contentType.includes("application/json")) {
        const rawText = await response.text();
        console.error("Non-JSON Response received:", rawText.slice(0, 500));
        throw new Error("Server mengirimkan dokumen HTML/halaman error. Pastikan API key Gemini Anda sudah terpasang di Settings > Secrets dengan nama GEMINI_API_KEY.");
      }

      const resJson = await response.json();
      
      if (resJson.error) {
        throw new Error(resJson.error);
      }

      // Voice response successfully retrieved
      setStatus("success");
      setTranscript(resJson.voice_response);
      setLastAction({
        action: resJson.action,
        voice_response: resJson.voice_response
      });

      // Automatically speak back utilizing synthesizer
      speakVoice(resJson.voice_response);

    } catch (error: any) {
      console.error("Voice parsing error:", error);
      setStatus("error");
      setTranscript(`Waduh, gagal denger nih bos: ${error.message || "Koneksi bermasalah"}`);
      speakVoice("Maaf bos, ganti koneksi atau coba ulangi perintahnya.");
    }
  };

  // Handler for Manual inventory submission
  const handleSaveInventoryItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      setInventoryFormError("");
      const payload = {
        id: editingItem?.id,
        name: formName.toLowerCase().trim(),
        qty: formQty,
        category: formCategory,
        price: formPrice
      };

      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowAddForm(false);
        setEditingItem(null);
        setFormName("");
        setFormQty(1);
        setFormPrice(0);
        setInventoryFormError("");
      } else {
        const errData = await response.json().catch(() => ({}));
        setInventoryFormError(errData.error || "Gagal menyimpan menu.");
      }
    } catch (err: any) {
      console.error("Manual inventory update failed:", err);
      setInventoryFormError("Koneksi bermasalah saat menyimpan menu.");
    }
  };

  // Delete inventory item
  const handleDeleteInventoryItem = async (id: string) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    setDeleteConfirm({
      id,
      type: "menu",
      label: item.name
    });
  };

  // Helper to add menu item into temporary order draft list
  const addOrderItemToDraf = () => {
    if (!orderFormAddItemName) {
      setOrderFormError("Pilih menu terlebih dahulu, bos!");
      return;
    }
    const qty = orderFormAddItemQty;
    if (qty <= 0) {
      setOrderFormError("Kuantitas item harus di atas 0 bos!");
      return;
    }

    const itemExists = orderFormItems.find(
      (item) => item.name.toLowerCase().trim() === orderFormAddItemName.toLowerCase().trim()
    );

    if (itemExists) {
      setOrderFormItems(
        orderFormItems.map((item) =>
          item.name.toLowerCase().trim() === orderFormAddItemName.toLowerCase().trim()
            ? { ...item, qty: item.qty + qty }
            : item
        )
      );
    } else {
      setOrderFormItems([...orderFormItems, { name: orderFormAddItemName, qty }]);
    }
    setOrderFormError("");
  };

  const removeOrderItemFromDraf = (index: number) => {
    setOrderFormItems(orderFormItems.filter((_, i) => i !== index));
  };

  const incrementOrderDrafQty = (index: number) => {
    setOrderFormItems(
      orderFormItems.map((item, i) => (i === index ? { ...item, qty: item.qty + 1 } : item))
    );
  };

  const decrementOrderDrafQty = (index: number) => {
    setOrderFormItems(
      orderFormItems.map((item, i) =>
        i === index ? { ...item, qty: Math.max(1, item.qty - 1) } : item
      )
    );
  };

  // Save manual order (Both POST and PUT)
  const handleSaveOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderFormMeja.trim()) {
      setOrderFormError("Nomor meja harus diisi bos!");
      return;
    }
    if (orderFormItems.length === 0) {
      setOrderFormError("Pilih minimal 1 item menu untuk membuat pesanan!");
      return;
    }

    try {
      const payload = {
        meja: orderFormMeja.trim(),
        items: orderFormItems
      };

      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowOrderForm(false);
        setEditingOrder(null);
        setOrderFormMeja("");
        setOrderFormItems([]);
        setOrderFormAddItemName("");
        setOrderFormAddItemQty(1);
        setOrderFormError("");
      } else {
        const errData = await response.json().catch(() => ({}));
        setOrderFormError(errData.error || "Gagal menyimpan pesanan.");
      }
    } catch (err) {
      console.error("Manual order update failed:", err);
      setOrderFormError("Koneksi bermasalah saat menyimpan pesanan.");
    }
  };

  // Resolve / Toggle orders completed
  const handleCompleteOrder = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}/complete`, { method: "POST" });
    } catch (err) {
      console.error("Failed to complete order:", err);
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setDeleteConfirm({
      id: orderId,
      type: "order",
      label: `Pesanan Meja ${order.meja}`
    });
  };

  // Resuable execution handler for custom delete confirmation
  const handleExecuteDelete = async () => {
    if (!deleteConfirm) return;
    const { id, type } = deleteConfirm;
    try {
      if (type === "menu") {
        await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      } else if (type === "order") {
        await fetch(`/api/orders/${id}`, { method: "DELETE" });
      }
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Load editing state
  const loadEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormQty(item.qty);
    setFormCategory(item.category);
    setFormPrice(item.price || 0);
    setInventoryFormError("");
    setShowAddForm(true);
  };

  const getStatusColor = () => {
    switch (status) {
      case "listening":
        return "bg-rose-500 hover:bg-rose-600 text-white border-rose-200 shadow-[0_20px_50px_rgba(244,63,94,0.25)]";
      case "processing":
        return "bg-amber-500 hover:bg-amber-600 text-white border-amber-200 shadow-[0_20px_50px_rgba(245,158,11,0.25)]";
      case "success":
        return "bg-[#1E293B] text-white border-slate-200 shadow-[0_20px_50px_rgba(30,41,59,0.15)]";
      case "error":
        return "bg-rose-600 hover:bg-rose-750 text-white border-rose-300 shadow-[0_20px_50px_rgba(225,29,72,0.25)]";
      default:
        return "bg-[#475569] hover:bg-[#334155] text-white border-[#E2E8F0] shadow-[0_20px_50px_rgba(0,0,0,0.1)]";
    }
  };

  const statusLabel = () => {
    switch (status) {
      case "listening":
        return "LISTENING MODE 🎙️";
      case "processing":
        return "PROCESSING COMMAND ⚙️";
      case "success":
        return "COMMAND SUCCESS ✅";
      case "error":
        return "ERROR OCCURRED ❌";
      default:
        return "STANDBY MODE 😴";
    }
  };

  // Helper functions for displaying text and calculations
  const formatTime = (isoString?: string) => {
    if (!isoString) return "--:--";
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

  // Filtered orders list
  const filteredOrders = orders.filter((o) => o.status === orderFilter);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-800 flex flex-col font-sans relative antialiased p-0 sm:p-4 md:p-6 justify-center items-center">
      
      {/* MAIN SINGLE-SCREEN DASHBOARD CONTAINER */}
      <div className="w-full max-w-2xl bg-white sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-xl flex flex-col overflow-hidden h-screen sm:h-[682px]">
        
        {/* HEADER: cloudfood.Ai : [editable shop name] */}
        <header className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-850 shadow-sm flex-shrink-0">
          <div className="flex items-center space-x-2 flex-wrap">
            <span className="font-extrabold text-sm sm:text-base text-blue-400 font-mono tracking-tight uppercase">
              cloudfood.Ai
            </span>
            <span className="text-slate-500 font-light">:</span>
            {isEditingShopName ? (
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  className="bg-slate-800 text-slate-100 border border-blue-500 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold max-w-[160px] sm:max-w-[220px]"
                  value={tempShopName}
                  onChange={(e) => setTempShopName(e.target.value)}
                  onBlur={saveShopName}
                  onKeyDown={(e) => e.key === "Enter" && saveShopName()}
                  autoFocus
                />
                <button 
                  onClick={saveShopName}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-3xs font-extrabold rounded-md uppercase tracking-wide leading-none"
                >
                  Simpan
                </button>
              </div>
            ) : (
              <span 
                onClick={() => { setIsEditingShopName(true); setTempShopName(shopName); }}
                className="font-bold text-xs sm:text-sm text-slate-200 hover:text-white cursor-pointer flex items-center gap-1 group transition-colors"
                title="Klik untuk mengubah nama warung"
              >
                {shopName}
                <Edit2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition ml-0.5" />
              </span>
            )}
          </div>

          <button
            onClick={() => speakVoice(`Halo bosku! Selamat datang di cloud food AI ${shopName}.`)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-350 border border-slate-700 text-[10px] font-mono rounded-lg transition"
            title="Sistem Audio Test"
          >
            🔊 Uji Audio
          </button>
        </header>

        {/* CONTAINER CONTENT: Scrollable or tight segments */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* SECTION 1: DAFTAR PESANAN WITH AKTIF / SELESAI TOGGLES */}
          <div className="p-4 sm:p-5 border-b border-slate-150 bg-slate-50 flex flex-col flex-shrink-0 h-[224px] min-h-[224px] overflow-hidden">
            <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-slate-400" />
                  Daftar Pesanan ({filteredOrders.length})
                </h2>
                <button
                  onClick={() => {
                    setEditingOrder(null);
                    setOrderFormMeja("");
                    setOrderFormItems([]);
                    setOrderFormAddItemName(inventory[0]?.name || "");
                    setOrderFormAddItemQty(1);
                    setOrderFormError("");
                    setShowOrderForm(true);
                  }}
                  className="text-[9px] font-black px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition uppercase tracking-wider flex items-center shadow-xs"
                >
                  <Plus className="w-3 h-3 mr-0.5" />
                  Tambah
                </button>
              </div>
              
              <div className="flex bg-slate-200/55 p-0.5 rounded-lg border border-slate-250/30">
                <button
                  onClick={() => setOrderFilter("active")}
                  className={`px-3 py-1 text-2xs font-extrabold uppercase rounded-md transition-all duration-150 ${
                    orderFilter === "active" 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Aktif ({orders.filter(o => o.status === "active").length})
                </button>
                <button
                  onClick={() => setOrderFilter("completed")}
                  className={`px-3 py-1 text-2xs font-extrabold uppercase rounded-md transition-all duration-150 ${
                    orderFilter === "completed" 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Selesai ({orders.filter(o => o.status === "completed").length})
                </button>
              </div>
            </div>

            {/* SCROLLABLE ORDER CARDS STREAM */}
            <div className="h-[144px] overflow-y-auto space-y-2 pr-1 scrollbar-thin flex-shrink-0">
              {filteredOrders.length === 0 ? (
                <div className="text-center h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/50">
                  <p className="text-2xs font-mono font-bold text-slate-400 uppercase tracking-widest">
                    Belum ada pesanan {orderFilter === "active" ? "aktif" : "selesai"}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`p-3 rounded-xl border flex flex-col gap-2 transition bg-white border-slate-200`}
                    >
                      <div className="flex justify-between items-center bg-slate-50/75 px-2.5 py-1.5 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[10px] text-slate-700 font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                            MEJA {order.meja}
                          </span>
                          <span className="text-[10px] text-slate-455 font-mono">
                            • {formatTime(order.createdAt)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingOrder(order);
                              setOrderFormMeja(order.meja);
                              setOrderFormItems(order.items.map(item => ({ name: item.name, qty: item.qty })));
                              setOrderFormAddItemName(inventory[0]?.name || "");
                              setOrderFormAddItemQty(1);
                              setOrderFormError("");
                              setShowOrderForm(true);
                            }}
                            title="Edit Pesanan"
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => order.id && handleCompleteOrder(order.id)}
                            title={order.status === "active" ? "Tandai Selesai" : "Buka Kembali"}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                          >
                            <CheckCircle className={`w-4 h-4 ${order.status === "completed" ? "text-slate-400" : "text-emerald-600"}`} />
                          </button>
                          <button
                            onClick={() => order.id && handleDeleteOrder(order.id)}
                            title="Hapus Pesanan"
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 px-1 mt-0.5">
                        {order.items.map((item, idx) => {
                          const price = getItemPrice(item.name, (item as any).price);
                          return (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="text-slate-700 capitalize truncate max-w-[130px]" title={item.name}>
                                {item.name}
                                <span className="text-blue-600 font-mono font-bold text-[10px] ml-1">
                                  x{item.qty}
                                </span>
                              </span>
                              <span className="text-slate-500 font-mono text-[10px] font-semibold">
                                {formatRupiah(price * item.qty)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-dashed border-slate-150 pt-1.5 px-1 flex justify-between items-center text-2xs">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Total</span>
                        <span className="text-emerald-700 font-black font-mono text-xs">
                          {formatRupiah(calculateTotal(order))}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* SECTION 2: DAFTAR MENU & DAFTAR STOK */}
          <div className="p-4 sm:p-5 h-[294px] min-h-[294px] flex-shrink-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2.5 border-b border-slate-100 pb-2 flex-shrink-0">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" />
                Daftar Menu & Stok
              </h2>
              
              <button
                onClick={() => {
                  setEditingItem(null);
                  setFormName("");
                  setFormQty(1);
                  setFormCategory("makanan");
                  setFormPrice(0);
                  setShowAddForm(true);
                }}
                className="text-[10px] font-black px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition uppercase tracking-wider flex items-center shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Tambah Menu
              </button>
            </div>

            {/* Sized exactly to display exactly 4 product containers (gaps = 8px * 3, items = 52px * 4 = 208px. Total = 232px) */}
            <div className="h-[232px] overflow-y-auto space-y-2 pr-1 scrollbar-thin flex-shrink-0">
              {inventory.length === 0 ? (
                <div className="text-center h-full flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-slate-200/50">
                  <p className="text-2xs font-mono font-bold text-slate-400 uppercase tracking-widest text-center">
                    Belum ada menu terdaftar
                  </p>
                </div>
              ) : (
                inventory.map((item) => (
                  <div
                    key={item.id}
                    className="h-[52px] min-h-[52px] px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 rounded-xl flex items-center justify-between transition gap-2 sm:gap-3 flex-shrink-0"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                      <span className="font-extrabold text-slate-800 capitalize text-xs truncate max-w-[95px] sm:max-w-[150px]" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400 px-1.5 py-0.5 bg-white border border-slate-200/55 rounded font-bold uppercase tracking-wide font-mono flex-shrink-0">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-3.5 flex-shrink-0">
                      <span className="text-2xs sm:text-xs text-emerald-700 font-extrabold font-mono">
                        {formatRupiah(item.price || 0)}
                      </span>

                      <div className="flex items-center gap-1 pl-1.5 sm:pl-2 border-l border-slate-200 flex-shrink-0">
                        <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase font-mono tracking-wider font-semibold hidden sm:inline">
                          Stok:
                        </span>
                        <span className={`font-mono font-black text-[11px] sm:text-xs px-1.5 py-0.5 rounded leading-none ${
                          item.qty <= 5 
                            ? "bg-rose-100 text-rose-800 animate-pulse font-bold" 
                            : "text-slate-700 bg-slate-250/50"
                        }`}>
                          {item.qty}
                        </span>
                      </div>

                      <div className="flex items-center space-x-0.5 sm:space-x-1 pl-1.5 sm:pl-2 border-l border-slate-200 flex-shrink-0">
                        <button
                          onClick={() => loadEditItem(item)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => item.id && handleDeleteInventoryItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* SECTION 3: THE VOICE BUTTON AS THE BOTTOM CONTROL PANEL */}
        <div className="bg-slate-900 border-t border-slate-800 py-3 px-5 flex flex-col items-center justify-center flex-shrink-0 text-slate-400 h-[100px] min-h-[100px]">
          <div className="relative flex flex-col items-center justify-center">
            {/* Pulsating Voice Circles */}
            {isRecording && (
              <>
                <motion.div 
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
                  className="absolute w-12 h-12 bg-rose-500 rounded-full"
                />
                <motion.div 
                  initial={{ scale: 1, opacity: 0.2 }}
                  animate={{ scale: 1.25, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.4, delay: 0.4, ease: "easeOut" }}
                  className="absolute w-12 h-12 bg-rose-400 rounded-full"
                />
              </>
            )}
            {status === "processing" && (
              <motion.div 
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
                className="absolute w-12 h-12 bg-amber-500 rounded-full"
              />
            )}

            <button
              id="voice-activation-btn"
              onClick={toggleVoiceRecording}
              className={`w-12 h-12 rounded-full flex items-center justify-center relative z-10 cursor-pointer transition-all duration-300 ${
                isRecording 
                  ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md" 
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
              } border-2 border-slate-850`}
              title={isRecording ? "Selesai Bicara" : "Tekan untuk Bicara"}
            >
              {isRecording ? (
                <MicOff className="w-5 h-5 animate-pulse" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          </div>

          <span className="text-[9px] font-mono tracking-wider font-extrabold mt-2.5 uppercase text-slate-400 select-none">
            {status === "listening" ? "• MENDENGAR..." : 
             status === "processing" ? "• MEMPROSES..." : 
             status === "success" ? "• BERHASIL" : 
             status === "error" ? "• COBA LAGI" : 
             "• TEKAN SPASI UNTUK BICARA"}
          </span>
        </div>

      </div>

      {/* Dynamic Modal for adding / updating stocks */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 max-w-sm w-full rounded-2xl shadow-xl p-6 text-slate-800"
            >
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h4 className="text-sm font-extrabold tracking-wider uppercase text-slate-700">
                  {editingItem ? "Update Detail Menu" : "Tambah Menu & Stok Baru"}
                </h4>
                <button 
                  onClick={() => { setShowAddForm(false); setEditingItem(null); setInventoryFormError(""); }}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {inventoryFormError && (
                <div className="mb-3.5 p-2.5 bg-rose-50 border border-rose-250/50 text-rose-800 font-extrabold font-mono text-[10px] rounded-lg tracking-wide uppercase text-center leading-snug">
                  ⚠ {inventoryFormError}
                </div>
              )}

              <form onSubmit={handleSaveInventoryItem} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-500 mb-1.5 uppercase font-bold tracking-wider text-[10px]">Nama Item</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 placeholder-slate-450 focus:outline-none focus:border-slate-350 font-semibold text-xs"
                    placeholder="e.g. es teh manis"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value.toLowerCase())}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1.5 uppercase font-bold tracking-wider text-[10px]">Kuantitas Stok</label>
                    <input
                      required
                      type="number"
                      min="0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-slate-350 font-mono font-bold text-xs"
                      value={formQty}
                      onChange={(e) => setFormQty(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1.5 uppercase font-bold tracking-wider text-[10px]">Kategori</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-slate-350 font-semibold text-xs"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                    >
                      <option value="makanan">Makanan</option>
                      <option value="minuman">Minuman</option>
                      <option value="bahan">Bahan / Mentah</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1.5 uppercase font-bold tracking-wider text-[10px]">Harga Jual (Rupiah)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="e.g. 15000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-slate-350 font-mono font-bold text-xs"
                    value={formPrice}
                    onChange={(e) => setFormPrice(parseInt(e.target.value, 10) || 0)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-3 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition flex items-center justify-center space-x-1 uppercase tracking-wider text-xs shadow-3xs"
                >
                  <span>Simpan Perubahan</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Modal for adding / updating manual Orders */}
      <AnimatePresence>
        {showOrderForm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 max-w-sm w-full rounded-2xl shadow-xl p-6 text-slate-800"
            >
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h4 className="text-sm font-extrabold tracking-wider uppercase text-slate-700">
                  {editingOrder ? "Update Detail Pesanan" : "Tambah Pesanan Baru"}
                </h4>
                <button 
                  onClick={() => { setShowOrderForm(false); setEditingOrder(null); setOrderFormItems([]); }}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {orderFormError && (
                <div className="mb-3.5 p-2.5 bg-rose-50 border border-rose-250/50 text-rose-800 font-extrabold font-mono text-[10px] rounded-lg tracking-wide uppercase text-center leading-snug">
                  ⚠ {orderFormError}
                </div>
              )}

              <form onSubmit={handleSaveOrder} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-500 mb-1.5 uppercase font-bold tracking-wider text-[10px]">Nomor Meja</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 placeholder-slate-450 focus:outline-none focus:border-slate-350 font-extrabold text-xs"
                    placeholder="e.g. 5, 12, atau bungkus"
                    value={orderFormMeja}
                    onChange={(e) => setOrderFormMeja(e.target.value)}
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2">
                  <span className="block text-slate-500 uppercase font-black tracking-wider text-[9px]">Pilihan Menu & Stok</span>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-slate-350"
                      value={orderFormAddItemName}
                      onChange={(e) => setOrderFormAddItemName(e.target.value)}
                    >
                      <option value="">-- Pilih Menu --</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name.toUpperCase()} ({item.qty} pcs)
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      className="w-12 text-center bg-white border border-slate-200 rounded-lg px-1 py-1.5 text-[11px] font-mono font-bold text-slate-800 focus:outline-none"
                      value={orderFormAddItemQty}
                      onChange={(e) => setOrderFormAddItemQty(parseInt(e.target.value, 10) || 1)}
                    />

                    <button
                      type="button"
                      onClick={addOrderItemToDraf}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition flex items-center justify-center uppercase tracking-wider text-[10px]"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-slate-500 uppercase font-bold tracking-wider text-[10px]">Daftar Item Terpilih</span>
                  
                  <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 border border-slate-150 p-2 rounded-xl bg-slate-50/50 min-h-[50px] flex flex-col justify-start">
                    {orderFormItems.length === 0 ? (
                      <span className="text-[10px] text-slate-400 font-mono text-center block my-auto uppercase font-bold">Belum ada item dipilih</span>
                    ) : (
                      orderFormItems.map((item, index) => (
                        <div key={index} className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-slate-200 shadow-3xs">
                          <span className="text-[11px] font-bold text-slate-700 capitalize truncate max-w-[130px]">{item.name}</span>
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => decrementOrderDrafQty(index)}
                              className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-[10px] font-bold"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-mono font-bold text-slate-800 min-w-4 text-center">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => incrementOrderDrafQty(index)}
                              className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-[10px] font-bold"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOrderItemFromDraf(index)}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded ml-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-3 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition flex items-center justify-center space-x-1 uppercase tracking-wider text-xs shadow-3xs"
                >
                  <span>Simpan Pesanan</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 max-w-xs w-full rounded-2xl shadow-xl p-5 text-slate-800"
            >
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-600 mb-2 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                Konfirmasi Hapus
              </h4>
              <p className="text-xs text-slate-600 font-semibold mb-4 leading-relaxed">
                Apakah bos yakin ingin menghapus <span className="font-extrabold text-slate-900 capitalize font-mono bg-slate-100 px-1 py-0.5 rounded">"{deleteConfirm.label}"</span> dari sistem? Tindakan ini tidak bisa dibatalkan.
              </p>
              <div className="flex gap-2 text-xs font-bold font-sans uppercase tracking-wider text-center">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-xs cursor-pointer"
                >
                  Ya, Hapus!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
