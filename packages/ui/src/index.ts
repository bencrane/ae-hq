// Layout
export {
  Stack,
  Inline,
  Grid,
  Box,
  Divider,
  type StackProps,
  type InlineProps,
  type GridProps,
  type BoxProps,
  type DividerProps,
} from "./layout";

// Page
export {
  Page,
  PageHeader,
  PageBody,
  PageSection,
  PageActions,
  PageBreadcrumbs,
  PageEmptyState,
  PageError,
  PageLoading,
  type PageProps,
  type PageHeaderProps,
  type PageBodyProps,
  type PageSectionProps,
  type PageActionsProps,
  type PageBreadcrumbsProps,
  type PageEmptyStateProps,
  type PageErrorProps,
  type PageLoadingProps,
  type BreadcrumbItem,
} from "./page";

// Form
export {
  Field,
  Label,
  Input,
  Textarea,
  Select,
  Combobox,
  TagInput,
  FieldGroup,
  FormErrors,
  type FieldProps,
  type LabelProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type ComboboxProps,
  type TagInputProps,
  type FieldGroupProps,
  type FormErrorsProps,
} from "./form";

// Display
export {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Avatar,
  CompanyLogo,
  Stat,
  KVTable,
  DataTable,
  Pagination,
  Spinner,
  SectionLabel,
  Button,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type BadgeProps,
  type BadgeTone,
  type AvatarProps,
  type CompanyLogoProps,
  type StatProps,
  type KVTableProps,
  type DataTableProps,
  type DataTableColumn,
  type PaginationProps,
  type SpinnerProps,
  type SectionLabelProps,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./display";

// Feedback
export {
  Banner,
  Toast,
  Modal,
  Drawer,
  Tooltip,
  type BannerProps,
  type BannerTone,
  type ToastProps,
  type ModalProps,
  type DrawerProps,
  type TooltipProps,
} from "./feedback";

// Motion
export {
  AppearOnMount,
  FadeIn,
  SlideIn,
  type SlideInProps,
} from "./motion";

// Interactive (shared)
export {
  Tabs,
  TabList,
  TabPanel,
  PreferenceTagPicker,
  type TabsProps,
  type TabListProps,
  type TabPanelProps,
  type TabItem,
  type PreferenceTagPickerProps,
  type PreferenceTagOption,
} from "./interactive";

// Messaging
export {
  ConversationList,
  ConversationListItem,
  MessageThread,
  MessageBubble,
  MessageComposer,
  MessageDayDivider,
  ThreadEmptyState,
  type ConversationListProps,
  type ConversationListItemProps,
  type MessageThreadProps,
  type MessageBubbleProps,
  type MessageComposerProps,
  type MessageDayDividerProps,
  type ThreadEmptyStateProps,
} from "./messaging";

// Feed
export {
  FeedRow,
  ArticleCard,
  ArticleCardCompact,
  DataDropCard,
  type FeedRowProps,
  type FeedRowData,
  type ArticleCardProps,
  type ArticleCardCompactProps,
  type DataDropCardProps,
} from "./feed";

// Jobs (cycle 5)
export {
  JobCard,
  CollectionRow,
  CollectionSection,
  FunnelSummary,
  CompanyProfileHeader,
  type JobCardProps,
  type CollectionRowProps,
  type CollectionSectionProps,
  type FunnelSummaryProps,
  type FunnelStageDatum,
  type CompanyProfileHeaderProps,
  type CompanyProfileFact,
} from "./jobs";

// Markdown
export { Markdown } from "./markdown";

// Consent & matchmaking (cycle 6)
export {
  Toggle,
  MatchStatusBadge,
  AnonymousCandidateCard,
  type ToggleProps,
  type MatchStatusBadgeProps,
  type MatchStatus,
  type AnonymousCandidateCardProps,
  type AnonymousCandidateCardWorkedAt,
} from "./consent";

// Pipeline
export {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  ApplicantKanbanCard,
  StageHeader,
  CandidateTimeline,
  TimelineEntry,
  type KanbanBoardProps,
  type KanbanColumnProps,
  type KanbanCardProps,
  type ApplicantKanbanCardProps,
  type StageHeaderProps,
  type CandidateTimelineProps,
  type TimelineEntryProps,
  type TimelineEntryKind,
} from "./pipeline";

// Utils
export {
  cx,
  type SpacingProp,
  type TextColorProp,
  type SurfaceProp,
  type BorderProp,
  type FontSizeProp,
  type PageVariantProp,
} from "./utils";
