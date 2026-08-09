// ─── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string
  name: string
  emoji: string
  description: string
  sortOrder: number
}

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  description: string
  price: number
  cost: number
  image: string
  available: boolean
  preparationTime: number
  isPopular: boolean
  tags: string[]
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderType     = 'dine_in' | 'takeaway' | 'delivery' | 'room_charge'
export type OrderStatus   = 'open' | 'sent_to_kitchen' | 'ready' | 'held' | 'billed' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'room_charge' | 'split' | 'complimentary'

export interface OrderItem {
  id: string
  menuItemId: string
  categoryId: string
  name: string
  price: number
  cost: number
  quantity: number
  notes: string
  status: 'pending' | 'preparing' | 'ready' | 'served'
}

export interface TableOrder {
  id: string
  orderNumber: number
  tableId: string
  tableNumber: string
  type: OrderType
  status: OrderStatus
  items: OrderItem[]
  subtotal: number
  discountPct: number
  taxPct: number
  taxAmt: number
  total: number
  notes: string
  waiterName: string
  createdAt: string
  sentToKitchenAt?: string
  heldAt?: string
  billedAt?: string
  paidAt?: string
  // Room charge — ready for backend integration
  guestId?: string
  guestName?: string
  roomNumber?: string
  bookingId?: string
  // Payment
  paymentMethod?: PaymentMethod
  amountPaid?: number
  change?: number
}

// ─── Booking Payment Responsibility ───────────────────────────────────────────

export type PaymentResponsibility = 'guest' | 'company' | 'complimentary'

export interface CompanyBilling {
  companyName: string
  contactPerson: string
  phone: string
  email: string
  taxId: string
  address: string
}

/*
 * ─── DB Schema Notes ────────────────────────────────────────────────────────
 *
 * These types map to future backend tables:
 *
 * menu_categories (id PK, org_id FK, name, emoji, description, sort_order, active)
 * menu_items      (id PK, org_id FK, category_id FK, branch_id FK,
 *                  name, description, price, cost, image_url, available,
 *                  preparation_time, is_popular, tags jsonb, created_at, updated_at)
 *
 * restaurant_orders (id PK, order_number, table_id FK, branch_id FK,
 *                    type, status, notes, waiter_id FK,
 *                    subtotal, discount_pct, tax_pct, tax_amt, total,
 *                    guest_id FK nullable, room_number nullable, booking_id FK nullable,
 *                    payment_method, amount_paid, change_amount,
 *                    created_at, sent_to_kitchen_at, held_at, billed_at, paid_at)
 *
 * order_items (id PK, order_id FK, menu_item_id FK, name_snapshot,
 *              price_snapshot, cost_snapshot, quantity, notes, status,
 *              created_at, updated_at)
 *
 * Charge-to-room integration:
 *   restaurant_orders.guest_id → hotel_guests.id
 *   restaurant_orders.booking_id → hotel_bookings.id
 *   → triggers a room_charges record on payment
 *
 * Booking payment responsibility:
 *   hotel_bookings ADD COLUMNS:
 *     payment_responsibility ENUM('guest','company','complimentary')
 *     company_name, company_contact, company_phone, company_email,
 *     company_tax_id, company_address
 */