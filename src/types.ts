export type TaskStatus = 'active' | 'paused' | 'completed';

export type EventType =
  | 'goal'
  | 'decision'
  | 'assumption'
  | 'pending'
  | 'snapshot'
  | 'file_change';

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  type: EventType;
  content: string;
  metadata?: string;
  timestamp: string;
}

export interface FileEdit {
  id: number;
  taskId: string;
  filePath: string;
  diff: string;
  timestamp: string;
}

export interface TaskContext {
  task: Task;
  events: TaskEvent[];
  fileEdits: FileEdit[];
}

export interface ContinuitySettings {
  captureEnabled: boolean;
  maxDiffChars: number;
  flushIntervalMs: number;
  promptMaxChars: number;
  /** URL of your hosted Continuity extraction service. */
  serviceUrl: string;
  /** Whether to run AI extraction automatically on snapshots and handoffs. */
  aiAutoExtract: boolean;
  enrichHandoffWithAI: boolean;
  offlineMode: boolean;
  sessionAutoStart: boolean;
  sessionIdleMinutes: number;
  autoHandoffOnAssistantSwitch: boolean;
}

export interface PromptBuildOptions {
  maxChars: number;
  targetAssistant?: string;
  isFreeMode?: boolean;
}

export interface ExtractionResult {
  goal?: string;
  decisions: string[];
  assumptions: string[];
  pending: string[];
}
