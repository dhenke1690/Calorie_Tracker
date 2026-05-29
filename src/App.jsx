import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { estimateMacros } from './services/claudeService.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  Legend,
} from 'recharts';

const MEAL_SLOTS = [
  { key: 'breakfast', label: 'Breakfast', color: '#f97316' },
  { key: 'morningSnack', label: 'Morning Snack', color: '#facc15' },
  { key: 'lunch', label: 'Lunch', color: '#34d399' },
  { key: 'afternoonSnack', label: 'Afternoon Snack', color: '#60a5fa' },
  { key: 'dinner', label: 'Dinner', color: '#a78bfa' },
];

const GOAL_MIN = 1200;
const GOAL_MAX = 1500;

function formatLabel(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildDayData(rows) {
  const days = {};
  rows.forEach((row) => {
    const date = row.entry_date;
    if (!days[date]) {
      days[date] = { date, meals: {} };
    }
    days[date].meals[row.meal_slot] = row;
  });
  return Object.values(days).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function totalForDay(day) {
  return MEAL_SLOTS.reduce((sum, meal) => {
    const entry = day.meals[meal.key];
    return sum + (entry?.calories || 0);
  }, 0);
}

function totalMacros(day, field) {
  return MEAL_SLOTS.reduce((sum, meal) => {
    const entry = day.meals[meal.key];
    return sum + (entry?.[field] || 0);
  }, 0);
}

function goalStatus(total) {
  if (total === 0) return 'No entries';
  if (total < GOAL_MIN) return 'Under goal';
  if (total <= GOAL_MAX) return 'In range';
  return 'Over goal';
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ padding: 12, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, color: '#e2e8f0' }}>
      <strong style={{ display: 'block', marginBottom: 8 }}>{formatLabel(label)}</strong>
      {payload.map((item) => {
        const unit = item.name === 'Protein' || item.name === 'Carbs' || item.name === 'Fat' ? 'g' : 'cal';
        return (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
            <span>{item.name}</span>
            <span>{item.value} {unit}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const today = new Date();
  const initialDate = today.toISOString().slice(0, 10);

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authView, setAuthView] = useState('signin');
  const [authLoading, setAuthLoading] = useState(false);

  const [entries, setEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedMeal, setSelectedMeal] = useState(MEAL_SLOTS[0].key);
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState('');
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
    }

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setEntries([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchEntries();
    }
  }, [user]);

  const days = useMemo(() => buildDayData(entries), [entries]);
  const visibleDays = days.slice(0, 14);
  const selectedDay = useMemo(() => days.find((day) => day.date === selectedDate) ?? null, [days, selectedDate]);
  const selectedMealEntry = selectedDay?.meals[selectedMeal] ?? null;

  useEffect(() => {
    if (selectedMealEntry) {
      setDescription(selectedMealEntry.description || '');
      setCalories(selectedMealEntry.calories?.toString() ?? '');
      setProtein(selectedMealEntry.protein?.toString() ?? '');
      setCarbs(selectedMealEntry.carbs?.toString() ?? '');
      setFat(selectedMealEntry.fat?.toString() ?? '');
    } else {
      setDescription('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
    }
  }, [selectedMealEntry]);

  function buildChartData() {
    return visibleDays
      .map((day) => {
        const values = MEAL_SLOTS.reduce((acc, meal) => {
          acc[meal.key] = day.meals[meal.key]?.calories || 0;
          return acc;
        }, {});
        return {
          date: day.date,
          label: formatLabel(day.date),
          total: totalForDay(day),
          proteinTotal: totalMacros(day, 'protein'),
          carbsTotal: totalMacros(day, 'carbs'),
          fatTotal: totalMacros(day, 'fat'),
          ...values,
        };
      })
      .reverse();
  }

  async function fetchEntries() {
    if (!user) {
      setEntries([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('meal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false });
    setLoading(false);

    if (error) {
      setNotification('Unable to load meal entries from Supabase.');
      console.error(error);
      return;
    }

    setEntries(data ?? []);
  }

  async function handleSave() {
    if (!user) {
      setNotification('Please sign in before saving meals.');
      return;
    }

    setLoading(true);

    const payload = {
      user_id: user.id,
      entry_date: selectedDate,
      meal_slot: selectedMeal,
      description: description.trim(),
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
    };

    const { error } = await supabase.from('meal_entries').upsert(payload, {
      onConflict: ['user_id', 'entry_date', 'meal_slot'],
      returning: 'minimal',
    });

    setLoading(false);

    if (error) {
      setNotification('Unable to save entry.');
      console.error(error);
      return;
    }

    setDescription('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setNotification('Meal entry saved successfully.');
    await fetchEntries();
  }

  async function handleAiEstimate() {
    if (!description.trim()) {
      setNotification('Enter a food description before asking Claude.');
      return;
    }
    if (!session?.access_token) {
      setNotification('Sign in to use Claude AI estimation.');
      return;
    }

    setAiLoading(true);
    setAiFeedback('');
    try {
      const estimate = await estimateMacros(description, session.access_token);
      setAiFeedback(estimate);
    } catch (error) {
      setNotification(error.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSignIn() {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) {
      setNotification(error.message);
      return;
    }
    setNotification('Signed in successfully.');
  }

  async function handleSignUp() {
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) {
      setNotification(error.message);
      return;
    }
    setNotification('Sign-up successful. Check your email if confirmation is required.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setEntries([]);
    setNotification('Signed out successfully.');
  }

  const totalCalories = selectedDay ? totalForDay(selectedDay) : 0;
  const caloriesByMeal = MEAL_SLOTS.map((meal) => ({
    ...meal,
    calories: selectedDay?.meals[meal.key]?.calories || 0,
  }));

  if (!user) {
    return (
      <div className="app-shell">
        <div className="page-inner">
          <div className="header-card">
            <div className="header-top">
              <div>
                <small>Supabase Auth required</small>
                <h1>Sign in to your Calorie Tracker</h1>
                <p>Use email and password to keep your meals private across devices.</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <div>
                <h2>{authView === 'signin' ? 'Sign in' : 'Create account'}</h2>
                <p>{authView === 'signin' ? 'Enter your email and password.' : 'Create a new account to save your data.'}</p>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {authView === 'signin' ? (
                  <button className="primary" onClick={handleSignIn} disabled={authLoading}>Sign in</button>
                ) : (
                  <button className="primary" onClick={handleSignUp} disabled={authLoading}>Create account</button>
                )}
                <button className="secondary" onClick={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}>
                  {authView === 'signin' ? 'Need an account?' : 'Back to sign in'}
                </button>
              </div>
            </div>

            {notification && <div className="toast">{notification}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="page-inner">
        <div className="header-card">
          <div className="header-top">
            <div>
              <small>Supabase + Claude-powered tracker</small>
              <h1>Calorie & Macro Dashboard</h1>
              <p>Log meals privately and get AI macro estimates when you want.</p>
            </div>
            <div className="stats-list">
              <div className="stats-card">
                <small>Signed in as</small>
                <strong>{user.email}</strong>
              </div>
              <div className="stats-card">
                <small>Daily total</small>
                <strong>{totalCalories} cal</strong>
              </div>
              <div className="stats-card">
                <small>Meal entries</small>
                <strong>{MEAL_SLOTS.filter((m) => caloriesByMeal.find((item) => item.key === m.key)?.calories > 0).length}/5</strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="section-heading">
              <div>
                <h2>Log meal details</h2>
                <p>Save entries to Supabase and use Claude to estimate macros from free text.</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="secondary" onClick={fetchEntries} disabled={loading}>Refresh</button>
                <button className="primary" onClick={handleSave} disabled={loading}>Save entry</button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Date
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </label>
              <label>
                Meal slot
                <select value={selectedMeal} onChange={(e) => setSelectedMeal(e.target.value)}>
                  {MEAL_SLOTS.map((meal) => (
                    <option key={meal.key} value={meal.key}>{meal.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Chicken breast, salad, drink..." />
              </label>
              <div className="form-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                <label>
                  Calories
                  <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </label>
                <label>
                  Protein
                  <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
                </label>
                <label>
                  Carbs
                  <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </label>
                <label>
                  Fat
                  <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="secondary" onClick={handleAiEstimate} disabled={aiLoading}>Ask Claude for macro estimate</button>
              </div>
              {aiFeedback && (
                <div className="toast">
                  <strong>Claude answer:</strong>
                  <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiFeedback}</pre>
                </div>
              )}
            </div>
          </div>

          <div className="panel summary-card">
            <div className="section-heading">
              <div>
                <h2>Selected day summary</h2>
                <p>Calories and macros for {selectedDate}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="stats-card" style={{ padding: 16 }}>
                  <small>Total calories</small>
                  <strong>{totalCalories} cal</strong>
                </div>
                <div className="stats-card" style={{ padding: 16 }}>
                  <small>Total protein</small>
                  <strong>{totalMacros(selectedDay, 'protein')} g</strong>
                </div>
                <div className="stats-card" style={{ padding: 16 }}>
                  <small>Total carbs</small>
                  <strong>{totalMacros(selectedDay, 'carbs')} g</strong>
                </div>
                <div className="stats-card" style={{ padding: 16 }}>
                  <small>Total fat</small>
                  <strong>{totalMacros(selectedDay, 'fat')} g</strong>
                </div>
              </div>

              <table className="entry-table">
                <thead>
                  <tr>
                    <th>Meal</th>
                    <th>Calories</th>
                    <th>Protein</th>
                    <th>Carbs</th>
                    <th>Fat</th>
                  </tr>
                </thead>
                <tbody>
                  {MEAL_SLOTS.map((meal) => {
                    const row = selectedDay?.meals[meal.key];
                    return (
                      <tr key={meal.key}>
                        <td>
                          <span className="meal-chip">
                            <span className="meal-color" style={{ background: meal.color }} />
                            {meal.label}
                          </span>
                        </td>
                        <td>{row?.calories ?? '—'}</td>
                        <td>{row?.protein ?? '—'}</td>
                        <td>{row?.carbs ?? '—'}</td>
                        <td>{row?.fat ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginTop: 24 }}>
          <div className="panel">
            <div className="section-heading">
              <div>
                <h2>Calorie progress (last 14 days)</h2>
                <p>Compare meal totals against your target range.</p>
              </div>
            </div>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={buildChartData()}>
                  <ReferenceArea y1={GOAL_MIN} y2={GOAL_MAX} fill="#34d399" fillOpacity={0.08} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={GOAL_MIN} stroke="#34d399" strokeDasharray="4 4" />
                  <ReferenceLine y={GOAL_MAX} stroke="#34d399" strokeDasharray="4 4" />
                  {MEAL_SLOTS.map((meal) => (
                    <Bar key={meal.key} dataKey={meal.key} name={meal.label} stackId="a" fill={meal.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <div>
                <h2>Macro trends</h2>
                <p>Protein, carbs and fat over the same period.</p>
              </div>
            </div>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={buildChartData()}>
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="proteinTotal" name="Protein" stroke="#22c55e" dot={false} />
                  <Line type="monotone" dataKey="carbsTotal" name="Carbs" stroke="#38bdf8" dot={false} />
                  <Line type="monotone" dataKey="fatTotal" name="Fat" stroke="#f472b6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {notification && <div className="toast">{notification}</div>}
      </div>
    </div>
  );
}
