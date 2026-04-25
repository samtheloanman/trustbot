const { supabase } = require('./db');

// ── CRUD ─────────────────────────────────────────────────────
async function create(userId, userName, userEmail, formData) {
    const sub = {
        id: 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        profile_id:  userId,
        user_name:   userName,
        user_email:  userEmail,
        status:      'pending',
        data:        formData,
        generated_files: [],
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
    };

    const { error } = await supabase.from('trustbot_submissions').insert(sub);
    if (error) {
        console.error('[submissions.create] Supabase error:', error);
        throw new Error(error.message);
    }
    return sub;
}

async function list() {
    const { data, error } = await supabase
        .from('trustbot_submissions')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[submissions.list] Supabase error:', error);
        return [];
    }
    return data;
}

async function listByUser(userId) {
    const { data, error } = await supabase
        .from('trustbot_submissions')
        .select('*')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[submissions.listByUser] Supabase error:', error);
        return [];
    }
    return data;
}

async function getById(id) {
    const { data, error } = await supabase
        .from('trustbot_submissions')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return data;
}

async function update(id, updates) {
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
        .from('trustbot_submissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        console.error('[submissions.update] Supabase error:', error);
        return null;
    }
    return data;
}

async function remove(id) {
    const { error } = await supabase
        .from('trustbot_submissions')
        .delete()
        .eq('id', id);
    if (error) return false;
    return true;
}

module.exports = { create, list, listByUser, getById, update, remove };
