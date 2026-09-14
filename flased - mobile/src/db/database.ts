import * as SQLite from 'expo-sqlite';
import {
  SubjectItem,
  ModuleItem,
  FlashcardItem,
  DailyUsageStats,
  ModuleFlashcardsResponse,
  HomeStats,
  MasteredModuleItem,
  SubjectProgressItem,
} from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('studyforge.db');
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = await getDb();

  await database.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      group_name TEXT DEFAULT 'General'
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_id INTEGER,
      title TEXT NOT NULL,
      content TEXT,
      FOREIGN KEY (phase_id) REFERENCES phases (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER,
      concept_group TEXT,
      question TEXT NOT NULL,
      explanation TEXT NOT NULL,
      memory_code TEXT,
      review_state TEXT DEFAULT 'Didn_know',
      FOREIGN KEY (module_id) REFERENCES modules (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      candidate_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success'
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate phases table if group_name or due_date doesn't exist yet
  try {
    await database.execAsync(`ALTER TABLE phases ADD COLUMN group_name TEXT DEFAULT 'General';`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE phases ADD COLUMN due_date TEXT;`);
  } catch {
    // Column already exists
  }
}

// --- Subject & Module Queries ---

export async function getSubjectsAndModules(): Promise<SubjectItem[]> {
  const database = await getDb();
  const phases = await database.getAllAsync<{ id: number; title: string; group_name?: string; due_date?: string | null }>(
    'SELECT id, title, COALESCE(group_name, "") AS group_name, due_date FROM phases ORDER BY id ASC'
  );

  const result: SubjectItem[] = [];

  for (const p of phases) {
    const modules = await database.getAllAsync<{
      id: number;
      phase_id: number;
      title: string;
      content: string;
      card_count: number;
    }>(
      `SELECT m.id, m.phase_id, m.title, m.content, COUNT(f.id) AS card_count
       FROM modules m
       LEFT JOIN flashcards f ON f.module_id = m.id
       WHERE m.phase_id = ?
       GROUP BY m.id
       ORDER BY m.id ASC`,
      [p.id]
    );

    const moduleItems: ModuleItem[] = modules.map((m) => ({
      id: m.id,
      phase_id: m.phase_id,
      title: m.title,
      content: m.content || '',
      card_count: m.card_count || 0,
    }));

    const total_cards = moduleItems.reduce((acc, curr) => acc + (curr.card_count || 0), 0);

    result.push({
      id: p.id,
      title: p.title,
      group_name: p.group_name || '',  // empty = no folder assigned
      due_date: p.due_date || null,
      modules: moduleItems,
      total_cards,
    });
  }

  return result;
}

export async function createSubject(title: string, groupName: string = '', dueDate?: string | null): Promise<number> {
  const database = await getDb();
  const cleanGroup = (groupName || '').trim();
  const cleanDue = dueDate && dueDate.trim() ? dueDate.trim() : null;
  const res = await database.runAsync(
    'INSERT INTO phases (title, group_name, due_date) VALUES (?, ?, ?)',
    [title.trim(), cleanGroup, cleanDue]
  );
  return res.lastInsertRowId;
}

export async function renameSubject(
  subjectId: number,
  newTitle: string,
  newGroup?: string,
  newDueDate?: string | null
): Promise<void> {
  const database = await getDb();
  const cleanGroup = (newGroup || '').trim();
  const cleanDue = newDueDate !== undefined ? (newDueDate && newDueDate.trim() ? newDueDate.trim() : null) : undefined;

  if (cleanDue !== undefined) {
    await database.runAsync(
      'UPDATE phases SET title = ?, group_name = ?, due_date = ? WHERE id = ?',
      [newTitle.trim(), cleanGroup, cleanDue, subjectId]
    );
  } else if (newGroup !== undefined) {
    await database.runAsync(
      'UPDATE phases SET title = ?, group_name = ? WHERE id = ?',
      [newTitle.trim(), cleanGroup, subjectId]
    );
  } else {
    await database.runAsync('UPDATE phases SET title = ? WHERE id = ?', [newTitle.trim(), subjectId]);
  }
}

export async function moveSubjectToFolder(subjectId: number, targetFolder: string): Promise<void> {
  const database = await getDb();
  const clean = (targetFolder || '').trim();
  await database.runAsync('UPDATE phases SET group_name = ? WHERE id = ?', [clean, subjectId]);
}

/**
 * Rename every subject in a folder from oldName -> newName.
 * Handles both root folders (e.g. "General") and nested paths (e.g. "1st Year / Sem 1").
 */
export async function renameFolder(oldName: string, newName: string): Promise<void> {
  const database = await getDb();
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanNew) throw new Error('New folder name cannot be empty.');
  if (cleanOld === cleanNew) return;

  // Match subjects whose group_name starts with cleanOld (handles nested paths too)
  // Exact match: group_name = 'Old Name'
  // Nested match: group_name = 'Old Name / Sub'
  await database.runAsync(
    `UPDATE phases
     SET group_name = REPLACE(group_name, ?, ?)
     WHERE group_name = ?
        OR group_name LIKE ?`,
    [cleanOld, cleanNew, cleanOld, `${cleanOld}/%`]
  );
}


export async function deleteSubject(subjectId: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM flashcards WHERE module_id IN (SELECT id FROM modules WHERE phase_id = ?)', [subjectId]);
  await database.runAsync('DELETE FROM modules WHERE phase_id = ?', [subjectId]);
  await database.runAsync('DELETE FROM phases WHERE id = ?', [subjectId]);
}

export async function createModule(subjectId: number, title: string, content: string = ''): Promise<number> {
  const database = await getDb();
  const res = await database.runAsync(
    'INSERT INTO modules (phase_id, title, content) VALUES (?, ?, ?)',
    [subjectId, title.trim(), content.trim()]
  );
  return res.lastInsertRowId;
}

export async function renameModule(moduleId: number, newTitle: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE modules SET title = ? WHERE id = ?', [newTitle.trim(), moduleId]);
}

export async function deleteModule(moduleId: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM flashcards WHERE module_id = ?', [moduleId]);
  await database.runAsync('DELETE FROM modules WHERE id = ?', [moduleId]);
}

// --- Save AI Flashcard Response ---

export async function saveModuleAndCards(
  phaseTitle: string,
  moduleTitle: string,
  content: string,
  aiResponse: ModuleFlashcardsResponse,
  subjectId?: number,
  groupName?: string
): Promise<number> {
  const database = await getDb();
  let targetPhaseId = subjectId;

  if (!targetPhaseId) {
    const existing = await database.getFirstAsync<{ id: number }>('SELECT id FROM phases WHERE title = ?', [phaseTitle]);
    if (existing) {
      targetPhaseId = existing.id;
    } else {
      const res = await database.runAsync(
        'INSERT INTO phases (title, group_name) VALUES (?, ?)',
        [phaseTitle, (groupName || '').trim()]
      );
      targetPhaseId = res.lastInsertRowId;
    }
  }

  const modRes = await database.runAsync(
    'INSERT INTO modules (phase_id, title, content) VALUES (?, ?, ?)',
    [targetPhaseId, moduleTitle, content]
  );
  const moduleId = modRes.lastInsertRowId;

  for (const card of aiResponse.cards) {
    let explanation = '';
    let memoryCode = card.memory_code || null;

    if (card.points && card.points.length > 0) {
      const lines: string[] = [];
      if (card.explanation) {
        lines.push(card.explanation.trim());
      } else if (card.summary) {
        lines.push(card.summary.trim());
      }
      for (const pt of card.points) {
        const letter = pt.letter.trim().toUpperCase();
        const kw = pt.keyword.trim();
        const desc = pt.explanation.trim();
        lines.push(`• **${letter}** — **${kw}**: ${desc}`);
      }
      explanation = lines.join('\n');
      if (!memoryCode) {
        memoryCode = card.points.map((p) => p.letter.trim().toUpperCase()).join('');
      }
    } else {
      explanation = card.explanation || (card as any).summary || '';
      memoryCode = null;
    }

    await database.runAsync(
      `INSERT INTO flashcards (module_id, concept_group, question, explanation, memory_code)
       VALUES (?, ?, ?, ?, ?)`,
      [moduleId, card.concept_group, card.question, explanation, memoryCode]
    );
  }

  return moduleId;
}

// --- Flashcard Operations ---

export async function getCardsForModule(moduleId: number): Promise<FlashcardItem[]> {
  const database = await getDb();
  return await database.getAllAsync<FlashcardItem>(
    `SELECT id, module_id, concept_group, question, explanation, memory_code, review_state
     FROM flashcards
     WHERE module_id = ?
     ORDER BY id ASC`,
    [moduleId]
  );
}

export async function getCardsForSubject(subjectId: number): Promise<FlashcardItem[]> {
  const database = await getDb();
  return await database.getAllAsync<FlashcardItem>(
    `SELECT f.id, f.module_id, f.concept_group, f.question, f.explanation, f.memory_code, f.review_state
     FROM flashcards f
     JOIN modules m ON f.module_id = m.id
     WHERE m.phase_id = ?
     ORDER BY m.id ASC, f.id ASC`,
    [subjectId]
  );
}

export async function getAllCards(): Promise<FlashcardItem[]> {
  const database = await getDb();
  return await database.getAllAsync<FlashcardItem>(
    `SELECT id, module_id, concept_group, question, explanation, memory_code, review_state
     FROM flashcards
     ORDER BY id ASC`
  );
}

export async function updateCardState(cardId: number, state: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE flashcards SET review_state = ? WHERE id = ?', [state, cardId]);
}

export async function getCardsByReviewState(state: string): Promise<import('../types').CardWithContextItem[]> {
  const database = await getDb();
  return await database.getAllAsync<import('../types').CardWithContextItem>(
    `SELECT f.id, f.module_id, f.concept_group, f.question, f.explanation, f.memory_code, f.review_state,
            m.title AS module_title,
            p.id AS subject_id, p.title AS subject_title, COALESCE(p.group_name, 'General') AS group_name
     FROM flashcards f
     JOIN modules m ON f.module_id = m.id
     JOIN phases p ON m.phase_id = p.id
     WHERE f.review_state = ?
     ORDER BY p.title ASC, m.title ASC, f.id ASC`,
    [state]
  );
}

export async function getDueSoonSubjects(daysThreshold: number = 3): Promise<import('../types').DueSubjectAlert[]> {
  const database = await getDb();
  const subjects = await getSubjectsAndModules();
  const alerts: import('../types').DueSubjectAlert[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const s of subjects) {
    if (!s.due_date) continue;
    try {
      const parts = s.due_date.split('-');
      if (parts.length === 3) {
        const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= daysThreshold) {
          alerts.push({
            id: s.id,
            title: s.title,
            group_name: s.group_name,
            due_date: s.due_date,
            daysRemaining: diffDays,
            totalCards: s.total_cards,
          });
        }
      }
    } catch {
      // ignore parsing error
    }
  }

  // Sort ascending by days remaining (most urgent / overdue first)
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return alerts;
}

export async function createFlashcard(
  moduleId: number,
  conceptGroup: string,
  question: string,
  explanation: string,
  memoryCode?: string
): Promise<number> {
  const database = await getDb();
  const res = await database.runAsync(
    `INSERT INTO flashcards (module_id, concept_group, question, explanation, memory_code, review_state)
     VALUES (?, ?, ?, ?, ?, 'Didn_know')`,
    [moduleId, conceptGroup.trim(), question.trim(), explanation.trim(), memoryCode ? memoryCode.trim() : null]
  );
  return res.lastInsertRowId;
}

export async function updateFlashcard(
  cardId: number,
  conceptGroup: string,
  question: string,
  explanation: string,
  memoryCode?: string
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `UPDATE flashcards
     SET concept_group = ?, question = ?, explanation = ?, memory_code = ?
     WHERE id = ?`,
    [conceptGroup.trim(), question.trim(), explanation.trim(), memoryCode ? memoryCode.trim() : null, cardId]
  );
}

export async function deleteFlashcard(cardId: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM flashcards WHERE id = ?', [cardId]);
}

export async function resetCardStates(moduleId?: number, subjectId?: number): Promise<void> {
  const database = await getDb();
  if (moduleId !== undefined) {
    await database.runAsync("UPDATE flashcards SET review_state = 'Didn_know' WHERE module_id = ?", [moduleId]);
  } else if (subjectId !== undefined) {
    await database.runAsync(
      `UPDATE flashcards SET review_state = 'Didn_know'
       WHERE module_id IN (SELECT id FROM modules WHERE phase_id = ?)`,
      [subjectId]
    );
  } else {
    await database.runAsync("UPDATE flashcards SET review_state = 'Didn_know'");
  }
}

// --- App Settings & Gemini API Usage ---

export async function getApiKey(): Promise<string> {
  const database = await getDb();
  const res = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key IN ('api_key', 'gemini_api_key') ORDER BY CASE WHEN key = 'api_key' THEN 0 ELSE 1 END LIMIT 1"
  );
  return res ? res.value : '';
}

export async function setApiKey(key: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('api_key', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key.trim()]
  );
  // Also keep gemini_api_key in sync for backward compatibility
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key.trim()]
  );
}

export async function getApiProvider(): Promise<string> {
  const database = await getDb();
  const res = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'api_provider'");
  return res ? res.value : 'auto';
}

export async function setApiProvider(provider: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('api_provider', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [provider.trim()]
  );
}

export async function getApiModel(): Promise<string> {
  const database = await getDb();
  const res = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'api_model'");
  return res ? res.value : '';
}

export async function setApiModel(model: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('api_model', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [model.trim()]
  );
}

export async function getQuotaLimit(): Promise<number> {
  const database = await getDb();
  const res = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'daily_quota_limit'");
  if (res && res.value) {
    const val = parseInt(res.value, 10);
    return isNaN(val) ? 50 : val;
  }
  return 50;
}

export async function setQuotaLimit(limit: number): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('daily_quota_limit', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [limit.toString()]
  );
}

export async function getUserName(): Promise<string> {
  const database = await getDb();
  const res = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'user_name'");
  return res ? res.value : '';
}

export async function setUserName(name: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('user_name', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [name.trim()]
  );
}

export async function logApiUsage(
  promptTokens: number = 0,
  candidateTokens: number = 0,
  totalTokens: number = 0,
  status: string = 'success'
): Promise<void> {
  const database = await getDb();
  const nowIso = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO api_usage (timestamp, prompt_tokens, candidate_tokens, total_tokens, status)
     VALUES (?, ?, ?, ?, ?)`,
    [nowIso, promptTokens, candidateTokens, totalTokens, status]
  );
}

export async function getDailyUsageStats(): Promise<DailyUsageStats> {
  const database = await getDb();
  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00';

  const row = await database.getFirstAsync<{ req_count: number; token_sum: number }>(
    `SELECT COUNT(*) AS req_count, SUM(total_tokens) AS token_sum
     FROM api_usage
     WHERE timestamp >= ? AND status = 'success'`,
    [todayStart]
  );

  const reqCount = row ? row.req_count || 0 : 0;
  const tokenSum = row ? row.token_sum || 0 : 0;

  const quotaExceededRow = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM api_usage
     WHERE timestamp >= ? AND status = 'quota_exceeded'`,
    [todayStart]
  );

  const quotaExceededCount = quotaExceededRow ? quotaExceededRow.count || 0 : 0;

  const limit = await getQuotaLimit();
  const percentage = limit > 0 ? Math.min(100, (reqCount / limit) * 100) : 0;
  const remaining = Math.max(0, limit - reqCount);

  return {
    requests_today: reqCount,
    quota_limit: limit,
    remaining,
    percentage,
    tokens_today: tokenSum,
    is_exhausted: remaining === 0 || quotaExceededCount > 0,
  };
}

export async function resetDatabase(): Promise<void> {
  const database = await getDb();
  await database.execAsync(`
    DELETE FROM flashcards;
    DELETE FROM modules;
    DELETE FROM phases;
    DELETE FROM api_usage;
  `);
}

export async function getHomeStats(): Promise<HomeStats> {
  const database = await getDb();

  const allCards = await database.getAllAsync<{
    id: number;
    module_id: number;
    review_state: string;
  }>('SELECT id, module_id, review_state FROM flashcards');

  const totalCards = allCards.length;
  let masteredCards = 0;
  let learningCards = 0;
  let unlearnedCards = 0;

  const cardCountsByModule = new Map<number, { total: number; mastered: number }>();

  for (const c of allCards) {
    if (c.review_state === 'I_know') {
      masteredCards++;
    } else if (c.review_state === 'A_bit') {
      learningCards++;
    } else {
      unlearnedCards++;
    }

    const current = cardCountsByModule.get(c.module_id) || { total: 0, mastered: 0 };
    current.total++;
    if (c.review_state === 'I_know') current.mastered++;
    cardCountsByModule.set(c.module_id, current);
  }

  const masteryPercentage = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

  // Gamified points: 15 pts per mastered card, 5 pts per partially learned card
  const points = (masteredCards * 15) + (learningCards * 5);

  // Get subjects and modules
  const subjects = await getSubjectsAndModules();
  const masteredModules: MasteredModuleItem[] = [];
  const subjectProgress: SubjectProgressItem[] = [];

  for (const s of subjects) {
    let subTotal = 0;
    let subMastered = 0;

    for (const m of s.modules) {
      const stats = cardCountsByModule.get(m.id);
      if (stats && stats.total > 0) {
        subTotal += stats.total;
        subMastered += stats.mastered;
        if (stats.mastered === stats.total) {
          masteredModules.push({
            id: m.id,
            title: m.title,
            subjectTitle: s.title,
            cardCount: stats.total,
          });
        }
      }
    }

    const percent = subTotal > 0 ? Math.round((subMastered / subTotal) * 100) : 0;
    subjectProgress.push({
      id: s.id,
      title: s.title,
      total: subTotal,
      mastered: subMastered,
      percent,
    });
  }

  const dueAlerts = await getDueSoonSubjects(3);

  return {
    totalCards,
    masteredCards,
    learningCards,
    unlearnedCards,
    masteryPercentage,
    points,
    masteredModules,
    subjectProgress,
    dueAlerts,
  };
}
