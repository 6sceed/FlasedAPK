import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashcardItem, SubjectItem } from '../types';
import {
  getAllCards,
  getSubjectsAndModules,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  resetCardStates,
} from '../db/database';
import { COLORS } from '../theme/colors';
import { MemoryCodeBadge } from '../components/MemoryCodeBadge';
import { LogoHeader } from '../components/LogoHeader';

export const DeckScreen: React.FC = () => {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Accordion expansion states: closed by default
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  // Card Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardItem | null>(null);
  const [targetModuleId, setTargetModuleId] = useState<number | null>(null);
  const [conceptGroupInput, setConceptGroupInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [explanationInput, setExplanationInput] = useState('');
  const [memoryCodeInput, setMemoryCodeInput] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [allC, subs] = await Promise.all([getAllCards(), getSubjectsAndModules()]);
      setCards(allC);
      setSubjects(subs);
      // Folders start closed by default
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Hierarchical Folder Tree matching LibraryScreen
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

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  };

  // Map cards by module ID
  const cardsByModule = useMemo(() => {
    const map = new Map<number, FlashcardItem[]>();
    for (const card of cards) {
      if (card.module_id !== undefined) {
        const list = map.get(card.module_id) || [];
        list.push(card);
        map.set(card.module_id, list);
      }
    }
    return map;
  }, [cards]);

  const toggleSubject = (subjectId: number) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleOpenAddCard = (moduleId?: number) => {
    setEditingCard(null);
    setConceptGroupInput('');
    setQuestionInput('');
    setExplanationInput('');
    setMemoryCodeInput('');

    if (moduleId !== undefined) {
      setTargetModuleId(moduleId);
    } else if (subjects.length > 0 && subjects[0].modules.length > 0) {
      setTargetModuleId(subjects[0].modules[0].id);
    }

    setModalVisible(true);
  };

  const handleOpenEditCard = (card: FlashcardItem) => {
    setEditingCard(card);
    setConceptGroupInput(card.concept_group);
    setQuestionInput(card.question);
    setExplanationInput(card.explanation);
    setMemoryCodeInput(card.memory_code || '');
    if (card.module_id !== undefined) {
      setTargetModuleId(card.module_id);
    }
    setModalVisible(true);
  };

  const handleSaveCard = async () => {
    if (!questionInput.trim() || !explanationInput.trim()) {
      Alert.alert('Missing Fields', 'Question and explanation are required.');
      return;
    }

    try {
      if (editingCard && editingCard.id !== undefined) {
        await updateFlashcard(
          editingCard.id,
          conceptGroupInput.trim() || 'GENERAL',
          questionInput.trim(),
          explanationInput.trim(),
          memoryCodeInput.trim() || undefined
        );
      } else {
        if (!targetModuleId) {
          Alert.alert('Error', 'Please select a module.');
          return;
        }
        await createFlashcard(
          targetModuleId,
          conceptGroupInput.trim() || 'GENERAL',
          questionInput.trim(),
          explanationInput.trim(),
          memoryCodeInput.trim() || undefined
        );
      }
      setModalVisible(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteCard = (card: FlashcardItem) => {
    Alert.alert('Delete Card', 'Are you sure you want to delete this flashcard?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (card.id !== undefined) {
            await deleteFlashcard(card.id);
            await loadData();
          }
        },
      },
    ]);
  };

  const handleResetAllProgress = () => {
    Alert.alert('Reset Progress', 'Reset all cards back to unlearned state?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await resetCardStates();
          await loadData();
          Alert.alert('Done', 'Study progress reset.');
        },
      },
    ]);
  };

  // Filter cards by search query
  const searchFilter = (card: FlashcardItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      card.question.toLowerCase().includes(q) ||
      card.concept_group.toLowerCase().includes(q) ||
      card.explanation.toLowerCase().includes(q) ||
      (card.memory_code && card.memory_code.toLowerCase().includes(q))
    );
  };

  return (
    <View style={styles.container}>
      {/* Consistent FLASED Logo Header */}
      <LogoHeader
        rightAction={
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleResetAllProgress}>
              <Ionicons name="refresh-outline" size={16} color={COLORS.warning} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconBtn, styles.primaryIconBtn]}
              onPress={() => handleOpenAddCard()}
            >
              <Ionicons name="add" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search questions or keywords..."
          placeholderTextColor={COLORS.textDark}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Subjects & Nested Modules Accordion */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : subjects.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="layers-outline" size={48} color={COLORS.borderLight} />
          <Text style={styles.emptyTitle}>No Subjects Found</Text>
          <Text style={styles.emptySub}>Create subjects and generate cards in the Studio.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollList}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {folderTree.map((rootGroup) => {
            const isRootExpanded = expandedFolders.has(rootGroup.rootName) || searchQuery.trim().length > 0;
            const isUnfiled = rootGroup.rootName.startsWith('📁');

            const renderSubjectBlock = (sub: SubjectItem) => {
              const isSubExpanded = expandedSubjects.has(sub.id) || searchQuery.trim().length > 0;
              const subModules = sub.modules;
              const subjectCardCount = subModules.reduce((acc, m) => {
                return acc + (cardsByModule.get(m.id)?.length || 0);
              }, 0);

              return (
                <View key={sub.id} style={styles.subjectBlock}>
                  <TouchableOpacity
                    style={styles.subjectHeader}
                    onPress={() => toggleSubject(sub.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.subjectHeaderLeft}>
                      <Ionicons
                        name={isSubExpanded ? 'book' : 'book-outline'}
                        size={17}
                        color={COLORS.primary}
                      />
                      <View>
                        <Text style={styles.subjectTitle}>{sub.title}</Text>
                        <Text style={styles.subjectMeta}>
                          {subModules.length} modules · {subjectCardCount} cards
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isSubExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>

                  {isSubExpanded && (
                    <View style={styles.modulesContainer}>
                      {subModules.length === 0 ? (
                        <Text style={styles.emptyModuleText}>No modules in this subject.</Text>
                      ) : (
                        subModules.map((mod) => {
                          const modCards = cardsByModule.get(mod.id) || [];
                          const filteredModCards = modCards.filter(searchFilter);
                          const isModExpanded =
                            expandedModules.has(mod.id) || searchQuery.trim().length > 0;

                          if (searchQuery.trim().length > 0 && filteredModCards.length === 0) {
                            return null;
                          }

                          return (
                            <View key={mod.id} style={styles.moduleBlock}>
                              <TouchableOpacity
                                style={styles.moduleHeader}
                                onPress={() => toggleModule(mod.id)}
                                activeOpacity={0.8}
                              >
                                <View style={styles.moduleHeaderLeft}>
                                  <Ionicons
                                    name="document-text-outline"
                                    size={16}
                                    color={COLORS.accent}
                                  />
                                  <Text style={styles.moduleTitle} numberOfLines={1}>
                                    {mod.title}
                                  </Text>
                                  <View style={styles.cardCountBadge}>
                                    <Text style={styles.cardCountText}>
                                      {filteredModCards.length}
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.moduleHeaderRight}>
                                  <TouchableOpacity
                                    style={styles.addCardMiniBtn}
                                    onPress={() => handleOpenAddCard(mod.id)}
                                  >
                                    <Ionicons name="add" size={14} color={COLORS.primaryDark} />
                                    <Text style={styles.addCardMiniText}>Card</Text>
                                  </TouchableOpacity>

                                  <Ionicons
                                    name={isModExpanded ? 'chevron-down' : 'chevron-forward'}
                                    size={14}
                                    color={COLORS.textMuted}
                                  />
                                </View>
                              </TouchableOpacity>

                              {isModExpanded && (
                                <View style={styles.cardsContainer}>
                                  {filteredModCards.length === 0 ? (
                                    <Text style={styles.emptyCardsText}>No cards in this module.</Text>
                                  ) : (
                                    filteredModCards.map((card) => (
                                      <View key={card.id} style={styles.cardItem}>
                                        <View style={styles.cardItemHeader}>
                                          <View style={styles.conceptRow}>
                                            <Text style={styles.conceptTag}>
                                              {card.concept_group
                                                ? card.concept_group.toUpperCase()
                                                : 'GENERAL'}
                                            </Text>
                                            {card.memory_code ? (
                                              <MemoryCodeBadge code={card.memory_code} size="sm" />
                                            ) : null}
                                          </View>

                                          <View style={styles.cardItemActions}>
                                            <TouchableOpacity
                                              style={styles.smallActionBtn}
                                              onPress={() => handleOpenEditCard(card)}
                                            >
                                              <Ionicons
                                                name="pencil-outline"
                                                size={14}
                                                color={COLORS.textMuted}
                                              />
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                              style={styles.smallActionBtn}
                                              onPress={() => handleDeleteCard(card)}
                                            >
                                              <Ionicons
                                                name="trash-outline"
                                                size={14}
                                                color={COLORS.danger}
                                              />
                                            </TouchableOpacity>
                                          </View>
                                        </View>

                                        <Text style={styles.cardQuestion}>{card.question}</Text>
                                        <Text style={styles.cardExplanationSnippet} numberOfLines={2}>
                                          {card.explanation
                                            ? card.explanation.replace(/\*\*/g, '').replace(/•/g, '')
                                            : ''}
                                        </Text>
                                      </View>
                                    ))
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            };

            if (isUnfiled) {
              return rootGroup.rootSubjects.map(renderSubjectBlock);
            }

            return (
              <View key={rootGroup.rootName} style={styles.rootFolderBlock}>
                <TouchableOpacity
                  style={styles.rootFolderHeader}
                  onPress={() => toggleFolder(rootGroup.rootName)}
                  activeOpacity={0.8}
                >
                  <View style={styles.rootFolderLeft}>
                    <Ionicons
                      name={isRootExpanded ? 'folder-open' : 'folder'}
                      size={18}
                      color={COLORS.primary}
                    />
                    <Text style={styles.rootFolderTitle}>
                      {rootGroup.rootName.toUpperCase()}
                    </Text>
                  </View>
                  <Ionicons
                    name={isRootExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>

                {isRootExpanded && (
                  <View style={styles.rootFolderContent}>
                    {rootGroup.rootSubjects.map(renderSubjectBlock)}
                    {rootGroup.subFolders.map((subFolder) => {
                      const subFolderKey = `${rootGroup.rootName}__sub__${subFolder.subFolderName}`;
                      const isSubFolderExpanded = expandedFolders.has(subFolderKey) || searchQuery.trim().length > 0;

                      return (
                        <View key={subFolderKey} style={styles.subFolderBlock}>
                          <TouchableOpacity
                            style={styles.subFolderHeader}
                            onPress={() => toggleFolder(subFolderKey)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.rootFolderLeft}>
                              <Ionicons
                                name={isSubFolderExpanded ? 'folder-open' : 'folder'}
                                size={15}
                                color={COLORS.accent}
                              />
                              <Text style={styles.subFolderTitle}>{subFolder.subFolderName}</Text>
                            </View>
                            <Ionicons
                              name={isSubFolderExpanded ? 'chevron-down' : 'chevron-forward'}
                              size={14}
                              color={COLORS.textMuted}
                            />
                          </TouchableOpacity>
                          {isSubFolderExpanded && (
                            <View style={styles.subFolderContent}>
                              {subFolder.subjects.map(renderSubjectBlock)}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Edit / Add Card Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{editingCard ? 'Edit Card' : 'Add Card'}</Text>

              {/* Module Selector if adding new card */}
              {!editingCard && (
                <>
                  <Text style={styles.inputLabel}>Module</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.modulePickerRow}
                  >
                    {subjects
                      .flatMap((s) => s.modules)
                      .map((m) => {
                        const isSel = targetModuleId === m.id;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.moduleChip, isSel && styles.moduleChipActive]}
                            onPress={() => setTargetModuleId(m.id)}
                          >
                            <Text
                              style={[
                                styles.moduleChipText,
                                isSel && styles.moduleChipTextActive,
                              ]}
                            >
                              {m.title}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </>
              )}

              <Text style={styles.inputLabel}>Concept</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. DEFINITIONS, TYPES, MODELS"
                placeholderTextColor={COLORS.textDark}
                value={conceptGroupInput}
                onChangeText={setConceptGroupInput}
              />

              <Text style={styles.inputLabel}>Question</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="What is the concept or question?"
                placeholderTextColor={COLORS.textDark}
                value={questionInput}
                onChangeText={setQuestionInput}
              />

              <Text style={styles.inputLabel}>Memory Code (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Acronym code (e.g. MLSG or leave empty)"
                placeholderTextColor={COLORS.textDark}
                value={memoryCodeInput}
                onChangeText={setMemoryCodeInput}
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Explanation</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                placeholder="Direct explanation or bullet points..."
                placeholderTextColor={COLORS.textDark}
                value={explanationInput}
                onChangeText={setExplanationInput}
                multiline
                numberOfLines={5}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveCard}>
                  <Text style={styles.modalBtnTextSave}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#101017',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryIconBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0c12',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    height: 42,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 30,
  },
  rootFolderBlock: {
    marginBottom: 8,
  },
  rootFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a10',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  rootFolderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rootFolderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  rootFolderContent: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(168, 85, 247, 0.2)',
    marginLeft: 12,
    gap: 8,
  },
  subFolderBlock: {
    marginBottom: 6,
  },
  subFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d0d14',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  subFolderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  subFolderContent: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(56, 189, 248, 0.2)',
    marginLeft: 10,
    gap: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  // Subject Block
  subjectBlock: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#101017',
  },
  subjectHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  subjectTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  subjectMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modulesContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0a0a0f',
    gap: 8,
  },
  emptyModuleText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontStyle: 'italic',
    padding: 10,
  },
  // Module Block
  moduleBlock: {
    backgroundColor: '#11111a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#141420',
  },
  moduleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  moduleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  cardCountBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardCountText: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '700',
  },
  moduleHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCardMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addCardMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  cardsContainer: {
    padding: 8,
    gap: 8,
    backgroundColor: '#0c0c14',
  },
  emptyCardsText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontStyle: 'italic',
    padding: 8,
  },
  // Card Item
  cardItem: {
    backgroundColor: '#13131f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  cardItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  conceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  conceptTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  cardItemActions: {
    flexDirection: 'row',
    gap: 4,
  },
  smallActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1c1c28',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardQuestion: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardExplanationSnippet: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    padding: 20,
    justifyContent: 'center',
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#101017',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 12,
  },
  modalTextArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  modulePickerRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  moduleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#101017',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
  },
  moduleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  moduleChipText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  moduleChipTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalBtnCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnTextCancel: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  modalBtnSave: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalBtnTextSave: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
});
