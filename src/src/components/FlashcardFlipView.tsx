import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashcardItem } from '../types';
import { COLORS } from '../theme/colors';
import { MemoryCodeBadge } from './MemoryCodeBadge';

export type CardRating = 'Didn_know' | 'A_bit' | 'I_know' | 'Mastered';

interface FlashcardFlipViewProps {
  card: FlashcardItem;
  isFlipped: boolean;
  onToggleFlip: () => void;
}

const { width, height } = Dimensions.get('window');

export const FlashcardFlipView: React.FC<FlashcardFlipViewProps> = ({
  card,
  isFlipped,
  onToggleFlip,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [showCode, setShowCode] = useState(false);

  // Reset peek state whenever card changes or is un-flipped
  useEffect(() => {
    setShowCode(false);
  }, [card.id, card.question, isFlipped]);

  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: isFlipped ? 180 : 0,
      friction: 8,
      tension: 12,
      useNativeDriver: true,
    }).start();
  }, [isFlipped]);

  // Smooth 3D flip interpolation
  const frontInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  // Clean opacity switch right at the midpoint (90deg)
  const frontOpacity = animatedValue.interpolate({
    inputRange: [0, 89, 90, 180],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = animatedValue.interpolate({
    inputRange: [0, 89, 90, 180],
    outputRange: [0, 0, 1, 1],
  });

  const frontAnimatedStyle = {
    opacity: frontOpacity,
    transform: [{ perspective: 1000 }, { rotateY: frontInterpolate }],
  };

  const backAnimatedStyle = {
    opacity: backOpacity,
    transform: [{ perspective: 1000 }, { rotateY: backInterpolate }],
  };

  // Parse explanation into structured bullet components
  const renderExplanationLines = (explanation: string) => {
    const lines = explanation.split('\n').filter((l) => l.trim().length > 0);
    const hasBullets = lines.some((l) => l.trim().startsWith('•') || l.trim().startsWith('-'));

    if (!hasBullets) {
      return (
        <View style={styles.standaloneBox}>
          <Text style={styles.standaloneText}>{explanation.trim()}</Text>
        </View>
      );
    }

    return lines.map((line, idx) => {
      const match = line.match(/^•\s*\*\*([A-Z0-9])\*\*\s*—\s*\*\*(.*?)\*\*\s*:\s*(.*)$/);
      if (match) {
        const [, letter, keyword, desc] = match;
        return (
          <View key={idx} style={styles.bulletRow}>
            <View style={styles.letterBadge}>
              <Text style={styles.letterText}>{letter}</Text>
            </View>
            <View style={styles.bulletContent}>
              <Text style={styles.bulletKeyword}>{keyword}</Text>
              <Text style={styles.bulletDesc}>{desc}</Text>
            </View>
          </View>
        );
      }
      const cleanLine = line.replace(/^[•\-\*]\s*/, '').replace(/\*\*/g, '');
      return (
        <View key={idx} style={styles.fallbackRow}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.fallbackText}>{cleanLine}</Text>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {/* ── FRONT SIDE ── */}
      <Animated.View
        pointerEvents={isFlipped ? 'none' : 'auto'}
        style={[
          styles.card,
          styles.cardFront,
          frontAnimatedStyle,
          { zIndex: isFlipped ? 0 : 2, elevation: isFlipped ? 0 : 6 },
        ]}
      >
        {/* Header: topic label + peek code eye button */}
        <View style={styles.cardHeader}>
          <Text style={styles.conceptGroup}>
            {card.concept_group ? card.concept_group.toUpperCase() : 'CONCEPT'}
          </Text>

          {card.memory_code ? (
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowCode((prev) => !prev)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {showCode ? (
                <View style={styles.eyeActiveRow}>
                  <MemoryCodeBadge code={card.memory_code} size="sm" />
                  <Ionicons name="eye-off-outline" size={14} color={COLORS.textMuted} />
                </View>
              ) : (
                <View style={styles.eyeInactiveRow}>
                  <Ionicons name="eye-outline" size={16} color={COLORS.textMuted} />
                </View>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Main Body & Whole Bottom: Tapping anywhere flips the card */}
        <TouchableOpacity
          style={styles.cardMainTouchArea}
          activeOpacity={0.92}
          onPress={onToggleFlip}
        >
          {/* Center: question prompt */}
          <View style={styles.centerContent}>
            <Text style={styles.questionText}>{card.question}</Text>
          </View>

          {/* Footer: minimalist fingerprint touch hint */}
          <View style={styles.cardFooter}>
            <Ionicons name="finger-print-outline" size={20} color={COLORS.textDark} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── BACK SIDE ── */}
      <Animated.View
        pointerEvents={isFlipped ? 'auto' : 'none'}
        style={[
          styles.card,
          styles.cardBack,
          backAnimatedStyle,
          { zIndex: isFlipped ? 2 : 0, elevation: isFlipped ? 6 : 0 },
        ]}
      >
        <View style={styles.backContent}>
          {/* Back header: topic + hide/flip button */}
          <TouchableOpacity
            style={styles.cardHeader}
            activeOpacity={0.8}
            onPress={onToggleFlip}
          >
            <View style={styles.backHeaderLeft}>
              <Text style={styles.conceptGroup}>
                {card.concept_group ? card.concept_group.toUpperCase() : 'ANSWER'}
              </Text>
              {card.memory_code ? <MemoryCodeBadge code={card.memory_code} size="md" /> : null}
            </View>
            <TouchableOpacity
              onPress={onToggleFlip}
              style={styles.iconCloseBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="eye-off-outline" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Explanation scroll */}
          <ScrollView
            style={styles.scrollExplanation}
            contentContainerStyle={styles.scrollExplanationContent}
            showsVerticalScrollIndicator={false}
          >
            {renderExplanationLines(card.explanation || '')}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 36,
    height: Math.min(height * 0.46, 380),
    alignSelf: 'center',
    marginVertical: 4,
    position: 'relative',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cardFront: {
    justifyContent: 'space-between',
  },
  cardBack: {
    backgroundColor: '#0d0d13',
    borderColor: COLORS.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 28,
  },
  backHeaderLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  conceptGroup: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: COLORS.textMuted,
  },
  // Front eye button for abbreviated code peek
  eyeBtn: {
    padding: 4,
    borderRadius: 8,
  },
  eyeInactiveRow: {
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeActiveRow: {
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardMainTouchArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  cardFooter: {
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Back card
  backContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  iconCloseBtn: {
    padding: 6,
  },
  scrollExplanation: {
    flex: 1,
    marginVertical: 10,
  },
  scrollExplanationContent: {
    paddingBottom: 8,
  },
  standaloneBox: {
    backgroundColor: '#12121c',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 4,
  },
  standaloneText: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text,
    fontWeight: '500',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#12121c',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  letterBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
  },
  bulletContent: {
    flex: 1,
  },
  bulletKeyword: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  bulletDesc: {
    fontSize: 13,
    color: '#b0b0bc',
    lineHeight: 18,
  },
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  dot: {
    color: COLORS.accent,
    fontSize: 16,
    marginRight: 8,
  },
  fallbackText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
    lineHeight: 20,
  },
});
