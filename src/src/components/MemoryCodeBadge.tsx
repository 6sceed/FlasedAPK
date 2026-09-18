import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme/colors';

interface MemoryCodeBadgeProps {
  code: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export const MemoryCodeBadge: React.FC<MemoryCodeBadgeProps> = ({ code, size = 'md' }) => {
  if (!code) return null;

  const letters = code.split('');

  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const badgeSize = isSm ? 22 : isLg ? 32 : 26;
  const fontSize = isSm ? 11 : isLg ? 16 : 13;

  return (
    <View style={styles.container}>
      {letters.map((letter, idx) => (
        <View key={idx} style={[styles.badge, { width: badgeSize, height: badgeSize }]}>
          <Text style={[styles.text, { fontSize }]}>{letter.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 4,
  },
  badge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: COLORS.accent,
    fontWeight: '700',
    fontFamily: 'System',
  },
});
