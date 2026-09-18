import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getApiKey,
  setApiKey,
  getApiProvider,
  setApiProvider,
  getApiModel,
  setApiModel,
  getQuotaLimit,
  setQuotaLimit,
  getDailyUsageStats,
  resetDatabase,
  getUserName,
  setUserName,
} from '../db/database';
import { detectProvider, resolveProvider, getProviderDisplayName, SupportedProvider } from '../engine/ai';
import { DailyUsageStats } from '../types';
import { COLORS, APP_INFO } from '../theme/colors';
import { LogoHeader } from '../components/LogoHeader';

export const SettingsScreen: React.FC = () => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [quotaInput, setQuotaInput] = useState('50');
  const [stats, setStats] = useState<DailyUsageStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userNameInput, setUserNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [key, provider, qLimit, dailyStats, uName] = await Promise.all([
        getApiKey(),
        getApiProvider(),
        getQuotaLimit(),
        getDailyUsageStats(),
        getUserName(),
      ]);
      setApiKeyInput(key);
      setSelectedProvider(provider || 'auto');
      setQuotaInput(qLimit.toString());
      setStats(dailyStats);
      setUserNameInput(uName);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleKeyChange = (val: string) => {
    setApiKeyInput(val);
    const clean = val.trim();
    if (clean.startsWith('sk-or-')) {
      setSelectedProvider('openrouter');
    } else if (clean.startsWith('sk-ant-')) {
      setSelectedProvider('anthropic');
    } else if (clean.startsWith('AIza')) {
      setSelectedProvider('gemini');
    } else if (clean.startsWith('gsk_')) {
      setSelectedProvider('groq');
    }
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      showToast('API key cannot be empty.', 'err');
      return;
    }
    try {
      setSaving(true);
      const cleanKey = apiKeyInput.trim();
      const resolved = resolveProvider(cleanKey, selectedProvider);
      await setApiKey(cleanKey);
      await setApiProvider(resolved);
      setSelectedProvider(resolved);
      const label = getProviderDisplayName(resolved);
      showToast(`API saved (${label}).`);
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuota = async () => {
    const val = parseInt(quotaInput.trim(), 10);
    if (isNaN(val) || val <= 0) {
      showToast('Enter a valid number.', 'err');
      return;
    }
    await setQuotaLimit(val);
    showToast('Quota limit updated.');
    await loadSettings();
  };

  const handleReset = () => setShowConfirmReset(true);

  const confirmReset = async () => {
    setShowConfirmReset(false);
    await resetDatabase();
    showToast('All data cleared.');
    await loadSettings();
  };

  const handleSaveName = async () => {
    if (!userNameInput.trim()) {
      showToast('Enter your name first.', 'err');
      return;
    }
    try {
      setSavingName(true);
      await setUserName(userNameInput);
      showToast('Name saved.');
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      setSavingName(false);
    }
  };

  const pct = stats?.percentage ?? 0;
  const isExhausted = stats?.is_exhausted ?? false;

  return (
    <View style={styles.container}>
      {/* Consistent FLASED Logo Header */}
      <LogoHeader />

      {/* Confirm Reset Modal */}
      <Modal visible={showConfirmReset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="warning-outline" size={28} color={COLORS.danger} />
            <Text style={styles.modalTitle}>Clear All Data?</Text>
            <Text style={styles.modalSub}>This deletes all subjects, modules, and cards. Cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowConfirmReset(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={confirmReset}>
                <Text style={styles.modalDeleteText}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* User Profile Section */}
        <Text style={styles.groupLabel}>PROFILE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.rowLabel}>Your Name</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g. Cedrick"
            placeholderTextColor={COLORS.textDark}
            value={userNameInput}
            onChangeText={setUserNameInput}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.btn} onPress={handleSaveName} disabled={savingName} activeOpacity={0.8}>
            {savingName
              ? <ActivityIndicator color={COLORS.primaryDark} size="small" />
              : <Text style={styles.btnText}>Save Name</Text>}
          </TouchableOpacity>
        </View>

        {/* API Section */}
        <Text style={styles.groupLabel}>API CONFIGURATION</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="key-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.rowLabel}>Key</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Paste Gemini, OpenRouter, Cline, or OpenAI key..."
            placeholderTextColor={COLORS.textDark}
            value={apiKeyInput}
            onChangeText={handleKeyChange}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Provider selector */}
          <View style={styles.providerSection}>
            <View style={styles.providerHeader}>
              <Text style={styles.subLabel}>PROVIDER</Text>
              {apiKeyInput.trim().length > 0 && (
                <View style={styles.detectedPill}>
                  <Ionicons name="sparkles-outline" size={11} color={COLORS.accent} />
                  <Text style={styles.detectedPillText}>
                    {selectedProvider === 'auto'
                      ? `Detected: ${getProviderDisplayName(detectProvider(apiKeyInput))}`
                      : `${getProviderDisplayName(detectProvider(apiKeyInput))}`}
                  </Text>
                </View>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerScroll}>
              {[
                { id: 'auto', label: 'Auto' },
                { id: 'gemini', label: 'Gemini' },
                { id: 'openrouter', label: 'OpenRouter' },
                { id: 'anthropic', label: 'Cline / Claude' },
                { id: 'deepseek', label: 'DeepSeek' },
                { id: 'openai', label: 'OpenAI' },
                { id: 'groq', label: 'Groq' },
              ].map((p) => {
                const isActive = selectedProvider === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.providerChip, isActive && styles.providerChipActive]}
                    onPress={() => setSelectedProvider(p.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.providerChipText, isActive && styles.providerChipTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleSaveKey} disabled={saving} activeOpacity={0.8}>
            {saving
              ? <ActivityIndicator color={COLORS.primaryDark} size="small" />
              : <Text style={styles.btnText}>Save API</Text>}
          </TouchableOpacity>
        </View>

        {/* Quota Section */}
        <Text style={styles.groupLabel}>QUOTA</Text>
        <View style={styles.card}>
          {/* Usage Bar */}
          {loading || !stats ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <>
              <View style={styles.quotaTopRow}>
                <Text style={styles.quotaStat}>
                  <Text style={[styles.quotaNum, isExhausted && { color: COLORS.danger }]}>
                    {stats.requests_today}
                  </Text>
                  <Text style={styles.quotaDivider}> / {stats.quota_limit}</Text>
                </Text>
                <Text style={styles.tokenLabel}>{(stats.tokens_today / 1000).toFixed(1)}k tokens</Text>
              </View>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${pct}%` as any,
                      backgroundColor: isExhausted ? COLORS.danger : COLORS.accent,
                    },
                  ]}
                />
              </View>

              <View style={styles.quotaInputRow}>
                <Text style={styles.rowLabel}>Limit</Text>
                <TextInput
                  style={styles.quotaInput}
                  keyboardType="numeric"
                  value={quotaInput}
                  onChangeText={setQuotaInput}
                />
                <TouchableOpacity style={styles.smallBtn} onPress={handleSaveQuota}>
                  <Text style={styles.smallBtnText}>Set</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* System Section */}
        <Text style={styles.groupLabel}>SYSTEM</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Theme</Text>
            <Text style={styles.infoVal}>{APP_INFO.themeName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Version</Text>
            <Text style={styles.infoVal}>v{APP_INFO.version}</Text>
          </View>
          <TouchableOpacity
            style={[styles.infoRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(APP_INFO.githubUrl || 'https://github.com/6sceed')}
          >
            <Text style={styles.infoKey}>Build</Text>
            <View style={styles.linkRow}>
              <Text style={[styles.infoVal, { color: COLORS.accent }]}>{APP_INFO.build}</Text>
              <Ionicons name="logo-github" size={14} color={COLORS.accent} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger */}
        <Text style={styles.groupLabel}>DATA</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleReset} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
          <Text style={styles.dangerText}>Clear All Data</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Dark in-app Toast */}
      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }, toast.type === 'err' ? styles.toastErr : styles.toastOk]}>
          <Ionicons
            name={toast.type === 'err' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={16}
            color={toast.type === 'err' ? COLORS.danger : COLORS.success}
          />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 2,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  input: {
    backgroundColor: '#0d0d13',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 14,
  },
  quotaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  quotaStat: {
    fontSize: 14,
  },
  quotaNum: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  quotaDivider: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  tokenLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  barTrack: {
    height: 5,
    backgroundColor: '#12121c',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  quotaInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  quotaInput: {
    flex: 1,
    backgroundColor: '#0d0d13',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 13,
    textAlign: 'center',
  },
  smallBtn: {
    backgroundColor: '#13131c',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  smallBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 13,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoKey: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 13,
    borderRadius: 14,
  },
  dangerText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  // Confirm reset modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalBox: {
    backgroundColor: '#0f0f18',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  modalSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1a1a26',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  modalDeleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDeleteText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  // Provider Selector
  providerSection: {
    marginVertical: 4,
    gap: 8,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
  },
  detectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  detectedPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.accent,
  },
  providerScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  providerChip: {
    backgroundColor: '#101018',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  providerChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  providerChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  providerChipTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  // Toast
  toast: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 999,
  },
  toastOk: {
    backgroundColor: '#0c1a12',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  toastErr: {
    backgroundColor: '#1f0d11',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  toastText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
