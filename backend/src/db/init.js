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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_clients_email (email),
      INDEX idx_clients_status (status)
    )
  `);

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
}

async function initDatabase() {
  await initSystemConfigTable();
  await initAccessControlTables();
  await initAuthTables();
  await initNotificationsTable();
  await initReportAccessTable();
  await initAuditTables();
  await initTemplateTables();
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
};
