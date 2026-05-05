const { supabase } = require('../db');
const bcrypt = require('bcryptjs');

async function syncAdmins() {
    console.log('Starting Admin Synchronization...');

    // 1. Fetch admins from public.users
    const { data: platformAdmins, error: fetchError } = await supabase
        .from('users')
        .select('id, email, fullName, role')
        .eq('role', 'ADMIN');

    if (fetchError) {
        console.error('Error fetching platform admins:', fetchError);
        return;
    }

    console.log(`Found ${platformAdmins.length} platform admins.`);

    const defaultPassword = process.env.ADMIN_PASSWORD || 'Lolo@2323';
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

    for (const admin of platformAdmins) {
        const email = admin.email.toLowerCase().trim();
        console.log(`Syncing: ${email}...`);

        // Check if already in trustbot_users
        const { data: existing, error: findError } = await supabase
            .from('trustbot_users')
            .select('*')
            .ilike('email', email)
            .single();

        if (findError && findError.code !== 'PGRST116') {
            console.error(`Error finding ${email}:`, findError);
            continue;
        }

        if (existing) {
            console.log(`  Updating existing user: ${email}`);
            const { error: updateError } = await supabase
                .from('trustbot_users')
                .update({
                    role: 'admin',
                    password: hashedPassword // Ensure password matches the expected default
                })
                .eq('id', existing.id);
            
            if (updateError) console.error(`  Update failed for ${email}:`, updateError);
            else console.log(`  Update successful for ${email}`);
        } else {
            console.log(`  Inserting new user: ${email}`);
            const { error: insertError } = await supabase
                .from('trustbot_users')
                .insert({
                    id: 'admin-' + Math.random().toString(36).slice(2, 7),
                    name: admin.fullName || 'Admin',
                    email: email,
                    password: hashedPassword,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });

            if (insertError) console.error(`  Insert failed for ${email}:`, insertError);
            else console.log(`  Insert successful for ${email}`);
        }
    }

    // Also ensure admin@trustbot.local is up to date
    console.log('Ensuring admin@trustbot.local is synchronized...');
    const { data: localAdmin, error: localError } = await supabase
        .from('trustbot_users')
        .select('*')
        .eq('email', 'admin@trustbot.local')
        .single();
    
    if (localAdmin) {
        await supabase.from('trustbot_users').update({ password: hashedPassword }).eq('id', localAdmin.id);
        console.log('  admin@trustbot.local password updated.');
    }

    console.log('Synchronization Complete.');
}

syncAdmins().catch(console.error);
