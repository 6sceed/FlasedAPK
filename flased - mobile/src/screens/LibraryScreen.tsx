import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubjectItem, ModuleItem } from '../types';
import {
  getSubjectsAndModules,
  createSubject,
  renameSubject,
  deleteSubject,
  createModule,
  deleteModule,
  moveSubjectToFolder,
  renameFolder,
} from '../db/database';
import { COLORS } from '../theme/colors';
import { SubjectCard } from '../components/SubjectCard';
import { LogoHeader } from '../components/LogoHeader';

interface LibraryScreenProps {
  onStartStudy: (type: 'subject' | 'module' | 'all', id?: number, title?: string) => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ onStartStudy }) => {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Group filter state: 'all' or specific group name
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  // Folders are closed by default at all times unless explicitly opened by user
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Subject Modal State (Create / Rename / Due Date)
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [subjectTitleInput, setSubjectTitleInput] = useState('');
  const [subjectGroupInput, setSubjectGroupInput] = useState('');
  const [subjectDueDateInput, setSubjectDueDateInput] = useState('');

  // + Add Menu
  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // New Folder Modal
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  // Move Folder Modal State
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [targetSubjectForMove, setTargetSubjectForMove] = useState<SubjectItem | null>(null);
  const [destinationFolderInput, setDestinationFolderInput] = useState('');

  // Rename Folder Modal State
  const [renameFolderModalVisible, setRenameFolderModalVisible] = useState(false);
  const [renameFolderOldName, setRenameFolderOldName] = useState('');
  const [renameFolderNewName, setRenameFolderNewName] = useState('');

  // Module Modal State
  const [moduleModalVisible, setModuleModalVisible] = useState(false);
  const [targetSubjectForModule, setTargetSubjectForModule] = useState<SubjectItem | null>(null);
  const [moduleTitleInput, setModuleTitleInput] = useState('');
  const [moduleContentInput, setModuleContentInput] = useState('');

  // Custom Dark Confirm Delete Modal (no white OS alerts)
  const [confirmDelete, setConfirmDelete] = useState<{
    visible: boolean;
    title: string;
    sub: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    sub: '',
    onConfirm: () => {},
  });

  // Dark Toast
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

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getSubjectsAndModules();
      setSubjects(data);
    } catch (e) {
      console.error('Failed to load library:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute all distinct groups
  const allGroups = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach((s) => {
      const g = (s.group_name || 'General').trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort();
  }, [subjects]);

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const handleOpenAddSubject = () => {
    setEditingSubject(null);
    setSubjectTitleInput('');
    setSubjectGroupInput(selectedGroupFilter !== 'all' ? selectedGroupFilter : '');
    setSubjectDueDateInput('');
    setSubjectModalVisible(true);
  };

  const handleOpenEditSubject = (subject: SubjectItem) => {
    setEditingSubject(subject);
    setSubjectTitleInput(subject.title);
    setSubjectGroupInput(subject.group_name || '');
    setSubjectDueDateInput(subject.due_date || '');
    setSubjectModalVisible(true);
  };

  const handleOpenMoveFolder = (subject: SubjectItem) => {
    setTargetSubjectForMove(subject);
    setDestinationFolderInput(subject.group_name || '');
    setMoveModalVisible(true);
  };

  const handleApplyMoveFolder = async () => {
    if (!targetSubjectForMove) return;
    const dest = destinationFolderInput.trim();
    try {
      await moveSubjectToFolder(targetSubjectForMove.id, dest);
      showToast(dest ? `Moved to '${dest}'.` : 'Moved to Unfiled.');
      setMoveModalVisible(false);
      setTargetSubjectForMove(null);
      setDestinationFolderInput('');
      await loadData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
  };

  const handleOpenRenameFolder = (currentFolderName: string) => {
    setRenameFolderOldName(currentFolderName);
    setRenameFolderNewName(currentFolderName);
    setRenameFolderModalVisible(true);
  };

  const handleApplyRenameFolder = async () => {
    const newName = renameFolderNewName.trim();
    if (!newName) {
      showToast('Folder name cannot be empty.', 'err');
      return;
    }
    try {
      await renameFolder(renameFolderOldName, newName);
      showToast(`Renamed to '${newName}'.`);
      setRenameFolderModalVisible(false);
      setRenameFolderOldName('');
      setRenameFolderNewName('');
      await loadData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderNameInput.trim();
    if (!name) { showToast('Folder name cannot be empty.', 'err'); return; }
    // Create a placeholder subject inside this folder so the folder appears
    // Alternatively just close — folders auto-appear when subjects are assigned
    // For now: open subject modal pre-filled with the folder name
    setNewFolderModalVisible(false);
    setNewFolderNameInput('');
    setSubjectGroupInput(name);
    setSubjectTitleInput('');
    setSubjectDueDateInput('');
    setEditingSubject(null);
    setSubjectModalVisible(true);
  };

  const handleCreateOrRenameSubject = async () => {
    if (!subjectTitleInput.trim()) {
      showToast('Enter a subject name.', 'err');
      return;
    }
    const groupToSave = subjectGroupInput.trim();  // allow empty = no folder
    const dueDateToSave = subjectDueDateInput.trim() || null;
    try {
      if (editingSubject) {
        await renameSubject(editingSubject.id, subjectTitleInput.trim(), groupToSave, dueDateToSave);
        showToast('Subject updated.');
      } else {
        await createSubject(subjectTitleInput.trim(), groupToSave, dueDateToSave);
        showToast('Subject created.');
      }
      setSubjectModalVisible(false);
      setSubjectTitleInput('');
      setSubjectGroupInput('');
      setSubjectDueDateInput('');
      setEditingSubject(null);
      await loadData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
  };

  // Helper to format ISO date offset
  const setDuePreset = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSubjectDueDateInput(`${yyyy}-${mm}-${dd}`);
  };

  const handleDeleteSubject = (subject: SubjectItem) => {
    setConfirmDelete({
      visible: true,
      title: 'Delete Subject?',
      sub: `This will permanently delete '${subject.title}' and all its modules and flashcards.`,
      onConfirm: async () => {
        setConfirmDelete((prev) => ({ ...prev, visible: false }));
        await deleteSubject(subject.id);
        showToast('Subject deleted.');
        await loadData();
      },
    });
  };

  const handleCreateModule = async () => {
    if (!targetSubjectForModule || !moduleTitleInput.trim()) return;
    try {
      await createModule(targetSubjectForModule.id, moduleTitleInput.trim(), moduleContentInput.trim());
      showToast('Module created.');
      setModuleModalVisible(false);
      setModuleTitleInput('');
      setModuleContentInput('');
      setTargetSubjectForModule(null);
      await loadData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
  };

  const handleDeleteModule = (module: ModuleItem) => {
    setConfirmDelete({
      visible: true,
      title: 'Delete Module?',
      sub: `Delete '${module.title}' and its flashcards?`,
      onConfirm: async () => {
        setConfirmDelete((prev) => ({ ...prev, visible: false }));
        await deleteModule(module.id);
        showToast('Module deleted.');
        await loadData();
      },
    });
  };

  const totalCardsAll = subjects.reduce((sum, s) => sum + s.total_cards, 0);

  // Grouped subjects tree: supports nested folders like "College / 1st Year" or "1st Year / Sem 1"
  const folderTree = useMemo(() => {
    // Root level map: RootFolder -> SubFolder -> SubjectItem[]
    // If a group has no slash, it's: RootFolder -> "" -> SubjectItem[]
    interface SubFolderGroup {
      subFolderName: string;
      fullPath: string;
      subjects: SubjectItem[];
      totalCards: number;
    }
    interface RootFolderGroup {
      rootName: string;
      subFolders: SubFolderGroup[];
      rootSubjects: SubjectItem[]; // subjects directly in root
      totalCards: number;
      totalSubjects: number;
    }

    const rootMap = new Map<string, RootFolderGroup>();

    subjects.forEach((sub) => {
      const fullGroup = (sub.group_name || '').trim();
      const parts = fullGroup.split(/[\/\\]+/).map((p) => p.trim()).filter(Boolean);
      const rootName = parts[0] || '📁 Unfiled';  // empty group = Unfiled bucket
      const subName = parts.slice(1).join(' / ');

      if (!rootMap.has(rootName)) {
        rootMap.set(rootName, {
          rootName,
          subFolders: [],
          rootSubjects: [],
          totalCards: 0,
          totalSubjects: 0,
        });
      }

      const root = rootMap.get(rootName)!;
      root.totalCards += sub.total_cards;
      root.totalSubjects += 1;

      if (!subName) {
        root.rootSubjects.push(sub);
      } else {
        let subGroup = root.subFolders.find((sf) => sf.subFolderName === subName);
        if (!subGroup) {
          subGroup = {
            subFolderName: subName,
            fullPath: fullGroup,
            subjects: [],
            totalCards: 0,
          };
          root.subFolders.push(subGroup);
        }
        subGroup.subjects.push(sub);
        subGroup.totalCards += sub.total_cards;
      }
    });

    return Array.from(rootMap.values()).sort((a, b) => a.rootName.localeCompare(b.rootName));
  }, [subjects]);

  return (
    <View style={styles.container}>
      {/* Consistent FLASED Logo Header with Polished Right Actions */}
      <LogoHeader
        rightAction={
          <View style={styles.topActions}>
            {totalCardsAll > 0 && (
              <TouchableOpacity
                style={styles.studyAllBtn}
                onPress={() => onStartStudy('all', undefined, 'All Flashcards')}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles" size={12} color={COLORS.primaryDark} />
                <Text style={styles.studyAllText}>Study All</Text>
              </TouchableOpacity>
            )}

            {/* Single + button — opens add menu */}
            <TouchableOpacity
              style={styles.addPlusBtn}
              onPress={() => setAddMenuVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Main Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : subjects.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="albums-outline" size={36} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Your Library is Empty</Text>
          <Text style={styles.emptySub}>
            Create a subject (e.g. 2nd Year 1st Sem) to start organizing your study notes.
          </Text>
          <TouchableOpacity
            style={styles.createFirstBtn}
            onPress={handleOpenAddSubject}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={COLORS.primaryDark} />
            <Text style={styles.createFirstText}>New Subject</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.contentWrapper}>
          {/* Horizontal Group Filter Pills */}
          {allGroups.length > 1 && (
            <View style={styles.filterBarContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedGroupFilter === 'all' && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedGroupFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedGroupFilter === 'all' && styles.filterChipTextActive,
                    ]}
                  >
                    All ({subjects.length})
                  </Text>
                </TouchableOpacity>

                {allGroups.map((g) => {
                  const count = subjects.filter((s) => (s.group_name || 'General') === g).length;
                  const isActive = selectedGroupFilter === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() => setSelectedGroupFilter(g)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive && styles.filterChipTextActive,
                        ]}
                      >
                        {g} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Subjects Scroll List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {selectedGroupFilter === 'all' ? (
              // Hierarchical Folder Tree View (Folder inside Folder)
              folderTree.map((rootGroup) => {
                const isRootExpanded = expandedSections.has(rootGroup.rootName);

                return (
                  <View key={rootGroup.rootName} style={styles.groupSection}>
                    {/* Root Folder Header */}
                    <View style={styles.groupSectionHeaderRow}>
                      <TouchableOpacity
                        style={[styles.groupSectionHeader, { flex: 1 }]}
                        onPress={() => toggleSection(rootGroup.rootName)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.groupSectionLeft}>
                          <Ionicons
                            name={isRootExpanded ? 'folder-open-outline' : 'folder-outline'}
                            size={15}
                            color={COLORS.primary}
                          />
                          <Text style={styles.groupSectionTitle} numberOfLines={1}>
                            {rootGroup.rootName.startsWith('📁') ? rootGroup.rootName : rootGroup.rootName.toUpperCase()}
                          </Text>
                          <View style={styles.groupCountPill}>
                            <Text style={styles.groupCountPillText}>
                              {rootGroup.totalSubjects} {rootGroup.totalSubjects === 1 ? 'subject' : 'subjects'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.groupSectionRight}>
                          <Text style={styles.groupSectionCards}>{rootGroup.totalCards} cards</Text>
                          <Ionicons
                            name={isRootExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={14}
                            color={COLORS.textMuted}
                          />
                        </View>
                      </TouchableOpacity>

                      {/* Rename button — hidden for 'Unfiled' system bucket */}
                      {!rootGroup.rootName.startsWith('📁') && (
                        <TouchableOpacity
                          style={styles.folderRenameBtn}
                          onPress={() => handleOpenRenameFolder(rootGroup.rootName)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pencil-outline" size={13} color={COLORS.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>


                    {/* Root Folder Content when expanded */}
                    {isRootExpanded && (
                      <View style={styles.folderIndentArea}>
                        {/* Nested Sub-Folders */}
                        {rootGroup.subFolders.map((subFolder) => {
                          const subFolderKey = `${rootGroup.rootName}__sub__${subFolder.subFolderName}`;
                          const isSubExpanded = expandedSections.has(subFolderKey);

                          return (
                            <View key={subFolderKey} style={styles.subFolderBlock}>
                              {/* Sub-Folder Header */}
                              <TouchableOpacity
                                style={styles.subFolderHeader}
                                onPress={() => toggleSection(subFolderKey)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.groupSectionLeft}>
                                  <Ionicons
                                    name={isSubExpanded ? 'folder-open' : 'folder'}
                                    size={13}
                                    color={COLORS.accent}
                                  />
                                  <Text style={styles.subFolderTitle} numberOfLines={1}>
                                    {subFolder.subFolderName}
                                  </Text>
                                  <View style={styles.subGroupCountPill}>
                                    <Text style={styles.subGroupCountText}>
                                      {subFolder.subjects.length}
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.groupSectionRight}>
                                  <Text style={styles.groupSectionCards}>{subFolder.totalCards} cards</Text>
                                  <Ionicons
                                    name={isSubExpanded ? 'chevron-down' : 'chevron-forward'}
                                    size={12}
                                    color={COLORS.textMuted}
                                  />
                                </View>
                              </TouchableOpacity>

                              {/* Subjects in Sub-Folder */}
                              {isSubExpanded && (
                                <View style={styles.subFolderCardsList}>
                                  {subFolder.subjects.map((sub) => (
                                    <SubjectCard
                                      key={sub.id}
                                      subject={sub}
                                      onStudySubject={(s) => onStartStudy('subject', s.id, s.title)}
                                      onStudyModule={(m) => onStartStudy('module', m.id, m.title)}
                                      onAddModule={(s) => {
                                        setTargetSubjectForModule(s);
                                        setModuleTitleInput('');
                                        setModuleContentInput('');
                                        setModuleModalVisible(true);
                                      }}
                                      onRenameSubject={handleOpenEditSubject}
                                      onDeleteSubject={handleDeleteSubject}
                                      onDeleteModule={handleDeleteModule}
                                      onMoveFolder={handleOpenMoveFolder}
                                    />
                                  ))}
                                </View>
                              )}
                            </View>
                          );
                        })}

                        {/* Subjects directly inside Root Folder */}
                        {rootGroup.rootSubjects.map((sub) => (
                          <SubjectCard
                            key={sub.id}
                            subject={sub}
                            onStudySubject={(s) => onStartStudy('subject', s.id, s.title)}
                            onStudyModule={(m) => onStartStudy('module', m.id, m.title)}
                            onAddModule={(s) => {
                              setTargetSubjectForModule(s);
                              setModuleTitleInput('');
                              setModuleContentInput('');
                              setModuleModalVisible(true);
                            }}
                            onRenameSubject={handleOpenEditSubject}
                            onDeleteSubject={handleDeleteSubject}
                            onDeleteModule={handleDeleteModule}
                            onMoveFolder={handleOpenMoveFolder}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              // Filtered Single Group View
              subjects
                .filter((s) => (s.group_name || 'General').trim() === selectedGroupFilter)
                .map((sub) => (
                  <SubjectCard
                    key={sub.id}
                    subject={sub}
                    onStudySubject={(s) => onStartStudy('subject', s.id, s.title)}
                    onStudyModule={(m) => onStartStudy('module', m.id, m.title)}
                    onAddModule={(s) => {
                      setTargetSubjectForModule(s);
                      setModuleTitleInput('');
                      setModuleContentInput('');
                      setModuleModalVisible(true);
                    }}
                    onRenameSubject={handleOpenEditSubject}
                    onDeleteSubject={handleDeleteSubject}
                    onDeleteModule={handleDeleteModule}
                    onMoveFolder={handleOpenMoveFolder}
                  />
                ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Custom Dark Confirmation Modal */}
      <Modal visible={confirmDelete.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="warning-outline" size={30} color={COLORS.danger} />
            <Text style={styles.modalBoxTitle}>{confirmDelete.title}</Text>
            <Text style={styles.modalBoxSub}>{confirmDelete.sub}</Text>
            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setConfirmDelete((prev) => ({ ...prev, visible: false }))}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxDeleteBtn}
                onPress={confirmDelete.onConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subject Modal (Create / Rename & Group) */}
      <Modal visible={subjectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>
              {editingSubject ? 'Edit Subject & Group' : 'New Subject'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SUBJECT NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Computer Networks"
                placeholderTextColor={COLORS.textDark}
                value={subjectTitleInput}
                onChangeText={setSubjectTitleInput}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>GROUP / SEMESTER</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 2nd Year 1st Sem"
                placeholderTextColor={COLORS.textDark}
                value={subjectGroupInput}
                onChangeText={setSubjectGroupInput}
              />
            </View>

            {/* Quick group suggestion chips */}
            {allGroups.length > 0 && (
              <View style={styles.suggestionBox}>
                <Text style={styles.suggestionLabel}>Existing Groups:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionScroll}
                >
                  {allGroups.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.suggestionChip,
                        subjectGroupInput === g && styles.suggestionChipActive,
                      ]}
                      onPress={() => setSubjectGroupInput(g)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.suggestionText,
                          subjectGroupInput === g && styles.suggestionTextActive,
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Due Date Input */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>EXAM / DUE DATE (OPTIONAL)</Text>
                {subjectDueDateInput ? (
                  <TouchableOpacity onPress={() => setSubjectDueDateInput('')} activeOpacity={0.7}>
                    <Text style={styles.clearDueText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD (e.g. 2026-09-18)"
                placeholderTextColor={COLORS.textDark}
                value={subjectDueDateInput}
                onChangeText={setSubjectDueDateInput}
              />
            </View>

            {/* Quick Due Date Presets */}
            <View style={styles.duePresetsRow}>
              <TouchableOpacity style={styles.presetChip} onPress={() => setDuePreset(3)} activeOpacity={0.7}>
                <Text style={styles.presetChipText}>+3 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setDuePreset(7)} activeOpacity={0.7}>
                <Text style={styles.presetChipText}>+1 Week</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setDuePreset(14)} activeOpacity={0.7}>
                <Text style={styles.presetChipText}>+2 Weeks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setDuePreset(30)} activeOpacity={0.7}>
                <Text style={styles.presetChipText}>+1 Month</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setSubjectModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxSaveBtn}
                onPress={handleCreateOrRenameSubject}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move Subject to Folder Modal */}
      <Modal visible={moveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="folder-open-outline" size={22} color={COLORS.accent} />
              <Text style={styles.modalBoxTitle}>Move Subject</Text>
            </View>
            <Text style={styles.modalBoxSub}>
              Move '{targetSubjectForMove?.title}' into another folder or semester.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TARGET FOLDER</Text>
              <TextInput
                style={styles.input}
                placeholder="Folder name (e.g. 1st Year, 2nd Year 1st Sem)"
                placeholderTextColor={COLORS.textDark}
                value={destinationFolderInput}
                onChangeText={setDestinationFolderInput}
                autoFocus
              />
            </View>

            {/* Quick folder choices */}
            {allGroups.length > 0 && (
              <View style={styles.suggestionBox}>
                <Text style={styles.suggestionLabel}>Choose existing folder:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionScroll}
                >
                  {allGroups.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.suggestionChip,
                        destinationFolderInput === g && styles.suggestionChipActive,
                      ]}
                      onPress={() => setDestinationFolderInput(g)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="folder"
                        size={12}
                        color={destinationFolderInput === g ? COLORS.primaryDark : COLORS.accent}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.suggestionText,
                          destinationFolderInput === g && styles.suggestionTextActive,
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setMoveModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxSaveBtn}
                onPress={handleApplyMoveFolder}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxSaveText}>Move Subject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Folder Modal */}
      <Modal visible={renameFolderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
              <Text style={styles.modalBoxTitle}>Rename Folder</Text>
            </View>
            <Text style={styles.modalBoxSub}>
              All subjects inside "{renameFolderOldName}" will be moved to the new folder name.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NEW FOLDER NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1st Year, 2nd Year / Sem 1"
                placeholderTextColor={COLORS.textDark}
                value={renameFolderNewName}
                onChangeText={setRenameFolderNewName}
                autoFocus
              />
            </View>

            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setRenameFolderModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxSaveBtn}
                onPress={handleApplyRenameFolder}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxSaveText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Module Modal */}
      <Modal visible={moduleModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>New Module</Text>
            <Text style={styles.modalBoxSub}>In '{targetSubjectForModule?.title}'</Text>
            <TextInput
              style={styles.input}
              placeholder="Module Title (e.g. Chapter 1: OSI Layer)"
              placeholderTextColor={COLORS.textDark}
              value={moduleTitleInput}
              onChangeText={setModuleTitleInput}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Optional notes or text summary..."
              placeholderTextColor={COLORS.textDark}
              value={moduleContentInput}
              onChangeText={setModuleContentInput}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setModuleModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxSaveBtn}
                onPress={handleCreateModule}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxSaveText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Sheet / Choice Modal for + Button */}
      <Modal visible={addMenuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAddMenuVisible(false)}
        >
          <View style={[styles.modalBox, { width: 270, padding: 18, gap: 12 }]}>
            <Text style={[styles.modalBoxTitle, { fontSize: 15 }]}>Create New</Text>

            <TouchableOpacity
              style={styles.addMenuItemBtn}
              onPress={() => {
                setAddMenuVisible(false);
                handleOpenAddSubject();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.addMenuIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                <Ionicons name="book-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addMenuItemTitle}>Subject</Text>
                <Text style={styles.addMenuItemSub}>e.g. Computer Networks</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addMenuItemBtn}
              onPress={() => {
                setAddMenuVisible(false);
                setNewFolderModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.addMenuIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                <Ionicons name="folder-open-outline" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addMenuItemTitle}>General Folder</Text>
                <Text style={styles.addMenuItemSub}>e.g. 2nd Year 1st Sem</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBoxCancelBtn, { marginTop: 4 }]}
              onPress={() => setAddMenuVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBoxCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* New Folder Modal */}
      <Modal visible={newFolderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="folder-open-outline" size={22} color={COLORS.accent} />
              <Text style={styles.modalBoxTitle}>New Folder</Text>
            </View>
            <Text style={styles.modalBoxSub}>
              Enter a folder name (or path like "Year 1 / Sem 2") to organize your subjects.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FOLDER NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 2nd Year 1st Sem"
                placeholderTextColor={COLORS.textDark}
                value={newFolderNameInput}
                onChangeText={setNewFolderNameInput}
                autoFocus
              />
            </View>

            <View style={styles.modalBoxActions}>
              <TouchableOpacity
                style={styles.modalBoxCancelBtn}
                onPress={() => setNewFolderModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBoxSaveBtn}
                onPress={handleCreateFolder}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBoxSaveText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dark Toast */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            { opacity: toastOpacity },
            toast.type === 'err' ? styles.toastErr : styles.toastOk,
          ]}
        >
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
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
  },
  studyAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  addPlusBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMenuItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#12121a',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    borderRadius: 12,
    width: '100%',
  },
  addMenuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMenuItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  addMenuItemSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  // Filter Bar
  filterBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#07070b',
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Group Sections
  groupSection: {
    marginBottom: 10,
  },
  groupSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderRenameBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginLeft: 4,
  },
  groupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  groupSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  groupSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: COLORS.textMuted,
  },
  groupCountPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  groupCountPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  groupSectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupSectionCards: {
    fontSize: 11,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  // Sub-Folder Nested Styles
  folderIndentArea: {
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 6,
    gap: 8,
  },
  subFolderBlock: {
    marginBottom: 6,
  },
  subFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#0c0c13',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 6,
  },
  subFolderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  subGroupCountPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  subGroupCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  subFolderCardsList: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(56, 189, 248, 0.15)',
    marginLeft: 6,
    gap: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0f0f18',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
    maxWidth: 280,
  },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createFirstText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  // Custom Dark Modal Box
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: '#0f0f18',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  modalBoxTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
    textAlign: 'center',
  },
  modalBoxSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  inputGroup: {
    width: '100%',
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    marginLeft: 2,
  },
  input: {
    width: '100%',
    backgroundColor: '#0c0c12',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 13,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  suggestionBox: {
    width: '100%',
    gap: 6,
    marginTop: 2,
  },
  suggestionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  suggestionScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  suggestionChip: {
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  suggestionChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: COLORS.accent,
  },
  suggestionText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  suggestionTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  modalBoxActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 8,
  },
  modalBoxCancelBtn: {
    flex: 1,
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBoxCancelText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  modalBoxSaveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBoxSaveText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  modalBoxDeleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBoxDeleteText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  // Toast
  toast: {
    position: 'absolute',
    bottom: 30,
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearDueText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '700',
    marginRight: 2,
  },
  duePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: -2,
    marginBottom: 4,
  },
  presetChip: {
    backgroundColor: '#12121c',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
