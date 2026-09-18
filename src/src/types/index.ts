export interface BulletPoint {
  letter: string;
  keyword: string;
  explanation: string;
}

export interface FlashcardItem {
  id?: number;
  module_id?: number;
  concept_group: string;
  question: string;
  explanation: string;
  memory_code: string | null;
  review_state?: 'Didn_know' | 'A_bit' | 'I_know' | string;
  points?: BulletPoint[];
}

export interface ModuleItem {
  id: number;
  phase_id: number;
  title: string;
  content: string;
  card_count?: number;
}

export interface SubjectItem {
  id: number;
  title: string;
  group_name?: string;
  due_date?: string | null;
  modules: ModuleItem[];
  total_cards: number;
}

export interface CardWithContextItem extends FlashcardItem {
  id: number;
  module_id: number;
  module_title: string;
  subject_id: number;
  subject_title: string;
  group_name?: string;
}

export interface DueSubjectAlert {
  id: number;
  title: string;
  group_name?: string;
  due_date: string;
  daysRemaining: number;
  totalCards: number;
}

export interface ModuleFlashcardsResponse {
  module_title: string;
  cards: {
    concept_group: string;
    question: string;
    explanation: string;
    points?: BulletPoint[];
    memory_code?: string;
    summary?: string;
  }[];
}

export interface DailyUsageStats {
  requests_today: number;
  quota_limit: number;
  remaining: number;
  percentage: number;
  tokens_today: number;
  is_exhausted: boolean;
}

export interface MasteredModuleItem {
  id: number;
  title: string;
  subjectTitle: string;
  cardCount: number;
}

export interface SubjectProgressItem {
  id: number;
  title: string;
  total: number;
  mastered: number;
  percent: number;
}

export interface HomeStats {
  totalCards: number;
  masteredCards: number;
  learningCards: number;
  unlearnedCards: number;
  masteryPercentage: number;
  points: number;
  masteredModules: MasteredModuleItem[];
  subjectProgress: SubjectProgressItem[];
  dueAlerts?: DueSubjectAlert[];
}
