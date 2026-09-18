import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubjectItem, ModuleItem } from '../types';
import { COLORS } from '../theme/colors';

interface SubjectCardProps {
  subject: SubjectItem;
  onStudySubject: (subject: SubjectItem) => void;
  onStudyModule: (module: ModuleItem) => void;
  onAddModule: (subject: SubjectItem) => void;
  onRenameSubject: (subject: SubjectItem) => void;
  onDeleteSubject: (subject: SubjectItem) => void;
  onDeleteModule: (module: ModuleItem) => void;
  onMoveFolder?: (subject: SubjectItem) => void;
}

export const SubjectCard: React.FC<SubjectCardProps> = ({
  subject,
  onStudySubject,
  onStudyModule,
  onAddModule,
  onRenameSubject,
  onDeleteSubject,
  onDeleteModule,
  onMoveFolder,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // Compute days remaining for due badge if set
  const getDueBadge = () => {
    if (!subject.due_date) return null;
    const parts = subject.due_date.split('-');
    if (parts.length !== 3) return null;
    const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = diff < 0;
    const label = isOverdue ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Due today' : `${diff}d left`;
    return { label, isOverdue };
  };

  const dueBadge = getDueBadge();

  return (
    <View style={styles.container}>
      {/* Subject Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.titleArea}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={COLORS.textMuted}
          />
          <Text style={styles.subjectTitle} numberOfLines={1}>
            {subject.title}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{subject.total_cards}</Text>
          </View>
          {dueBadge && (
            <View
              style={[
                styles.dueBadge,
                dueBadge.isOverdue ? styles.dueBadgeOverdue : styles.dueBadgeNormal,
              ]}
            >
              <Ionicons
                name="time-outline"
                size={10}
                color={dueBadge.isOverdue ? COLORS.danger : '#f59e0b'}
              />
              <Text
                style={[
                  styles.dueBadgeText,
                  { color: dueBadge.isOverdue ? COLORS.danger : '#f59e0b' },
                ]}
              >
                {dueBadge.label}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Polished Header Actions: Study + Options Menu */}
        <View style={styles.headerActions}>
          {subject.total_cards > 0 && (
            <TouchableOpacity
              style={styles.studyBtn}
              onPress={() => onStudySubject(subject)}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={12} color={COLORS.primaryDark} />
              <Text style={styles.studyBtnText}>Study</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Modules List */}
      {expanded && (
        <View style={styles.modulesContainer}>
          {subject.modules.length === 0 ? (
            <View style={styles.emptyModuleBox}>
              <Text style={styles.emptyText}>No modules created yet.</Text>
              <TouchableOpacity
                style={styles.addFirstModuleBtn}
                onPress={() => onAddModule(subject)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={14} color={COLORS.primary} />
                <Text style={styles.addFirstModuleText}>Add Module</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {subject.modules.map((mod) => {
                const count = mod.card_count || 0;
                const canStudy = count > 0;
                return (
                  <TouchableOpacity
                    key={mod.id}
                    style={styles.moduleRow}
                    onPress={() => canStudy && onStudyModule(mod)}
                    activeOpacity={canStudy ? 0.7 : 1}
                  >
                    <View style={styles.moduleLeft}>
                      <Ionicons
                        name="albums-outline"
                        size={15}
                        color={canStudy ? COLORS.accent : COLORS.textDark}
                      />
                      <Text style={styles.moduleTitle} numberOfLines={1}>
                        {mod.title}
                      </Text>
                    </View>

                    <View style={styles.moduleRight}>
                      <View style={[styles.moduleBadge, canStudy && styles.moduleBadgeActive]}>
                        <Text style={[styles.moduleBadgeText, canStudy && styles.moduleBadgeTextActive]}>
                          {count} {count === 1 ? 'card' : 'cards'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteModuleBtn}
                        onPress={() => onDeleteModule(mod)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={15} color={COLORS.textDark} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Minimalist Inline Add Module Button */}
              <TouchableOpacity
                style={styles.addModuleInlineBtn}
                onPress={() => onAddModule(subject)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color={COLORS.textMuted} />
                <Text style={styles.addModuleInlineText}>Add Module</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Dark Subject Action Sheet Modal */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuBox}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {subject.title}
              </Text>
              <Text style={styles.menuSubtitle}>
                {subject.group_name && subject.group_name !== 'General' ? `${subject.group_name} · ` : ''}{subject.total_cards} cards · {subject.modules.length} modules
              </Text>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onAddModule(subject);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={COLORS.text} />
              <Text style={styles.menuItemText}>Add Module</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onRenameSubject(subject);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil-outline" size={18} color={COLORS.text} />
              <Text style={styles.menuItemText}>Edit Subject & Due Date</Text>
            </TouchableOpacity>

            {onMoveFolder && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  onMoveFolder(subject);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-open-outline" size={18} color={COLORS.accent} />
                <Text style={styles.menuItemText}>Move to Folder</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => {
                setMenuVisible(false);
                onDeleteSubject(subject);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              <Text style={[styles.menuItemText, { color: COLORS.danger }]}>Delete Subject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancelBtn}
              onPress={() => setMenuVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0c0c11',
  },
  titleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 10,
  },
  subjectTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    maxWidth: '65%',
  },
  countBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  dueBadgeNormal: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  dueBadgeOverdue: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  studyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#12121c',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modulesContainer: {
    padding: 10,
    gap: 6,
  },
  emptyModuleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0e0e16',
    borderRadius: 10,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  addFirstModuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a26',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addFirstModuleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#101017',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  moduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  moduleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  moduleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  moduleBadgeActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  moduleBadgeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  moduleBadgeTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  deleteModuleBtn: {
    padding: 2,
  },
  addModuleInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    marginTop: 2,
  },
  addModuleInlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  // Dark Action Sheet Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuBox: {
    backgroundColor: '#0f0f18',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  menuHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 4,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 2,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  menuCancelBtn: {
    marginTop: 6,
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
});
