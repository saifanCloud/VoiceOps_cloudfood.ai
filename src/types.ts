export interface InventoryItem {
  id?: string;
  name: string;
  qty: number;
  price: number;
  category: string;
}

export interface OrderItem {
  name: string;
  qty: number;
}

export interface Order {
  id?: string;
  meja: string;
  items: OrderItem[];
  status: 'active' | 'completed';
  createdAt: string;
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error';
