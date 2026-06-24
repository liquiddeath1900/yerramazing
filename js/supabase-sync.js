// yerramazing — Supabase Sync Library
// Offline-first: localStorage is primary, Supabase syncs in background

let _sb = null;

function getSupabase() {
  if (_sb) return _sb;
  if (typeof supabase === 'undefined') return null;
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

async function getUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

// --- Auth ---

// Optional `redirect` (e.g. 'my-plan.html') is carried through the auth round-trip
// so the user lands on the right page after sign-in. Defaults to plain login.html.
function _loginReturnUrl(redirect) {
  var base = window.location.origin + '/login.html';
  // Only forward same-site relative paths through the auth round-trip (no open redirect).
  if (!redirect || /^[a-z][a-z0-9+.-]*:/i.test(redirect) || redirect.indexOf('//') === 0 || redirect.indexOf('\\') === 0) {
    return base;
  }
  return base + '?redirect=' + encodeURIComponent(redirect.replace(/^\/+/, ''));
}

async function signInWithEmail(email, redirect) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not loaded' };
  const { data, error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: _loginReturnUrl(redirect) }
  });
  return { data, error };
}

async function signInWithGoogle(redirect) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not loaded' };
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: _loginReturnUrl(redirect) }
  });
  return { data, error };
}

async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

function onAuthChange(callback) {
  const sb = getSupabase();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

// --- Checklists ---

async function syncChecklist(localKey) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();

  // Read local
  let local = [];
  try { local = JSON.parse(localStorage.getItem(localKey)) || []; } catch {}
  const localTime = localStorage.getItem(localKey + '-ts') || '1970-01-01T00:00:00Z';

  // Read remote
  const { data: remote } = await sb
    .from('checklists')
    .select('*')
    .eq('user_id', user.id)
    .eq('key', localKey)
    .single();

  if (remote && remote.updated_at > localTime) {
    // Remote is newer — pull
    localStorage.setItem(localKey, JSON.stringify(remote.checked_indices));
    localStorage.setItem(localKey + '-ts', remote.updated_at);
    return 'pulled';
  } else {
    // Local is newer or no remote — push
    await pushChecklist(localKey, local, user);
    return 'pushed';
  }
}

async function pushChecklist(localKey, checkedArr, user) {
  if (!user) user = await getUser();
  if (!user) return;
  const sb = getSupabase();
  const now = new Date().toISOString();

  await sb
    .from('checklists')
    .upsert({
      user_id: user.id,
      key: localKey,
      checked_indices: checkedArr,
      updated_at: now
    }, { onConflict: 'user_id,key' });

  localStorage.setItem(localKey + '-ts', now);
}

// --- Progress Entries ---

async function syncProgress(localKey, person) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();

  // Read local
  let local = [];
  try { local = JSON.parse(localStorage.getItem(localKey)) || []; } catch {}

  // Read remote
  const { data: remote } = await sb
    .from('progress_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('person', person)
    .order('date', { ascending: false });

  if (!remote) return;

  // Merge: newest wins by date
  const merged = new Map();

  // Remote entries first
  remote.forEach(r => {
    merged.set(r.date, {
      date: r.date,
      weight: r.weight ? Number(r.weight) : null,
      waist: r.waist ? Number(r.waist) : null,
      chest: r.chest ? Number(r.chest) : null,
      arms: r.arms ? Number(r.arms) : null,
      hips: r.hips ? Number(r.hips) : null,
      notes: r.notes || ''
    });
  });

  // Local entries overwrite if they exist (local = authoritative for new entries)
  local.forEach(l => {
    if (!merged.has(l.date)) {
      merged.set(l.date, l);
    }
  });

  // Save merged back to local
  const mergedArr = Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date));
  localStorage.setItem(localKey, JSON.stringify(mergedArr));

  // Push all local entries to remote
  for (const entry of mergedArr) {
    await sb
      .from('progress_entries')
      .upsert({
        user_id: user.id,
        person,
        date: entry.date,
        weight: entry.weight,
        waist: entry.waist,
        chest: entry.chest,
        arms: entry.arms,
        hips: entry.hips,
        notes: entry.notes
      }, { onConflict: 'user_id,person,date' });
  }
}

async function pushProgressEntry(localKey, person, entry) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();

  await sb
    .from('progress_entries')
    .upsert({
      user_id: user.id,
      person,
      date: entry.date,
      weight: entry.weight,
      waist: entry.waist,
      chest: entry.chest,
      arms: entry.arms,
      hips: entry.hips,
      notes: entry.notes
    }, { onConflict: 'user_id,person,date' });
}

async function deleteProgressEntry(person, date) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();

  await sb
    .from('progress_entries')
    .delete()
    .eq('user_id', user.id)
    .eq('person', person)
    .eq('date', date);
}

// --- Dashboard ---

async function syncDashboard(localKey) {
  const user = await getUser();
  if (!user) return;
  const sb = getSupabase();

  let local = {};
  try { local = JSON.parse(localStorage.getItem(localKey)) || {}; } catch {}
  const localTime = localStorage.getItem(localKey + '-ts') || '1970-01-01T00:00:00Z';

  const { data: remote } = await sb
    .from('dashboard')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (remote && remote.updated_at > localTime) {
    localStorage.setItem(localKey, JSON.stringify(remote.data));
    localStorage.setItem(localKey + '-ts', remote.updated_at);
    return 'pulled';
  } else {
    await pushDashboard(localKey, local, user);
    return 'pushed';
  }
}

async function pushDashboard(localKey, data, user) {
  if (!user) user = await getUser();
  if (!user) return;
  const sb = getSupabase();
  const now = new Date().toISOString();

  await sb
    .from('dashboard')
    .upsert({
      user_id: user.id,
      data,
      updated_at: now
    }, { onConflict: 'user_id' });

  localStorage.setItem(localKey + '-ts', now);
}
