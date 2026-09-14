import { FlashcardItem } from '../types';

export class ReviewSessionEngine {
  title: string;
  initialTotal: number;
  cardsById: Map<number, FlashcardItem>;
  activePool: Set<number>;
  cardRatings: Map<number, 'Didn_know' | 'A_bit'>;
  currentRoundQueue: FlashcardItem[];
  currentIndex: number;
  roundNumber: number;
  masteredCount: number;
  isCompleted: boolean;

  constructor(title: string, cards: FlashcardItem[]) {
    this.title = title;
    this.initialTotal = cards.length;
    this.cardsById = new Map();
    cards.forEach((c) => {
      if (c.id !== undefined) {
        this.cardsById.set(c.id, c);
      }
    });

    this.activePool = new Set(this.cardsById.keys());
    this.cardRatings = new Map();

    // Initial queue: shuffle all cards
    this.currentRoundQueue = this.shuffle([...cards]);
    this.currentIndex = 0;
    this.roundNumber = 1;
    this.masteredCount = 0;
    this.isCompleted = cards.length === 0;
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  get currentCard(): FlashcardItem | null {
    if (this.isCompleted || this.activePool.size === 0) {
      return null;
    }
    // Skip any card that has already been mastered
    while (
      this.currentIndex < this.currentRoundQueue.length &&
      this.currentRoundQueue[this.currentIndex].id !== undefined &&
      !this.activePool.has(this.currentRoundQueue[this.currentIndex].id!)
    ) {
      this.currentIndex++;
    }
    if (this.currentIndex >= this.currentRoundQueue.length) {
      this.advanceRound();
    }
    if (this.currentIndex < this.currentRoundQueue.length) {
      return this.currentRoundQueue[this.currentIndex];
    }
    return null;
  }

  get remainingCount(): number {
    return this.activePool.size;
  }

  get roundCardNumber(): number {
    return Math.min(this.currentIndex + 1, this.currentRoundQueue.length);
  }

  get roundTotalCards(): number {
    return this.currentRoundQueue.length;
  }

  get progressPercentage(): number {
    if (this.initialTotal === 0) return 100;
    return (this.masteredCount / this.initialTotal) * 100;
  }

  recordRating(rating: 'Didn_know' | 'A_bit' | 'I_know'): boolean {
    const card = this.currentCard;
    if (!card || card.id === undefined) return false;

    const cardId = card.id;

    if (rating === 'I_know') {
      // Mastered: completely remove from active pool
      if (this.activePool.has(cardId)) {
        this.activePool.delete(cardId);
        this.masteredCount++;
      }
      this.cardRatings.delete(cardId);
    } else if (rating === 'A_bit') {
      // Partial knowledge: keep in active pool, mark as A_bit
      this.cardRatings.set(cardId, 'A_bit');
      // Push to the end of the line if there are other unreviewed cards ahead
      if (this.currentRoundQueue.length - (this.currentIndex + 1) > 0) {
        this.currentRoundQueue.push(card);
      }
    } else {
      // IDK (Didn't know): keep in active pool with top priority for next cycle
      this.cardRatings.set(cardId, 'Didn_know');
    }

    this.currentIndex++;
    let roundAdvanced = false;

    if (this.currentIndex >= this.currentRoundQueue.length) {
      roundAdvanced = true;
      this.advanceRound();
    }

    return roundAdvanced;
  }

  private advanceRound(): void {
    if (this.activePool.size === 0) {
      this.isCompleted = true;
      this.currentRoundQueue = [];
      this.currentIndex = 0;
      return;
    }

    this.roundNumber++;

    const didntKnowCards: FlashcardItem[] = [];
    const aBitCards: FlashcardItem[] = [];

    this.activePool.forEach((cardId) => {
      const card = this.cardsById.get(cardId);
      if (card) {
        const lastRating = this.cardRatings.get(cardId) || 'Didn_know';
        if (lastRating === 'A_bit') {
          aBitCards.push(card);
        } else {
          didntKnowCards.push(card);
        }
      }
    });

    const shuffledDidntKnow = this.shuffle(didntKnowCards);
    const shuffledABit = this.shuffle(aBitCards);

    // High priority ("Didn't know") first, followed by low priority ("A bit")
    this.currentRoundQueue = [...shuffledDidntKnow, ...shuffledABit];
    this.currentIndex = 0;
  }

  restart(): void {
    this.activePool = new Set(this.cardsById.keys());
    this.cardRatings.clear();
    this.masteredCount = 0;
    this.roundNumber = 1;
    this.isCompleted = this.cardsById.size === 0;
    this.currentRoundQueue = this.shuffle(Array.from(this.cardsById.values()));
    this.currentIndex = 0;
  }
}
