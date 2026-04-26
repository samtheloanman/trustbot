const { supabase } = require('./db');

const TABLE = 'trustbot_submissions';

// ── Normalize DB row → app shape ────────────────────────────
// DB uses snake_case + uppercase status enum (PENDING/IN_PROGRESS/COMPLETED).
// Admin JS and server routes expect camelCase + lowercase status strings.
function normalize(row) {
    if (!row) return null;
    return {
        id:             row.id,
        profileId:      row.profile_id,
        userName:       row.user_name   || '',
        userEmail:      row.user_email  || '',
        status:         (row.status || 'PENDING').toLowerCase().replace('_', '_'), // PENDING→pending, IN_PROGRESS→in_progress
        data:           row.data        || {},
        generatedFiles: row.generated_files || [],
        createdAt:      row.created_at,
        updatedAt:      row.updated_at,
    };
}

// Map app status → DB enum
function toDbStatus(status) {
    const map = { pending: 'PENDING', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' };
    return map[status?.toLowerCase()] ?? status?.toUpperCase() ?? 'PENDING';
}

// ── CRUD ─────────────────────────────────────────────────────

async function create(userId, userName, userEmail, formData) {
    const id = 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const row = {
        id,
        profile_id:      userId,
        user_name:       userName,
        user_email:      userEmail,
        status:          'PENDING',
        data:            formData,
        generated_files: [],
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
    };

    const { error } = await supabase.from(TABLE).insert(row);
    if (error) {
        console.error('[submissions.create] Supabase error:', error);
        throw new Error(error.message);
    }
    return normalize(row);
}

async function list() {
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[submissions.list] Supabase error:', error);
        return [];
    }
    return (data || []).map(normalize);
}

async function listByUser(userId) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[submissions.listByUser] Supabase error:', error)
        return [];
    }
    return (data || []).map(normalize);
}

async function getById(id) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return normalize(data);
}

async function update(id, updates) {
    // Map camelCase update keys → snake_case DB columns
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (updates.status !== undefined)        dbUpdates.status          = toDbStatus(updates.status);
    if (updates.data !== undefined)          dbUpdates.data            = updates.data;
    if (updates.generatedFiles !== undefined) dbUpdates.generated_files = updates.generatedFiles;

    const { data, error } = await supabase
        .from(TABLE)
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        console.error('[submissions.update] Supabase error:', error);
        return null;
    }
    return normalize(data);
}

async function remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return false;
    return true;
}

module.exports = { create, list, listByUser, getById, update, remove };
