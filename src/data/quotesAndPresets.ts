export type ChallengeCategory =
  | 'Mindfulness'
  | 'Fitness'
  | 'Deep Work'
  | 'Nutrition'
  | 'Reading'
  | 'Custom';

export type QuoteTheme =
  | 'Stoic Discipline'
  | 'Atomic Systems'
  | 'Mindful Presence'
  | 'Peak Endurance';

export interface HabitItem {
  id: string;
  title: string;
  unit: string;
  target: string;
}

export interface ChallengeRecord {
  id: string;
  ownerId: string;
  title: string;
  subtitle: string;
  category: ChallengeCategory;
  startDate: string; // YYYY-MM-DD
  targetDays: number; // 30
  habits: HabitItem[];
  completedDays: number[]; // e.g. [1, 2, 3]
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM
  status: 'active' | 'completed' | 'archived';
}

export interface HabitLogRecord {
  id: string; // e.g. day_1
  ownerId: string;
  challengeId: string;
  dayNumber: number; // 1..30
  dateStr: string; // YYYY-MM-DD
  completedHabitIds: string[];
  reflectionNote: string;
  moodScore: number; // 1..5
}

export interface NotificationPreferenceRecord {
  ownerId: string;
  pushEnabled: boolean;
  morningQuoteTime: string;
  eveningCheckinTime: string;
  quoteTheme: QuoteTheme;
  soundEnabled: boolean;
}

export interface DailyQuote {
  day: number;
  theme: QuoteTheme;
  quote: string;
  author: string;
  source: string;
  actionPrompt: string;
}

export function serializeHabit(habit: HabitItem): string {
  const safeId = habit.id.replace(/\|/g, '').slice(0, 24) || 'h1';
  const safeTitle = habit.title.replace(/\|/g, ' ').trim().slice(0, 70) || 'Daily Habit';
  const safeUnit = habit.unit.replace(/\|/g, ' ').trim().slice(0, 24) || 'session';
  const safeTarget = habit.target.replace(/\|/g, ' ').trim().slice(0, 24) || '1';
  return `${safeId}|${safeTitle}|${safeUnit}|${safeTarget}`.slice(0, 160);
}

export function deserializeHabit(raw: string, index: number): HabitItem {
  const parts = raw.split('|');
  if (parts.length >= 4) {
    return {
      id: parts[0] || `h_${index + 1}`,
      title: parts[1] || `Habit ${index + 1}`,
      unit: parts[2] || 'min',
      target: parts[3] || '20',
    };
  }
  return {
    id: `h_${index + 1}`,
    title: raw.slice(0, 70) || `Habit ${index + 1}`,
    unit: 'session',
    target: '1',
  };
}

export const DAILY_MOTIVATIONAL_QUOTES: DailyQuote[] = [
  {
    day: 1,
    theme: 'Atomic Systems',
    quote: 'Every action you take is a vote for the type of person you wish to become. No single instance will transform your beliefs, but as the votes build up, so does the evidence of your new identity.',
    author: 'James Clear',
    source: 'Atomic Habits',
    actionPrompt: 'Anchor Day 1 by reducing friction: lay out your tools the night before so starting requires zero negotiation.',
  },
  {
    day: 2,
    theme: 'Stoic Discipline',
    quote: 'First say to yourself what you would be; and then do what you have to do.',
    author: 'Epictetus',
    source: 'Discourses, Book III',
    actionPrompt: 'Complete your first morning habit before opening any inbox or feed.',
  },
  {
    day: 3,
    theme: 'Peak Endurance',
    quote: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
    source: 'The Story of Philosophy',
    actionPrompt: 'Focus on showing up on time today—precision in timing builds self-trust.',
  },
  {
    day: 4,
    theme: 'Mindful Presence',
    quote: 'How we spend our days is, of course, how we spend our lives. What we do with this hour, and that one, is what we are doing.',
    author: 'Annie Dillard',
    source: 'The Writing Life',
    actionPrompt: 'Notice the exact moment resistance appears today and breathe through the first 90 seconds of the ritual.',
  },
  {
    day: 5,
    theme: 'Stoic Discipline',
    quote: 'At dawn, when you have trouble getting out of bed, tell yourself: I have to go to work—as a human being.',
    author: 'Marcus Aurelius',
    source: 'Meditations, Book V',
    actionPrompt: 'Five days forms your first work-week chain. Log your reflection immediately after finishing.',
  },
  {
    day: 6,
    theme: 'Atomic Systems',
    quote: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    source: 'Atomic Habits',
    actionPrompt: 'Audit your environment: remove one distraction that competed for your attention this week.',
  },
  {
    day: 7,
    theme: 'Peak Endurance',
    quote: 'It is not the mountain we conquer, but ourselves.',
    author: 'Sir Edmund Hillary',
    source: 'High Adventure',
    actionPrompt: 'One full week complete. Celebrate consistency over intensity and protect tomorrow’s start.',
  },
  {
    day: 8,
    theme: 'Mindful Presence',
    quote: 'Nothing is softer or more flexible than water, yet nothing can resist it.',
    author: 'Lao Tzu',
    source: 'Tao Te Ching',
    actionPrompt: 'Begin Week 2 with steady, unhurried execution—no rushing through the reps.',
  },
  {
    day: 9,
    theme: 'Stoic Discipline',
    quote: 'If a man knows not to which port he sails, no wind is favorable.',
    author: 'Seneca',
    source: 'Letters from a Stoic',
    actionPrompt: 'Re-read your 30-day commitment subtitle before checking off today’s habits.',
  },
  {
    day: 10,
    theme: 'Peak Endurance',
    quote: 'One-third of the crossing is behind you. Momentum is no longer an accident; it is an asset you have earned.',
    author: 'Beryl Markham',
    source: 'West with the Night',
    actionPrompt: 'Day 10 milestone: write one sentence in today’s log about what feels easier now than on Day 1.',
  },
  {
    day: 11,
    theme: 'Atomic Systems',
    quote: 'Professionals stick to the schedule; amateurs let life get in the way.',
    author: 'Steven Pressfield',
    source: 'The War of Art',
    actionPrompt: 'Even if today is compressed, execute a minimum viable version of every habit rather than skipping.',
  },
  {
    day: 12,
    theme: 'Stoic Discipline',
    quote: 'No man is free who is not master of himself.',
    author: 'Epictetus',
    source: 'Fragments',
    actionPrompt: 'Treat your scheduled reminder time as an unbreakable appointment with yourself.',
  },
  {
    day: 13,
    theme: 'Mindful Presence',
    quote: 'Realize deeply that the present moment is all you have. Make the NOW the primary focus of your life.',
    author: 'Eckhart Tolle',
    source: 'The Power of Now',
    actionPrompt: 'Perform today’s habits in single-task mode—no background podcasts or multitasking.',
  },
  {
    day: 14,
    theme: 'Peak Endurance',
    quote: 'Endurance is not just the ability to bear a hard thing, but to turn it into glory.',
    author: 'William Barclay',
    source: 'Daily Study Bible',
    actionPrompt: 'Two full weeks locked in. Review your 14-day grid and notice the compound visual proof.',
  },
  {
    day: 15,
    theme: 'Stoic Discipline',
    quote: 'Well-being is realized by small steps, but is truly no small thing.',
    author: 'Zeno of Citium',
    source: 'Stoic Fragments',
    actionPrompt: 'Halfway Summit (Day 15 of 30): You have tipped the balance from initiation to identity.',
  },
  {
    day: 16,
    theme: 'Atomic Systems',
    quote: 'Success is a few simple disciplines, practiced every day; while failure is simply a few errors in judgment, repeated every day.',
    author: 'Jim Rohn',
    source: 'The Treasury of Quotes',
    actionPrompt: 'Enter the second half of the 30-day cycle by slightly elevating the quality of your focus.',
  },
  {
    day: 17,
    theme: 'Mindful Presence',
    quote: 'In the midst of movement and chaos, keep stillness inside of you.',
    author: 'Deepak Chopra',
    source: 'The Seven Spiritual Laws',
    actionPrompt: 'Use your habit ritual as an anchor of calm regardless of external workload.',
  },
  {
    day: 18,
    theme: 'Peak Endurance',
    quote: 'fatigue makes cowards of us all, until routine takes over and carries the weight.',
    author: 'Vince Lombardi',
    source: 'On Leadership',
    actionPrompt: 'Let muscle memory lead today—start within 5 seconds of your reminder.',
  },
  {
    day: 19,
    theme: 'Stoic Discipline',
    quote: 'How long are you going to wait before you demand the best for yourself?',
    author: 'Epictetus',
    source: 'Enchiridion, 51',
    actionPrompt: 'Close out all habits before your evening check-in notification fires.',
  },
  {
    day: 20,
    theme: 'Atomic Systems',
    quote: 'Chains of habit are too light to be felt until they are too heavy to be broken.',
    author: 'Warren Buffett',
    source: 'Berkshire Letters',
    actionPrompt: 'Day 20 milestone: two-thirds complete. Only 10 squares remain on your 30-day matrix.',
  },
  {
    day: 21,
    theme: 'Mindful Presence',
    quote: 'Walk as if you are kissing the Earth with your feet.',
    author: 'Thich Nhat Hanh',
    source: 'Peace Is Every Step',
    actionPrompt: 'Three full weeks complete. Bring deliberate gratitude to today’s reflection note.',
  },
  {
    day: 22,
    theme: 'Peak Endurance',
    quote: 'He who has a why to live can bear almost any how.',
    author: 'Viktor Frankl',
    source: 'Man’s Search for Meaning',
    actionPrompt: 'Reconnect with the deeper outcome behind your 30-day challenge.',
  },
  {
    day: 23,
    theme: 'Stoic Discipline',
    quote: 'Waste no more time arguing about what a good person should be. Be one.',
    author: 'Marcus Aurelius',
    source: 'Meditations, Book X',
    actionPrompt: 'Action over deliberation: check off your most demanding habit first today.',
  },
  {
    day: 24,
    theme: 'Atomic Systems',
    quote: 'The secret of your future is hidden in your daily routine.',
    author: 'Mike Murdock',
    source: 'The Leadership Secrets',
    actionPrompt: 'Six days left. Protect your evening sleep window so tomorrow’s energy is high.',
  },
  {
    day: 25,
    theme: 'Peak Endurance',
    quote: 'The last five days test not your strength, but your refusal to coast before the finish line.',
    author: 'Eliud Kipchoge',
    source: 'Training Journals',
    actionPrompt: 'Day 25: execute with the same crispness you brought to Day 1.',
  },
  {
    day: 26,
    theme: 'Mindful Presence',
    quote: 'Tension is who you think you should be. Relaxation is who you are.',
    author: 'Chinese Proverb',
    source: 'Classical Anthology',
    actionPrompt: 'Release unnecessary strain; let the habit flow naturally.',
  },
  {
    day: 27,
    theme: 'Stoic Discipline',
    quote: 'Difficulties strengthen the mind, as labor does the body.',
    author: 'Seneca',
    source: 'Moral Letters',
    actionPrompt: 'Three days from completion. Note the resilience you have built over 27 days.',
  },
  {
    day: 28,
    theme: 'Atomic Systems',
    quote: 'Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.',
    author: 'John C. Maxwell',
    source: 'The 15 Invaluable Laws of Growth',
    actionPrompt: 'Four full weeks complete (28/30). Prepare your reflection on how to sustain this ritual.',
  },
  {
    day: 29,
    theme: 'Peak Endurance',
    quote: 'Almost everything worthwhile carries with it some sort ofink of monotony; mastery is loving the plateau.',
    author: 'George Leonard',
    source: 'Mastery',
    actionPrompt: 'Penultimate day: savor the quiet discipline of the 29th repetition.',
  },
  {
    day: 30,
    theme: 'Stoic Discipline',
    quote: 'You have proven to yourself that your word is law. Thirty days of deliberate action has forged a new baseline.',
    author: 'Marcus Aurelius',
    source: 'Meditations Synthesis',
    actionPrompt: 'Day 30 Finale: Complete your final habits and record your closing reflection.',
  },
];

export interface ChallengePreset {
  id: string;
  title: string;
  subtitle: string;
  category: ChallengeCategory;
  reminderTime: string;
  habits: HabitItem[];
}

export const CHALLENGE_PRESETS: ChallengePreset[] = [
  {
    id: 'preset_deep_work',
    title: 'Deep Focus & Morning Clarity Protocol',
    subtitle: 'Eliminate morning cognitive fragmentation with 90 minutes of uninterrupted creation before checking messages.',
    category: 'Deep Work',
    reminderTime: '07:30',
    habits: [
      { id: 'h_monolith', title: '90-Min Phone-Free Deep Work Block', unit: 'min', target: '90' },
      { id: 'h_sunlight', title: 'Morning Daylight Walk & Hydration', unit: 'min', target: '15' },
      { id: 'h_plan', title: 'Write Top 3 Daily Priorities', unit: 'tasks', target: '3' },
      { id: 'h_shutdown', title: 'Evening Digital Sunset (No Screens)', unit: 'min', target: '45' },
    ],
  },
  {
    id: 'preset_stoic_fitness',
    title: 'Stoic Mind & Physical Conditioning',
    subtitle: 'Build aerobic capacity, structural strength, and daily philosophical reflection over 30 consecutive days.',
    category: 'Fitness',
    reminderTime: '06:45',
    habits: [
      { id: 'h_train', title: 'Zone 2 Cardio or Strength Session', unit: 'min', target: '45' },
      { id: 'h_mobility', title: 'Thoracic & Hip Mobility Flow', unit: 'min', target: '15' },
      { id: 'h_protein', title: 'Whole-Food Hydration & Nutrition Target', unit: 'liters', target: '3.0' },
      { id: 'h_journal', title: 'Evening Stoic Examen Journal', unit: 'pages', target: '1' },
    ],
  },
  {
    id: 'preset_mindful_reading',
    title: 'Contemplative Stillness & Deep Reading',
    subtitle: 'Reclaim attention span through daily seated breathwork and long-form book reading.',
    category: 'Mindfulness',
    reminderTime: '08:00',
    habits: [
      { id: 'h_meditate', title: 'Unassisted Breath Observation', unit: 'min', target: '20' },
      { id: 'h_reading', title: 'Deep Long-Form Book Reading', unit: 'pages', target: '25' },
      { id: 'h_notes', title: 'Capture 1 Commonplace Book Synthesis', unit: 'entry', target: '1' },
    ],
  },
];

// Helper to compute relative YYYY-MM-DD from N days ago
export function getIsoDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function getDateForChallengeDay(startDateStr: string, dayNumber: number): string {
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + (dayNumber - 1));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createInitialDemoChallenges(): {
  challenges: ChallengeRecord[];
  logs: Record<string, HabitLogRecord[]>;
} {
  const startDate = getIsoDateDaysAgo(11); // Currently on Day 12 of 30
  const challengeId = 'ch_deep_focus_30';
  const habits: HabitItem[] = [
    { id: 'h_monolith', title: '90-Min Phone-Free Deep Work Block', unit: 'min', target: '90' },
    { id: 'h_sunlight', title: 'Morning Daylight Walk & Hydration', unit: 'min', target: '15' },
    { id: 'h_plan', title: 'Write Top 3 Daily Priorities', unit: 'tasks', target: '3' },
    { id: 'h_shutdown', title: 'Evening Digital Sunset (No Screens)', unit: 'min', target: '45' },
  ];

  const completedDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const sampleNotes: Record<number, { note: string; mood: number }> = {
    1: { note: 'Set phone in another room before bed. First 90-minute block felt remarkably quiet.', mood: 5 },
    2: { note: 'Morning walk in crisp light cleared mental fog immediately.', mood: 4 },
    3: { note: 'Slight resistance around minute 40 of deep work, breathed through it and finished strong.', mood: 4 },
    4: { note: 'Completed all four rituals before 8:00 PM. Sleep quality noticeably deeper.', mood: 5 },
    5: { note: 'Locked in the first 5-day workweek chain without checking messages before 9:30 AM.', mood: 5 },
    6: { note: 'Saturday cadence kept steady; shorter walk due to rain but zero missed habits.', mood: 4 },
    7: { note: 'Full Week 1 milestone complete. The morning cue now feels automatic.', mood: 5 },
    8: { note: 'Started Week 2 by refining the top-3 priority list the evening prior.', mood: 4 },
    9: { note: 'Busy schedule today, protected the morning block first thing at 06:45.', mood: 4 },
    10: { note: 'Day 10 milestone reached—one-third of the 30-day grid is now solid.', mood: 5 },
    11: { note: 'Zero screen time 45 minutes before bed made waking up today effortless.', mood: 5 },
  };

  const logsForChallenge: HabitLogRecord[] = completedDays.map((dayNum) => ({
    id: `day_${dayNum}`,
    ownerId: 'local_user',
    challengeId,
    dayNumber: dayNum,
    dateStr: getDateForChallengeDay(startDate, dayNum),
    completedHabitIds: habits.map((h) => h.id),
    reflectionNote: sampleNotes[dayNum]?.note || 'Completed daily habit sequence.',
    moodScore: sampleNotes[dayNum]?.mood || 4,
  }));

  // Partial progress on Day 12 (today) so the user can check off the remaining habits right away
  logsForChallenge.push({
    id: 'day_12',
    ownerId: 'local_user',
    challengeId,
    dayNumber: 12,
    dateStr: getDateForChallengeDay(startDate, 12),
    completedHabitIds: ['h_sunlight', 'h_plan'],
    reflectionNote: 'Morning daylight walk and priority mapping done; deep work block underway.',
    moodScore: 5,
  });

  const secondaryStartDate = getIsoDateDaysAgo(4);
  const secondaryId = 'ch_stoic_conditioning';
  const secondaryHabits: HabitItem[] = [
    { id: 'h_train', title: 'Zone 2 Cardio or Strength Session', unit: 'min', target: '45' },
    { id: 'h_mobility', title: 'Thoracic & Hip Mobility Flow', unit: 'min', target: '15' },
    { id: 'h_journal', title: 'Evening Stoic Examen Journal', unit: 'pages', target: '1' },
  ];

  const secondaryLogs: HabitLogRecord[] = [1, 2, 3, 4].map((dayNum) => ({
    id: `day_${dayNum}`,
    ownerId: 'local_user',
    challengeId: secondaryId,
    dayNumber: dayNum,
    dateStr: getDateForChallengeDay(secondaryStartDate, dayNum),
    completedHabitIds: secondaryHabits.map((h) => h.id),
    reflectionNote: `Day ${dayNum} conditioning & mobility session logged on schedule.`,
    moodScore: 4,
  }));

  return {
    challenges: [
      {
        id: challengeId,
        ownerId: 'local_user',
        title: 'Deep Focus & Morning Clarity Protocol',
        subtitle: 'Eliminate morning cognitive fragmentation with 90 minutes of uninterrupted creation before checking messages.',
        category: 'Deep Work',
        startDate,
        targetDays: 30,
        habits,
        completedDays,
        reminderEnabled: true,
        reminderTime: '07:30',
        status: 'active',
      },
      {
        id: secondaryId,
        ownerId: 'local_user',
        title: 'Stoic Mind & Physical Conditioning',
        subtitle: 'Build aerobic capacity, structural strength, and daily philosophical reflection over 30 consecutive days.',
        category: 'Fitness',
        startDate: secondaryStartDate,
        targetDays: 30,
        habits: secondaryHabits,
        completedDays: [1, 2, 3, 4],
        reminderEnabled: true,
        reminderTime: '18:00',
        status: 'active',
      },
    ],
    logs: {
      [challengeId]: logsForChallenge,
      [secondaryId]: secondaryLogs,
    },
  };
}
