import { ExtractionResult, TaskContext, TaskEvent } from '../types';

export function applyEnrichment(ctx: TaskContext, enriched: ExtractionResult): TaskContext {
  const synthetic: TaskEvent[] = [];
  const stamp = new Date().toISOString();
  let id = -1;

  if (enriched.goal) {
    synthetic.push(makeSynthetic(id--, ctx.task.id, 'goal', enriched.goal, stamp));
  }
  for (const decision of enriched.decisions) {
    synthetic.push(makeSynthetic(id--, ctx.task.id, 'decision', decision, stamp));
  }
  for (const assumption of enriched.assumptions) {
    synthetic.push(makeSynthetic(id--, ctx.task.id, 'assumption', assumption, stamp));
  }
  for (const pending of enriched.pending) {
    synthetic.push(makeSynthetic(id--, ctx.task.id, 'pending', pending, stamp));
  }

  return {
    task: ctx.task,
    events: [...ctx.events, ...synthetic],
    fileEdits: ctx.fileEdits
  };
}

function makeSynthetic(
  id: number,
  taskId: string,
  type: TaskEvent['type'],
  content: string,
  timestamp: string
): TaskEvent {
  return {
    id,
    taskId,
    type,
    content,
    metadata: JSON.stringify({ source: 'enrichment', synthetic: true }),
    timestamp
  };
}
