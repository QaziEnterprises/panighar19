// Full Database type definitions for the Panighar/Qazi Enterprises app

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: { id: string; user_id: string | null; user_email: string | null; action: string; entity_type: string; entity_id: string | null; description: string | null; details: any; created_at: string }
        Insert: { id?: string; user_id?: string | null; user_email?: string | null; action: string; entity_type: string; entity_id?: string | null; description?: string | null; details?: any; created_at?: string }
        Update: { id?: string; user_id?: string | null; user_email?: string | null; action?: string; entity_type?: string; entity_id?: string | null; description?: string | null; details?: any; created_at?: string }
        Relationships: []
      }
      backup_history: {
        Row: { id: string; user_id: string; file_name: string; file_id: string | null; status: string; type: string; error_message: string | null; created_at: string }
        Insert: { id?: string; user_id: string; file_name: string; file_id?: string | null; status?: string; type?: string; error_message?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; file_name?: string; file_id?: string | null; status?: string; type?: string; error_message?: string | null; created_at?: string }
        Relationships: []
      }
      cash_register: {
        Row: { id: string; date: string; opening_balance: number; cash_in: number; cash_out: number; expected_balance: number; actual_balance: number | null; discrepancy: number | null; notes: string | null; status: string; opened_by: string | null; closed_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; date?: string; opening_balance?: number; cash_in?: number; cash_out?: number; expected_balance?: number; actual_balance?: number | null; discrepancy?: number | null; notes?: string | null; status?: string; opened_by?: string | null; closed_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; date?: string; opening_balance?: number; cash_in?: number; cash_out?: number; expected_balance?: number; actual_balance?: number | null; discrepancy?: number | null; notes?: string | null; status?: string; opened_by?: string | null; closed_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      contacts: {
        Row: { id: string; type: string; name: string; phone: string | null; email: string | null; address: string | null; city: string | null; opening_balance: number | null; current_balance: number | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; type: string; name: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; opening_balance?: number | null; current_balance?: number | null; notes?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; type?: string; name?: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; opening_balance?: number | null; current_balance?: number | null; notes?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      daily_summaries: {
        Row: { id: string; date: string; total_sales: number | null; total_purchases: number | null; total_expenses: number | null; net_profit: number | null; sales_count: number | null; purchases_count: number | null; expenses_count: number | null; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; date: string; total_sales?: number | null; total_purchases?: number | null; total_expenses?: number | null; net_profit?: number | null; sales_count?: number | null; purchases_count?: number | null; expenses_count?: number | null; created_at?: string | null; updated_at?: string | null }
        Update: { id?: string; date?: string; total_sales?: number | null; total_purchases?: number | null; total_expenses?: number | null; net_profit?: number | null; sales_count?: number | null; purchases_count?: number | null; expenses_count?: number | null; created_at?: string | null; updated_at?: string | null }
        Relationships: []
      }
      expense_categories: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: { id?: string; name?: string; created_at?: string }
        Relationships: []
      }
      expenses: {
        Row: { id: string; category_id: string | null; amount: number; date: string; description: string | null; payment_method: string | null; reference_no: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; category_id?: string | null; amount: number; date?: string; description?: string | null; payment_method?: string | null; reference_no?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; category_id?: string | null; amount?: number; date?: string; description?: string | null; payment_method?: string | null; reference_no?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      google_drive_tokens: {
        Row: { id: string; user_id: string; access_token: string; refresh_token: string; expiry_date: number; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; access_token: string; refresh_token: string; expiry_date: number; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; access_token?: string; refresh_token?: string; expiry_date?: number; created_at?: string; updated_at?: string }
        Relationships: []
      }
      ledger_entries: {
        Row: { id: string; contact_id: string; date: string; description: string; debit: number | null; credit: number | null; balance: number | null; reference_type: string | null; reference_id: string | null; created_at: string }
        Insert: { id?: string; contact_id: string; date?: string; description: string; debit?: number | null; credit?: number | null; balance?: number | null; reference_type?: string | null; reference_id?: string | null; created_at?: string }
        Update: { id?: string; contact_id?: string; date?: string; description?: string; debit?: number | null; credit?: number | null; balance?: number | null; reference_type?: string | null; reference_id?: string | null; created_at?: string }
        Relationships: []
      }
      login_attempts: {
        Row: { id: string; identifier: string; attempted_at: string }
        Insert: { id?: string; identifier: string; attempted_at?: string }
        Update: { id?: string; identifier?: string; attempted_at?: string }
        Relationships: []
      }
      price_list_items: {
        Row: { id: string; price_list_id: string; product_id: string; custom_price: number; created_at: string }
        Insert: { id?: string; price_list_id: string; product_id: string; custom_price?: number; created_at?: string }
        Update: { id?: string; price_list_id?: string; product_id?: string; custom_price?: number; created_at?: string }
        Relationships: []
      }
      price_lists: {
        Row: { id: string; name: string; description: string | null; is_default: boolean | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; description?: string | null; is_default?: boolean | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; description?: string | null; is_default?: boolean | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      product_categories: {
        Row: { id: string; name: string; description: string | null; created_at: string }
        Insert: { id?: string; name: string; description?: string | null; created_at?: string }
        Update: { id?: string; name?: string; description?: string | null; created_at?: string }
        Relationships: []
      }
      products: {
        Row: { id: string; name: string; sku: string | null; category_id: string | null; purchase_price: number | null; selling_price: number | null; quantity: number | null; unit: string | null; alert_threshold: number | null; brand: string | null; description: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; sku?: string | null; category_id?: string | null; purchase_price?: number | null; selling_price?: number | null; quantity?: number | null; unit?: string | null; alert_threshold?: number | null; brand?: string | null; description?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; sku?: string | null; category_id?: string | null; purchase_price?: number | null; selling_price?: number | null; quantity?: number | null; unit?: string | null; alert_threshold?: number | null; brand?: string | null; description?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { id: string; user_id: string; email: string; display_name: string | null; created_at: string }
        Insert: { id?: string; user_id: string; email: string; display_name?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; email?: string; display_name?: string | null; created_at?: string }
        Relationships: []
      }
      purchase_items: {
        Row: { id: string; purchase_id: string; product_id: string | null; quantity: number; unit_price: number; subtotal: number }
        Insert: { id?: string; purchase_id: string; product_id?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Update: { id?: string; purchase_id?: string; product_id?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Relationships: []
      }
      purchases: {
        Row: { id: string; supplier_id: string | null; date: string; reference_no: string | null; total: number | null; discount: number | null; payment_status: string | null; payment_method: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; supplier_id?: string | null; date?: string; reference_no?: string | null; total?: number | null; discount?: number | null; payment_status?: string | null; payment_method?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; supplier_id?: string | null; date?: string; reference_no?: string | null; total?: number | null; discount?: number | null; payment_status?: string | null; payment_method?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      receivable_payments: {
        Row: { id: string; sale_id: string; amount: number; payment_method: string | null; date: string; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; sale_id: string; amount: number; payment_method?: string | null; date?: string; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; sale_id?: string; amount?: number; payment_method?: string | null; date?: string; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      sale_items: {
        Row: { id: string; sale_id: string; product_id: string | null; product_name: string | null; quantity: number; unit_price: number; subtotal: number }
        Insert: { id?: string; sale_id: string; product_id?: string | null; product_name?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Update: { id?: string; sale_id?: string; product_id?: string | null; product_name?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Relationships: []
      }
      sale_transactions: {
        Row: { id: string; customer_id: string | null; date: string; invoice_no: string | null; subtotal: number | null; discount: number | null; total: number | null; paid_amount: number | null; payment_method: string | null; payment_status: string | null; customer_type: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; customer_id?: string | null; date?: string; invoice_no?: string | null; subtotal?: number | null; discount?: number | null; total?: number | null; paid_amount?: number | null; payment_method?: string | null; payment_status?: string | null; customer_type?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; customer_id?: string | null; date?: string; invoice_no?: string | null; subtotal?: number | null; discount?: number | null; total?: number | null; paid_amount?: number | null; payment_method?: string | null; payment_status?: string | null; customer_type?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      todos: {
        Row: { id: string; title: string; completed: boolean; priority: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; title: string; completed?: boolean; priority?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; title?: string; completed?: boolean; priority?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      user_roles: {
        Row: { id: string; user_id: string; role: 'admin' | 'user'; created_at: string }
        Insert: { id?: string; user_id: string; role?: 'admin' | 'user'; created_at?: string }
        Update: { id?: string; user_id?: string; role?: 'admin' | 'user'; created_at?: string }
        Relationships: []
      }
      returns: {
        Row: { id: string; sale_id: string | null; date: string; total_refund: number; refund_method: string | null; reason: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; sale_id?: string | null; date?: string; total_refund?: number; refund_method?: string | null; reason?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; sale_id?: string | null; date?: string; total_refund?: number; refund_method?: string | null; reason?: string | null; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      return_items: {
        Row: { id: string; return_id: string; product_id: string | null; product_name: string | null; quantity: number; unit_price: number; subtotal: number }
        Insert: { id?: string; return_id: string; product_id?: string | null; product_name?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Update: { id?: string; return_id?: string; product_id?: string | null; product_name?: string | null; quantity?: number; unit_price?: number; subtotal?: number }
        Relationships: []
      }
      notifications: {
        Row: { id: string; user_id: string; title: string; message: string | null; type: string; is_read: boolean; link: string | null; created_at: string }
        Insert: { id?: string; user_id: string; title: string; message?: string | null; type?: string; is_read?: boolean; link?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; title?: string; message?: string | null; type?: string; is_read?: boolean; link?: string | null; created_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: 'admin' | 'user' }
        Returns: boolean
      }
    }
    Enums: {
      app_role: 'admin' | 'user'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
