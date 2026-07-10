const pool = require('./pool');
const { DEFAULT_SYSTEM_CONFIG } = require('../config/defaultSystemConfig');
const { buildFullPermissions, buildEmptyPermissions } = require('../config/permissionRegistry');
const { hashPassword } = require('../services/passwordService');

const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';

async function addColumnIfNotExists(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function addIndexIfNotExists(table, indexName, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await pool.query(`CREATE INDEX ${indexName} ON ${table} (${column})`);
  }
}

async function ensureClientIdNullable(table) {
  const [cols] = await pool.query(
    `SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'client_id'`,
    [table]
  );
  if (!cols[0] || cols[0].nullable === 'YES') return;

  const [fks] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'client_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table]
  );

  for (const fk of fks) {
    await pool.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
  }
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN client_id INT NULL`);
  for (const fk of fks) {
    await pool.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${fk.CONSTRAINT_NAME}_client_fk
       FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE`
    );
  }
}

async function ensureUniqueIndex(table, indexName, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (Number(rows[0]?.count ?? 0) > 0) return;
  try {
    await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (${column})`);
  } catch (error) {
    // Duplicate values in existing rows would block the unique index. Log and
    // continue rather than crash startup — the service layer still enforces
    // uniqueness for new/updated rows.
    console.warn(`[db] could not add unique index ${indexName} on ${table}.${column}: ${error.message}`);
  }
}

async function initAuthTables() {
  await addColumnIfNotExists('users', 'password_hash', 'VARCHAR(255) NULL');
  await addColumnIfNotExists('users', 'phone', 'VARCHAR(32) NULL');
  await addColumnIfNotExists(
    'users',
    'must_reset_password',
    'BOOLEAN NOT NULL DEFAULT FALSE'
  );
  await addColumnIfNotExists('users', 'deleted_at', 'TIMESTAMP NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      purpose VARCHAR(32) NOT NULL DEFAULT 'login',
      attempts INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_otp_challenges_user (user_id),
      INDEX idx_otp_challenges_expires (expires_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_reset_tokens_user (user_id),
      INDEX idx_reset_tokens_expires (expires_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      credential_id VARCHAR(512) NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
      transports JSON NULL,
      device_name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_webauthn_credential_id (credential_id),
      INDEX idx_webauthn_credentials_user (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      challenge VARCHAR(255) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_webauthn_challenges_challenge (challenge),
      INDEX idx_webauthn_challenges_expires (expires_at)
    )
  `);

  const adminHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  await pool.query(
    `UPDATE users SET password_hash = ?, must_reset_password = TRUE
     WHERE email = 'admin@omnicrm.com' AND (password_hash IS NULL OR password_hash = '')`,
    [adminHash]
  );
}

async function initSystemConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_config (
      id TINYINT PRIMARY KEY DEFAULT 1,
      config JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT single_config_row CHECK (id = 1)
    )
  `);

  const [rows] = await pool.query('SELECT id FROM system_config WHERE id = 1');

  if (rows.length === 0) {
    await pool.query('INSERT INTO system_config (id, config) VALUES (1, ?)', [
      JSON.stringify(DEFAULT_SYSTEM_CONFIG),
    ]);
  }
}

async function initAccessControlTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      is_system_admin BOOLEAN NOT NULL DEFAULT FALSE,
      permissions JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      role_id INT NOT NULL,
      permission_overrides JSON NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  const [adminRows] = await pool.query(
    'SELECT id FROM roles WHERE is_system_admin = TRUE LIMIT 1'
  );

  if (adminRows.length === 0) {
    await pool.query('INSERT INTO roles (name, is_system_admin, permissions) VALUES (?, TRUE, ?)', [
      'System Admin',
      JSON.stringify(buildFullPermissions()),
    ]);

    await pool.query('INSERT INTO roles (name, is_system_admin, permissions) VALUES (?, FALSE, ?)', [
      'Agent',
      JSON.stringify(buildEmptyPermissions()),
    ]);

    await pool.query('INSERT INTO roles (name, is_system_admin, permissions) VALUES (?, FALSE, ?)', [
      'Manager',
      JSON.stringify(buildEmptyPermissions()),
    ]);
  }

  // Keep the System Admin role's stored permissions in sync with the registry so
  // newly added modules/submodules are always reflected as full access.
  await pool.query('UPDATE roles SET permissions = ? WHERE is_system_admin = TRUE', [
    JSON.stringify(buildFullPermissions()),
  ]);

  const [userRows] = await pool.query('SELECT id FROM users LIMIT 1');
  if (userRows.length === 0) {
    const [adminRole] = await pool.query(
      'SELECT id FROM roles WHERE is_system_admin = TRUE LIMIT 1'
    );
    if (adminRole[0]?.id) {
      const adminHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
      await pool.query(
        `INSERT INTO users (name, email, role_id, is_active, password_hash, must_reset_password)
         VALUES (?, ?, ?, TRUE, ?, TRUE)`,
        ['System Admin', 'admin@omnicrm.com', adminRole[0].id, adminHash]
      );
    }
  }
}

async function initNotificationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('info', 'success', 'warning') NOT NULL DEFAULT 'info',
      read_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_notifications_user_created (user_id, created_at DESC),
      INDEX idx_notifications_user_unread (user_id, read_at)
    )
  `);

  const [users] = await pool.query(
    "SELECT id FROM users WHERE email = 'admin@omnicrm.com' LIMIT 1"
  );
  const userId = users[0]?.id;
  if (!userId) return;

  const [existing] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
    [userId]
  );
  if (Number(existing[0].total) > 0) return;

  const seedItems = [
    ['New case assigned', 'Case #1042 has been assigned to you for follow-up.', 'info', false, 1],
    ['Payment received', 'KES 12,500 was reconciled for debtor account #8831.', 'success', false, 2],
    ['SMS delivery failed', 'Unable to deliver message to 254710595755.', 'warning', true, 3],
    ['Weekly report ready', 'Your collections performance report is available.', 'info', true, 4],
    ['Case escalated', 'Case #991 requires manager review within 24 hours.', 'warning', false, 5],
    ['New debtor profile', 'A debtor profile was added to your queue.', 'info', false, 6],
    ['Email sent', 'Payment reminder sent to kenwekesir@gmail.com.', 'success', true, 8],
    ['Integration sync', 'ERP sync completed with 3 new records.', 'success', true, 10],
    ['Access updated', 'Your role permissions were updated by an admin.', 'info', false, 12],
    ['Compliance alert', 'Review required for case #772 before contact.', 'warning', false, 14],
    ['Call logged', 'Outbound call to 254710595755 was logged.', 'info', true, 16],
    ['Payment plan due', 'Installment due tomorrow for account #4412.', 'warning', false, 18],
    ['Team note', 'Manager left a note on case #1042.', 'info', false, 20],
    ['Gateway timeout', 'Payment gateway did not respond. Retry scheduled.', 'warning', true, 22],
    ['Daily summary', 'You closed 5 cases yesterday. Great work.', 'success', true, 24],
    ['New assignment', 'Case #1108 assigned from workflow automation.', 'info', false, 26],
    ['Document uploaded', 'Client uploaded proof of payment for #8831.', 'success', false, 28],
    ['SLA breach risk', 'Case #665 approaching SLA deadline.', 'warning', false, 30],
    ['WhatsApp queued', 'Message queued for delivery at 10:00 AM.', 'info', true, 32],
    ['Reconciliation done', 'Batch #28 reconciled successfully.', 'success', true, 34],
    ['Profile incomplete', 'Complete your profile in account settings.', 'info', false, 36],
    ['New user invited', 'An agent account was created under your team.', 'info', true, 38],
    ['Report exported', 'Monthly analytics export is ready to download.', 'success', true, 40],
    ['Failed login attempt', 'Unrecognized login attempt was blocked.', 'warning', false, 42],
    ['Case closed', 'Case #998 marked as resolved.', 'success', true, 44],
    ['Reminder sent', 'Follow-up reminder sent for case #1042.', 'info', false, 46],
    ['Bulk import done', '50 debtor records imported successfully.', 'success', true, 48],
    ['Config saved', 'Communication settings were updated.', 'info', true, 50],
    ['Debtor responded', 'Debtor replied via SMS on case #772.', 'info', false, 52],
    ['System maintenance', 'Scheduled maintenance tonight at 11 PM EAT.', 'warning', true, 54],
  ];

  for (const [title, message, type, isRead, hoursAgo] of seedItems) {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, read_at, created_at)
       VALUES (?, ?, ?, ?, ${isRead ? 'DATE_SUB(NOW(), INTERVAL ? HOUR)' : 'NULL'}, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
      isRead
        ? [userId, title, message, type, hoursAgo, hoursAgo]
        : [userId, title, message, type, hoursAgo]
    );
  }
}

async function initReportAccessTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_access (
      report_slug VARCHAR(100) PRIMARY KEY,
      password_hash VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function initAuditTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(255) NULL,
      session_id VARCHAR(64) NULL,
      status ENUM('success', 'failed') NOT NULL DEFAULT 'success',
      failure_reason VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      user_agent TEXT NULL,
      browser VARCHAR(120) NULL,
      browser_version VARCHAR(60) NULL,
      os VARCHAR(120) NULL,
      device_type VARCHAR(40) NULL,
      device_vendor VARCHAR(120) NULL,
      login_at TIMESTAMP NULL DEFAULT NULL,
      logout_at TIMESTAMP NULL DEFAULT NULL,
      notes VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_login_audit_user (user_id),
      INDEX idx_login_audit_session (session_id),
      INDEX idx_login_audit_status (status),
      INDEX idx_login_audit_created (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      recipient VARCHAR(512) NOT NULL,
      sender VARCHAR(255) NULL,
      subject VARCHAR(512) NULL,
      body MEDIUMTEXT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      provider VARCHAR(50) NULL,
      status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
      provider_message_id VARCHAR(255) NULL,
      error_message VARCHAR(512) NULL,
      metadata JSON NULL,
      notes VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_email_audit_user (user_id),
      INDEX idx_email_audit_status (status),
      INDEX idx_email_audit_category (category),
      INDEX idx_email_audit_created (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      recipient VARCHAR(64) NOT NULL,
      sender_id VARCHAR(40) NULL,
      message TEXT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      provider VARCHAR(50) NULL,
      status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
      provider_message_id VARCHAR(120) NULL,
      provider_code VARCHAR(20) NULL,
      error_message VARCHAR(512) NULL,
      segments INT NULL,
      notes VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_sms_audit_user (user_id),
      INDEX idx_sms_audit_status (status),
      INDEX idx_sms_audit_category (category),
      INDEX idx_sms_audit_created (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      user_name VARCHAR(255) NULL,
      action_type VARCHAR(80) NOT NULL,
      title VARCHAR(255) NOT NULL,
      subject VARCHAR(512) NULL,
      entity_type VARCHAR(50) NULL,
      entity_id VARCHAR(120) NULL,
      amount DECIMAL(15,2) NULL,
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_activity_log_user (user_id),
      INDEX idx_activity_log_type (action_type),
      INDEX idx_activity_log_entity (entity_type, entity_id),
      INDEX idx_activity_log_created (created_at)
    )
  `);
}

async function initTemplateTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      business_type VARCHAR(50) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      email VARCHAR(255) NOT NULL,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      total_files INT NOT NULL DEFAULT 0,
      active_cases INT NOT NULL DEFAULT 0,
      closed_files INT NOT NULL DEFAULT 0,
      active_value DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      closed_value DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      collected DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_clients_email (email),
      INDEX idx_clients_status (status),
      INDEX idx_clients_deleted_at (deleted_at)
    )
  `);

  // Existing installs need the new aggregate + soft-delete columns added.
  await addColumnIfNotExists('clients', 'closed_files', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('clients', 'active_value', 'DECIMAL(18,2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('clients', 'closed_value', 'DECIMAL(18,2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('clients', 'collected', 'DECIMAL(18,2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('clients', 'balance', 'DECIMAL(18,2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('clients', 'deleted_at', 'TIMESTAMP NULL');

  // Existing installs (created before the unique constraint) need the index added.
  await ensureUniqueIndex('clients', 'uq_clients_email', 'email');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS template_variables (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(64) NOT NULL UNIQUE,
      label VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      example_value VARCHAR(255) NULL,
      category VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NULL,
      name VARCHAR(160) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      INDEX idx_email_templates_client (client_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NULL,
      name VARCHAR(160) NOT NULL,
      body MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      INDEX idx_sms_templates_client (client_id)
    )
  `);

  // Older installs created client_id as NOT NULL — relax it so system-wide
  // templates (client_id = NULL, shared by all clients) can be stored.
  await ensureClientIdNullable('email_templates');
  await ensureClientIdNullable('sms_templates');

  const [varRows] = await pool.query('SELECT COUNT(*) AS count FROM template_variables');
  if (Number(varRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['name', 'Recipient Name', 'Full name of the debtor/recipient', 'John Doe', 'Recipient'],
      ['amount', 'Amount', 'Outstanding or transaction amount', '12,500.00', 'Financial'],
      ['account_number', 'Account Number', 'Debtor account reference', 'ACC-8831', 'Account'],
      ['due_date', 'Due Date', 'Date the amount is due', '15 Jul 2026', 'Schedule'],
      ['business_name', 'Business Name', 'Name of the collecting business', 'OMNICRM', 'Branding'],
      ['agent_name', 'Agent Name', 'Name of the assigned collector', 'Purity Makau', 'Agent'],
      ['otp_code', 'OTP Code', 'One-time password code', '482917', 'Auth'],
    ];
    for (const [key, label, description, exampleValue, category] of defaults) {
      await pool.query(
        'INSERT INTO template_variables (`key`, label, description, example_value, category) VALUES (?, ?, ?, ?, ?)',
        [key, label, description, exampleValue, category]
      );
    }
  }

  // Ensure the account-deletion template variables exist on every install
  // (the bulk seed above only runs on a fresh table).
  await ensureTemplateVariable(
    'first_name',
    'Recipient First Name',
    'First name of the recipient (greeting)',
    'Jane',
    'Recipient'
  );
  await ensureTemplateVariable(
    'email',
    'Recipient Email',
    'Email address of the recipient',
    'kenwekesir@gmail.com',
    'Recipient'
  );

  // Case-assignment notification variables used by the assignment templates.
  await ensureTemplateVariable(
    'case_file_name',
    'Case File Name',
    'Name of the batch file being assigned/reallocated/unallocated',
    'Q3 Loans Batch',
    'Case Assignment'
  );
  await ensureTemplateVariable(
    'case_count',
    'Case Count',
    'Number of debtor cases affected by the action',
    '42',
    'Case Assignment'
  );
  await ensureTemplateVariable(
    'performer_name',
    'Performer Name',
    'Name of the supervisor who performed the action',
    'Purity Makau',
    'Case Assignment'
  );
  await ensureTemplateVariable(
    'action_label',
    'Action Label',
    'What happened to the case file (e.g. "assigned to you")',
    'assigned to you',
    'Case Assignment'
  );

  // Seed the default system-wide "Account Deleted" templates used by the
  // soft-delete notification flow, and point system_config at them when no
  // template has been chosen yet.
  await seedAccountDeletedTemplates();
  await seedCaseAssignmentTemplates();
}

async function ensureTemplateVariable(key, label, description, exampleValue, category) {
  const [rows] = await pool.query(
    'SELECT id FROM template_variables WHERE `key` = ? LIMIT 1',
    [key]
  );
  if (rows.length > 0) return;
  await pool.query(
    'INSERT INTO template_variables (`key`, label, description, example_value, category) VALUES (?, ?, ?, ?, ?)',
    [key, label, description, exampleValue, category]
  );
}

const ACCOUNT_DELETED_EMAIL_BODY = `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
  <h2 style="color: #111;">{{first_name}}, your {{business_name}} access has been removed</h2>
  <p>This is to inform you that your user account on the {{business_name}} platform has been deleted by an administrator. You can no longer sign in or access the platform.</p>
  <p style="background: #f5f6f8; border: 1px solid #e3e6ea; border-radius: 10px; padding: 14px 18px; color: #666; font-size: 14px;">
    If you believe this was done in error, please contact your administrator.
  </p>
  <p style="color: #666; font-size: 13px;">This is an automated notification. Please do not reply to this email.</p>
</div>`;

const ACCOUNT_DELETED_SMS_BODY =
  'Hi {{first_name}}, your access to {{business_name}} has been removed. Contact your administrator if you believe this is an error.';

async function seedAccountDeletedTemplates() {
  const [emailRows] = await pool.query(
    "SELECT id FROM email_templates WHERE name = 'Account Deleted' AND client_id IS NULL LIMIT 1"
  );
  let emailTemplateId = emailRows[0]?.id;
  if (!emailTemplateId) {
    const [result] = await pool.query(
      'INSERT INTO email_templates (client_id, name, subject, body) VALUES (NULL, ?, ?, ?)',
      ['Account Deleted', 'Your {{business_name}} access has been removed', ACCOUNT_DELETED_EMAIL_BODY]
    );
    emailTemplateId = result.insertId;
  }

  const [smsRows] = await pool.query(
    "SELECT id FROM sms_templates WHERE name = 'Account Deleted' AND client_id IS NULL LIMIT 1"
  );
  let smsTemplateId = smsRows[0]?.id;
  if (!smsTemplateId) {
    const [result] = await pool.query(
      'INSERT INTO sms_templates (client_id, name, body) VALUES (NULL, ?, ?)',
      ['Account Deleted', ACCOUNT_DELETED_SMS_BODY]
    );
    smsTemplateId = result.insertId;
  }

  // Backfill system_config.notifications.* when an admin has not chosen a
  // template yet. Preserves any explicit null/selection made via the UI.
  const [cfgRows] = await pool.query('SELECT config FROM system_config WHERE id = 1');
  if (cfgRows.length === 0) return;
  const raw = cfgRows[0].config;
  const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const notifications = config.notifications || {};
  let changed = false;
  if (notifications.accountDeletedEmailTemplateId == null) {
    notifications.accountDeletedEmailTemplateId = emailTemplateId;
    changed = true;
  }
  if (notifications.accountDeletedSmsTemplateId == null) {
    notifications.accountDeletedSmsTemplateId = smsTemplateId;
    changed = true;
  }
  if (changed) {
    config.notifications = notifications;
    await pool.query('UPDATE system_config SET config = ? WHERE id = 1', [JSON.stringify(config)]);
  }
}

const CASE_ASSIGNMENT_EMAIL_BODY = `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <h2 style="color: #111; margin-bottom: 8px;">{{business_name}}: case file {{case_file_name}}</h2>
  <p style="margin: 0 0 12px;">Hi {{first_name}},</p>
  <p style="margin: 0 0 12px;">
    The case file <strong>{{case_file_name}}</strong> has been <strong>{{action_label}}</strong>.
    <strong>{{case_count}}</strong> case(s) are affected.
  </p>
  <p style="background: #f5f6f8; border: 1px solid #e3e6ea; border-radius: 10px; padding: 12px 16px; color: #555; font-size: 14px; margin: 12px 0;">
    Action performed by <strong>{{performer_name}}</strong>. Please log in to {{business_name}} to review the case files now under your care.
  </p>
  <p style="color: #777; font-size: 13px;">This is an automated notification. Please do not reply to this email.</p>
</div>`;

const CASE_ASSIGNMENT_SMS_BODY =
  'Hi {{first_name}}, {{case_file_name}} has been {{action_label}}. {{case_count}} case(s) affected. Action by {{performer_name}}. Log in to {{business_name}} to review.';

async function seedCaseAssignmentTemplates() {
  const [emailRows] = await pool.query(
    "SELECT id FROM email_templates WHERE name = 'Case Assignment Notification' AND client_id IS NULL LIMIT 1"
  );
  let emailTemplateId = emailRows[0]?.id;
  if (!emailTemplateId) {
    const [result] = await pool.query(
      'INSERT INTO email_templates (client_id, name, subject, body) VALUES (NULL, ?, ?, ?)',
      [
        'Case Assignment Notification',
        '{{business_name}}: case file {{case_file_name}} {{action_label}}',
        CASE_ASSIGNMENT_EMAIL_BODY,
      ]
    );
    emailTemplateId = result.insertId;
  }

  const [smsRows] = await pool.query(
    "SELECT id FROM sms_templates WHERE name = 'Case Assignment Notification' AND client_id IS NULL LIMIT 1"
  );
  let smsTemplateId = smsRows[0]?.id;
  if (!smsTemplateId) {
    const [result] = await pool.query(
      'INSERT INTO sms_templates (client_id, name, body) VALUES (NULL, ?, ?)',
      ['Case Assignment Notification', CASE_ASSIGNMENT_SMS_BODY]
    );
    smsTemplateId = result.insertId;
  }

  // Backfill system_config.notifications.* when an admin has not chosen a
  // template yet. Preserves any explicit selection made via the UI.
  const [cfgRows] = await pool.query('SELECT config FROM system_config WHERE id = 1');
  if (cfgRows.length === 0) return;
  const raw = cfgRows[0].config;
  const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const notifications = config.notifications || {};
  let changed = false;
  if (notifications.caseAssignmentEmailTemplateId == null) {
    notifications.caseAssignmentEmailTemplateId = emailTemplateId;
    changed = true;
  }
  if (notifications.caseAssignmentSmsTemplateId == null) {
    notifications.caseAssignmentSmsTemplateId = smsTemplateId;
    changed = true;
  }
  if (changed) {
    config.notifications = notifications;
    await pool.query('UPDATE system_config SET config = ? WHERE id = 1', [JSON.stringify(config)]);
  }
}

async function initDatabase() {
  await initSystemConfigTable();
  await initAccessControlTables();
  await initAuthTables();
  await initNotificationsTable();
  await initReportAccessTable();
  await initAuditTables();
  await initTemplateTables();
  await initDebtorTables();
  await initDebtConfigTables();
  await initAgentTables();
  await initCommissionTables();
}

// Agent skill lookups (experience levels, expertise areas) + per-agent profile
// tagging used by Case Management rule-based assignment. Mirrors the debt
// category lookup pattern: table + seed-when-empty.
async function initAgentTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_experience_levels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(48) NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_agent_experience_levels_name (name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_expertise_areas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(48) NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_agent_expertise_areas_name (name)
    )
  `);

  // Per-agent profile: experience/expertise (names from the lookups above) +
  // workload (a fixed enum managed in agentAttributes.js). One row per agent.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      user_id INT PRIMARY KEY,
      experience VARCHAR(120) NULL,
      expertise VARCHAR(120) NULL,
      workload VARCHAR(32) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_agent_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Per-agent KPI targets set by supervisors. One row per agent (upserted).
  // Collection targets are money (DECIMAL); the rest are integer counts.
  // "ptp_volume" = successful-contact PTP count.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_kpis (
      user_id INT PRIMARY KEY,
      calls_daily INT NOT NULL DEFAULT 0,
      calls_weekly INT NOT NULL DEFAULT 0,
      calls_monthly INT NOT NULL DEFAULT 0,
      collection_daily DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      collection_weekly DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      collection_monthly DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      sms_daily INT NOT NULL DEFAULT 0,
      sms_weekly INT NOT NULL DEFAULT 0,
      sms_monthly INT NOT NULL DEFAULT 0,
      emails_daily INT NOT NULL DEFAULT 0,
      emails_weekly INT NOT NULL DEFAULT 0,
      emails_monthly INT NOT NULL DEFAULT 0,
      ptp_volume_daily INT NOT NULL DEFAULT 0,
      ptp_volume_weekly INT NOT NULL DEFAULT 0,
      ptp_volume_monthly INT NOT NULL DEFAULT 0,
      effective_from DATE NULL,
      notes VARCHAR(255) NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_agent_kpis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const [expRows] = await pool.query('SELECT COUNT(*) AS count FROM agent_experience_levels');
  if (Number(expRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['Senior', 'senior', 'Highly experienced agents handling complex portfolios.'],
      ['Intermediate', 'intermediate', 'Agents with moderate experience.'],
      ['Junior', 'junior', 'Entry-level agents under supervision.'],
    ];
    for (const [name, code, description] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO agent_experience_levels (name, code, description) VALUES (?, ?, ?)',
        [name, code, description]
      );
    }
  }

  const [areaRows] = await pool.query('SELECT COUNT(*) AS count FROM agent_expertise_areas');
  if (Number(areaRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['Customer Service', 'customer_service', 'Desk-based customer engagement and negotiation.'],
      ['Field Agent', 'field_agent', 'On-the-ground visits and recoveries.'],
      ['Recoveries', 'recoveries', 'Specialised in recovering written-off accounts.'],
    ];
    for (const [name, code, description] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO agent_expertise_areas (name, code, description) VALUES (?, ?, ?)',
        [name, code, description]
      );
    }
  }
}

async function initDebtorTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debtors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_id INT NULL,
      cfid VARCHAR(64) NOT NULL,
      phone VARCHAR(32) NULL,
      assigned_agent VARCHAR(255) NULL,
      loan_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      total_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      outstanding_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      overdue_days INT NOT NULL DEFAULT 0,
      bucket VARCHAR(32) NULL,
      borrow_date DATE NULL,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_debtors_client (client_id),
      INDEX idx_debtors_cfid (cfid),
      INDEX idx_debtors_deleted_at (deleted_at),
      CONSTRAINT fk_debtors_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    )
  `);
}

// Debt classification lookups (debt categories, debt types, currencies) plus
// the linking columns on `debtors`. Seeded with sensible defaults on first run.
async function initDebtConfigTables() {
  // ── debt_categories ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debt_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(48) NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_debt_categories_name (name)
    )
  `);

  // ── debt_types ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debt_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(48) NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_debt_types_name (name)
    )
  `);

  // ── currencies ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS currencies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(8) NOT NULL,
      name VARCHAR(80) NOT NULL,
      symbol VARCHAR(8) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_currencies_code (code)
    )
  `);

  // Seed defaults (only when the tables are empty).
  const [catRows] = await pool.query('SELECT COUNT(*) AS count FROM debt_categories');
  if (Number(catRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['Loan', 'loan', 'Term loans and structured credit facilities.'],
      ['Overdraft/Overdrawn account', 'overdraft', 'Accounts drawn beyond their available balance.'],
      ['Mobile loan', 'mobile_loan', 'Short-term credit disbursed via mobile money platforms.'],
      ['Credit Card', 'credit_card', 'Revolving credit card balances.'],
    ];
    for (const [name, code, description] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO debt_categories (name, code, description) VALUES (?, ?, ?)',
        [name, code, description]
      );
    }
  }

  const [typeRows] = await pool.query('SELECT COUNT(*) AS count FROM debt_types');
  if (Number(typeRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['Write off', 'write_off', 'Debts written off the books and flagged for recovery.'],
      ['Digital Loan', 'digital_loan', 'Loans originated through digital/online channels.'],
      ['SME', 'sme', 'Credit extended to small and medium enterprises.'],
      ['Live', 'live', 'Active accounts currently under collection.'],
    ];
    for (const [name, code, description] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO debt_types (name, code, description) VALUES (?, ?, ?)',
        [name, code, description]
      );
    }
  }

  const [curRows] = await pool.query('SELECT COUNT(*) AS count FROM currencies');
  if (Number(curRows[0]?.count ?? 0) === 0) {
    await pool.query(
      'INSERT INTO currencies (code, name, symbol, is_default) VALUES (?, ?, ?, 1)',
      ['KES', 'Kenyan Shillings', 'KSh']
    );
  }

  // Link debtors to the lookups. Use addColumnIfNotExists so existing installs
  // pick up the columns without losing data.
  await addColumnIfNotExists('debtors', 'debt_category_id', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('debtors', 'debt_type_id', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('debtors', 'currency_id', 'INT NULL DEFAULT NULL');

  // Indexes for the new FK columns (guard against duplicate-index errors).
  await addIndexIfNotExists('debtors', 'idx_debtors_debt_category', 'debt_category_id');
  await addIndexIfNotExists('debtors', 'idx_debtors_debt_type', 'debt_type_id');
  await addIndexIfNotExists('debtors', 'idx_debtors_currency', 'currency_id');

  // ── debtor_files ── one row per bulk-upload batch. Its id becomes the shared
  //    `cfid` stamped on every debtor imported from that batch.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debtor_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NULL,
      file_name VARCHAR(255) NULL,
      debt_category_id INT NULL,
      debt_type_id INT NULL,
      currency_id INT NULL,
      row_count INT NOT NULL DEFAULT 0,
      imported_count INT NOT NULL DEFAULT 0,
      skipped_count INT NOT NULL DEFAULT 0,
      uploaded_by INT NULL,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_debtor_files_client (client_id),
      CONSTRAINT fk_debtor_files_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    )
  `);

  // ── Portfolio columns on `debtors` (added with addColumnIfNotExists so
  //    existing installs keep their data). Legacy columns (name, phone,
  //    loan_amount, total_paid, outstanding_balance, overdue_days, bucket,
  //    borrow_date, cfid, assigned_agent) already exist from initDebtorTables.
  const portfolioColumns = [
    ['file_id', 'INT NULL DEFAULT NULL'],
    ['loan_id', 'VARCHAR(64) NULL DEFAULT NULL'],
    ['principal_amount', 'DECIMAL(18,2) NULL DEFAULT NULL'],
    ['account_number', 'VARCHAR(64) NULL DEFAULT NULL'],
    ['email', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['id_number', 'VARCHAR(64) NULL DEFAULT NULL'],
    ['waived_amount', 'DECIMAL(18,2) NULL DEFAULT NULL'],
    ['contract_number', 'VARCHAR(64) NULL DEFAULT NULL'],
    ['secondary_phone_number', 'VARCHAR(32) NULL DEFAULT NULL'],
    ['installment_amount', 'DECIMAL(18,2) NULL DEFAULT NULL'],
    ['penalty', 'DECIMAL(18,2) NULL DEFAULT NULL'],
    ['loan_due_date', 'DATE NULL DEFAULT NULL'],
    ['last_paid_amount', 'DECIMAL(18,2) NULL DEFAULT NULL'],
    ['last_paid_date', 'DATE NULL DEFAULT NULL'],
    ['loan_counter', 'INT NULL DEFAULT NULL'],
    ['physical_address', 'VARCHAR(255) NULL DEFAULT NULL'],
    ['employer_and_address', 'VARCHAR(255) NULL DEFAULT NULL'],
    ['next_of_kin_full_name', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['next_of_kin_relationship', 'VARCHAR(80) NULL DEFAULT NULL'],
    ['next_of_kin_phone_number', 'VARCHAR(32) NULL DEFAULT NULL'],
    ['next_of_kin_email', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['guarantor_full_name', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['guarantor_phones', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['guarantor_email', 'VARCHAR(160) NULL DEFAULT NULL'],
    ['guarantor_address', 'VARCHAR(255) NULL DEFAULT NULL'],
  ];
  for (const [column, definition] of portfolioColumns) {
    await addColumnIfNotExists('debtors', column, definition);
  }

  await addIndexIfNotExists('debtors', 'idx_debtors_file', 'file_id');
  await addIndexIfNotExists('debtors', 'idx_debtors_loan_id', 'loan_id');

  // ── contact_statuses ── outcomes recorded when an agent attempts to contact
  //    a debtor (Call Back, Hang Up, Promise To Pay, etc.). Used by the debtor
  //    advanced filter and the contact-status settings page.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_statuses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(16) NULL,
      description VARCHAR(255) NULL,
      max_na_days INT NOT NULL DEFAULT 0,
      dialing_priority INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_contact_statuses_name (name)
    )
  `);

  const [csRows] = await pool.query('SELECT COUNT(*) AS count FROM contact_statuses');
  if (Number(csRows[0]?.count ?? 0) === 0) {
    const defaults = [
      ['Call Back', 'CB', 'Call Back', 1, 1],
      ['Hang Up', 'HU', 'Hang Up', 29, 20],
      ['Negotiation in Progress', 'NIP', 'Negotiation in Progress', 2, 1],
      ['Non-Commital', 'N-C', 'Hangs up and uncooperative clients', 4, 5],
      ['Phone Switched Off', 'PSO', 'Phone Switched Off', 3, 9],
      ['Promise To Pay', 'PTP', 'Promise To Pay', 1, 1],
      ['Ringing No Response', 'RNR', 'Ringing No Response', 30, 30],
      ['Temporarily Out of Service', 'TOS', 'Temporarily Out of Service', 30, 30],
      ['Wrong Number', 'WN', 'Number registered under another person or wrong number provided', 150, 150],
      ['Non-Confirmed payments', 'NCP', 'Casefiles whose payments have not reflected in the system', 100, 10],
    ];
    for (const [name, code, description, maxNaDays, dialingPriority] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO contact_statuses (name, code, description, max_na_days, dialing_priority) VALUES (?, ?, ?, ?, ?)',
        [name, code, description, maxNaDays, dialingPriority]
      );
    }
  }

  // ── Debtor columns to support the advanced filter ──
  await addColumnIfNotExists('debtors', 'contact_status_id', 'INT NULL DEFAULT NULL');
  await addColumnIfNotExists('debtors', 'last_contacted_at', 'TIMESTAMP NULL DEFAULT NULL');
  await addColumnIfNotExists('debtors', 'next_action_date', 'DATE NULL DEFAULT NULL');
  await addIndexIfNotExists('debtors', 'idx_debtors_contact_status', 'contact_status_id');
  await addIndexIfNotExists('debtors', 'idx_debtors_next_action', 'next_action_date');

  // ── Per-debtor case closure (Closed Files page) ──
  await addColumnIfNotExists('debtors', 'is_closed', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfNotExists('debtors', 'closure_reason', 'VARCHAR(120) NULL DEFAULT NULL');
  await addColumnIfNotExists('debtors', 'closed_at', 'TIMESTAMP NULL DEFAULT NULL');
  await addIndexIfNotExists('debtors', 'idx_debtors_closed', 'is_closed');

  // Closed-file flag on the batch file (advanced filter "Closed File").
  await addColumnIfNotExists('debtor_files', 'is_closed', 'TINYINT(1) NOT NULL DEFAULT 0');
  // Calendar day for API pulls — one case file (CFID) per client per batch_date.
  await addColumnIfNotExists('debtor_files', 'batch_date', 'DATE NULL DEFAULT NULL');
  await addColumnIfNotExists('debtor_files', 'source', "VARCHAR(32) NULL DEFAULT NULL");
  await addIndexIfNotExists(
    'debtor_files',
    'idx_debtor_files_client_batch_date',
    'client_id, batch_date'
  );
}

// ── Commissions ── payments ledger (populated from daily upload deltas on
//    debtors.total_paid), commission earnings (rate × collected, materialized
//    per payment), client payouts, and the per (client × debt category) rate
//    matrix. A one-time backfill seeds the ledger from the existing
//    debtors.total_paid snapshot so the commissions page is non-empty on day one.
async function initCommissionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      debtor_id INT NOT NULL,
      client_id INT NULL,
      debt_category_id INT NULL,
      file_id INT NULL,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      payment_date DATE NULL,
      previous_total_paid DECIMAL(18,2) NULL DEFAULT NULL,
      new_total_paid DECIMAL(18,2) NULL DEFAULT NULL,
      currency_id INT NULL,
      agent_user_id INT NULL,
      agent_name VARCHAR(255) NULL,
      source ENUM('upload_delta','upload_reversal','backfill') NOT NULL DEFAULT 'upload_delta',
      confirmed TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payments_client_date (client_id, payment_date),
      INDEX idx_payments_debtor (debtor_id),
      INDEX idx_payments_file (file_id),
      INDEX idx_payments_category (debt_category_id),
      INDEX idx_payments_source (source),
      CONSTRAINT fk_payments_debtor FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE,
      CONSTRAINT fk_payments_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission_earnings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id INT NOT NULL,
      client_id INT NULL,
      debt_category_id INT NULL,
      debtor_id INT NULL,
      collected_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      rate_tier VARCHAR(20) NOT NULL DEFAULT 'global_default',
      rate_applied DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
      commission_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      period_month CHAR(7) NULL,
      status ENUM('accrued','invoiced','paid') NOT NULL DEFAULT 'accrued',
      invoiced_at TIMESTAMP NULL DEFAULT NULL,
      paid_at TIMESTAMP NULL DEFAULT NULL,
      payout_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_earnings_payment (payment_id),
      INDEX idx_earnings_client (client_id),
      INDEX idx_earnings_category (debt_category_id),
      INDEX idx_earnings_status (status),
      INDEX idx_earnings_period (period_month),
      INDEX idx_earnings_payout (payout_id),
      CONSTRAINT fk_earnings_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
    )
  `);

  // Existing installs (created before paid_amount) get the column added.
  try {
    await pool.query(
      `ALTER TABLE commission_earnings ADD COLUMN paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00 AFTER commission_amount`
    );
  } catch (err) {
    if (!/Duplicate column name/i.test(err.message)) throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission_payouts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      paid_date DATE NULL,
      reference VARCHAR(120) NULL,
      applies_to JSON NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payouts_client (client_id),
      CONSTRAINT fk_payouts_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_commission_rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      debt_category_id INT NULL,
      rate DECIMAL(7,4) NOT NULL,
      currency_id INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ccr_client (client_id),
      INDEX idx_ccr_category (debt_category_id),
      CONSTRAINT fk_ccr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_ccr_category FOREIGN KEY (debt_category_id) REFERENCES debt_categories(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migration_flags (
      flag VARCHAR(64) PRIMARY KEY,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Unique index on debtors(client_id, loan_id) so daily uploads can upsert by
  // loan_id. Rows with NULL loan_id are excluded from uniqueness (MySQL NULL
  // semantics). Existing installs with duplicate loan_ids are tolerated — the
  // service layer still picks the latest match when more than one exists.
  await ensureUniqueIndex('debtors', 'uq_debtors_client_loan', 'client_id, loan_id');

  await backfillPaymentsFromSnapshot();
}

// One-time seed of the payments ledger + commission_earnings from the existing
// debtors.total_paid snapshot. Idempotent: gated by the `payments_backfilled`
// migration flag, and per-debtor guarded so a partial run resumes cleanly.
async function backfillPaymentsFromSnapshot() {
  const [[flag]] = await pool.query(
    "SELECT flag FROM migration_flags WHERE flag = 'payments_backfilled' LIMIT 1"
  );
  if (flag) return;

  let defaultRate = 0.1;
  try {
    const { getSystemConfig } = require('../services/systemConfigService');
    const cfg = await getSystemConfig({ mask: false });
    defaultRate = Number(cfg?.commissions?.defaultRate) || 0.1;
  } catch (error) {
    console.warn('[db] could not read commissions.defaultRate, using 0.1:', error.message);
  }

  const { recordBackfillPayment } = require('../services/paymentService');

  const [debtors] = await pool.query(
    `SELECT d.id, d.client_id, d.debt_category_id, d.total_paid, d.last_paid_date,
            d.borrow_date, d.created_at, d.assigned_agent, d.currency_id
       FROM debtors d
      WHERE d.deleted_at IS NULL AND d.total_paid > 0
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.debtor_id = d.id AND p.source = 'backfill')
      ORDER BY d.id ASC`
  );

  let backfilled = 0;
  for (const d of debtors) {
    try {
      await recordBackfillPayment({
        debtorId: d.id,
        clientId: d.client_id || null,
        debtCategoryId: d.debt_category_id || null,
        amount: Number(d.total_paid) || 0,
        paymentDate: d.last_paid_date || d.borrow_date || d.created_at,
        currencyId: d.currency_id || null,
        agentName: d.assigned_agent || null,
        defaultRate,
      });
      backfilled += 1;
    } catch (error) {
      console.warn(`[db] backfill payment for debtor ${d.id} failed: ${error.message}`);
    }
  }

  await pool.query(
    "INSERT IGNORE INTO migration_flags (flag) VALUES ('payments_backfilled')"
  );
  if (backfilled > 0) {
    console.log(`[db] backfilled ${backfilled} payment rows from debtor snapshot`);
  }
}

module.exports = {
  initDatabase,
  initSystemConfigTable,
  initAccessControlTables,
  initAuthTables,
  initNotificationsTable,
  initReportAccessTable,
  initAuditTables,
  initTemplateTables,
  initDebtorTables,
  initDebtConfigTables,
  initAgentTables,
  initCommissionTables,
};
