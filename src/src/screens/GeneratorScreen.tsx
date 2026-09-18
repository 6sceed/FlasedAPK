import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubjectItem } from '../types';
import { getSubjectsAndModules, saveModuleAndCards, getApiKey, getApiProvider } from '../db/database';
import { generateFlashcardsForModule, resolveProvider, getProviderDisplayName } from '../engine/ai';
import { COLORS } from '../theme/colors';
import { LogoHeader } from '../components/LogoHeader';

interface GeneratorScreenProps {
  onGeneratedSuccess: (subjectId: number, moduleId: number, title: string) => void;
  onNavigateSettings: () => void;
}

export const GeneratorScreen: React.FC<GeneratorScreenProps> = ({
  onGeneratedSuccess,
  onNavigateSettings,
}) => {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newSubjectFolder, setNewSubjectFolder] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [providerLabel, setProviderLabel] = useState('AI');

  // Folder-based Subject Picker Modal state: ALL folders closed by default
  const [subjectPickerVisible, setSubjectPickerVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [expandedPickerFolders, setExpandedPickerFolders] = useState<Set<string>>(new Set());

  // Custom Dark Modal State (replaces ugly white Alert.alert)
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    msg: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    primaryText?: string;
    onPrimary?: () => void;
    secondaryText?: string;
    onSecondary?: () => void;
  }>({
    visible: false,
    title: '',
    msg: '',
    icon: 'checkmark-circle-outline',
    iconColor: COLORS.success,
  });

  // Dark Toast for field validation
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const loadData = async () => {
    try {
      const subs = await getSubjectsAndModules();
      setSubjects(subs);
      if (subs.length > 0 && selectedSubjectId === null) {
        setSelectedSubjectId(subs[0].id);
      }
      const key = await getApiKey();
      const hasKey = key.trim().length > 0;
      setHasApiKey(hasKey);

      if (hasKey) {
        const prov = await getApiProvider();
        const effectiveProv = resolveProvider(key, prov);
        setProviderLabel(getProviderDisplayName(effectiveProv));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Hierarchical Folder Tree for Subject Picker
  const folderTree = useMemo(() => {
    interface SubFolderGroup {
      subFolderName: string;
      subjects: SubjectItem[];
    }
    interface RootFolderGroup {
      rootName: string;
      subFolders: SubFolderGroup[];
      rootSubjects: SubjectItem[];
    }

    const rootMap = new Map<string, RootFolderGroup>();

    subjects.forEach((sub) => {
      const fullGroup = (sub.group_name || '').trim();
      const parts = fullGroup.split(/[\/\\]+/).map((p) => p.trim()).filter(Boolean);
      const rootName = parts[0] || '📁 Unfiled';
      const subName = parts.slice(1).join(' / ');

      if (!rootMap.has(rootName)) {
        rootMap.set(rootName, {
          rootName,
          subFolders: [],
          rootSubjects: [],
        });
      }

      const root = rootMap.get(rootName)!;
      if (!subName) {
        root.rootSubjects.push(sub);
      } else {
        let subGroup = root.subFolders.find((sf) => sf.subFolderName === subName);
        if (!subGroup) {
          subGroup = { subFolderName: subName, subjects: [] };
          root.subFolders.push(subGroup);
        }
        subGroup.subjects.push(sub);
      }
    });

    return Array.from(rootMap.values()).sort((a, b) => a.rootName.localeCompare(b.rootName));
  }, [subjects]);

  const filteredFolderTree = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return folderTree;

    return folderTree
      .map((root) => {
        const rootMatches = root.rootName.toLowerCase().includes(q);
        const filteredRootSubjects = root.rootSubjects.filter((s) =>
          rootMatches || s.title.toLowerCase().includes(q)
        );
        const filteredSubFolders = root.subFolders
          .map((sf) => {
            const sfMatches = rootMatches || sf.subFolderName.toLowerCase().includes(q);
            const sfSubjects = sf.subjects.filter((s) =>
              sfMatches || s.title.toLowerCase().includes(q)
            );
            return { ...sf, subjects: sfSubjects };
          })
          .filter((sf) => sf.subjects.length > 0 || sf.subFolderName.toLowerCase().includes(q));

        if (rootMatches || filteredRootSubjects.length > 0 || filteredSubFolders.length > 0) {
          return {
            ...root,
            rootSubjects: filteredRootSubjects,
            subFolders: filteredSubFolders,
          };
        }
        return null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [folderTree, pickerSearch]);

  const togglePickerFolder = (folderKey: string) => {
    setExpandedPickerFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  };

  const selectedSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  const handleGenerate = async () => {
    if (!hasApiKey) {
      setDialog({
        visible: true,
        title: 'API Key Required',
        msg: 'Please paste your API key in Settings to generate cards (Gemini, OpenRouter, Cline, Groq, or OpenAI).',
        icon: 'key-outline',
        iconColor: COLORS.warning,
        primaryText: 'Go to Settings',
        onPrimary: () => {
          setDialog((prev) => ({ ...prev, visible: false }));
          onNavigateSettings();
        },
        secondaryText: 'Cancel',
        onSecondary: () => setDialog((prev) => ({ ...prev, visible: false })),
      });
      return;
    }

    if (!moduleTitle.trim()) {
      showToast('Enter a module title first.');
      return;
    }

    if (!sourceContent.trim()) {
      showToast('Paste notes or source text first.');
      return;
    }

    let subjectTitleToUse = '';
    let targetSubjectId: number | undefined = undefined;

    if (selectedSubjectId === -1) {
      if (!newSubjectTitle.trim()) {
        showToast('Enter a subject name first.');
        return;
      }
      subjectTitleToUse = newSubjectTitle.trim();
    } else {
      const found = subjects.find((s) => s.id === selectedSubjectId);
      if (found) {
        subjectTitleToUse = found.title;
        targetSubjectId = found.id;
      } else {
        subjectTitleToUse = newSubjectTitle.trim() || 'General';
      }
    }

    try {
      setIsGenerating(true);
      const aiResponse = await generateFlashcardsForModule(moduleTitle.trim(), sourceContent.trim());

      const newModuleId = await saveModuleAndCards(
        subjectTitleToUse,
        moduleTitle.trim(),
        sourceContent.trim(),
        aiResponse,
        targetSubjectId,
        selectedSubjectId === -1 ? newSubjectFolder.trim() : undefined
      );

      const count = aiResponse.cards.length;

      // Dark success dialog
      setDialog({
        visible: true,
        title: 'Deck Created!',
        msg: `${count} flashcards generated successfully with ${providerLabel}.`,
        icon: 'sparkles',
        iconColor: COLORS.primary,
        primaryText: 'Start Studying',
        onPrimary: () => {
          setDialog((prev) => ({ ...prev, visible: false }));
          onGeneratedSuccess(targetSubjectId || 1, newModuleId, moduleTitle);
        },
        secondaryText: 'Done',
        onSecondary: () => setDialog((prev) => ({ ...prev, visible: false })),
      });

      // Reset form
      setModuleTitle('');
      setSourceContent('');
      setNewSubjectTitle('');
      setNewSubjectFolder('');
      await loadData();
    } catch (error: any) {
      setDialog({
        visible: true,
        title: 'Generation Failed',
        msg: error.message || 'An error occurred while generating flashcards.',
        icon: 'alert-circle-outline',
        iconColor: COLORS.danger,
        primaryText: 'OK',
        onPrimary: () => setDialog((prev) => ({ ...prev, visible: false })),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Consistent FLASED Logo Header */}
      <LogoHeader
        rightAction={
          !hasApiKey ? (
            <TouchableOpacity style={styles.keyWarnBadge} onPress={onNavigateSettings}>
              <Ionicons name="key-outline" size={14} color={COLORS.warning} />
              <Text style={styles.keyWarnText}>Key</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.modelPill}>
              <Text style={styles.modelPillText}>{providerLabel}</Text>
            </View>
          )
        }
      />

      {/* Dark Themed Dialog Modal */}
      <Modal visible={dialog.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name={dialog.icon} size={32} color={dialog.iconColor} />
            <Text style={styles.modalTitle}>{dialog.title}</Text>
            <Text style={styles.modalSub}>{dialog.msg}</Text>
            <View style={styles.modalActions}>
              {dialog.secondaryText && (
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={dialog.onSecondary}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>{dialog.secondaryText}</Text>
                </TouchableOpacity>
              )}
              {dialog.primaryText && (
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={dialog.onPrimary}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalPrimaryText}>{dialog.primaryText}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder-based Subject Picker Modal */}
      <Modal visible={subjectPickerVisible} transparent animationType="slide">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalBox}>
            {/* Header */}
            <View style={styles.pickerHeaderRow}>
              <View>
                <Text style={styles.pickerModalTitle}>Select Subject</Text>
                <Text style={styles.pickerModalSub}>Choose folder & subject for this module</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerCloseBtn}
                onPress={() => setSubjectPickerVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Quick Filter Search */}
            <View style={styles.pickerSearchRow}>
              <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Filter folders or subjects..."
                placeholderTextColor={COLORS.textDark}
                value={pickerSearch}
                onChangeText={setPickerSearch}
              />
              {pickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Folder Tree Scroll */}
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              {/* Option to create a new subject */}
              <TouchableOpacity
                style={[
                  styles.pickerNewSubjectOption,
                  selectedSubjectId === -1 && styles.pickerOptionActive,
                ]}
                onPress={() => {
                  setSelectedSubjectId(-1);
                  setSubjectPickerVisible(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.pickerNewSubjectIconBox}>
                  <Ionicons name="add" size={16} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerNewSubjectTitle}>+ Create New Subject</Text>
                  <Text style={styles.pickerNewSubjectSub}>Add a new subject inside a folder</Text>
                </View>
                {selectedSubjectId === -1 && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                )}
              </TouchableOpacity>

              <View style={styles.pickerDivider} />

              {/* Grouped Folders */}
              {filteredFolderTree.length === 0 ? (
                <View style={styles.pickerEmptyContainer}>
                  <Text style={styles.pickerEmptyText}>No subjects or folders found.</Text>
                </View>
              ) : (
                filteredFolderTree.map((rootGroup) => {
                  const isExpanded =
                    expandedPickerFolders.has(rootGroup.rootName) || pickerSearch.trim().length > 0;
                  const isUnfiled = rootGroup.rootName.startsWith('📁');
                  const totalSubCount =
                    rootGroup.rootSubjects.length +
                    rootGroup.subFolders.reduce((a, sf) => a + sf.subjects.length, 0);

                  return (
                    <View key={rootGroup.rootName} style={styles.pickerFolderBlock}>
                      {/* Root Folder Header */}
                      <TouchableOpacity
                        style={styles.pickerFolderHeader}
                        onPress={() => togglePickerFolder(rootGroup.rootName)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.pickerFolderHeaderLeft}>
                          <Ionicons
                            name={isExpanded ? 'folder-open-outline' : 'folder-outline'}
                            size={16}
                            color={COLORS.primary}
                          />
                          <Text style={styles.pickerFolderHeaderTitle} numberOfLines={1}>
                            {isUnfiled ? 'UNFILED' : rootGroup.rootName.toUpperCase()}
                          </Text>
                          <View style={styles.pickerCountBadge}>
                            <Text style={styles.pickerCountText}>{totalSubCount}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                          size={14}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>

                      {/* Folder Contents */}
                      {isExpanded && (
                        <View style={styles.pickerFolderChildren}>
                          {/* Direct subjects */}
                          {rootGroup.rootSubjects.map((sub) => {
                            const isSelected = selectedSubjectId === sub.id;
                            return (
                              <TouchableOpacity
                                key={sub.id}
                                style={[
                                  styles.pickerSubjectRow,
                                  isSelected && styles.pickerSubjectRowActive,
                                ]}
                                onPress={() => {
                                  setSelectedSubjectId(sub.id);
                                  setSubjectPickerVisible(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Ionicons
                                  name="book-outline"
                                  size={15}
                                  color={isSelected ? COLORS.primary : COLORS.textMuted}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.pickerSubjectName,
                                      isSelected && styles.pickerSubjectNameActive,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {sub.title}
                                  </Text>
                                  <Text style={styles.pickerSubjectMeta}>
                                    {sub.modules.length} modules · {sub.total_cards} cards
                                  </Text>
                                </View>
                                {isSelected && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={18}
                                    color={COLORS.primary}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}

                          {/* Nested Sub-Folders */}
                          {rootGroup.subFolders.map((subFolder) => {
                            const subFolderKey = `${rootGroup.rootName}__sub__${subFolder.subFolderName}`;
                            const isSubFolderExpanded =
                              expandedPickerFolders.has(subFolderKey) || pickerSearch.trim().length > 0;

                            return (
                              <View key={subFolder.subFolderName} style={styles.pickerSubFolderBlock}>
                                <TouchableOpacity
                                  style={styles.pickerSubFolderHeader}
                                  onPress={() => togglePickerFolder(subFolderKey)}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name={isSubFolderExpanded ? 'folder-open' : 'folder'}
                                    size={13}
                                    color={COLORS.accent}
                                  />
                                  <Text style={styles.pickerSubFolderTitle} numberOfLines={1}>
                                    {subFolder.subFolderName}
                                  </Text>
                                  <View style={styles.pickerCountBadge}>
                                    <Text style={styles.pickerCountText}>{subFolder.subjects.length}</Text>
                                  </View>
                                  <Ionicons
                                    name={isSubFolderExpanded ? 'chevron-down' : 'chevron-forward'}
                                    size={12}
                                    color={COLORS.textMuted}
                                    style={{ marginLeft: 'auto' }}
                                  />
                                </TouchableOpacity>

                                {isSubFolderExpanded &&
                                  subFolder.subjects.map((sub) => {
                                    const isSelected = selectedSubjectId === sub.id;
                                    return (
                                      <TouchableOpacity
                                        key={sub.id}
                                        style={[
                                          styles.pickerSubjectRow,
                                          isSelected && styles.pickerSubjectRowActive,
                                          { paddingLeft: 18 },
                                        ]}
                                        onPress={() => {
                                          setSelectedSubjectId(sub.id);
                                          setSubjectPickerVisible(false);
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons
                                          name="book-outline"
                                          size={14}
                                          color={isSelected ? COLORS.primary : COLORS.textMuted}
                                        />
                                        <View style={{ flex: 1 }}>
                                          <Text
                                            style={[
                                              styles.pickerSubjectName,
                                              isSelected && styles.pickerSubjectNameActive,
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {sub.title}
                                          </Text>
                                          <Text style={styles.pickerSubjectMeta}>
                                            {sub.modules.length} modules · {sub.total_cards} cards
                                          </Text>
                                        </View>
                                        {isSelected && (
                                          <Ionicons
                                            name="checkmark-circle"
                                            size={18}
                                            color={COLORS.primary}
                                          />
                                        )}
                                      </TouchableOpacity>
                                    );
                                  })}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        {/* Subject Selection Card */}
        <View style={styles.subjectHeaderRow}>
          <Text style={styles.label}>Target Subject & Folder</Text>
          <TouchableOpacity
            style={styles.changeSubjectPill}
            onPress={() => setSubjectPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="folder-open-outline" size={12} color={COLORS.primary} />
            <Text style={styles.changeSubjectPillText}>Browse Folders</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.selectedSubjectCard}
          onPress={() => setSubjectPickerVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.selectedSubjectLeft}>
            <View
              style={[
                styles.selectedSubjectIconBox,
                selectedSubjectId === -1 && { backgroundColor: 'rgba(168, 85, 247, 0.15)' },
              ]}
            >
              <Ionicons
                name={selectedSubjectId === -1 ? 'add' : 'folder-outline'}
                size={18}
                color={COLORS.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedFolderLabel}>
                {selectedSubjectId === -1
                  ? 'NEW SUBJECT'
                  : selectedSubject?.group_name?.trim() || 'UNFILED'}
              </Text>
              <Text style={styles.selectedSubjectTitle} numberOfLines={1}>
                {selectedSubjectId === -1
                  ? newSubjectTitle.trim() || 'Tap to enter subject name...'
                  : selectedSubject?.title || 'Choose a Subject'}
              </Text>
            </View>
          </View>

          <View style={styles.changeSubjectBadge}>
            <Text style={styles.changeSubjectText}>Change</Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
          </View>
        </TouchableOpacity>

        {selectedSubjectId === -1 && (
          <View style={styles.newSubjectInputGroup}>
            <TextInput
              style={styles.input}
              placeholder="New Subject Name (e.g. Computer Networks)"
              placeholderTextColor={COLORS.textDark}
              value={newSubjectTitle}
              onChangeText={setNewSubjectTitle}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Folder / Semester (Optional e.g. 2nd Year 1st Sem)"
              placeholderTextColor={COLORS.textDark}
              value={newSubjectFolder}
              onChangeText={setNewSubjectFolder}
            />
          </View>
        )}

        {/* Module Title */}
        <Text style={styles.label}>Module Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Week 1: Photosynthesis & Calvin Cycle"
          placeholderTextColor={COLORS.textDark}
          value={moduleTitle}
          onChangeText={setModuleTitle}
        />

        {/* Source Text / Study Notes */}
        <Text style={styles.label}>Source Content / Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Paste lecture notes, book summaries, or syllabus text here..."
          placeholderTextColor={COLORS.textDark}
          value={sourceContent}
          onChangeText={setSourceContent}
          multiline
          numberOfLines={8}
        />

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={isGenerating}
          activeOpacity={0.8}
        >
          {isGenerating ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primaryDark} size="small" />
              <Text style={styles.generateBtnText}>Generating Flashcards...</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>Generate Deck</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Dark Toast */}
      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} />
          <Text style={styles.toastText}>{toast}</Text>
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
  keyWarnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  keyWarnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
  },
  modelPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  modelPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 8,
  },
  changeSubjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changeSubjectPillText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  selectedSubjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0c0c13',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  selectedSubjectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedSubjectIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedFolderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectedSubjectTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  changeSubjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#12121a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  changeSubjectText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  newSubjectInputGroup: {
    gap: 2,
    marginBottom: 6,
  },
  // Folder Picker Modal
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  pickerModalBox: {
    backgroundColor: '#0c0c13',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '82%',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  pickerModalSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#161622',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    marginBottom: 14,
  },
  pickerSearchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
  },
  pickerScroll: {
    maxHeight: 420,
  },
  pickerNewSubjectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  pickerOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
  },
  pickerNewSubjectIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerNewSubjectTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  pickerNewSubjectSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  pickerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  pickerEmptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  pickerEmptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  pickerFolderBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  pickerFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  pickerFolderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerFolderHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
    flex: 1,
  },
  pickerCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pickerCountText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  pickerFolderChildren: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(168, 85, 247, 0.15)',
    marginLeft: 14,
    marginTop: 4,
    gap: 4,
  },
  pickerSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#0e0e16',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  pickerSubjectRowActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  pickerSubjectName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  pickerSubjectNameActive: {
    color: COLORS.primary,
  },
  pickerSubjectMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  pickerSubFolderBlock: {
    marginTop: 4,
    gap: 4,
  },
  pickerSubFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  pickerSubFolderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  input: {
    backgroundColor: '#0d0d13',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 10,
  },
  textArea: {
    height: 180,
    textAlignVertical: 'top',
  },
  generateBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 30,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  // Modal dialog (dark, premium)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    gap: 10,
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
    marginBottom: 10,
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
  modalPrimaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 14,
  },
  // Dark Toast
  toast: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#171722',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    zIndex: 999,
  },
  toastText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
