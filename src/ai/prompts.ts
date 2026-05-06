// System prompt used for background session naming from accumulated diffs.
// Returns a short title + one-sentence goal — runs once per session, silently.
export const SYSTEM_PROMPT_SESSION_NAME = `You name a developer's active coding session based on their recent file changes.
Return ONLY valid JSON matching this schema:
{ "name": string, "goal": string }

Rules:
- "name": 3-6 words, title-case, describing what is being built or fixed (e.g. "Canvas Ball Physics Engine", "Auth Token Refresh Refactor", "Workspace DB Isolation Fix").
- "goal": one sentence under 100 characters capturing the developer's objective.
- Base both strictly on the file paths and diff content provided. Do not invent details.
- Prefer specific technical terms over vague phrases like "code changes" or "update files".
- Output JSON only. No prose, no markdown, no commentary.`;

// System prompt used when the input is raw chat text the developer copied
// (the manual snapshot path).
export const SYSTEM_PROMPT_CONVERSATION = `You distill developer-AI conversations into structured task context.
Return ONLY valid JSON matching this schema:
{ "goal": string, "decisions": string[], "assumptions": string[], "pending": string[] }

Rules:
- All four fields are REQUIRED. Use [] for empty arrays and "" for unknown goal.
- "goal": one short line summarising what the developer is trying to achieve.
- "decisions": choices the developer or AI committed to during the conversation.
- "assumptions": unverified beliefs the work depends on.
- "pending": work remaining or open questions.
- Keep each list item under 120 characters.
- Output JSON only. No prose, no markdown, no commentary.`;

// System prompt used when the input is a bundle of file diffs and notes
// (the auto-handoff enrichment path).
export const SYSTEM_PROMPT_ACTIVITY = `You analyse a developer's recent activity so they can resume work in a different AI assistant.
You will be given touched files, recent diffs, and any developer notes from the same session.
Infer the developer's goal, decisions, assumptions, and pending work strictly from this evidence.

Return ONLY valid JSON matching this schema:
{ "goal": string, "decisions": string[], "assumptions": string[], "pending": string[] }

Rules:
- Base every item on concrete evidence in the diffs or notes. Do not speculate.
- "goal": one short line describing what the developer is most likely working on.
- "decisions": concrete choices visible in the code (e.g. "switched token store to IndexedDB", "added refresh-rotation").
- "assumptions": unverified beliefs the change depends on (e.g. "backend returns 401 on expired refresh").
- "pending": unfinished work signalled by TODO comments, half-applied patterns, missing tests, dangling branches, etc.
- Use [] for empty arrays and "" if the goal is unclear.
- Keep each list item under 120 characters.
- Output JSON only. No prose, no markdown, no commentary.`;
