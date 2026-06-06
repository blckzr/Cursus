/**
 * Icon — name-based wrapper around lucide-react.
 * Mirrors the Cursus design's <Icon name="…" /> API so screens port cleanly.
 */
import {
  Users, GraduationCap, BookOpen, Calendar, School, ClipboardList, LayoutGrid,
  BarChart3, Home, Plus, Search, Filter, ChevronLeft, ChevronRight, ChevronDown,
  ArrowRight, ArrowUp, ArrowDown, LogOut, Bell, Check, X, Clock, AlertTriangle,
  Info, TrendingUp, TrendingDown, Award, Pencil, Trash2, Copy, Download, Upload,
  Inbox, Star, MapPin, Building2, Hash, Command, Sparkles, User, UserCheck,
  Flame, RefreshCw, Send, MessageSquare, Shield, PanelLeft, MoreHorizontal, Sun,
  Boxes, Eye, EyeOff, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  users: Users, 'graduation-cap': GraduationCap, 'book-open': BookOpen,
  calendar: Calendar, school: School, 'clipboard-list': ClipboardList,
  'layout-grid': LayoutGrid, 'bar-chart': BarChart3, home: Home, plus: Plus,
  search: Search, filter: Filter, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, 'chevron-down': ChevronDown, 'arrow-right': ArrowRight,
  'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'log-out': LogOut, bell: Bell,
  check: Check, x: X, clock: Clock, 'alert-triangle': AlertTriangle, info: Info,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, award: Award,
  pencil: Pencil, trash: Trash2, copy: Copy, download: Download, upload: Upload,
  inbox: Inbox, star: Star, pin: MapPin, 'map-pin': MapPin, building: Building2,
  hash: Hash, command: Command, sparkles: Sparkles, user: User,
  'user-check': UserCheck, flame: Flame, refresh: RefreshCw, send: Send,
  message: MessageSquare, shield: Shield, panel: PanelLeft, more: MoreHorizontal,
  sun: Sun, boxes: Boxes, eye: Eye, 'eye-off': EyeOff,
};

interface Props {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.75 }: Props) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} />;
}
