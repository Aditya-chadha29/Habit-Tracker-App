import {
  Activity, Archive, ArrowDownRight, ArrowRight, ArrowUpRight, Bed, BookOpen, Bookmark, Brain,
  Calendar, ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle,
  CircleAlert, CircleCheck, CirclePlay, ClipboardCheck, Clock, Copy, Database, Download, Droplet,
  Dumbbell, Ellipsis, ExternalLink, FileText, Flame, FlaskConical, Flower2, Footprints,
  GraduationCap, GripVertical, Headphones, HeartPulse, History, House, Inbox, Info, LayoutGrid,
  Library, Lightbulb, ListChecks, ListOrdered, Lock, Minus, Moon, Newspaper, NotebookPen, Pause,
  PenLine, Pencil, Pill, Play, Plus, Quote, RotateCcw, Scale, Search, Settings, Shield,
  SlidersHorizontal, Sparkles, Star, Sunrise, Target, Timer, Trash2, TrendingUp, TriangleAlert,
  Upload, User, Utensils, Video, X, Zap, type LucideIcon,
} from 'lucide-react'

/**
 * Every icon the app uses, by a short name. Habits store one of these names, so the set is a
 * stable vocabulary rather than "whatever the icon library exports this year" — and only the
 * icons listed here end up in the bundle.
 */
export const ICONS = {
  // navigation
  home: House,
  learn: BookOpen,
  train: Dumbbell,
  review: ClipboardCheck,
  progress: TrendingUp,
  habits: ListChecks,
  routines: ListOrdered,
  journal: NotebookPen,
  quotes: Quote,
  data: Database,
  settings: Settings,
  menu: LayoutGrid,
  // habit vocabulary
  sunrise: Sunrise,
  droplet: Droplet,
  pill: Pill,
  flower: Flower2,
  flame: Flame,
  book: BookOpen,
  pen: PenLine,
  graduation: GraduationCap,
  sparkles: Sparkles,
  utensils: Utensils,
  moon: Moon,
  bed: Bed,
  shield: Shield,
  dumbbell: Dumbbell,
  footprints: Footprints,
  activity: Activity,
  brain: Brain,
  heart: HeartPulse,
  scale: Scale,
  zap: Zap,
  target: Target,
  // learning
  video: Video,
  article: Newspaper,
  file: FileText,
  podcast: Headphones,
  flask: FlaskConical,
  idea: Lightbulb,
  inbox: Inbox,
  library: Library,
  bookmark: Bookmark,
  // actions and states
  check: Check,
  plus: Plus,
  minus: Minus,
  close: X,
  more: Ellipsis,
  edit: Pencil,
  trash: Trash2,
  archive: Archive,
  search: Search,
  star: Star,
  grip: GripVertical,
  copy: Copy,
  external: ExternalLink,
  download: Download,
  upload: Upload,
  undo: RotateCcw,
  lock: Lock,
  info: Info,
  alert: TriangleAlert,
  'alert-circle': CircleAlert,
  clock: Clock,
  timer: Timer,
  calendar: Calendar,
  history: History,
  chart: ChartLine,
  sliders: SlidersHorizontal,
  user: User,
  play: Play,
  'play-circle': CirclePlay,
  pause: Pause,
  circle: Circle,
  'check-circle': CircleCheck,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'arrow-right': ArrowRight,
  'trend-up': ArrowUpRight,
  'trend-down': ArrowDownRight,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function isIconName(value: string): value is IconName {
  return value in ICONS
}

/** Names offered when choosing an icon for a habit. */
export const HABIT_ICON_CHOICES: IconName[] = [
  'sunrise', 'droplet', 'pill', 'flower', 'flame', 'book', 'pen', 'graduation', 'sparkles',
  'utensils', 'moon', 'bed', 'shield', 'dumbbell', 'footprints', 'activity', 'brain', 'heart',
  'scale', 'zap', 'target', 'check',
]

interface IconProps {
  name: IconName
  /** Pixel size; defaults to 18. */
  size?: number
  className?: string
  /** Set only when the icon is the sole content of a control and carries its meaning. */
  label?: string
}

export function Icon({ name, size = 18, className, label }: IconProps) {
  const Glyph = ICONS[name]
  return (
    <Glyph
      size={size}
      strokeWidth={1.9}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}
