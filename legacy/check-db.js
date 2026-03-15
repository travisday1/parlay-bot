require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fs = require('fs');

(async () => {
    const emails = ['day4ai@gmail.com', 'gfsolin@gmail.com'];
    let out = '';
    
    for (const email of emails) {
        const { data, error } = await sb.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
            options: {
                redirectTo: 'https://day4ai.tech/'
            }
        });
        
        if (error) {
            out += `${email}: ERROR - ${error.message}\n`;
        } else {
            out += `${email}:\n${data?.properties?.action_link}\n\n`;
        }
    }
    
    fs.writeFileSync('C:\\tmp\\invite-links.txt', out, 'utf8');
    console.log('Done!');
})();
