import type { Role } from '@/lib/auth';
import {
  ActivityIcon,
  ArrearsIcon,
  CostsIcon,
  HomeIcon,
  MenuIcon,
  MessagesIcon,
  OrdersIcon,
  PlusIcon,
  ReportsIcon,
  ShiftsIcon,
  StaffIcon,
} from './icons';

export interface NavEntry {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  roles: Role[];
  primary: boolean;
}

export const NAV_ITEMS: NavEntry[] = [
  { href: '/app', label: 'Home', icon: HomeIcon, roles: ['owner', 'counter'], primary: true },
  { href: '/app/orders/new', label: 'New', icon: PlusIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/orders', label: 'Orders', icon: OrdersIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/arrears', label: 'Owing', icon: ArrearsIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/menu', label: 'Menu', icon: MenuIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/activity', label: 'Activity', icon: ActivityIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/costs', label: 'Costs', icon: CostsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/reports', label: 'Reports', icon: ReportsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/messages', label: 'Messages', icon: MessagesIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/shifts', label: 'Shifts', icon: ShiftsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/staff', label: 'Staff', icon: StaffIcon, roles: ['owner'], primary: false },
];

export function primaryTabs(role: Role): NavEntry[] {
  return NAV_ITEMS.filter((item) => item.primary && item.roles.includes(role));
}

export function secondaryItems(role: Role): NavEntry[] {
  return NAV_ITEMS.filter((item) => !item.primary && item.roles.includes(role));
}

export function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname === href || pathname.startsWith(`${href}/`);
}
