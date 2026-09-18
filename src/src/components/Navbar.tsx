import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';

export type TabType = 'home' | 'library' | 'generator' | 'deck' | 'settings';

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab }) => {
  const tabs: { key: TabType; iconActive: keyof typeof Ionicons.glyphMap; iconInactive: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'home', iconActive: 'home', iconInactive: 'home-outline' },
    { key: 'library', iconActive: 'library', iconInactive: 'library-outline' },
    { key: 'generator', iconActive: 'flash', iconInactive: 'flash-outline' },
    { key: 'deck', iconActive: 'layers', iconInactive: 'layers-outline' },
    { key: 'settings', iconActive: 'settings', iconInactive: 'settings-outline' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, isActive && styles.activeTabItem]}
              onPress={() => onSelectTab(t.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? t.iconActive : t.iconInactive}
                size={22}
                color={isActive ? COLORS.primary : COLORS.textMuted}
              />
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 8,
    backgroundColor: COLORS.background,
  },
  navBar: {
    flexDirection: 'row',
    backgroundColor: '#0c0c12',
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  activeTabItem: {
    backgroundColor: '#161622',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    position: 'absolute',
    bottom: 6,
  },
});
