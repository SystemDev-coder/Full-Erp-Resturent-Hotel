// ─── Shared ──────────────────────────────────────────────────────────────────

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type OrderStatus   = 'open' | 'preparing' | 'ready' | 'served' | 'billed' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'bank_transfer'

// ─── Hotel ───────────────────────────────────────────────────────────────────

export interface RoomType {
  id: string
  name: string
  max_adults: number
  max_children: number
  bed_configuration: string
}

export interface Room {
  id: string
  room_number: string
  floor: number
  status: 'available' | 'occupied' | 'maintenance' | 'out_of_order' | 'cleaning'
  room_type: RoomType
}

export interface Guest {
  id: string
  full_name: string
  email?: string
  phone?: string
  nationality?: string
  id_type?: string
  id_number?: string
  loyalty_tier: 'standard' | 'silver' | 'gold' | 'platinum'
  loyalty_points: number
}

export interface Booking {
  id: string
  booking_ref: string
  room: Room
  primary_guest: Guest
  check_in_date: string
  check_out_date: string
  num_nights: number
  num_adults: number
  num_children: number
  rate_per_night: number
  total_amount: number
  discount_amount: number
  status: BookingStatus
  source: 'direct' | 'walk_in' | 'phone' | 'online' | 'ota' | 'agent'
  breakfast_included: boolean
  created_at: string
}

export interface HousekeepingTask {
  id: string
  room_number: string
  task_type: 'checkout_clean' | 'stayover_clean' | 'turndown' | 'inspection' | 'deep_clean'
  status: 'pending' | 'in_progress' | 'completed' | 'inspected' | 'skipped'
  assigned_to?: string
  scheduled_for: string
}

// ─── Restaurant ───────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string
  name: string
  display_order: number
}

export interface MenuItem {
  id: string
  name: string
  description?: string
  image_url?: string
  price: number
  cost_price: number
  item_type: 'food' | 'beverage' | 'combo' | 'addon'
  is_available: boolean
  category: MenuCategory
}

export interface DiningTable {
  id: string
  table_number: string
  capacity: number
  status: 'available' | 'reserved' | 'occupied' | 'cleaning' | 'inactive'
  area_name: string
}

export interface OrderLine {
  id: string
  item_name_snap: string
  quantity: number
  unit_price: number
  line_total: number
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled'
}

export interface Order {
  id: string
  order_ref: string
  table_number?: string
  order_type: 'dine_in' | 'takeaway' | 'delivery' | 'room_service'
  status: OrderStatus
  subtotal: number
  discount_amount: number
  tax_amount: number
  service_charge: number
  total_amount: number
  lines: OrderLine[]
  opened_at: string
  closed_at?: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface StockItem {
  id: string
  sku: string
  name: string
  category: string
  unit_of_measure: string
  quantity_on_hand: number
  reorder_level: number
  average_cost: number
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_name: string
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  order_date: string
  total_amount: number
}

// ─── Accounting ───────────────────────────────────────────────────────────────

export interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  guest_name?: string
  total_amount: number
  amount_paid: number
  amount_due: number
  status: 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'voided' | 'refunded'
}

export interface Transaction {
  id: string
  description: string
  transaction_type: string
  direction: 'in' | 'out'
  amount: number
  account_name: string
  transaction_date: string
  status: 'pending' | 'completed' | 'failed' | 'voided'
}

// ─── HR ──────────────────────────────────────────────────────────────────────

export interface Staff {
  id: string
  employee_id: string
  full_name: string
  email?: string
  phone?: string
  role: string
  department_name?: string
  employment_type: 'full_time' | 'part_time' | 'contract' | 'intern'
  basic_salary: number
  joined_at: string
  is_active: boolean
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface StatCard {
  label: string
  value: string
  change: number       // positive = up, negative = down
  changeLabel: string
  icon: string
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'
}

export interface RevenueDataPoint {
  date: string
  hotel: number
  restaurant: number
}

export interface OccupancyData {
  name: string
  value: number
  color: string
}