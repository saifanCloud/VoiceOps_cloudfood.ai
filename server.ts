import express, { Request, Response } from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  limit, 
  writeBatch 
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Client DB on the Server
const appInstance = initializeApp(firebaseConfig);
const db = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);

// Firestore Error Handler helper conforming to firebase integration specs
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "Server-Admin",
      email: "server@voiceops.local"
    },
    operationType,
    path
  };
  console.error('Firestore Server Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ----------------------------------------------------
// Seed Inventory if empty so the shop starts with items
// ----------------------------------------------------
async function seedInventoryIfEmpty() {
  try {
    const q = query(collection(db, "inventory"), limit(1));
    const snapshot = await getDocs(q).catch((err: any) => 
      handleFirestoreError(err, OperationType.LIST, "inventory")
    );
    if (snapshot.empty) {
      const seedItems = [
        { name: "ayam bakar", qty: 15, category: "makanan", price: 18000 },
        { name: "es teh manis", qty: 30, category: "minuman", price: 5000 },
        { name: "es batu", qty: 50, category: "bahan", price: 2000 },
        { name: "nasi goreng", qty: 20, category: "makanan", price: 15000 },
        { name: "bakso sapi", qty: 25, category: "makanan", price: 17000 },
        { name: "mie goreng", qty: 18, category: "makanan", price: 13000 },
        { name: "teh tawar", qty: 40, category: "minuman", price: 3000 },
        { name: "ayam goreng", qty: 12, category: "makanan", price: 16000 }
      ];
      const batch = writeBatch(db);
      seedItems.forEach(item => {
        const docRef = doc(collection(db, "inventory"));
        batch.set(docRef, item);
      });
      await batch.commit().catch((err: any) => 
        handleFirestoreError(err, OperationType.WRITE, "inventory/batch_seed")
      );
      console.log("Database inventory successfully seeded with default items.");
    }
  } catch (err) {
    console.error("Failed to seed inventory:", err);
  }
}

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  app.use(express.json());

  // Configure Multer for In-Memory uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
  });

  // Seed default data
  await seedInventoryIfEmpty();

  // ----------------------------------------------------
  // API Endpoints
  // ----------------------------------------------------

  // 1. GET Inventory list
  app.get("/api/inventory", async (req: Request, res: Response) => {
    try {
      const q = query(collection(db, "inventory"), orderBy("name", "asc"));
      const snapshot = await getDocs(q).catch((err: any) => 
        handleFirestoreError(err, OperationType.LIST, "inventory")
      );
      const items: any[] = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Add/Edit Inventory Item manually
  app.post("/api/inventory", async (req: Request, res: Response) => {
    try {
      const { id, name, qty, category, price } = req.body;
      if (!name || qty === undefined || !category) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const cleanName = name.toLowerCase().trim();
      const itemPayload = { 
        name: cleanName, 
        qty: parseInt(qty, 10), 
        category,
        price: price !== undefined ? parseInt(price, 10) : 0
      };

      if (id) {
        const docRef = doc(db, "inventory", id);
        await setDoc(docRef, itemPayload, { merge: true }).catch((err: any) => 
          handleFirestoreError(err, OperationType.WRITE, `inventory/${id}`)
        );
        res.json({ success: true, id });
      } else {
        // Prevent duplicate menu names on insert
        const q = query(
          collection(db, "inventory"),
          where("name", "==", cleanName)
        );
        const querySnapshot = await getDocs(q).catch((err: any) => 
          handleFirestoreError(err, OperationType.LIST, "inventory")
        );
        if (!querySnapshot.empty) {
          return res.status(400).json({ error: "Menu dengan nama ini sudah terdaftar bos!" });
        }

        const docRef = await addDoc(collection(db, "inventory"), itemPayload).catch((err: any) => 
          handleFirestoreError(err, OperationType.CREATE, "inventory")
        );
        res.json({ success: true, id: docRef.id });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Delete Inventory Item
  app.delete("/api/inventory/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const docRef = doc(db, "inventory", id);
      await deleteDoc(docRef).catch((err: any) => 
        handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`)
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. GET Active & Completed Orders
  app.get("/api/orders", async (req: Request, res: Response) => {
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q).catch((err: any) => 
        handleFirestoreError(err, OperationType.LIST, "orders")
      );
      const orders: any[] = [];
      snapshot.forEach(docSnap => {
        orders.push({ id: docSnap.id, ...docSnap.data() });
      });
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 新規追加 API endpoints:
  // 4b. Create a new Order manually
  app.post("/api/orders", async (req: Request, res: Response) => {
    try {
      const { meja, items } = req.body;
      if (!meja || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Meja atau item pesanan tidak boleh kosong!" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "Pilih minimal 1 menu untuk membuat pesanan, bos!" });
      }

      const itemsWithPrices: any[] = [];

      // 1. Subtract quantities from inventory items and grab prices
      for (const ordItem of items) {
        if (!ordItem || !ordItem.name) continue;
        const itemNameClean = ordItem.name.toLowerCase().trim();
        const reqQty = parseInt(ordItem.qty, 10) || 1;

        const q = query(
          collection(db, "inventory"),
          where("name", "==", itemNameClean)
        );
        const querySnapshot = await getDocs(q).catch((err: any) => 
          handleFirestoreError(err, OperationType.LIST, "inventory")
        );

        let itemPrice = 0;
        if (!querySnapshot.empty) {
          const matchedDoc = querySnapshot.docs[0];
          const docRef = matchedDoc.ref;
          const data = matchedDoc.data();
          itemPrice = data.price || 0;
          const currentQty = data.qty || 0;
          const nextQty = Math.max(0, currentQty - reqQty);
          
          await updateDoc(docRef, { qty: nextQty }).catch((err: any) => 
            handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
          );
        }

        itemsWithPrices.push({
          name: itemNameClean,
          qty: reqQty,
          price: itemPrice
        });
      }

      // 2. Create client order
      const orderRef = await addDoc(collection(db, "orders"), {
        meja: meja.trim(),
        items: itemsWithPrices,
        status: "active",
        createdAt: new Date().toISOString()
      }).catch((err: any) => 
        handleFirestoreError(err, OperationType.CREATE, "orders")
      );

      res.json({ success: true, id: orderRef.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4c. Update an Order manually (Edit order)
  app.put("/api/orders/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { meja, items } = req.body;
      if (!meja || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Meja atau item pesanan tidak boleh kosong!" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "Pesanan tidak boleh kosong bos!" });
      }

      const orderRef = doc(db, "orders", id);
      const orderDoc = await getDoc(orderRef).catch((err: any) =>
        handleFirestoreError(err, OperationType.GET, `orders/${id}`)
      );
      if (!orderDoc.exists()) {
        return res.status(404).json({ error: "Pesanan tidak ditemukan!" });
      }

      // Restore old quantities before rewriting (if active)
      const oldStatus = orderDoc.data()?.status || "active";
      if (oldStatus === "active") {
        const oldItems = orderDoc.data()?.items || [];
        for (const oldItem of oldItems) {
          if (!oldItem || !oldItem.name) continue;
          const q = query(
            collection(db, "inventory"),
            where("name", "==", oldItem.name.toLowerCase().trim())
          );
          const querySnapshot = await getDocs(q).catch((err: any) =>
            handleFirestoreError(err, OperationType.LIST, "inventory")
          );
          if (!querySnapshot.empty) {
            const docRef = querySnapshot.docs[0].ref;
            const currentQty = querySnapshot.docs[0].data().qty || 0;
            const oldQty = parseInt(oldItem.qty, 10) || 0;
            await updateDoc(docRef, { qty: currentQty + oldQty }).catch((err: any) =>
              handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
            );
          }
        }
      }

      // Deduct new quantities
      const itemsWithPrices: any[] = [];
      for (const ordItem of items) {
        if (!ordItem || !ordItem.name) continue;
        const itemNameClean = ordItem.name.toLowerCase().trim();
        const reqQty = parseInt(ordItem.qty, 10) || 1;

        const q = query(
          collection(db, "inventory"),
          where("name", "==", itemNameClean)
        );
        const querySnapshot = await getDocs(q).catch((err: any) =>
          handleFirestoreError(err, OperationType.LIST, "inventory")
        );

        let itemPrice = 0;
        if (!querySnapshot.empty) {
          const matchedDoc = querySnapshot.docs[0];
          const docRef = matchedDoc.ref;
          const data = matchedDoc.data();
          itemPrice = data.price || 0;

          // Only deduct live inventory stocks if the order is still "active"
          if (oldStatus === "active") {
            const currentQty = data.qty || 0;
            const nextQty = Math.max(0, currentQty - reqQty);
            await updateDoc(docRef, { qty: nextQty }).catch((err: any) =>
              handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
            );
          }
        }

        itemsWithPrices.push({
          name: itemNameClean,
          qty: reqQty,
          price: itemPrice
        });
      }

      await updateDoc(orderRef, {
        meja: meja.trim(),
        items: itemsWithPrices
      }).catch((err: any) =>
        handleFirestoreError(err, OperationType.WRITE, `orders/${id}`)
      );

      res.json({ success: true, id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Complete an order (toggle status)
  app.post("/api/orders/:id/complete", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orderRef = doc(db, "orders", id);
      const orderDoc = await getDoc(orderRef).catch((err: any) => 
        handleFirestoreError(err, OperationType.GET, `orders/${id}`)
      );
      if (!orderDoc.exists()) {
        return res.status(404).json({ error: "Order not found" });
      }

      const currentStatus = orderDoc.data()?.status;
      const newStatus = currentStatus === "active" ? "completed" : "active";

      await updateDoc(orderRef, { status: newStatus }).catch((err: any) => 
        handleFirestoreError(err, OperationType.WRITE, `orders/${id}`)
      );
      res.json({ success: true, newStatus });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. Delete an order
  app.delete("/api/orders/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orderRef = doc(db, "orders", id);
      
      const orderDoc = await getDoc(orderRef).catch((err: any) =>
        handleFirestoreError(err, OperationType.GET, `orders/${id}`)
      );

      if (orderDoc.exists() && orderDoc.data()?.status === "active") {
        // Restore stock to inventory if active order is deleted
        const oldItems = orderDoc.data()?.items || [];
        for (const oldItem of oldItems) {
          if (!oldItem || !oldItem.name) continue;
          const q = query(
            collection(db, "inventory"),
            where("name", "==", oldItem.name.toLowerCase().trim())
          );
          const querySnapshot = await getDocs(q).catch((err: any) =>
            handleFirestoreError(err, OperationType.LIST, "inventory")
          );
          if (!querySnapshot.empty) {
            const docRef = querySnapshot.docs[0].ref;
            const currentQty = querySnapshot.docs[0].data().qty || 0;
            const oldQty = parseInt(oldItem.qty, 10) || 0;
            await updateDoc(docRef, { qty: currentQty + oldQty }).catch((err: any) =>
              handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
            );
          }
        }
      }

      await deleteDoc(orderRef).catch((err: any) => 
        handleFirestoreError(err, OperationType.DELETE, `orders/${id}`)
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 7. MULTIMODAL VOICE PROCESSOR Endpoint (/api/process-voice)
  app.post("/api/process-voice", upload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file uploaded" });
      }

      // Fetch the latest inventory context to accompany the request
      const qInv = query(collection(db, "inventory"), orderBy("name", "asc"));
      const inventorySnapshot = await getDocs(qInv).catch((err: any) => 
        handleFirestoreError(err, OperationType.LIST, "inventory")
      );
      const inventoryItems: any[] = [];
      inventorySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        inventoryItems.push({ id: docSnap.id, name: data.name, qty: data.qty, category: data.category, price: data.price || 0 });
      });

      // Prepare Audio Part for Gemini
      const audioPart = {
        inlineData: {
          mimeType: req.file.mimetype || "audio/webm",
          data: req.file.buffer.toString("base64")
        }
      };

      // Prompt and Rules for VoiceOps (Sisca)
      const promptText = `
Anda adalah "Sisca", asisten operasional warung kuliner yang super ramah, ceria, gembira, hangat, dan asyik (tidak kaku sama sekali)!
Tugas Anda: memahami rekaman suara pemilik warung lalu memberikan tanggapan suara yang ramah dan ceria.

PENTING - MULTITASKING: 
Pengguna bisa memberikan beberapa instruksi/perintah sekaligus dalam satu ucapan! 
Misalnya: "Sisca, tambah menu sate kambing harga lima belas ribu stok dua puluh, sekalian ada pesanan meja tiga berupa ayam bakar dua, dan update stok es teh manis jadi tiga puluh porsi."
Anda harus mendeteksi SEMUA perintah tersebut secara cerdas, mengklasifikasikannya ke dalam perintah masing-masing, dan mengembalikan array berisi seluruh tindakan tersebut dalam properti "actions".

ATURAN KECEPATAN & KEPADATAN (CRITICAL FOR SPEED!):
- Ucapkan hasil analisis Anda secara singkat dan ceria, dirangkum dalam properti "voice_response" (Maksimal 1-2 kalimat pendek, padat, lugas. Maksimal 18 kata).
- Gunakan bahasa percakapan lisan yang luwes, santai, dan gembira khas asisten warung yang asyik. Mulai dengan kata seru seperti: "Sip bosku!", "Beres bos!", "Yess bos!", "Siap bos!", "Mantap bosku!", "Ok kakk!".
- Hindari basa-basi panjang agar respons diproses sangat cepat.

Berikut adalah daftar menu/inventory toko saat ini:
${JSON.stringify(inventoryItems, null, 2)}

Petunjuk Analisis Perintah Suara:
1. MENCATAT PESANAN (CREATE_ORDER):
   - Jika ada pesanan makanan/minuman (misal: "meja 4 pesen ayam bakar 2, es teh manis 2"), cocokkan item tersebut dengan data di inventory secara pintar.
   - Deteksi nomor meja ("meja 4" -> "4", jika tidak disebut gunakan "Umum").
   - Kembalikan tindakan ber-type "CREATE_ORDER" dengan properti "meja" dan array "items" (berisi name dan qty).

2. CEK STOK ATAU PENGINGAT (CHECK_STOK):
   - Jika bertanya stok (misal: "stok es teh manis sisa berapa?"), periksa data.
   - Kembalikan tindakan ber-type "CHECK_STOK" dengan properti "items" yang ditanyakan.

3. UPDATE STOK ATAU TAMBAH MENU BARU (UPDATE_INVENTORY):
   - Jika ingin menyuplai/update stok (misal: "tambah stok ayam bakar 10" atau "atur stok jus mangga jadi 15") atau MENDAFTARKAN MENU BARU (misal: "tambah menu baru bakso kuah seharga 15000 rupiah dengan stok 20"), kembalikan tindakan ber-type "UPDATE_INVENTORY".
   - Deteksi operasi: "ADD" (tambah), "SET" (atur langsung), atau "SUBTRACT" (kurangi).
   - Ekstrak harga ("price", dalam angka bulat rupiah) dan kategori ("category", yaitu "makanan"/"minuman"/"bahan") jika disebutkan.
   - Tindakan ini juga berlaku untuk UPDATE HARGA saja (misal: "ubah harga nasi goreng jadi dua belas ribu").

PENTING: Selalu kembalikan respon JSON yang valid sesuai schema berikut!
`;

      // Call Gemini 3.5 Flash Multimodal API
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [audioPart, { text: promptText }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              voice_response: {
                type: Type.STRING,
                description: "Balasan ucapan natural bahasa Indonesia yang sangat ramah, ceria, singkat dan padat (maksimal 1-2 kalimat) yang merangkum seluruh kesuksesan tindakan."
              },
              actions: {
                type: Type.ARRAY,
                description: "Daftar seluruh tindakan yang terdeteksi dari perintah pemilik toko.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      enum: ["CREATE_ORDER", "CHECK_STOK", "UPDATE_INVENTORY", "NONE"]
                    },
                    data: {
                      type: Type.OBJECT,
                      properties: {
                        meja: {
                          type: Type.STRING,
                          description: "Nomor meja pesanan (untuk CREATE_ORDER)."
                        },
                        items: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: {
                                type: Type.STRING,
                                description: "Nama item menu."
                              },
                              qty: {
                                type: Type.INTEGER,
                                description: "Jumlah kuantitas."
                              },
                              operation: {
                                type: Type.STRING,
                                enum: ["ADD", "SET", "SUBTRACT"],
                                description: "Operasi stok (untuk UPDATE_INVENTORY)."
                              },
                              price: {
                                type: Type.INTEGER,
                                description: "Harga menu dalam rupiah jika terdaftar baru atau diupdate harganya."
                              },
                              category: {
                                type: Type.STRING,
                                description: "Kategori menu (makanan/minuman/bahan)."
                              }
                            },
                            required: ["name"]
                          }
                        }
                      }
                    }
                  },
                  required: ["type"]
                }
              }
            },
            required: ["voice_response", "actions"]
          }
        }
      });

      const responseText = geminiResponse.text?.trim() || "{}";
      const resultObj = JSON.parse(responseText);

      // ----------------------------------------------------
      // Automatically Modify Database based on Multiple Actions
      // ----------------------------------------------------
      const actionsList = resultObj.actions || [];

      for (const actionItem of actionsList) {
        if (!actionItem) continue;
        
        if (actionItem.type === "CREATE_ORDER" && actionItem.data) {
          const orderData = actionItem.data;
          const items = orderData.items || [];
          const meja = orderData.meja || "Umum";

          if (items.length > 0) {
            const itemsWithPrices: any[] = [];

            // 1. Subtract quantities from inventory items and grab prices
            for (const ordItem of items) {
              if (!ordItem || !ordItem.name) continue;
              const itemNameClean = ordItem.name.toLowerCase().trim();

              const q = query(
                collection(db, "inventory"),
                where("name", "==", itemNameClean)
              );
              const querySnapshot = await getDocs(q).catch((err: any) => 
                handleFirestoreError(err, OperationType.LIST, "inventory")
              );

              let itemPrice = 0;
              if (!querySnapshot.empty) {
                const matchedDoc = querySnapshot.docs[0];
                const docRef = matchedDoc.ref;
                const data = matchedDoc.data();
                itemPrice = data.price || 0;
                const currentQty = data.qty || 0;
                const reqQty = ordItem.qty || 1;
                const nextQty = Math.max(0, currentQty - reqQty);
                
                await updateDoc(docRef, { qty: nextQty }).catch((err: any) => 
                  handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
                );
              }

              itemsWithPrices.push({
                name: itemNameClean,
                qty: ordItem.qty || 1,
                price: itemPrice
              });
            }

            // 2. Create client order with historical pricing populated
            if (itemsWithPrices.length > 0) {
              await addDoc(collection(db, "orders"), {
                meja: meja,
                items: itemsWithPrices,
                status: "active",
                createdAt: new Date().toISOString()
              }).catch((err: any) => 
                handleFirestoreError(err, OperationType.CREATE, "orders")
              );
            }
          }
        } else if (actionItem.type === "UPDATE_INVENTORY" && actionItem.data) {
          const items = actionItem.data.items || [];

          for (const item of items) {
            if (!item || !item.name) continue;
            const itemNameClean = item.name.toLowerCase().trim();

            const q = query(
              collection(db, "inventory"),
              where("name", "==", itemNameClean)
            );
            const querySnapshot = await getDocs(q).catch((err: any) => 
              handleFirestoreError(err, OperationType.LIST, "inventory")
            );

            if (!querySnapshot.empty) {
              const matchedDoc = querySnapshot.docs[0];
              const docRef = matchedDoc.ref;
              const data = matchedDoc.data();
              const currentQty = data.qty || 0;
              const inputQty = item.qty !== undefined ? item.qty : 0;
              let nextQty = currentQty;

              if (item.operation === "SET") {
                nextQty = inputQty;
              } else if (item.operation === "SUBTRACT") {
                nextQty = Math.max(0, currentQty - inputQty);
              } else { // default to ADD
                nextQty = currentQty + inputQty;
              }

              const updatePayload: any = { qty: nextQty };
              if (item.price !== undefined && item.price > 0) {
                updatePayload.price = item.price;
              }
              if (item.category) {
                updatePayload.category = item.category;
              }

              await updateDoc(docRef, updatePayload).catch((err: any) => 
                handleFirestoreError(err, OperationType.WRITE, `inventory/${docRef.id}`)
              );
            } else {
              // Logically create new if it does not exist
              const newPrice = item.price !== undefined && item.price > 0 ? item.price : 10000;
              const newCategory = item.category || "makanan";
              const inputQty = item.qty !== undefined ? item.qty : 0;

              await addDoc(collection(db, "inventory"), {
                name: itemNameClean,
                qty: inputQty,
                category: newCategory,
                price: newPrice
              }).catch((err: any) => 
                handleFirestoreError(err, OperationType.CREATE, "inventory")
              );
            }
          }
        }
      }

      // Maintain backward-compatibility inside response JSON
      const firstAction = actionsList.find((a: any) => a && a.type);
      resultObj.action = firstAction ? firstAction.type : "NONE";
      resultObj.data = firstAction ? firstAction.data : null;

      // Return voice response + raw results to frontend
      res.json(resultObj);

    } catch (err: any) {
      console.error("Error processing voice session:", err);
      res.status(500).json({ error: err.message || "Gagal memproses audio perintah bos." });
    }
  });

  // Global Express JSON Error Handler for api routes to bypass Express' default HTML responder
  app.use("/api", (err: any, req: Request, res: Response, next: any) => {
    console.error("EXPRESS GLOBAL VOICE/API ROUTE ERROR ACTION:", err);
    res.status(500).json({ error: err.message || "Kesalahan internal pada server voice." });
  });

  // ----------------------------------------------------
  // Mount Vite middleware for Assets & SPA serving
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VoiceOps listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
