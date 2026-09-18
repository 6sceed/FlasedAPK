import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeStats, CardWithContextItem, DueSubjectAlert } from '../types';
import {
  getHomeStats,
  getUserName,
  getCardsByReviewState,
  updateCardState,
  deleteFlashcard,
} from '../db/database';
import { COLORS, APP_INFO } from '../theme/colors';
import { LogoHeader } from '../components/LogoHeader';

interface HomeScreenProps {
  onStartStudy: (type: 'all' | 'subject' | 'module', id?: number, title?: string) => void;
  onNavigateTab: (tab: 'home' | 'library' | 'generator' | 'deck' | 'settings') => void;
}

const { width } = Dimensions.get('window');

type ReviewCategory = 'I_know' | 'A_bit' | 'Didn_know';

export const HomeScreen: React.FC<HomeScreenProps> = ({ onStartStudy, onNavigateTab }) => {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  // Pill Review Modal state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ReviewCategory>('I_know');
  const [categoryCards, setCategoryCards] = useState<CardWithContextItem[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  // Subject folders are closed by default at all times unless explicitly opened
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    const name = userName.trim() || 'there';
    if (hour >= 5 && hour < 12) return `Good morning, ${name}`;
    if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`;
    if (hour >= 17 && hour < 21) return `Good evening, ${name}`;
    return `Good night, ${name}`;
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const [data, uName] = await Promise.all([getHomeStats(), getUserName()]);
      setStats(data);
      setUserName(uName);
    } catch (e) {
      console.error('Failed to load home stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const openCategoryModal = async (cat: ReviewCategory) => {
    setSelectedCategory(cat);
    setSearchFilter('');
    // Ensure all folders start closed every time the modal is opened
    setExpandedSubjects(new Set());
    setReviewModalVisible(true);
    setCardsLoading(true);
    try {
      const cards = await getCardsByReviewState(cat);
      setCategoryCards(cards);
    } catch (e) {
      console.error('Failed to fetch cards for category:', e);
    } finally {
      setCardsLoading(false);
    }
  };

  const handleReclassifyCard = async (cardId: number, newState: string) => {
    try {
      await updateCardState(cardId, newState);
      // Remove from current list since its state changed
      setCategoryCards((prev) => prev.filter((c) => c.id !== cardId));
      // Refresh home stats in background
      const updatedStats = await getHomeStats();
      setStats(updatedStats);
    } catch (e) {
      console.error('Failed to update card state:', e);
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    try {
      await deleteFlashcard(cardId);
      setCategoryCards((prev) => prev.filter((c) => c.id !== cardId));
      const updatedStats = await getHomeStats();
      setStats(updatedStats);
    } catch (e) {
      console.error('Failed to delete card:', e);
    }
  };

  const toggleSubjectCollapse = (subjectKey: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  };

  // Group filtered cards by Subject (and Folder)
  const groupedCardsBySubject = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const filtered = categoryCards.filter((c) => {
      if (!q) return true;
      return (
        c.question.toLowerCase().includes(q) ||
        c.explanation.toLowerCase().includes(q) ||
        (c.concept_group && c.concept_group.toLowerCase().includes(q)) ||
        c.subject_title.toLowerCase().includes(q) ||
        c.module_title.toLowerCase().includes(q)
      );
    });

    // Map by Subject Title
    const map = new Map<string, { subjectTitle: string; groupName: string; cards: CardWithContextItem[] }>();
    for (const card of filtered) {
      const key = `${card.group_name || 'General'} · ${card.subject_title}`;
      if (!map.has(key)) {
        map.set(key, {
          subjectTitle: card.subject_title,
          groupName: card.group_name || 'General',
          cards: [],
        });
      }
      map.get(key)!.cards.push(card);
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [categoryCards, searchFilter]);

  if (loading || !stats) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const hasCards = stats.totalCards > 0;
  const unmasteredCount = stats.totalCards - stats.masteredCards;
  const dueAlerts = stats.dueAlerts || [];

  const getCategoryMeta = () => {
    switch (selectedCategory) {
      case 'I_know':
        return { title: 'Mastered Cards', color: COLORS.success, dotBg: 'rgba(34, 197, 94, 0.15)' };
      case 'A_bit':
        return { title: 'Learning Cards', color: COLORS.warning, dotBg: 'rgba(234, 179, 8, 0.15)' };
      case 'Didn_know':
        return { title: 'Review Needed Cards', color: COLORS.danger, dotBg: 'rgba(239, 68, 68, 0.15)' };
    }
  };

  const currentCatMeta = getCategoryMeta();

  return (
    <View style={styles.container}>
      {/* Top Header with FLASED Logo & Points */}
      <LogoHeader
        rightAction={
          <View style={styles.pointsBadge}>
            <Ionicons name="flash" size={14} color="#f59e0b" />
            <Text style={styles.pointsText}>{stats.points} pts</Text>
          </View>
        }
      />

      {/* Time-based greeting */}
      <View style={styles.greetingRow}>
        <Text style={styles.greetingText}>{getGreeting()}</Text>
      </View>

      <ScrollView
        style={styles.scrollList}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Due Date Alert Banner (≤ 3 days or overdue) */}
        {dueAlerts.length > 0 && (
          <View style={styles.dueAlertsSection}>
            {dueAlerts.map((alert) => {
              const isOverdue = alert.daysRemaining < 0;
              const isToday = alert.daysRemaining === 0;
              const countdownText = isOverdue
                ? `Overdue by ${Math.abs(alert.daysRemaining)}d`
                : isToday
                ? 'Due Today!'
                : `${alert.daysRemaining} days left`;

              return (
                <View
                  key={alert.id}
                  style={[
                    styles.dueAlertCard,
                    isOverdue ? styles.dueAlertOverdue : styles.dueAlertUrgent,
                  ]}
                >
                  <View style={styles.dueAlertLeft}>
                    <View
                      style={[
                        styles.dueIconBox,
                        { backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)' },
                      ]}
                    >
                      <Ionicons
                        name={isOverdue ? 'alert-circle' : 'time-outline'}
                        size={20}
                        color={isOverdue ? COLORS.danger : '#f59e0b'}
                      />
                    </View>
                    <View style={styles.dueAlertInfo}>
                      <View style={styles.dueAlertTagRow}>
                        <Text style={[styles.dueTag, { color: isOverdue ? COLORS.danger : '#f59e0b' }]}>
                          {countdownText.toUpperCase()}
                        </Text>
                        {alert.group_name && alert.group_name !== 'General' && (
                          <Text style={styles.dueFolderTag}>· {alert.group_name}</Text>
                        )}
                      </View>
                      <Text style={styles.dueAlertTitle} numberOfLines={1}>
                        {alert.title}
                      </Text>
                      <Text style={styles.dueAlertDate}>
                        Target: {alert.due_date} ({alert.totalCards} cards)
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.dueStudyBtn,
                      { backgroundColor: isOverdue ? COLORS.danger : '#f59e0b' },
                    ]}
                    onPress={() => onStartStudy('subject', alert.id, alert.title)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={12} color="#000" />
                    <Text style={styles.dueStudyBtnText}>Study</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Circular Mastery Widget */}
        <View style={styles.circleWidgetCard}>
          <View style={styles.circleOuter}>
            <View style={styles.circleMiddle}>
              <View style={styles.circleInner}>
                <Text style={styles.circlePercent}>{stats.masteryPercentage}%</Text>
                <Text style={styles.circleLabel}>Mastery</Text>
              </View>
            </View>
          </View>

          {/* Minimalist 3-Pill Breakdown - CLICKABLE WITH HINT */}
          <View style={styles.statPillsRow}>
            <TouchableOpacity
              style={[styles.statPill, styles.pillSuccess]}
              onPress={() => openCategoryModal('I_know')}
              activeOpacity={0.7}
            >
              <View style={[styles.pillDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.pillNum}>{stats.masteredCards}</Text>
              <Text style={styles.pillLabel}>Mastered</Text>
              <Ionicons name="chevron-forward" size={10} color={COLORS.textDark} style={styles.pillArrow} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statPill, styles.pillWarning]}
              onPress={() => openCategoryModal('A_bit')}
              activeOpacity={0.7}
            >
              <View style={[styles.pillDot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.pillNum}>{stats.learningCards}</Text>
              <Text style={styles.pillLabel}>Learning</Text>
              <Ionicons name="chevron-forward" size={10} color={COLORS.textDark} style={styles.pillArrow} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statPill, styles.pillDanger]}
              onPress={() => openCategoryModal('Didn_know')}
              activeOpacity={0.7}
            >
              <View style={[styles.pillDot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.pillNum}>{stats.unlearnedCards}</Text>
              <Text style={styles.pillLabel}>Review</Text>
              <Ionicons name="chevron-forward" size={10} color={COLORS.textDark} style={styles.pillArrow} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Study / Action CTA */}
        {hasCards ? (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => onStartStudy('all', undefined, 'All Cards')}
            activeOpacity={0.85}
          >
            <View style={styles.ctaContent}>
              <Ionicons name="play" size={18} color={COLORS.primaryDark} />
              <Text style={styles.ctaText}>
                {unmasteredCount > 0 ? `Study Active Pool (${unmasteredCount})` : 'Practice All Cards'}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => onNavigateTab('generator')}
            activeOpacity={0.85}
          >
            <View style={styles.ctaContent}>
              <Ionicons name="sparkles" size={18} color={COLORS.primaryDark} />
              <Text style={styles.ctaText}>Generate Flashcards</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Bar Graph: Subject Progress */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>PROGRESS</Text>
          <Text style={styles.sectionMeta}>{stats.subjectProgress.length} subjects</Text>
        </View>

        {stats.subjectProgress.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No subjects yet.</Text>
          </View>
        ) : (
          <View style={styles.barGraphCard}>
            {stats.subjectProgress.map((sub) => (
              <View key={sub.id} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={styles.barTitle} numberOfLines={1}>
                    {sub.title}
                  </Text>
                  <Text style={styles.barPercent}>{sub.percent}%</Text>
                </View>

                {/* Progress Bar Track */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${sub.percent}%`,
                        backgroundColor: sub.percent === 100 ? COLORS.success : COLORS.accent,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.barSub}>
                  {sub.mastered} of {sub.total} cards mastered
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Mastered Modules Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MASTERED MODULES</Text>
          <Text style={styles.sectionMeta}>{stats.masteredModules.length} completed</Text>
        </View>

        {stats.masteredModules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="ribbon-outline" size={24} color={COLORS.textDark} />
            <Text style={styles.emptyText}>
              Rate all cards in a module "I Know" to master it.
            </Text>
          </View>
        ) : (
          <View style={styles.masteredList}>
            {stats.masteredModules.map((mod) => (
              <View key={mod.id} style={styles.masteredCard}>
                <View style={styles.masteredIconCircle}>
                  <Ionicons name="checkmark-sharp" size={16} color={COLORS.success} />
                </View>
                <View style={styles.masteredContent}>
                  <Text style={styles.masteredTitle}>{mod.title}</Text>
                  <Text style={styles.masteredSub}>
                    {mod.subjectTitle} · {mod.cardCount} cards
                  </Text>
                </View>
                <View style={styles.masteredBadge}>
                  <Text style={styles.masteredBadgeText}>100%</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Interactive Review State Modal (Grouped into Subject Folders) */}
      <Modal visible={reviewModalVisible} animationType="slide" transparent>
        <View style={styles.catModalOverlay}>
          <View style={styles.catModalContainer}>
            {/* Modal Header */}
            <View style={styles.catModalHeader}>
              <View style={styles.catModalHeaderLeft}>
                <View style={[styles.catBadgeDot, { backgroundColor: currentCatMeta.color }]} />
                <View>
                  <Text style={styles.catModalTitle}>{currentCatMeta.title}</Text>
                  <Text style={styles.catModalSub}>
                    {categoryCards.length} {categoryCards.length === 1 ? 'card' : 'cards'} total · Click to reclassify
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.catModalCloseBtn}
                onPress={() => setReviewModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Filter Search Input */}
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search in these cards..."
                placeholderTextColor={COLORS.textDark}
                value={searchFilter}
                onChangeText={setSearchFilter}
              />
              {searchFilter ? (
                <TouchableOpacity onPress={() => setSearchFilter('')} activeOpacity={0.7}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Card Content List with Subject Folders */}
            {cardsLoading ? (
              <View style={styles.modalLoadingBox}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.modalLoadingText}>Loading cards...</Text>
              </View>
            ) : groupedCardsBySubject.length === 0 ? (
              <View style={styles.modalEmptyBox}>
                <Ionicons name="folder-open-outline" size={32} color={COLORS.textDark} />
                <Text style={styles.modalEmptyTitle}>No cards found</Text>
                <Text style={styles.modalEmptySub}>
                  {searchFilter ? 'Try a different search query.' : 'There are no cards in this category right now.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.catModalScroll}
                contentContainerStyle={styles.catModalContent}
                showsVerticalScrollIndicator={false}
              >
                {groupedCardsBySubject.map(([folderKey, groupData]) => {
                  const isExpanded = expandedSubjects.has(folderKey) || searchFilter.trim().length > 0;
                  return (
                    <View key={folderKey} style={styles.folderContainer}>
                      {/* Subject Folder Header */}
                      <TouchableOpacity
                        style={styles.folderHeader}
                        onPress={() => toggleSubjectCollapse(folderKey)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.folderHeaderLeft}>
                          <Ionicons
                            name={isExpanded ? 'folder-open-outline' : 'folder-outline'}
                            size={16}
                            color={COLORS.accent}
                          />
                          <View style={styles.folderTitleColumn}>
                            <Text style={styles.folderSubjectTitle} numberOfLines={1}>
                              {groupData.subjectTitle}
                            </Text>
                            {groupData.groupName && groupData.groupName !== 'General' && (
                              <Text style={styles.folderGroupBadge}>{groupData.groupName}</Text>
                            )}
                          </View>
                        </View>
                        <View style={styles.folderHeaderRight}>
                          <View style={styles.folderCardCountBadge}>
                            <Text style={styles.folderCardCountText}>
                              {groupData.cards.length} {groupData.cards.length === 1 ? 'card' : 'cards'}
                            </Text>
                          </View>
                          <Ionicons
                            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={14}
                            color={COLORS.textMuted}
                          />
                        </View>
                      </TouchableOpacity>

                      {/* Cards in Folder */}
                      {isExpanded && (
                        <View style={styles.folderCardsList}>
                          {groupData.cards.map((card) => (
                            <View key={card.id} style={styles.reviewCardItem}>
                              <View style={styles.cardHeaderRow}>
                                <View style={styles.moduleTagBox}>
                                  <Ionicons name="albums-outline" size={11} color={COLORS.textMuted} />
                                  <Text style={styles.moduleTagText} numberOfLines={1}>
                                    {card.module_title}
                                  </Text>
                                </View>
                                {card.concept_group ? (
                                  <Text style={styles.conceptTagText}>{card.concept_group}</Text>
                                ) : null}
                              </View>

                              <Text style={styles.cardQuestionText}>{card.question}</Text>
                              <Text style={styles.cardExplanationText} numberOfLines={2}>
                                {card.explanation}
                              </Text>

                              {/* Reclassification & Removal Bar */}
                              <View style={styles.cardActionsBar}>
                                <Text style={styles.moveLabel}>Move to:</Text>
                                <View style={styles.reclassifyButtonsGroup}>
                                  {selectedCategory !== 'I_know' && (
                                    <TouchableOpacity
                                      style={[styles.reclassifyBtn, styles.btnMastered]}
                                      onPress={() => handleReclassifyCard(card.id, 'I_know')}
                                      activeOpacity={0.7}
                                    >
                                      <View style={[styles.miniDot, { backgroundColor: COLORS.success }]} />
                                      <Text style={[styles.reclassifyBtnText, { color: COLORS.success }]}>
                                        Mastered
                                      </Text>
                                    </TouchableOpacity>
                                  )}

                                  {selectedCategory !== 'A_bit' && (
                                    <TouchableOpacity
                                      style={[styles.reclassifyBtn, styles.btnLearning]}
                                      onPress={() => handleReclassifyCard(card.id, 'A_bit')}
                                      activeOpacity={0.7}
                                    >
                                      <View style={[styles.miniDot, { backgroundColor: COLORS.warning }]} />
                                      <Text style={[styles.reclassifyBtnText, { color: COLORS.warning }]}>
                                        Learning
                                      </Text>
                                    </TouchableOpacity>
                                  )}

                                  {selectedCategory !== 'Didn_know' && (
                                    <TouchableOpacity
                                      style={[styles.reclassifyBtn, styles.btnReview]}
                                      onPress={() => handleReclassifyCard(card.id, 'Didn_know')}
                                      activeOpacity={0.7}
                                    >
                                      <View style={[styles.miniDot, { backgroundColor: COLORS.danger }]} />
                                      <Text style={[styles.reclassifyBtnText, { color: COLORS.danger }]}>
                                        Review
                                      </Text>
                                    </TouchableOpacity>
                                  )}

                                  <TouchableOpacity
                                    style={styles.deleteCardBtn}
                                    onPress={() => handleDeleteCard(card.id)}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Ionicons name="trash-outline" size={14} color={COLORS.textDark} />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
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
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
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
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pointsText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f59e0b',
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 30,
  },
  // Circular Mastery Card
  circleWidgetCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
  },
  circleOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 6,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  circleMiddle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0c0c14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circlePercent: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
  },
  circleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statPillsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  statPill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#0c0c14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  pillSuccess: {
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  pillWarning: {
    borderColor: 'rgba(234, 179, 8, 0.25)',
  },
  pillDanger: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  pillNum: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  pillLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  // CTA
  ctaButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
  },
  sectionMeta: {
    fontSize: 11,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  // Bar Graph Card
  barGraphCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  barItem: {
    width: '100%',
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  barTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  barPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#0c0c14',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barSub: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  // Mastered Modules
  masteredList: {
    gap: 8,
  },
  masteredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    padding: 12,
    gap: 12,
  },
  masteredIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  masteredContent: {
    flex: 1,
  },
  masteredTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  masteredSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  masteredBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  masteredBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.success,
  },
  emptyCard: {
    backgroundColor: '#0e0e16',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textDark,
    textAlign: 'center',
  },
  pillArrow: {
    marginTop: 3,
    opacity: 0.6,
  },
  // Due Alerts Banner
  dueAlertsSection: {
    gap: 10,
    marginBottom: 4,
  },
  dueAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#110f0a',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  dueAlertUrgent: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: '#120f08',
  },
  dueAlertOverdue: {
    borderColor: 'rgba(239, 68, 68, 0.45)',
    backgroundColor: '#140909',
  },
  dueAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dueIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueAlertInfo: {
    flex: 1,
  },
  dueAlertTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dueTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dueFolderTag: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  dueAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  dueAlertDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  dueStudyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  dueStudyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000',
  },
  // Category Review Modal Styles
  catModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  catModalContainer: {
    backgroundColor: '#0a0a0f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '88%',
    minHeight: '65%',
    paddingBottom: 28,
  },
  catModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  catModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  catModalSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  catModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e0e16',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  modalLoadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalLoadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  modalEmptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalEmptySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  catModalScroll: {
    flex: 1,
  },
  catModalContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  folderContainer: {
    backgroundColor: '#0d0d14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#101018',
  },
  folderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  folderTitleColumn: {
    flex: 1,
  },
  folderSubjectTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  folderGroupBadge: {
    fontSize: 10,
    color: COLORS.accent,
    marginTop: 1,
    fontWeight: '600',
  },
  folderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folderCardCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  folderCardCountText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  folderCardsList: {
    padding: 10,
    gap: 10,
  },
  reviewCardItem: {
    backgroundColor: '#12121c',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    gap: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  moduleTagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  moduleTagText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  conceptTagText: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '700',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardQuestionText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  cardExplanationText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  cardActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  moveLabel: {
    fontSize: 10,
    color: COLORS.textDark,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reclassifyButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reclassifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  btnMastered: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  btnLearning: {
    borderColor: 'rgba(234, 179, 8, 0.3)',
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
  },
  btnReview: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  miniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  reclassifyBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  deleteCardBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
});
