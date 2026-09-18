import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, APP_INFO } from '../theme/colors';

interface LogoHeaderProps {
  rightAction?: React.ReactNode;
}

export const LogoHeader: React.FC<LogoHeaderProps> = ({ rightAction }) => {
  return (
    <View style={styles.topBar}>
      <View style={styles.logoRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>F</Text>
        </View>
        <Text style={styles.appName}>{APP_INFO.appName}</Text>
      </View>
      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#12121e',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMarkText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
  },
  appName: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  buildText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
    fontWeight: '500',
  },
  rightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
