const { createClient } = require('../frontend/node_modules/@supabase/supabase-js');
const { execSync } = require('child_process');

const url = 'https://wxslwjwlutrcucieossv.supabase.co';
const key = 'sb_publishable_BTrPRAq5lUFULfPZ8JSWjQ_g_aktYKe';
const supabase = createClient(url, key);

const targetUserId = 'usr_test_bvi_001';
console.log('================================================================');
console.log('SUPABASE REALTIME WEBSOCKET END-TO-END VERIFICATION');
console.log('================================================================');
console.log('[*] Target Institute : TEST INSTITUTE (CATCH 25 is 100% UNTOUCHED)');
console.log('[*] Target Student   : Aarav Mehta (Roll: TEST_INST-TEST_BVI-001)');
console.log('[*] Target User ID   : ' + targetUserId);
console.log('[*] Connecting to Supabase Realtime WebSocket...');

let startTime = 0;

const channel = supabase
  .channel('realtime:test:' + targetUserId)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: 'user_id=eq.' + targetUserId,
    },
    (payload) => {
      const elapsed = Date.now() - startTime;
      console.log('\n----------------------------------------------------------------');
      console.log('>>> [REALTIME WEBSOCKET EVENT RECEIVED IN ' + elapsed + 'ms] <<<');
      console.log('Notification ID : ' + payload.new.id);
      console.log('Title           : ' + payload.new.title);
      console.log('Message         : ' + payload.new.message);
      console.log('Type            : ' + payload.new.type);
      console.log('Target User ID  : ' + payload.new.user_id);
      console.log('Created At      : ' + payload.new.created_at);
      console.log('----------------------------------------------------------------\n');

      const testNotifId = payload.new.id;
      console.log('[*] Cleaning up test notification row from database...');
      try {
        const cleanupCmd = `python -c "import sys; sys.path.insert(0, 'backend'); from app.db.session import SessionLocal; from sqlalchemy import text; db = SessionLocal(); db.execute(text('DELETE FROM notifications WHERE id = :id'), {'id': '${testNotifId}'}); db.commit(); db.close()"`;
        execSync(cleanupCmd);
        console.log('[*] Database row purged. Zero residual test data remains!');
      } catch (err) {
        console.error('Cleanup error:', err.message);
      }

      supabase.removeChannel(channel).then(() => {
        console.log('[*] WebSocket channel detached cleanly.');
        console.log('================================================================');
        console.log('TEST RESULT: 100% PASS (Realtime WebSocket verified end-to-end!)');
        console.log('================================================================');
        process.exit(0);
      });
    }
  )
  .subscribe((status) => {
    console.log('[*] Realtime Channel Status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('[*] Realtime WebSocket connection ESTABLISHED!');
      console.log('[*] Triggering backend send_notification via Python...');
      startTime = Date.now();
      try {
        const triggerCmd = `python -c "import sys; sys.path.insert(0, 'backend'); from app.services.notification_service import send_notification; from app.db.session import SessionLocal; db = SessionLocal(); send_notification(db, '${targetUserId}', 'SYSTEM_ALERT', 'Realtime Verification Alert', 'Live alert delivered in real time via Supabase WebSocket!', '/student/portal'); db.commit(); db.close()"`;
        execSync(triggerCmd);
        console.log('[*] Backend SQL INSERT committed. Awaiting WebSocket push...');
      } catch (err) {
        console.error('Backend trigger error:', err.message);
      }
    }
  });

setTimeout(() => {
  console.error('[!] Test timed out after 15 seconds.');
  process.exit(1);
}, 15000);
