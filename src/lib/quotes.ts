// Curated, short (fits one line at this type size). A deliberate departure from the app's
// original "no motivational copy" rule — see CLAUDE.md's Quotes section for why, and keep
// additions in the same register: quiet and specific, not poster-style cheerleading.
const QUOTES: { text: string; attribution: string }[] = [
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', attribution: 'Aristotle' },
  { text: 'Discipline is choosing between what you want now and what you want most.', attribution: 'Abraham Lincoln' },
  { text: 'The groundwork for all happiness is good health.', attribution: 'Leigh Hunt' },
  { text: 'Small daily improvements are the key to staggering long-term results.', attribution: 'Unknown' },
  { text: 'Sleep is the golden chain that ties health and our bodies together.', attribution: 'Thomas Dekker' },
  { text: 'He who has health has hope, and he who has hope has everything.', attribution: 'Proverb' },
  { text: 'You will never always be motivated, so you must learn to be disciplined.', attribution: 'Unknown' },
  { text: 'Take care of your body. It is the only place you have to live.', attribution: 'Jim Rohn' },
  { text: 'The first wealth is health.', attribution: 'Ralph Waldo Emerson' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', attribution: 'Jim Ryun' },
  { text: 'Early to bed and early to rise makes a man healthy, wealthy, and wise.', attribution: 'Benjamin Franklin' },
  { text: 'A journey of a thousand miles begins with a single step.', attribution: 'Lao Tzu' },
  { text: 'Water is the driving force of all nature.', attribution: 'Leonardo da Vinci' },
  { text: 'What you do every day matters more than what you do once in a while.', attribution: 'Gretchen Rubin' },
  { text: 'The pain of discipline weighs ounces; the pain of regret weighs tons.', attribution: 'Jim Rohn' },
  { text: 'Rest when you’re weary. Refresh and renew yourself. Then get back to work.', attribution: 'Ralph Marston' },
  { text: 'To keep the body in good health is a duty, otherwise the mind will not stay strong.', attribution: 'Buddha' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', attribution: 'Robert Collier' },
  { text: 'A healthy outside starts from the inside.', attribution: 'Robert Urich' },
  { text: 'Your future is created by what you do today, not tomorrow.', attribution: 'Unknown' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', attribution: 'James Clear' },
  { text: 'Patience, persistence and perspiration make an unbeatable combination for success.', attribution: 'Napoleon Hill' },
  { text: 'The body achieves what the mind believes.', attribution: 'Unknown' },
  { text: 'It is health that is real wealth, not pieces of gold and silver.', attribution: 'Mahatma Gandhi' },
  { text: 'Do something today that your future self will thank you for.', attribution: 'Unknown' },
  { text: 'Consistency is what transforms average into excellence.', attribution: 'Unknown' },
  { text: 'Strength does not come from winning. Your struggles develop your strengths.', attribution: 'Arnold Schwarzenegger' },
  { text: 'The greatest wealth is health.', attribution: 'Virgil' },
  { text: 'Better to lose count while forgiving than to lose count while counting hurts.', attribution: 'Unknown' },
  { text: 'Well begun is half done.', attribution: 'Aristotle' },
  { text: 'A good laugh and a long sleep are the best cures in the doctor’s book.', attribution: 'Irish Proverb' },
  { text: 'Nothing will work unless you do.', attribution: 'Maya Angelou' },
  { text: 'One small crack does not mean that you are broken, it means that you were put to the test.', attribution: 'Linda Poindexter' },
  { text: 'Habits are first cobwebs, then cables.', attribution: 'Spanish Proverb' },
  { text: 'Discipline is the bridge between goals and accomplishment.', attribution: 'Jim Rohn' },
]

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic "quote of the day" — same quote all day for a given date, rotates daily. */
export function quoteForDate(dateStr: string): { text: string; attribution: string } {
  return QUOTES[hashCode(dateStr) % QUOTES.length]
}
