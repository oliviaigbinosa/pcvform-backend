import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'

export const authenticateToken = (req, res, next) => {
  try {
    // First try to get token from httpOnly cookie
    const token = req.cookies?.auth_token

    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          // If token is invalid, fall back to header-based auth for backward compatibility
          return fallbackToHeaderAuth(req, res, next)
        }
        req.user = user
        next()
      })
    } else {
      // No cookie found, try Authorization header
      const authHeader = req.headers['authorization']
      const headerToken = authHeader && authHeader.split(' ')[1] // Bearer TOKEN format

      if (headerToken) {
        jwt.verify(headerToken, JWT_SECRET, (err, user) => {
          if (err) {
            // If token is invalid, fall back to header-based auth for backward compatibility
            return fallbackToHeaderAuth(req, res, next)
          }
          req.user = user
          next()
        })
      } else {
        // No token found, fall back to header-based auth for backward compatibility
        fallbackToHeaderAuth(req, res, next)
      }
    }
  } catch (error) {
    // If JWT verification fails, fall back to header-based auth
    fallbackToHeaderAuth(req, res, next)
  }
}

// Fallback to header-based authentication for backward compatibility
function fallbackToHeaderAuth(req, res, next) {
  const email = String(req.headers['x-user-email'] || req.headers['x-admin-email'] || '').trim().toLowerCase()
  if (email) {
    req.user = { email }
  }
  next()
}

export const generateToken = (user) => {
  return jwt.sign(
    { 
      email: user.email, 
      role: user.role,
      department: user.department || '',
      createdBy: user.createdBy || ''
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
}

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}