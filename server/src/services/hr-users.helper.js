/** Re-exports the auth helpers used by the admin user routes. */
export {
  createUser, updatePassword, findUserById, publicUser,
} from '../services/auth.service.js';

const digits = () => String(Math.floor(100000 + Math.random() * 900000));
export const generateTempPasswordClient = () => `Hcm@${digits()}`;
