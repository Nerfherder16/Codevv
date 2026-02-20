// Auth
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// Projects
export type ProjectRole = "owner" | "editor" | "viewer";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface ProjectMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: ProjectRole;
  joined_at: string;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
}

// Canvases
export interface Canvas {
  id: string;
  project_id: string;
  name: string;
  yjs_doc_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  component_count: number;
}

export interface CanvasComponent {
  id: string;
  canvas_id: string;
  shape_id: string;
  name: string;
  component_type: string;
  tech_stack: string | null;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface CanvasDetail extends Canvas {
  tldraw_snapshot: Record<string, unknown> | null;
  components: CanvasComponent[];
}

// Ideas
export type IdeaStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "implemented";

export interface Idea {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  category: string | null;
  feasibility_score: number | null;
  feasibility_reason: string | null;
  vote_count: number;
  comment_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface IdeaDetail extends Idea {
  comments: IdeaComment[];
}

// Scaffold
export type ScaffoldStatus =
  | "pending"
  | "generating"
  | "review"
  | "approved"
  | "rejected"
  | "failed";

export interface ScaffoldJob {
  id: string;
  project_id: string;
  canvas_id: string;
  component_ids: string[];
  status: ScaffoldStatus;
  spec_json: Record<string, unknown> | null;
  generated_files: Record<string, string> | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

// Knowledge Graph
export interface KnowledgeEntity {
  id: string;
  project_id: string;
  name: string;
  entity_type: string;
  description: string | null;
  path: string | null;
  metadata_json: Record<string, unknown> | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export interface KnowledgeRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface GraphNode {
  id: string;
  name: string;
  entity_type: string;
  depth: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation_type: string;
  weight: number | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Video
export interface VideoRoom {
  id: string;
  project_id: string;
  canvas_id: string | null;
  name: string;
  livekit_room_name: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface RoomToken {
  token: string;
  room_name: string;
  url: string;
}

// Deploy
export type DeployStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  config_json: Record<string, unknown> | null;
  compose_yaml: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeployJob {
  id: string;
  environment_id: string;
  status: DeployStatus;
  logs: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

// Business Rules (Recall)
export interface RecallMemory {
  id: string;
  content: string;
  domain: string | null;
  tags: string[];
  importance: number | null;
  pinned: boolean;
  created_at: string | null;
}

// Dependency Map
export interface DependencyNode {
  id: string;
  name: string;
  component_type: string;
  tech_stack: string | null;
  canvas_id: string | null;
}

export interface DependencyEdge {
  source_id: string;
  target_id: string;
  relation_type: string;
  weight: number | null;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  stats: { node_count: number; edge_count: number; max_depth: number };
}

// Agent Pipeline
export type AgentType = "scaffold" | "feasibility" | "embedding" | "custom";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type FindingSeverity = "info" | "warning" | "error" | "critical";

export interface AgentRun {
  id: string;
  project_id: string;
  agent_type: AgentType;
  status: RunStatus;
  input_json: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  findings_count: number;
}

export interface AgentFinding {
  id: string;
  run_id: string;
  severity: FindingSeverity;
  title: string;
  description: string | null;
  file_path: string | null;
  created_at: string;
}

export interface AgentRunDetail extends AgentRun {
  findings: AgentFinding[];
}

// Solana
export interface SolanaWatchlistItem {
  id: string;
  project_id: string;
  label: string;
  address: string;
  network: string;
  created_by: string;
  created_at: string;
}

export interface SolanaBalance {
  address: string;
  lamports: number;
  sol: number;
}

export interface SolanaTransaction {
  signature: string;
  slot: number | null;
  block_time: number | null;
  success: boolean;
  fee: number | null;
}

// Audit
export type AuditStatus = "generating" | "ready" | "archived";

export interface AuditSection {
  name: string;
  items: { label: string; value: unknown }[];
  score: number;
  notes?: string;
}

export interface AuditReport {
  id: string;
  project_id: string;
  title: string;
  report_json: {
    overall_score: number;
    sections: AuditSection[];
  } | null;
  status: AuditStatus;
  generated_by: string;
  created_at: string;
}

// Compliance
export type CheckCategory =
  | "security"
  | "performance"
  | "legal"
  | "infrastructure"
  | "testing";

export type CheckStatus =
  | "not_started"
  | "in_progress"
  | "passed"
  | "failed"
  | "waived";

export interface ComplianceCheck {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  category: CheckCategory;
  status: CheckStatus;
  evidence_url: string | null;
  notes: string | null;
  assigned_to: string | null;
  updated_at: string;
  created_at: string;
}

export interface ComplianceChecklist {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  checks_count: number;
  pass_rate: number;
}

export interface ComplianceChecklistDetail extends ComplianceChecklist {
  checks: ComplianceCheck[];
}

export interface LaunchReadiness {
  overall_score: number;
  category_scores: Record<string, number>;
  blockers: ComplianceCheck[];
  total: number;
  passed: number;
  failed: number;
}

// AI Chat
export interface Conversation {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_uses_json: string | null;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface ChatContext {
  page?: string;
  canvas_id?: string;
  component_id?: string;
  idea_id?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUses?: ToolUseEvent[];
  timestamp: number;
  streaming?: boolean;
}

export interface ToolUseEvent {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  status?: string;
}

export interface DoneEvent {
  session_id?: string | null;
  model: string;
  conversation_id?: string;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
}
