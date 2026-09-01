import express from 'express'
import rateLimit from 'express-rate-limit'
import { body, validationResult } from 'express-validator'
import { getMe, login, changePassword, forgotPassword, resetPassword } from '../controllers/authController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Rate limiting for login endpoint to prevent brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for forgot password endpoint (2 attempts per hour)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2, // Limit each IP to 2 forgot password requests per hour
  message: { error: 'Too many password reset attempts. Try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for reset password endpoint (5 attempts per 15 minutes)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 reset password requests per 15 minutes
  message: { error: 'Too many reset attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }
    next()
  }
]

const validateForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }
    next()
  }
]

const validateResetPassword = [
  body('token').isString().withMessage('Token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match')
    }
    return true
  }),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }
    next()
  }
]

const validateChangePassword = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }
    next()
  }
]

router.post('/login', validateLogin, loginLimiter, login)
router.post('/change-password', validateChangePassword, authenticateToken, changePassword)
router.post('/forgot-password', validateForgotPassword, forgotPasswordLimiter, forgotPassword)
router.post('/reset-password', validateResetPassword, resetPasswordLimiter, resetPassword)
router.get('/me', authenticateToken, getMe)

export default router
