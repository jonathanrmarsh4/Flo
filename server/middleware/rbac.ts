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
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = req.user as User;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }
  
  return next();
}
