import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { enforceModulePermission, enforceSubmodulePermission } from '../middleware/permissions'
import {
  listBookings, getBooking, createBooking,
  updateBooking, deleteBooking,
  checkIn, checkOut, cancelBooking, transferRoom, exchangeRooms,
} from '../controllers/hotel/bookingController'
import {
  listRooms, getRoom, createRoom, updateRoom, deleteRoom, updateRoomStatus,
} from '../controllers/hotel/roomController'
import {
  listGuests, getGuest, createGuest, updateGuest, deleteGuest,
} from '../controllers/hotel/guestController'
import {
  listHKTasks, createHKTask, updateHKTask, deleteHKTask, assignHKTask, updateHKStatus,
} from '../controllers/hotel/housekeepingController'
import {
  listRoomTypes, createRoomType, updateRoomType,
  listRatePlans, createRatePlan, updateRatePlan,
  listBookingServices, addBookingService,
  listLoyaltyTransactions, addLoyaltyPoints,
  listAvailableRooms,
} from '../controllers/hotel/roomTypeController'

export const hotelRouter = Router()
hotelRouter.use(requireAuth)
hotelRouter.use(enforceModulePermission('hotel'))

// Sub-page gates — layered on top of the module-level check above, one per
// nav item (Bookings / Rooms / Guests / Housekeeping); room-types & rate-plans
// are configuration for the Rooms page so they share its 'rooms' gate.
hotelRouter.use('/room-types', enforceSubmodulePermission('hotel', 'rooms'))
hotelRouter.use('/rate-plans', enforceSubmodulePermission('hotel', 'rooms'))
hotelRouter.use('/rooms',      enforceSubmodulePermission('hotel', 'rooms'))
hotelRouter.use('/bookings',   enforceSubmodulePermission('hotel', 'bookings'))
hotelRouter.use('/guests',     enforceSubmodulePermission('hotel', 'guests'))
hotelRouter.use('/housekeeping', enforceSubmodulePermission('hotel', 'housekeeping'))

// ── Room Types ────────────────────────────────────────────────────────────────
hotelRouter.get   ('/room-types',       listRoomTypes)
hotelRouter.post  ('/room-types',       createRoomType)
hotelRouter.put   ('/room-types/:id',   updateRoomType)

// ── Rate Plans ────────────────────────────────────────────────────────────────
hotelRouter.get   ('/rate-plans',       listRatePlans)
hotelRouter.post  ('/rate-plans',       createRatePlan)
hotelRouter.put   ('/rate-plans/:id',   updateRatePlan)

// ── Available Rooms ───────────────────────────────────────────────────────────
hotelRouter.get   ('/rooms/available',  listAvailableRooms)

// ── Rooms ─────────────────────────────────────────────────────────────────────
hotelRouter.get   ('/rooms',              listRooms)
hotelRouter.post  ('/rooms',              createRoom)
hotelRouter.get   ('/rooms/:id',          getRoom)
hotelRouter.put   ('/rooms/:id',          updateRoom)
hotelRouter.delete('/rooms/:id',          deleteRoom)
hotelRouter.patch ('/rooms/:id/status',   updateRoomStatus)

// ── Bookings ──────────────────────────────────────────────────────────────────
hotelRouter.get   ('/bookings',                    listBookings)
hotelRouter.get   ('/bookings/:id',                getBooking)
hotelRouter.post  ('/bookings',                    createBooking)
hotelRouter.put   ('/bookings/:id',                updateBooking)
hotelRouter.delete('/bookings/:id',                deleteBooking)
hotelRouter.patch ('/bookings/:id/checkin',        checkIn)
hotelRouter.patch ('/bookings/:id/checkout',       checkOut)
hotelRouter.patch ('/bookings/:id/cancel',         cancelBooking)
hotelRouter.patch ('/bookings/:id/transfer',       transferRoom)
hotelRouter.patch ('/bookings/:id/exchange',       exchangeRooms)
hotelRouter.get   ('/bookings/:id/services',       listBookingServices)
hotelRouter.post  ('/bookings/:id/services',       addBookingService)

// ── Guests ────────────────────────────────────────────────────────────────────
hotelRouter.get  ('/guests',                       listGuests)
hotelRouter.get  ('/guests/:id',                   getGuest)
hotelRouter.post ('/guests',                       createGuest)
hotelRouter.put  ('/guests/:id',                   updateGuest)
hotelRouter.delete('/guests/:id',                  deleteGuest)
hotelRouter.get  ('/guests/:guestId/loyalty',      listLoyaltyTransactions)
hotelRouter.post ('/guests/:guestId/loyalty',      addLoyaltyPoints)

// ── Housekeeping ──────────────────────────────────────────────────────────────
hotelRouter.get   ('/housekeeping',            listHKTasks)
hotelRouter.post  ('/housekeeping',            createHKTask)
hotelRouter.put   ('/housekeeping/:id',        updateHKTask)
hotelRouter.delete('/housekeeping/:id',        deleteHKTask)
hotelRouter.patch ('/housekeeping/:id/assign', assignHKTask)
hotelRouter.patch ('/housekeeping/:id/status', updateHKStatus)
