require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Using anon key since RLS policy allows all

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const email = (process.env.ADMIN_EMAIL || 'sam@c-mtg.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Lolo@2323';
    const hashedPassword = bcrypt.hashSync(password, 10);

    console.log(`Seeding admin: ${email}`);

    // Check if exists
    const { data: existing, error: findError } = await supabase
        .from('trustbot_users')
        .select('*')
        .eq('email', email)
        .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error finding user:', findError);
        return;
    }

    if (existing) {
        console.log('User exists, updating password and role...');
        const { error: updateError } = await supabase
            .from('trustbot_users')
            .update({
                password: hashedPassword,
                role: 'admin'
            })
            .eq('id', existing.id);
        
        if (updateError) console.error('Update error:', updateError);
        else console.log('Update successful');
    } else {
        console.log('User missing, inserting...');
        const { error: insertError } = await supabase
            .from('trustbot_users')
            .insert({
                id: 'admin-' + Math.random().toString(36).slice(2, 7),
                name: 'Admin',
                email: email,
                password: hashedPassword,
                role: 'admin',
                createdAt: new Date().toISOString()
            });

        if (insertError) console.error('Insert error:', insertError);
        else console.log('Insert successful');
    }

    // Double check
    const { data: final, error: finalError } = await supabase
        .from('trustbot_users')
        .select('*')
        .eq('email', email)
        .single();
    
    if (final) {
        console.log('Verification successful:', final.email, final.role);
    } else {
        console.error('Verification failed');
    }
}

run();
