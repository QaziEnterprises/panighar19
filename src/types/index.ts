export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  alertThreshold?: number;
  createdAt: string;
}

export interface Receivable {
  id: string;
  sno: number;
  partyName: string;
  date: string;
  refNo: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SaleEntry {
  id: string;
  date: string;
  customerName: string;
  billNo: string;
  cash: number;
  jc: number;
  ep: number;
  bt: number;
  notPaid: number;
}
