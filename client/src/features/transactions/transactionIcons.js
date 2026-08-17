/**
 * Named imports, never `import * as LucideIcons`.
 *
 * The namespace import defeats tree-shaking completely: it pulled every icon in
 * the library — roughly 1,500 components — into the dashboard bundle, which
 * accounted for over 500 kB of the shipped JavaScript on the app's most visited
 * page.
 *
 * The set below is exactly the icons the AI categoriser is prompted to emit,
 * plus the ones the backend hardcodes for transfers, top-ups and refunds.
 */
import {
    CircleDollarSign, ShoppingBag, ShoppingCart, Utensils, Plane, Home, Receipt,
    Wifi, HeartPulse, User, PiggyBank, Briefcase, GraduationCap, Shield, Tv,
    Send, Download, Wallet, RefreshCcw, Gift, BookOpen, Car, Zap,
} from 'lucide-react';

const ICONS = {
    CircleDollarSign, ShoppingBag, ShoppingCart, Utensils, Plane, Home, Receipt,
    Wifi, HeartPulse, User, PiggyBank, Briefcase, GraduationCap, Shield, Tv,
    Send, Download, Wallet, RefreshCcw, Gift, BookOpen, Car, Zap,
};

/** Falls back to a generic money icon for anything unrecognised. */
export const getTransactionIcon = (name) => ICONS[name] ?? CircleDollarSign;

export default ICONS;
