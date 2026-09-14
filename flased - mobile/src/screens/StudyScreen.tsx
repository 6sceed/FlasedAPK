import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashcardItem } from '../types';
import { getCardsForModule, getCardsForSubject, getAllCards, updateCardState } from '../db/database';
import { ReviewSessionEngine } from '../engine/session';
import { COLORS } from '../theme/colors';
import { FlashcardFlipView, CardRating } from '../components/FlashcardFlipView';

interface StudyScreenProps {
  type: 'subject' | 'module' | 'all';
  id?: number;
  title?: string;
  onExit: () => void;
}

export const StudyScreen: React.FC<StudyScreenProps> = ({ type, id, title, onExit }) => {
  const [engine, setEngine] = useState<ReviewSessionEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFlipped, setIsFlipped] = useState(false);
  const [, setTick] = useState(0); // Force state updates on session mutations

  useEffect(() => {
    const initSession = async () => {
      try {
        setLoading(true);
        let cards: FlashcardItem[] = [];

        if (type === 'module' && id !== undefined) {
          cards = await getCardsForModule(id);
        } else if (type === 'subject' && id !== undefined) {
          cards = await getCardsForSubject(id);
        } else {
          cards = await getAllCards();
        }

        const sessionTitle = title || 'Flashcard Session';
        const newEngine = new ReviewSessionEngine(sessionTitle, cards);
        setEngine(newEngine);
      } catch (e) {
        console.error('Failed to start session:', e);
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, [type, id]);

  const handleRate = async (rating: CardRating) => {
    if (!engine || !engine.currentCard) return;

    const cardId = engine.currentCard.id;

    // Map UI rating to engine/db rating
    // 'Mastered' → treated as I_know (removes from pool)
    // 'I_know'   → treated as A_bit  (stays in pool, deprioritised — "Know It" means almost there)
    // 'A_bit'    → Didn_know adjacent (unsure, stays active)
    // 'Didn_know'→ stays top priority
    let engineRating: 'Didn_know' | 'A_bit' | 'I_know';
    let dbState: string;

    if (rating === 'Mastered') {
      engineRating = 'I_know';
      dbState = 'I_know';
    } else if (rating === 'I_know') {
      engineRating = 'A_bit';  // keeps in pool, low priority
      dbState = 'A_bit';
    } else if (rating === 'A_bit') {
      engineRating = 'Didn_know';
      dbState = 'Didn_know';
    } else {
      engineRating = 'Didn_know';
      dbState = 'Didn_know';
    }

    engine.recordRating(engineRating);

    if (cardId !== undefined) {
      updateCardState(cardId, dbState).catch(console.error);
    }

    setIsFlipped(false);
    setTick((prev) => prev + 1);
  };

  const handleRestart = () => {
    if (!engine) return;
    engine.restart();
    setTick((prev) => prev + 1);
  };

  if (loading || !engine) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Preparing Study Session...</Text>
      </View>
    );
  }

  // Completion View
  if (engine.isCompleted) {
    return (
      <View style={styles.container}>
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
            <Ionicons name="close-outline" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.completeContent}>
          <View style={styles.trophyCircle}>
            <Ionicons name="ribbon-outline" size={56} color={COLORS.primary} />
          </View>
          <Text style={styles.completeTitle}>100% Mastery!</Text>
          <Text style={styles.completeSub}>
            You have successfully mastered all {engine.initialTotal} cards in '{engine.title}'.
          </Text>

          <View style={styles.completeActions}>
            <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
              <Ionicons name="refresh-outline" size={18} color={COLORS.primaryDark} />
              <Text style={styles.restartBtnText}>Study Again</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneBtn} onPress={onExit}>
              <Text style={styles.doneBtnText}>Back to Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const currentCard = engine.currentCard;

  return (
    <View style={styles.container}>
      {/* Session Top Bar */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
          <Ionicons name="close-outline" size={24} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.sessionMeta}>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {engine.title}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.roundBadge}>
              <Text style={styles.roundBadgeText}>Round {engine.roundNumber}</Text>
            </View>
            <Text style={styles.cardCounter}>
              {engine.roundCardNumber} of {engine.roundTotalCards}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.restartIconBtn} onPress={handleRestart}>
          <Ionicons name="refresh-outline" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Mastery Progress Bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${engine.progressPercentage}%` }]} />
      </View>

      {/* Main Flashcard Component */}
      <View style={styles.cardArea}>
        {currentCard ? (
          <FlashcardFlipView
            card={currentCard}
            isFlipped={isFlipped}
            onToggleFlip={() => setIsFlipped((prev) => !prev)}
          />
        ) : (
          <ActivityIndicator size="small" color={COLORS.accent} />
        )}
      </View>

      {/* Rating Bar — only visible after card is flipped */}
      <View style={styles.bottomActionBar}>
        {isFlipped && (
          <View style={styles.ratingRow}>
            <TouchableOpacity
              style={[styles.rateActionBtn, styles.rateDangerBtn]}
              onPress={() => handleRate('Didn_know')}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
              <Text style={[styles.rateActionLabel, { color: COLORS.danger }]}>IDK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rateActionBtn, styles.rateWarningBtn]}
              onPress={() => handleRate('A_bit')}
              activeOpacity={0.8}
            >
              <Ionicons name="help-circle-outline" size={16} color={COLORS.warning} />
              <Text style={[styles.rateActionLabel, { color: COLORS.warning }]}>Unsure</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rateActionBtn, styles.rateInfoBtn]}
              onPress={() => handleRate('I_know')}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.accent} />
              <Text style={[styles.rateActionLabel, { color: COLORS.accent }]}>Know It</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rateActionBtn, styles.rateSuccessBtn]}
              onPress={() => handleRate('Mastered')}
              activeOpacity={0.8}
            >
              <Ionicons name="ribbon-outline" size={16} color={COLORS.success} />
              <Text style={[styles.rateActionLabel, { color: COLORS.success }]}>Mastered</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Session Footer Info */}
      <View style={styles.footerInfo}>
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{engine.masteredCount}</Text>
          <Text style={styles.statLabel}>Mastered</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: COLORS.warning }]}>{engine.remainingCount}</Text>
          <Text style={styles.statLabel}>Active Pool</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 12,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
  },
  exitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#101017',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restartIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#101017',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionMeta: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  roundBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roundBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  cardCounter: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#12121c',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomActionBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 14,
    width: '100%',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  rateActionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: '#0f0f16',
  },
  rateDangerBtn: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.07)',
  },
  rateWarningBtn: {
    borderColor: 'rgba(234, 179, 8, 0.35)',
    backgroundColor: 'rgba(234, 179, 8, 0.07)',
  },
  rateInfoBtn: {
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(56, 189, 248, 0.07)',
  },
  rateSuccessBtn: {
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.07)',
  },
  rateActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingBottom: 30,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.success,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  completeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  trophyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  completeTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  completeSub: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },
  completeActions: {
    width: '100%',
    gap: 12,
    marginTop: 36,
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  restartBtnText: {
    color: COLORS.primaryDark,
    fontWeight: '800',
    fontSize: 15,
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#101017',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  doneBtnText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
});
