import { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

declare global {
  namespace Express {
    interface User {
      role?: string;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Works with both session auth and JWT auth
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = req.user as User;
  if (!user || user.role === undefined || user.role === null) {
    return res.status(403).json({ error: 'Forbidden - Invalid user role' });
  }
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }
  
  return next();
}
