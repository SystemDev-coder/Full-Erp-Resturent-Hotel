import rateLimit from 'express-rate-limit'
import { safeRouter } from '../utils/safeRouter'
import { getPublicMenu } from '../controllers/restaurant/modifierController'
import { getPublicHotel, getPublicAvailability, createPublicBooking } from '../controllers/hotel/onlineBookingController'

// No authentication — only data that is meant to be public (the QR digital menu, the online booking page).
export const publicRouter = safeRouter()
publicRouter.get('/menu/:branchId', getPublicMenu)

// Online booking: anyone can look; creating a request is limited per network address so nobody can flood the hotel
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: Math.max(1, Number(process.env.BOOKING_RATE_LIMIT ?? 8)), standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many booking requests from this network — please try again in an hour, or call the hotel.' },
})
publicRouter.get ('/hotel/:branchId',              getPublicHotel)
publicRouter.get ('/hotel/:branchId/availability', getPublicAvailability)
publicRouter.post('/hotel/:branchId/book',         bookingLimiter, createPublicBooking)
