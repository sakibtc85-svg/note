/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Flame,
  LogOut,
  Plus,
  Quote,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  FirestoreErrorInfo,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeDate,
  sanitizeId,
  sanitizeTime,
  VALIDATION_RULES,
} from './firebase';
import {
  CHALLENGE_PRESETS,
  ChallengeCategory,
  ChallengeRecord,
  createInitialDemoChallenges,
  DAILY_MOTIVATIONAL_QUOTES,
  deserializeHabit,
  getDateForChallengeDay,
  HabitItem,
  HabitLogRecord,
  NotificationPreferenceRecord,
  QuoteTheme,
  serializeHabit,
} from './data/quotesAndPresets';
import {
  BrowserPermissionState,
  dispatchPushNotification,
  getBrowserNotificationPermission,
  InAppPushPayload,
  requestBrowserNotificationPermission,
} from './utils/pushNotifications';
import heroRitualImg from './assets/images/hero_daily_ritual_1790947031360.jpg';
import milestoneEmblemImg from './assets/images/challenge_milestone_emblem_1790947048220.jpg';

// Error Boundary for Firestore & Runtime Errors
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  parsedFirestoreError: FirestoreErrorInfo | null;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      parsedFirestoreError: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsed: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message);
      if (candidate && candidate.operationType && candidate.error) {
        parsed = candidate as FirestoreErrorInfo;
      }
    } catch {
      // Standard error
    }
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
      parsedFirestoreError: parsed,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const fsErr = this.state.parsedFirestoreError;
      return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-8">
            <p className="text-xs font-mono text-red-600 mb-2">
              {fsErr ? `Database Permission / Operation Error · ${fsErr.operationType}` : 'Application Runtime Error'}
            </p>
            <h1 className="font-display text-2xl font-semibold text-slate-900 mb-3">
              Unable to complete request
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {fsErr
                ? `${fsErr.error} (Path: ${fsErr.path || 'unknown'})`
                : this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '', parsedFirestoreError: null })}
              className="min-h-[44px] px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Return to Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type NavSection = 'tracker' | 'habits' | 'quotes' | 'reminders';

const LOCAL_STORAGE_KEY = 'cadence30_local_state_v1';

export function Cadence30Workspace() {
  // Navigation & View State
  const [activeNav, setActiveNav] = useState<NavSection>('tracker');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [emblemImgFailed, setEmblemImgFailed] = useState(false);

  // Firebase Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authBannerMsg, setAuthBannerMsg] = useState<string | null>(null);

  // Initial Demo State (Loaded immediately for zero-latency availability)
  const initialDemo = useMemo(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.challenges) && parsed.challenges.length > 0) {
            return parsed as {
              challenges: ChallengeRecord[];
              logs: Record<string, HabitLogRecord[]>;
              prefs: NotificationPreferenceRecord;
            };
          }
        }
      } catch {
        // Fallback to default demo
      }
    }
    const base = createInitialDemoChallenges();
    return {
      ...base,
      prefs: {
        ownerId: 'local_user',
        pushEnabled: true,
        morningQuoteTime: '08:00',
        eveningCheckinTime: '20:30',
        quoteTheme: 'Atomic Systems' as QuoteTheme,
        soundEnabled: true,
      },
    };
  }, []);

  // Application Data State
  const [challenges, setChallenges] = useState<ChallengeRecord[]>(initialDemo.challenges);
  const [logsByChallenge, setLogsByChallenge] = useState<Record<string, HabitLogRecord[]>>(initialDemo.logs);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferenceRecord>(initialDemo.prefs);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>(
    initialDemo.challenges[0]?.id || 'ch_deep_focus_30'
  );
  const [selectedDay, setSelectedDay] = useState<number>(12);
  const [quoteDayIndex, setQuoteDayIndex] = useState<number>(12);
  const [quoteThemeFilter, setQuoteThemeFilter] = useState<QuoteTheme | 'All'>('All');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeSubtitle, setNewChallengeSubtitle] = useState('');
  const [newChallengeCategory, setNewChallengeCategory] = useState<ChallengeCategory>('Deep Work');
  const [newChallengeReminderTime, setNewChallengeReminderTime] = useState('07:30');
  const [newChallengeHabits, setNewChallengeHabits] = useState<HabitItem[]>([
    { id: 'h_1', title: '60-Min Focused Creation Block', unit: 'min', target: '60' },
    { id: 'h_2', title: 'Morning Hydration & Sunlight Walk', unit: 'min', target: '15' },
    { id: 'h_3', title: 'Evening Written Reflection', unit: 'pages', target: '1' },
  ]);

  // Habit Addition inline state
  const [addingHabitTitle, setAddingHabitTitle] = useState('');
  const [addingHabitTarget, setAddingHabitTarget] = useState('20');
  const [addingHabitUnit, setAddingHabitUnit] = useState('min');

  // Push Notifications Runtime State
  const [browserPermission, setBrowserPermission] = useState<BrowserPermissionState>(() =>
    getBrowserNotificationPermission()
  );
  const [activeToast, setActiveToast] = useState<InAppPushPayload | null>(null);
  const [pushHistory, setPushHistory] = useState<InAppPushPayload[]>([
    {
      id: 'push_seed_1',
      title: 'Day 12 Morning Ritual · Cadence 30',
      body: '“Professionals stick to the schedule; amateurs let life get in the way.” — Complete your morning block.',
      tag: 'morning-quote',
      timestamp: '07:30 AM',
      actionLabel: 'Log Day 12',
    },
  ]);

  // Persist local sandbox changes when not signed in
  useEffect(() => {
    if (!user && typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            challenges,
            logs: logsByChallenge,
            prefs: notifPrefs,
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [challenges, logsByChallenge, notifPrefs, user]);

  // Listen to Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Attach Firestore Listeners when Authenticated
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const challengesPath = 'challenges';
    const qChallenges = query(collection(db, challengesPath), where('ownerId', '==', user.uid));

    const unsubChallenges = onSnapshot(
      qChallenges,
      (snapshot) => {
        if (snapshot.empty) {
          // Keep current challenges visible and allow 1-click cloud sync or automatic seed
          return;
        }
        const loaded: ChallengeRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const rawHabits: string[] = Array.isArray(data.habits) ? data.habits : [];
          return {
            id: docSnap.id,
            ownerId: String(data.ownerId || user.uid),
            title: String(data.title || '30-Day Challenge'),
            subtitle: String(data.subtitle || ''),
            category: (data.category as ChallengeCategory) || 'Custom',
            startDate: String(data.startDate || new Date().toISOString().slice(0, 10)),
            targetDays: 30,
            habits: rawHabits.map((h, i) => deserializeHabit(String(h), i)),
            completedDays: Array.isArray(data.completedDays)
              ? data.completedDays.filter((n: unknown) => typeof n === 'number')
              : [],
            reminderEnabled: Boolean(data.reminderEnabled),
            reminderTime: String(data.reminderTime || '08:00'),
            status: (data.status as 'active' | 'completed' | 'archived') || 'active',
          };
        });
        setChallenges(loaded);
        setSelectedChallengeId((prev) =>
          loaded.some((c) => c.id === prev) ? prev : loaded[0]?.id || prev
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, challengesPath);
      }
    );

    const prefsPath = `notificationPreferences/${user.uid}`;
    const unsubPrefs = onSnapshot(
      doc(db, 'notificationPreferences', user.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setNotifPrefs({
            ownerId: String(d.ownerId || user.uid),
            pushEnabled: Boolean(d.pushEnabled),
            morningQuoteTime: String(d.morningQuoteTime || '08:00'),
            eveningCheckinTime: String(d.eveningCheckinTime || '20:30'),
            quoteTheme: (d.quoteTheme as QuoteTheme) || 'Atomic Systems',
            soundEnabled: Boolean(d.soundEnabled),
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, prefsPath);
      }
    );

    return () => {
      unsubChallenges();
      unsubPrefs();
    };
  }, [isAuthReady, user]);

  // Attach Subcollection Listener for Selected Challenge Logs when Authenticated
  useEffect(() => {
    if (!isAuthReady || !user || !selectedChallengeId) return;
    const activeChallenge = challenges.find((c) => c.id === selectedChallengeId);
    if (!activeChallenge || activeChallenge.ownerId !== user.uid) return;

    const logsPath = `challenges/${selectedChallengeId}/logs`;
    const qLogs = query(collection(db, logsPath), where('ownerId', '==', user.uid));

    const unsubLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const records: HabitLogRecord[] = snapshot.docs.map((dSnap) => {
          const d = dSnap.data();
          return {
            id: dSnap.id,
            ownerId: String(d.ownerId || user.uid),
            challengeId: String(d.challengeId || selectedChallengeId),
            dayNumber: Number(d.dayNumber || 1),
            dateStr: String(d.dateStr || new Date().toISOString().slice(0, 10)),
            completedHabitIds: Array.isArray(d.completedHabitIds)
              ? d.completedHabitIds.map(String)
              : [],
            reflectionNote: String(d.reflectionNote || ''),
            moodScore: Number(d.moodScore || 4),
          };
        });
        setLogsByChallenge((prev) => ({
          ...prev,
          [selectedChallengeId]: records,
        }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, logsPath);
      }
    );

    return () => unsubLogs();
  }, [isAuthReady, user, selectedChallengeId, challenges]);

  // Active Challenge Derived State
  const activeChallenge = useMemo(
    () => challenges.find((c) => c.id === selectedChallengeId) || challenges[0],
    [challenges, selectedChallengeId]
  );

  const activeLogs = useMemo(
    () => (activeChallenge ? logsByChallenge[activeChallenge.id] || [] : []),
    [activeChallenge, logsByChallenge]
  );

  const selectedDayLog = useMemo<HabitLogRecord>(() => {
    if (!activeChallenge) {
      return {
        id: `day_${selectedDay}`,
        ownerId: user?.uid || 'local_user',
        challengeId: 'default',
        dayNumber: selectedDay,
        dateStr: new Date().toISOString().slice(0, 10),
        completedHabitIds: [],
        reflectionNote: '',
        moodScore: 4,
      };
    }
    const existing = activeLogs.find((l) => l.dayNumber === selectedDay);
    if (existing) return existing;
    const isDayMarkedComplete = activeChallenge.completedDays.includes(selectedDay);
    return {
      id: `day_${selectedDay}`,
      ownerId: user?.uid || activeChallenge.ownerId,
      challengeId: activeChallenge.id,
      dayNumber: selectedDay,
      dateStr: getDateForChallengeDay(activeChallenge.startDate, selectedDay),
      completedHabitIds: isDayMarkedComplete ? activeChallenge.habits.map((h) => h.id) : [],
      reflectionNote: '',
      moodScore: 4,
    };
  }, [activeChallenge, activeLogs, selectedDay, user]);

  // Calculate Streak & Consistency Metrics
  const stats = useMemo(() => {
    if (!activeChallenge) {
      return { completedCount: 0, completionRate: 0, currentStreak: 0, bestStreak: 0, remainingDays: 30 };
    }
    const sorted = [...new Set(activeChallenge.completedDays)]
      .filter((d) => d >= 1 && d <= 30)
      .sort((a, b) => a - b);
    const completedCount = sorted.length;
    const completionRate = Math.round((completedCount / 30) * 100);

    let bestStreak = 0;
    let running = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] === sorted[i - 1] + 1) {
        running += 1;
      } else {
        running = 1;
      }
      if (running > bestStreak) bestStreak = running;
    }

    // Current consecutive streak from highest completed day backwards
    let currentStreak = 0;
    if (sorted.length > 0) {
      currentStreak = 1;
      for (let i = sorted.length - 1; i > 0; i--) {
        if (sorted[i] - sorted[i - 1] === 1) {
          currentStreak += 1;
        } else {
          break;
        }
      }
    }

    return {
      completedCount,
      completionRate,
      currentStreak,
      bestStreak,
      remainingDays: Math.max(0, 30 - completedCount),
    };
  }, [activeChallenge]);

  // Quote of the Day (Synced to Selected Day or Quote Carousel)
  const currentDailyQuote = useMemo(() => {
    const found = DAILY_MOTIVATIONAL_QUOTES.find((q) => q.day === quoteDayIndex);
    return found || DAILY_MOTIVATIONAL_QUOTES[0];
  }, [quoteDayIndex]);

  const filteredQuotesList = useMemo(() => {
    if (quoteThemeFilter === 'All') return DAILY_MOTIVATIONAL_QUOTES;
    return DAILY_MOTIVATIONAL_QUOTES.filter((q) => q.theme === quoteThemeFilter);
  }, [quoteThemeFilter]);

  // Push Notification Background Scheduler (Checks every 30s against HH:MM)
  const lastFiredKeyRef = useRef<string>('');

  const handleIncomingPush = (notification: InAppPushPayload) => {
    setActiveToast(notification);
    setPushHistory((prev) => [notification, ...prev.slice(0, 14)]);
  };

  useEffect(() => {
    if (!notifPrefs.pushEnabled) return;

    const timer = setInterval(() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHHMM = `${hh}:${mm}`;
      const dateKey = now.toISOString().slice(0, 10);

      // Check Morning Motivational Quote Time
      const morningKey = `morning_${dateKey}_${currentHHMM}`;
      if (currentHHMM === notifPrefs.morningQuoteTime && lastFiredKeyRef.current !== morningKey) {
        lastFiredKeyRef.current = morningKey;
        dispatchPushNotification(
          {
            title: `Day ${selectedDay} Motivational Quote · ${currentDailyQuote.author}`,
            body: `“${currentDailyQuote.quote}”`,
            tag: 'morning-quote',
            actionLabel: 'View Quote',
          },
          {
            soundEnabled: notifPrefs.soundEnabled,
            onInAppPush: handleIncomingPush,
          }
        );
      }

      // Check Evening Habit Check-In Time
      const eveningKey = `evening_${dateKey}_${currentHHMM}`;
      if (currentHHMM === notifPrefs.eveningCheckinTime && lastFiredKeyRef.current !== eveningKey) {
        lastFiredKeyRef.current = eveningKey;
        dispatchPushNotification(
          {
            title: `Evening Consistency Check-In · ${activeChallenge?.title || 'Cadence 30'}`,
            body: `Lock in your Day ${selectedDay} habits and reflection note to protect your ${stats.currentStreak}-day streak.`,
            tag: 'evening-checkin',
            actionLabel: `Log Day ${selectedDay}`,
          },
          {
            soundEnabled: notifPrefs.soundEnabled,
            onInAppPush: handleIncomingPush,
          }
        );
      }

      // Check Challenge-Specific Reminder Time
      if (
        activeChallenge &&
        activeChallenge.reminderEnabled &&
        currentHHMM === activeChallenge.reminderTime
      ) {
        const chKey = `challenge_${activeChallenge.id}_${dateKey}_${currentHHMM}`;
        if (lastFiredKeyRef.current !== chKey) {
          lastFiredKeyRef.current = chKey;
          dispatchPushNotification(
            {
              title: `30-Day Ritual Reminder · ${activeChallenge.title}`,
              body: `Time for your scheduled habits (${activeChallenge.habits.length} daily rituals). Stay consistent!`,
              tag: `challenge-${activeChallenge.id}`,
              actionLabel: 'Open Habits',
            },
            {
              soundEnabled: notifPrefs.soundEnabled,
              onInAppPush: handleIncomingPush,
            }
          );
        }
      }
    }, 20000);

    return () => clearInterval(timer);
  }, [
    notifPrefs.pushEnabled,
    notifPrefs.morningQuoteTime,
    notifPrefs.eveningCheckinTime,
    notifPrefs.soundEnabled,
    activeChallenge,
    selectedDay,
    currentDailyQuote,
    stats.currentStreak,
  ]);

  // Cloud Sync Helper: Persist Challenge & Log to Firestore if signed in
  const persistChallengeToCloud = async (challenge: ChallengeRecord, isNew = false) => {
    if (!user) return;
    const docId = sanitizeId(challenge.id);
    const path = `challenges/${docId}`;
    const serializedHabits = challenge.habits
      .slice(0, VALIDATION_RULES.MAX_HABITS_COUNT)
      .map(serializeHabit);
    if (serializedHabits.length === 0) {
      serializedHabits.push('h_1|Daily Core Habit|min|20');
    }
    const cleanCompletedDays = [...new Set(challenge.completedDays)]
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 30)
      .slice(0, 30);

    const statusValue: 'active' | 'completed' | 'archived' =
      cleanCompletedDays.length >= 30 ? 'completed' : challenge.status === 'archived' ? 'archived' : 'active';

    try {
      if (isNew || challenge.ownerId !== user.uid) {
        await setDoc(doc(db, 'challenges', docId), {
          ownerId: user.uid,
          title: challenge.title.trim().slice(0, VALIDATION_RULES.MAX_TITLE_LENGTH) || '30-Day Challenge',
          subtitle:
            challenge.subtitle.trim().slice(0, VALIDATION_RULES.MAX_SUBTITLE_LENGTH) ||
            '30 days of deliberate consistency.',
          category: VALIDATION_RULES.ALLOWED_CATEGORIES.includes(challenge.category)
            ? challenge.category
            : 'Custom',
          startDate: sanitizeDate(challenge.startDate),
          targetDays: 30,
          habits: serializedHabits,
          completedDays: cleanCompletedDays,
          reminderEnabled: Boolean(challenge.reminderEnabled),
          reminderTime: sanitizeTime(challenge.reminderTime),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'challenges', docId), {
          completedDays: cleanCompletedDays,
          status: statusValue,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
    }
  };

  const persistHabitLogToCloud = async (challenge: ChallengeRecord, log: HabitLogRecord, isExistingInCloud: boolean) => {
    if (!user) return;
    const chId = sanitizeId(challenge.id);
    const logId = sanitizeId(`day_${log.dayNumber}`);
    const path = `challenges/${chId}/logs/${logId}`;

    // First ensure parent challenge exists in cloud under user.uid
    if (challenge.ownerId !== user.uid) {
      await persistChallengeToCloud({ ...challenge, ownerId: user.uid }, true);
    }

    const cleanHabitIds = log.completedHabitIds
      .map((id) => id.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 8);

    try {
      if (!isExistingInCloud) {
        await setDoc(doc(db, 'challenges', chId, 'logs', logId), {
          ownerId: user.uid,
          challengeId: chId,
          dayNumber: Math.min(30, Math.max(1, Math.round(log.dayNumber))),
          dateStr: sanitizeDate(log.dateStr),
          completedHabitIds: cleanHabitIds,
          reflectionNote: log.reflectionNote.slice(0, VALIDATION_RULES.MAX_NOTE_LENGTH),
          moodScore: Math.min(5, Math.max(1, Math.round(log.moodScore))),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'challenges', chId, 'logs', logId), {
          completedHabitIds: cleanHabitIds,
          reflectionNote: log.reflectionNote.slice(0, VALIDATION_RULES.MAX_NOTE_LENGTH),
          moodScore: Math.min(5, Math.max(1, Math.round(log.moodScore))),
          dateStr: sanitizeDate(log.dateStr),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        isExistingInCloud ? OperationType.UPDATE : OperationType.CREATE,
        path
      );
    }
  };

  // Authentication Handlers
  const handleGoogleSignIn = async () => {
    try {
      setAuthBannerMsg(null);
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        // Sync current active challenge to user's Firestore if they just signed in
        for (const ch of challenges) {
          if (ch.ownerId === 'local_user') {
            await persistChallengeToCloud({ ...ch, ownerId: cred.user.uid }, true);
          }
        }
        setAuthBannerMsg('Cloud sync active. Your 30-day challenges and habit logs are backed up.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled';
      setAuthBannerMsg(`Sign-in note: ${msg}`);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setAuthBannerMsg('Signed out of cloud sync. Working in local session.');
  };

  // Toggle a single Day (1..30) on the 30-Day Consistency Matrix
  const handleToggleDayCompletion = async (dayNumber: number) => {
    if (!activeChallenge) return;
    if (activeChallenge.status === 'completed' && user) return; // Respect terminal state lock

    const isCurrentlyComplete = activeChallenge.completedDays.includes(dayNumber);
    const nextCompletedDays = isCurrentlyComplete
      ? activeChallenge.completedDays.filter((d) => d !== dayNumber)
      : [...activeChallenge.completedDays, dayNumber].sort((a, b) => a - b);

    const nextStatus: 'active' | 'completed' | 'archived' =
      nextCompletedDays.length >= 30 ? 'completed' : 'active';

    const updatedChallenge: ChallengeRecord = {
      ...activeChallenge,
      completedDays: nextCompletedDays,
      status: nextStatus,
    };

    // Update local state immediately for <100ms response
    setChallenges((prev) =>
      prev.map((c) => (c.id === activeChallenge.id ? updatedChallenge : c))
    );

    // Sync day's habit log habits
    const existingLog = activeLogs.find((l) => l.dayNumber === dayNumber);
    const updatedLog: HabitLogRecord = {
      id: `day_${dayNumber}`,
      ownerId: user?.uid || activeChallenge.ownerId,
      challengeId: activeChallenge.id,
      dayNumber,
      dateStr: getDateForChallengeDay(activeChallenge.startDate, dayNumber),
      completedHabitIds: isCurrentlyComplete ? [] : activeChallenge.habits.map((h) => h.id),
      reflectionNote: existingLog?.reflectionNote || '',
      moodScore: existingLog?.moodScore || 4,
    };

    setLogsByChallenge((prev) => {
      const currentList = prev[activeChallenge.id] || [];
      const filtered = currentList.filter((l) => l.dayNumber !== dayNumber);
      return {
        ...prev,
        [activeChallenge.id]: [...filtered, updatedLog],
      };
    });

    if (user) {
      await persistChallengeToCloud(updatedChallenge, activeChallenge.ownerId !== user.uid);
      await persistHabitLogToCloud(
        updatedChallenge,
        updatedLog,
        Boolean(existingLog && existingLog.ownerId === user.uid)
      );
    }
  };

  // Toggle an Individual Habit for Selected Day
  const handleToggleHabitForDay = async (habitId: string) => {
    if (!activeChallenge) return;
    const existingLog = activeLogs.find((l) => l.dayNumber === selectedDay);
    const currentIds = selectedDayLog.completedHabitIds;
    const isChecked = currentIds.includes(habitId);
    const nextIds = isChecked
      ? currentIds.filter((id) => id !== habitId)
      : [...currentIds, habitId];

    const updatedLog: HabitLogRecord = {
      ...selectedDayLog,
      ownerId: user?.uid || activeChallenge.ownerId,
      completedHabitIds: nextIds,
    };

    // If all habits for the day are now completed, mark the day complete on the 30-day matrix!
    const allHabitsDone =
      activeChallenge.habits.length > 0 &&
      activeChallenge.habits.every((h) => nextIds.includes(h.id));

    const hasDayInMatrix = activeChallenge.completedDays.includes(selectedDay);
    let updatedChallenge = activeChallenge;

    if (allHabitsDone && !hasDayInMatrix) {
      const nextDays = [...activeChallenge.completedDays, selectedDay].sort((a, b) => a - b);
      updatedChallenge = {
        ...activeChallenge,
        completedDays: nextDays,
        status: nextDays.length >= 30 ? 'completed' : 'active',
      };
      setChallenges((prev) =>
        prev.map((c) => (c.id === activeChallenge.id ? updatedChallenge : c))
      );
    } else if (!allHabitsDone && hasDayInMatrix) {
      const nextDays = activeChallenge.completedDays.filter((d) => d !== selectedDay);
      updatedChallenge = {
        ...activeChallenge,
        completedDays: nextDays,
        status: 'active',
      };
      setChallenges((prev) =>
        prev.map((c) => (c.id === activeChallenge.id ? updatedChallenge : c))
      );
    }

    setLogsByChallenge((prev) => {
      const currentList = prev[activeChallenge.id] || [];
      const filtered = currentList.filter((l) => l.dayNumber !== selectedDay);
      return {
        ...prev,
        [activeChallenge.id]: [...filtered, updatedLog],
      };
    });

    if (user) {
      if (updatedChallenge !== activeChallenge) {
        await persistChallengeToCloud(updatedChallenge, activeChallenge.ownerId !== user.uid);
      }
      await persistHabitLogToCloud(
        updatedChallenge,
        updatedLog,
        Boolean(existingLog && existingLog.ownerId === user.uid)
      );
    }
  };

  // Update Reflection Note or Mood Score for Selected Day
  const handleUpdateReflectionOrMood = async (note: string, moodScore: number) => {
    if (!activeChallenge) return;
    const existingLog = activeLogs.find((l) => l.dayNumber === selectedDay);
    const cleanNote = note.slice(0, VALIDATION_RULES.MAX_NOTE_LENGTH);
    const cleanMood = Math.min(5, Math.max(1, moodScore));

    const updatedLog: HabitLogRecord = {
      ...selectedDayLog,
      ownerId: user?.uid || activeChallenge.ownerId,
      reflectionNote: cleanNote,
      moodScore: cleanMood,
    };

    setLogsByChallenge((prev) => {
      const currentList = prev[activeChallenge.id] || [];
      const filtered = currentList.filter((l) => l.dayNumber !== selectedDay);
      return {
        ...prev,
        [activeChallenge.id]: [...filtered, updatedLog],
      };
    });

    if (user) {
      await persistHabitLogToCloud(
        activeChallenge,
        updatedLog,
        Boolean(existingLog && existingLog.ownerId === user.uid)
      );
    }
  };

  // Add a New Habit to the Active Challenge (Up to 8 habits)
  const handleAddHabitToActiveChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChallenge || !addingHabitTitle.trim()) return;
    if (activeChallenge.habits.length >= VALIDATION_RULES.MAX_HABITS_COUNT) return;

    const newHabit: HabitItem = {
      id: `h_${Date.now().toString(36).slice(-5)}`,
      title: addingHabitTitle.trim().slice(0, 70),
      target: addingHabitTarget.trim().slice(0, 16) || '1',
      unit: addingHabitUnit.trim().slice(0, 16) || 'session',
    };

    const nextHabits = [...activeChallenge.habits, newHabit];
    const updatedChallenge: ChallengeRecord = {
      ...activeChallenge,
      habits: nextHabits,
    };

    setChallenges((prev) =>
      prev.map((c) => (c.id === activeChallenge.id ? updatedChallenge : c))
    );
    setAddingHabitTitle('');

    if (user && activeChallenge.status !== 'completed') {
      const docId = sanitizeId(activeChallenge.id);
      try {
        if (activeChallenge.ownerId !== user.uid) {
          await persistChallengeToCloud({ ...updatedChallenge, ownerId: user.uid }, true);
        } else {
          await updateDoc(doc(db, 'challenges', docId), {
            title: updatedChallenge.title,
            subtitle: updatedChallenge.subtitle,
            category: updatedChallenge.category,
            habits: nextHabits.map(serializeHabit),
            reminderEnabled: updatedChallenge.reminderEnabled,
            reminderTime: updatedChallenge.reminderTime,
            status: updatedChallenge.status,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `challenges/${docId}`);
      }
    }
  };

  // Create a Brand New 30-Day Challenge
  const handleCreateNewChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChallengeTitle.trim()) return;

    const validHabits = newChallengeHabits.filter((h) => h.title.trim().length > 0);
    const finalHabits: HabitItem[] =
      validHabits.length > 0
        ? validHabits.slice(0, VALIDATION_RULES.MAX_HABITS_COUNT)
        : [{ id: 'h_core', title: 'Daily Core Consistency Ritual', unit: 'min', target: '30' }];

    const newId = sanitizeId(`ch_${Date.now().toString(36)}`);
    const todayIso = new Date().toISOString().slice(0, 10);

    const created: ChallengeRecord = {
      id: newId,
      ownerId: user?.uid || 'local_user',
      title: newChallengeTitle.trim().slice(0, VALIDATION_RULES.MAX_TITLE_LENGTH),
      subtitle:
        newChallengeSubtitle.trim().slice(0, VALIDATION_RULES.MAX_SUBTITLE_LENGTH) ||
        '30 consecutive days of deliberate execution and habit logging.',
      category: newChallengeCategory,
      startDate: todayIso,
      targetDays: 30,
      habits: finalHabits,
      completedDays: [],
      reminderEnabled: true,
      reminderTime: sanitizeTime(newChallengeReminderTime, '07:30'),
      status: 'active',
    };

    setChallenges((prev) => [created, ...prev]);
    setSelectedChallengeId(created.id);
    setSelectedDay(1);
    setQuoteDayIndex(1);
    setIsCreateModalOpen(false);
    setNewChallengeTitle('');
    setNewChallengeSubtitle('');

    if (user) {
      await persistChallengeToCloud(created, true);
    }
  };

  const handleApplyPresetToModal = (presetId: string) => {
    const preset = CHALLENGE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setNewChallengeTitle(preset.title);
    setNewChallengeSubtitle(preset.subtitle);
    setNewChallengeCategory(preset.category);
    setNewChallengeReminderTime(preset.reminderTime);
    setNewChallengeHabits(preset.habits.map((h) => ({ ...h })));
  };

  const handleDeleteChallenge = async (challengeId: string) => {
    if (challenges.length <= 1) return; // Keep at least 1 active challenge in workspace
    const target = challenges.find((c) => c.id === challengeId);
    const remaining = challenges.filter((c) => c.id !== challengeId);
    setChallenges(remaining);
    if (selectedChallengeId === challengeId && remaining[0]) {
      setSelectedChallengeId(remaining[0].id);
    }
    if (user && target && target.ownerId === user.uid) {
      const docId = sanitizeId(challengeId);
      try {
        await deleteDoc(doc(db, 'challenges', docId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `challenges/${docId}`);
      }
    }
  };

  // Save Notification Preferences
  const handleUpdateNotifPrefs = async (partial: Partial<NotificationPreferenceRecord>) => {
    const nextPrefs: NotificationPreferenceRecord = {
      ...notifPrefs,
      ...partial,
      ownerId: user?.uid || notifPrefs.ownerId,
      morningQuoteTime: sanitizeTime(
        partial.morningQuoteTime ?? notifPrefs.morningQuoteTime,
        '08:00'
      ),
      eveningCheckinTime: sanitizeTime(
        partial.eveningCheckinTime ?? notifPrefs.eveningCheckinTime,
        '20:30'
      ),
    };
    setNotifPrefs(nextPrefs);

    if (user) {
      const path = `notificationPreferences/${user.uid}`;
      try {
        await setDoc(doc(db, 'notificationPreferences', user.uid), {
          ownerId: user.uid,
          pushEnabled: Boolean(nextPrefs.pushEnabled),
          morningQuoteTime: nextPrefs.morningQuoteTime,
          eveningCheckinTime: nextPrefs.eveningCheckinTime,
          quoteTheme: VALIDATION_RULES.ALLOWED_QUOTE_THEMES.includes(nextPrefs.quoteTheme)
            ? nextPrefs.quoteTheme
            : 'Atomic Systems',
          soundEnabled: Boolean(nextPrefs.soundEnabled),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  };

  // Request Browser Permission & Dispatch Test Push Notification
  const handleRequestBrowserPermission = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPermission(perm);
    if (perm === 'granted') {
      dispatchPushNotification(
        {
          title: 'Browser Push Notifications Enabled · Cadence 30',
          body: `Daily quote reminders (${notifPrefs.morningQuoteTime}) and evening habit check-ins (${notifPrefs.eveningCheckinTime}) are active.`,
          tag: 'permission-granted',
          actionLabel: 'Check Schedule',
        },
        {
          soundEnabled: notifPrefs.soundEnabled,
          onInAppPush: handleIncomingPush,
        }
      );
    }
  };

  const handleSendTestHabitPush = () => {
    const uncompletedHabits = activeChallenge
      ? activeChallenge.habits.filter((h) => !selectedDayLog.completedHabitIds.includes(h.id))
      : [];
    const habitPrompt =
      uncompletedHabits.length > 0
        ? `${uncompletedHabits.length} habit${uncompletedHabits.length > 1 ? 's' : ''} remaining for Day ${selectedDay}: Next up is “${uncompletedHabits[0].title}” (${uncompletedHabits[0].target} ${uncompletedHabits[0].unit}).`
        : `All ${activeChallenge?.habits.length || 4} habits completed for Day ${selectedDay}! Your ${stats.currentStreak}-day consistency chain is locked in.`;

    dispatchPushNotification(
      {
        title: `Consistency Reminder · ${activeChallenge?.title || '30-Day Challenge'}`,
        body: habitPrompt,
        tag: 'test-habit-reminder',
        actionLabel: `Open Day ${selectedDay} Log`,
      },
      {
        soundEnabled: notifPrefs.soundEnabled,
        onInAppPush: handleIncomingPush,
      }
    );
  };

  const handleSendQuotePush = (quoteObj = currentDailyQuote) => {
    dispatchPushNotification(
      {
        title: `Day ${quoteObj.day} Motivational Dispatch · ${quoteObj.author}`,
        body: `“${quoteObj.quote}” — ${quoteObj.actionPrompt}`,
        tag: `quote-day-${quoteObj.day}`,
        actionLabel: 'Reflect on Day ' + quoteObj.day,
      },
      {
        soundEnabled: notifPrefs.soundEnabled,
        onInAppPush: handleIncomingPush,
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-20 md:pb-16">
      {/* Live Push Notification Floating Toast (Non-Arrival, User/Schedule Triggered) */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 z-50 max-w-md w-[calc(100vw-2rem)] bg-slate-900 text-white rounded-2xl p-4 shadow-xl border border-slate-800 transition-all duration-150"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mb-1">
                  <span>Push Notification</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeToast.timestamp}</span>
                </div>
                <p className="text-sm font-semibold text-white leading-snug mb-1">
                  {activeToast.title}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">{activeToast.body}</p>
                {activeToast.actionLabel && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav('habits');
                      setActiveToast(null);
                    }}
                    className="mt-2.5 text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-4"
                  >
                    {activeToast.actionLabel}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              aria-label="Dismiss notification"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Strictly Compliant 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <a
            href="#tracker"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('tracker');
            }}
            className="font-display text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Cadence 30
          </a>

          {/* Zone 2: 4 Clean Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveNav('tracker')}
              className={`min-h-[44px] py-2 transition-colors whitespace-nowrap border-b-2 ${
                activeNav === 'tracker'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              30-Day Tracker
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('habits')}
              className={`min-h-[44px] py-2 transition-colors whitespace-nowrap border-b-2 ${
                activeNav === 'habits'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Habit Log
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('quotes')}
              className={`min-h-[44px] py-2 transition-colors whitespace-nowrap border-b-2 ${
                activeNav === 'quotes'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Daily Quotes
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('reminders')}
              className={`min-h-[44px] py-2 transition-colors whitespace-nowrap border-b-2 ${
                activeNav === 'reminders'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Push Reminders
            </button>
          </nav>

          {/* Zone 3: 1-2 Primary Actions */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                title={`Signed in as ${user.email || user.displayName || 'User'}`}
                className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Sync with Google</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Challenge</span>
            </button>
          </div>
        </div>
      </header>

      {/* Optional Quiet Auth Sync Status Line */}
      {authBannerMsg && (
        <div className="bg-slate-900 text-slate-200 text-xs py-2 px-4 sm:px-8">
          <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4">
            <span>{authBannerMsg}</span>
            <button
              type="button"
              onClick={() => setAuthBannerMsg(null)}
              className="text-slate-400 hover:text-white underline whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container (1280px Desktop Presence, Generous Whitespace) */}
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6 sm:pt-8 space-y-10">
        {/* Focal Anchor: Daily Motivational Quote & Challenge Overview Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left 7 Columns: Editorial Daily Quote & Ritual Anchor Card with Measured Scrim */}
          <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-slate-200 min-h-[320px] flex flex-col justify-between p-6 sm:p-8 bg-slate-900 text-white">
            {!heroImgFailed ? (
              <img
                src={heroRitualImg}
                alt="Minimalist morning ritual study desk with linen journal and natural sunlight"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950" />
            )}
            {/* Measured Contrast Scrim ensuring >4.5:1 WCAG AA legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/30" />

            {/* Top Kicker Row: Unboxed Metadata with Typographic Separators */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200/90 font-mono tabular-nums">
              <div className="flex items-center gap-2">
                <span>Day {currentDailyQuote.day} of 30</span>
                <span aria-hidden="true">·</span>
                <span>{currentDailyQuote.theme}</span>
                <span aria-hidden="true">·</span>
                <span>Daily Reminder {notifPrefs.morningQuoteTime}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuoteDayIndex((d) => (d > 1 ? d - 1 : 30))}
                  aria-label="Previous daily quote"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteDayIndex((d) => (d < 30 ? d + 1 : 1))}
                  aria-label="Next daily quote"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Center Quote Block */}
            <div className="relative z-10 my-6 max-w-2xl">
              <blockquote className="font-display text-xl sm:text-2xl md:text-[26px] font-normal leading-snug text-white tracking-wide mb-3">
                “{currentDailyQuote.quote}”
              </blockquote>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-white">{currentDailyQuote.author}</span>
                <span aria-hidden="true">·</span>
                <span className="italic">{currentDailyQuote.source}</span>
              </div>
              <p className="mt-3 text-xs sm:text-sm text-amber-100/90 leading-relaxed border-l-2 border-amber-400/80 pl-3">
                {currentDailyQuote.actionPrompt}
              </p>
            </div>

            {/* Bottom Action Bar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/15">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>Active Protocol:</span>
                <span className="font-semibold text-white truncate max-w-[220px] sm:max-w-xs">
                  {activeChallenge?.title}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSendQuotePush(currentDailyQuote)}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5 text-amber-300" />
                  <span>Push Quote Reminder</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(currentDailyQuote.day);
                    setActiveNav('habits');
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Log Day {currentDailyQuote.day} Habits
                </button>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Active Challenge Summary & Quantitative Consistency Panel */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              {/* Challenge Switcher Tabs */}
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
                  {challenges.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setSelectedChallengeId(ch.id);
                      }}
                      className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap truncate max-w-[160px] ${
                        ch.id === activeChallenge?.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>

                {challenges.length > 1 && activeChallenge && (
                  <button
                    type="button"
                    onClick={() => handleDeleteChallenge(activeChallenge.id)}
                    aria-label="Delete active challenge"
                    title="Delete challenge"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Unboxed Metadata Line */}
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                <span>{activeChallenge?.category || 'Deep Work'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Started {activeChallenge?.startDate}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeChallenge?.status === 'completed' ? 'Completed 30/30' : 'Active Cycle'}
                </span>
              </div>

              <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 mb-2">
                {activeChallenge?.title}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                {activeChallenge?.subtitle}
              </p>
            </div>

            {/* Quantitative Consistency Metrics (Tabular Numerals, Hairline Grid) */}
            <div className="grid grid-cols-3 border-t border-b border-slate-200 py-4 my-2 divide-x divide-slate-200">
              <div className="pr-4">
                <p className="text-xs text-slate-500 mb-1">Days Completed</p>
                <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {stats.completedCount}
                  <span className="text-sm font-normal text-slate-400">/30</span>
                </p>
                <p className="text-[11px] text-emerald-700 font-mono tabular-nums mt-0.5">
                  {stats.completionRate}% consistency
                </p>
              </div>

              <div className="px-4">
                <p className="text-xs text-slate-500 mb-1">Current Streak</p>
                <div className="flex items-baseline gap-1.5">
                  <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                    {stats.currentStreak}
                  </p>
                  <span className="text-xs text-slate-500">days</span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                  Best: {stats.bestStreak}d chain
                </p>
              </div>

              <div className="pl-4">
                <p className="text-xs text-slate-500 mb-1">Daily Push</p>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {activeChallenge?.reminderTime || '07:30'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {notifPrefs.pushEnabled ? 'Reminders active' : 'Paused'}
                </p>
              </div>
            </div>

            {/* Immediate Test Push & Quick Day Check-In CTA */}
            <div className="pt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSendTestHabitPush}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 hover:border-slate-900 text-xs font-semibold text-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 text-amber-600" />
                <span>Test Push Notification</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleDayCompletion(selectedDay)}
                className={`min-h-[44px] flex-1 px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
                  activeChallenge?.completedDays.includes(selectedDay)
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-[#0F172A] hover:bg-slate-800 text-white'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {activeChallenge?.completedDays.includes(selectedDay)
                    ? `Day ${selectedDay} Completed`
                    : `Mark Day ${selectedDay} Complete`}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 1 & 2: 30-Day Consistency Matrix + Daily Habit Ritual Logger */}
        {(activeNav === 'tracker' || activeNav === 'habits') && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Columns: 01. 30-Day Consistency Matrix */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-900">
                    01. 30-Day Consistency Matrix
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Select any day to inspect or log habits, or double-click a day square to toggle full completion.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                    <span>Completed ({stats.completedCount})</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs border-2 border-amber-500 inline-block" />
                    <span>Selected (Day {selectedDay})</span>
                  </span>
                </div>
              </div>

              {/* 30-Day Tactile Grid (6 columns x 5 rows on desktop, 5x6 on mobile) */}
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 sm:gap-3">
                {Array.from({ length: 30 }, (_, idx) => {
                  const dayNum = idx + 1;
                  const isCompleted = activeChallenge?.completedDays.includes(dayNum) ?? false;
                  const isSelected = selectedDay === dayNum;
                  const dayLog = activeLogs.find((l) => l.dayNumber === dayNum);
                  const partialHabitsCount = dayLog?.completedHabitIds.length || 0;
                  const totalHabitsCount = activeChallenge?.habits.length || 1;
                  const hasPartial = !isCompleted && partialHabitsCount > 0;
                  const dateLabel = activeChallenge
                    ? getDateForChallengeDay(activeChallenge.startDate, dayNum).slice(5)
                    : '';

                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => {
                        setSelectedDay(dayNum);
                        setQuoteDayIndex(dayNum);
                      }}
                      onDoubleClick={() => handleToggleDayCompletion(dayNum)}
                      aria-label={`Day ${dayNum}, ${isCompleted ? 'Completed' : 'Pending'}`}
                      className={`min-h-[68px] p-2.5 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between relative ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : hasPartial
                          ? 'bg-amber-50/70 border-amber-300 text-slate-900'
                          : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800'
                      } ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-[#0F172A]'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          D{String(dayNum).padStart(2, '0')}
                        </span>
                        {isCompleted ? (
                          <Check className="w-3.5 h-3.5 text-white shrink-0" />
                        ) : hasPartial ? (
                          <span className="font-mono text-[10px] text-amber-800 tabular-nums">
                            {partialHabitsCount}/{totalHabitsCount}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center justify-between w-full">
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            isCompleted ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {dateLabel}
                        </span>
                        {dayNum % 7 === 0 || dayNum === 30 ? (
                          <Flame
                            className={`w-3 h-3 ${
                              isCompleted ? 'text-amber-200' : 'text-slate-300'
                            }`}
                          />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Bar of Matrix: Milestone Progress & Quick Toggle */}
              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {!emblemImgFailed && (
                    <img
                      src={milestoneEmblemImg}
                      alt="Bronze and travertine sundial milestone emblem"
                      referrerPolicy="no-referrer"
                      onError={() => setEmblemImgFailed(true)}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {stats.completedCount < 7
                        ? 'Next Milestone: 7-Day First Week Chain'
                        : stats.completedCount < 15
                        ? 'Next Milestone: Day 15 Halfway Summit'
                        : stats.completedCount < 30
                        ? 'Final Stretch: Day 30 Mastery Seal'
                        : '30-Day Challenge Complete!'}
                    </p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {stats.remainingDays} days remaining in this 30-day cycle
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDayCompletion(selectedDay)}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
                  >
                    {activeChallenge?.completedDays.includes(selectedDay)
                      ? `Unmark Day ${selectedDay}`
                      : `Complete All Day ${selectedDay}`}
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: 02. Daily Habit Ritual & Reflection Log */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span>Day {selectedDay} of 30</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedDayLog.dateStr}</span>
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">
                    02. Daily Habit Rituals
                  </h2>
                </div>

                {/* Day Stepper Controls */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDay((d) => (d > 1 ? d - 1 : 30))}
                    aria-label="Previous day"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDay((d) => (d < 30 ? d + 1 : 1))}
                    aria-label="Next day"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Interactive Tap List Rows for Habits (56px-68px height, hairline dividers) */}
              <div className="divide-y divide-slate-200 border-t border-b border-slate-200 my-4">
                {activeChallenge?.habits.map((habit) => {
                  const isDone = selectedDayLog.completedHabitIds.includes(habit.id);
                  return (
                    <button
                      key={habit.id}
                      type="button"
                      onClick={() => handleToggleHabitForDay(habit.id)}
                      className="w-full min-h-[60px] py-3 px-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : 'border-2 border-slate-300 group-hover:border-slate-600 bg-white'
                          }`}
                        >
                          {isDone && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isDone ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {habit.title}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            Target: {habit.target} {habit.unit} · {isDone ? 'Logged' : 'Pending'}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                        {isDone ? '100%' : '0%'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Habit to Protocol Form */}
              {activeChallenge &&
                activeChallenge.habits.length < VALIDATION_RULES.MAX_HABITS_COUNT && (
                  <form onSubmit={handleAddHabitToActiveChallenge} className="mb-6">
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Add Habit to This 30-Day Challenge ({activeChallenge.habits.length}/8)
                    </label>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <input
                        type="text"
                        value={addingHabitTitle}
                        onChange={(e) => setAddingHabitTitle(e.target.value)}
                        placeholder="e.g., 20-Min Evening Walk"
                        maxLength={70}
                        className="min-h-[40px] flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                      <input
                        type="text"
                        value={addingHabitTarget}
                        onChange={(e) => setAddingHabitTarget(e.target.value)}
                        placeholder="20"
                        maxLength={10}
                        aria-label="Target amount"
                        className="min-h-[40px] w-16 px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                      <input
                        type="text"
                        value={addingHabitUnit}
                        onChange={(e) => setAddingHabitUnit(e.target.value)}
                        placeholder="min"
                        maxLength={12}
                        aria-label="Target unit"
                        className="min-h-[40px] w-16 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                      <button
                        type="submit"
                        className="min-h-[40px] px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                )}

              {/* Daily Focus / Energy Rating & Reflection Note */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Day {selectedDay} Focus & Energy Score
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() =>
                          handleUpdateReflectionOrMood(selectedDayLog.reflectionNote, score)
                        }
                        className={`min-h-[36px] min-w-[36px] rounded-lg font-mono text-xs font-semibold tabular-nums transition-colors ${
                          selectedDayLog.moodScore === score
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                    <label htmlFor="daily-reflection-note" className="font-semibold text-slate-700">
                      Daily Consistency & Reflection Note
                    </label>
                    <span className="font-mono tabular-nums text-slate-400">
                      {selectedDayLog.reflectionNote.length}/{VALIDATION_RULES.MAX_NOTE_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id="daily-reflection-note"
                    rows={3}
                    value={selectedDayLog.reflectionNote}
                    maxLength={VALIDATION_RULES.MAX_NOTE_LENGTH}
                    onChange={(e) =>
                      handleUpdateReflectionOrMood(e.target.value, selectedDayLog.moodScore)
                    }
                    placeholder={`Record observations, friction points, or wins from Day ${selectedDay}...`}
                    className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: Curated 30-Day Motivational Quotes Library & Push Dispatch */}
        {(activeNav === 'tracker' || activeNav === 'quotes') && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-900">
                  03. 30-Day Motivational Quote Canon
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Each day of your 30-day cycle pairs with a specific philosophical principle and morning push dispatch.
                </p>
              </div>

              {/* Interactive Theme Filter Segmented Control */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    'All',
                    'Atomic Systems',
                    'Stoic Discipline',
                    'Mindful Presence',
                    'Peak Endurance',
                  ] as const
                ).map((themeOption) => (
                  <button
                    key={themeOption}
                    type="button"
                    onClick={() => setQuoteThemeFilter(themeOption)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      quoteThemeFilter === themeOption
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {themeOption}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {filteredQuotesList.slice(0, activeNav === 'quotes' ? 30 : 6).map((item) => {
                const isDayDone = activeChallenge?.completedDays.includes(item.day) ?? false;
                return (
                  <div
                    key={item.day}
                    className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 max-w-3xl">
                      {/* Clean Unboxed Metadata */}
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span className="font-semibold text-slate-900">
                          Day {String(item.day).padStart(2, '0')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.theme}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.author}</span>
                        <span aria-hidden="true">·</span>
                        <span className="italic font-sans">{item.source}</span>
                        {isDayDone && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-semibold">Day Completed</span>
                          </>
                        )}
                      </div>

                      <p className="font-display text-base sm:text-lg text-slate-900 leading-snug">
                        “{item.quote}”
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Action Prompt: {item.actionPrompt}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSendQuotePush(item)}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 hover:border-slate-900 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Bell className="w-3.5 h-3.5 text-amber-600" />
                        <span>Push to Device</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(item.day);
                          setQuoteDayIndex(item.day);
                          setActiveNav('habits');
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-900 transition-colors whitespace-nowrap"
                      >
                        Open Day {item.day}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {activeNav !== 'quotes' && (
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  Showing 6 of 30 daily motivational quotes
                </span>
                <button
                  type="button"
                  onClick={() => setActiveNav('quotes')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-900 hover:underline whitespace-nowrap"
                >
                  Explore Full 30-Day Quote Canon →
                </button>
              </div>
            )}
          </section>
        )}

        {/* SECTION 4: Push Notification Center & Reminder Schedule */}
        {(activeNav === 'tracker' || activeNav === 'reminders') && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Columns: Push Notification Schedule & Permission Controls */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-900">
                    04. Push Notification & Reminder Schedule
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure automated morning motivational quote pushes and evening consistency check-in alerts.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleUpdateNotifPrefs({ soundEnabled: !notifPrefs.soundEnabled })}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {notifPrefs.soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Harmonic Chime On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                      <span>Chime Muted</span>
                    </>
                  )}
                </button>
              </div>

              {/* Browser Web Notification Permission Banner */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600">
                    <span>Browser Push Status:</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      {browserPermission}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>In-App Push Engine: Active</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Grant browser notification permission to receive desktop or mobile lock-screen alerts alongside in-app push reminders.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {browserPermission !== 'granted' && browserPermission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={handleRequestBrowserPermission}
                      className="min-h-[40px] px-4 py-2 bg-[#0F172A] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      Authorize Browser Push
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSendTestHabitPush}
                    className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-900 text-slate-900 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Trigger Live Push Now
                  </button>
                </div>
              </div>

              {/* Schedule Configuration Rows */}
              <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
                <div className="py-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Master Push Reminders Switch
                    </p>
                    <p className="text-xs text-slate-500">
                      Enable or pause all scheduled daily motivational quotes and habit nudges.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateNotifPrefs({ pushEnabled: !notifPrefs.pushEnabled })
                    }
                    className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      notifPrefs.pushEnabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {notifPrefs.pushEnabled ? 'Push Reminders Active' : 'Push Reminders Paused'}
                  </button>
                </div>

                <div className="py-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="morning-quote-time"
                      className="text-sm font-semibold text-slate-900 block"
                    >
                      Morning Motivational Quote Dispatch
                    </label>
                    <p className="text-xs text-slate-500">
                      Delivers your daily quote and action prompt before your morning block.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <input
                      id="morning-quote-time"
                      type="time"
                      value={notifPrefs.morningQuoteTime}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({ morningQuoteTime: e.target.value })
                      }
                      className="min-h-[40px] px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                <div className="py-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="evening-checkin-time"
                      className="text-sm font-semibold text-slate-900 block"
                    >
                      Evening Habit Log & Streak Protection Alert
                    </label>
                    <p className="text-xs text-slate-500">
                      Reminds you to check off any remaining habits and write your daily reflection.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <input
                      id="evening-checkin-time"
                      type="time"
                      value={notifPrefs.eveningCheckinTime}
                      onChange={(e) =>
                        handleUpdateNotifPrefs({ eveningCheckinTime: e.target.value })
                      }
                      className="min-h-[40px] px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                <div className="py-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="default-quote-philosophy"
                      className="text-sm font-semibold text-slate-900 block"
                    >
                      Preferred Quote Philosophy
                    </label>
                    <p className="text-xs text-slate-500">
                      Curates the tone of your scheduled morning push notifications.
                    </p>
                  </div>
                  <select
                    id="default-quote-philosophy"
                    value={notifPrefs.quoteTheme}
                    onChange={(e) =>
                      handleUpdateNotifPrefs({ quoteTheme: e.target.value as QuoteTheme })
                    }
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {VALIDATION_RULES.ALLOWED_QUOTE_THEMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Recent Push Notification Dispatch Feed */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Recent Push Dispatches
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live log of motivational quote and habit reminders sent to your session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendQuotePush(currentDailyQuote)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 whitespace-nowrap"
                >
                  + Dispatch Quote
                </button>
              </div>

              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {pushHistory.map((item) => (
                  <div key={item.id} className="py-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                      <span>{item.tag}</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Modal: Create New 30-Day Challenge */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-challenge-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 sm:p-8 my-8">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-xs text-slate-500 font-mono">30-Day Protocol Architect</p>
                <h2
                  id="create-challenge-title"
                  className="font-display text-xl font-semibold text-slate-900"
                >
                  Launch a New 30-Day Challenge
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close modal"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1-Click Curated Blueprint Presets */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Load a Curated 30-Day Template (Optional)
              </p>
              <div className="flex flex-wrap gap-2">
                {CHALLENGE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPresetToModal(preset.id)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>{preset.category}: {preset.title.split('&')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateNewChallenge} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Challenge Title (max 100 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newChallengeTitle}
                  onChange={(e) => setNewChallengeTitle(e.target.value)}
                  placeholder="e.g., 30 Days of Deep Work & Morning Movement"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Commitment Statement / Why (max 240 chars)
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={newChallengeSubtitle}
                  onChange={(e) => setNewChallengeSubtitle(e.target.value)}
                  placeholder="What measurable transformation will 30 consecutive days create?"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Domain Category
                  </label>
                  <select
                    value={newChallengeCategory}
                    onChange={(e) => setNewChallengeCategory(e.target.value as ChallengeCategory)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                  >
                    {VALIDATION_RULES.ALLOWED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daily Push Reminder Time
                  </label>
                  <input
                    type="time"
                    value={newChallengeReminderTime}
                    onChange={(e) => setNewChallengeReminderTime(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Daily Habits Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Daily Habits to Track ({newChallengeHabits.length}/8)
                  </label>
                  {newChallengeHabits.length < 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewChallengeHabits((prev) => [
                          ...prev,
                          {
                            id: `h_${prev.length + 1}_${Date.now().toString(36).slice(-3)}`,
                            title: '',
                            unit: 'min',
                            target: '15',
                          },
                        ])
                      }
                      className="text-xs font-semibold text-slate-900 hover:underline"
                    >
                      + Add Habit Row
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {newChallengeHabits.map((h, i) => (
                    <div key={h.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={h.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewChallengeHabits((prev) =>
                            prev.map((item, idx) => (idx === i ? { ...item, title: val } : item))
                          );
                        }}
                        placeholder={`Habit #${i + 1} title`}
                        maxLength={70}
                        className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={h.target}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewChallengeHabits((prev) =>
                            prev.map((item, idx) => (idx === i ? { ...item, target: val } : item))
                          );
                        }}
                        placeholder="30"
                        maxLength={10}
                        className="w-14 min-h-[40px] px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={h.unit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewChallengeHabits((prev) =>
                            prev.map((item, idx) => (idx === i ? { ...item, unit: val } : item))
                          );
                        }}
                        placeholder="min"
                        maxLength={12}
                        className="w-16 min-h-[40px] px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
                >
                  Start 30-Day Challenge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer (No telemetry tickers or fake status engines) */}
      <footer className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <span>Cadence 30 · Deliberate 30-Day Habit & Consistency Architecture</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveNav('tracker')}
            className="hover:text-slate-900 transition-colors"
          >
            30-Day Matrix
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setActiveNav('quotes')}
            className="hover:text-slate-900 transition-colors"
          >
            Daily Quotes
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setActiveNav('reminders')}
            className="hover:text-slate-900 transition-colors"
          >
            Push Schedule
          </button>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Tab Bar (Thumb-Zone Ergonomics, <=15% Sticky Cap) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center h-14"
      >
        <button
          type="button"
          onClick={() => setActiveNav('tracker')}
          className={`h-full flex flex-col items-center justify-center ${
            activeNav === 'tracker' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">30-Day Grid</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('habits')}
          className={`h-full flex flex-col items-center justify-center ${
            activeNav === 'habits' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Habit Log</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('quotes')}
          className={`h-full flex flex-col items-center justify-center ${
            activeNav === 'quotes' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Quotes</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('reminders')}
          className={`h-full flex flex-col items-center justify-center ${
            activeNav === 'reminders' ? 'text-slate-900 font-semibold' : 'text-slate-500'
          }`}
        >
          <Quote className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Reminders</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Cadence30Workspace />
    </AppErrorBoundary>
  );
}
