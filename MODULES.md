# OMNICRM Modules

This document describes each module in OMNICRM. Each module has a corresponding page in the sidebar and a route in the frontend.

| Module | Route |
|--------|-------|
| Dashboard | `/dashboard` |
| Client & Debtor Management | `/client-debtor-management` |
| Case Assignment & Workflow Automation | `/case-assignment-workflow` |
| Communication Channels Integration | `/communications` |
| Payment & Reconciliation | `/payments-reconciliation` |
| Compliance & Legal | `/compliance-legal` |
| Reporting & Analytics | `/reporting-analytics` |
| Security & Access Control | `/security-access-control` |
| User Experience | `/ux-features` |
| Gamification & Motivation | `/gamification` |
| AI & Machine Learning | `/ai-machine-learning` |
| Client Portal | `/client-portal` |
| System Configurations | `/system-configurations` |

---

## 1. Dashboard

**Purpose:** Real-time monitoring of collections, agent performance, and financial KPIs.

**How it works:**
1. The system pulls data from collections, communications, performance, and payments modules.
2. After login, users land on a role-specific dashboard (executive, agent, or client).
3. KPIs, reports, and case updates refresh in real time based on the user's role.
4. Users can click metrics to drill into detailed reports or case management tools.
5. Managers can export reports or set agent targets from dashboard data.

**Key features:**
- KPI cards: total collections, outstanding amounts, agent performance, success rate
- Charts: collection trends, payment trends, case status breakdown
- Recent activity log with drill-down into individual cases
- Filters by date range, case status, and agent

**User roles:** Executive, Manager, Agent, Client

---

## 2. Client & Debtor Management

**Purpose:** Maintain comprehensive debtor and client profiles with financial and interaction history.

**How it works:**
1. Debtor and client data is entered manually or imported (ERP, client systems, file upload).
2. Agents create and update profiles with contact details, financial data, and payment history.
3. The system flags high-risk debtors based on criteria such as credit score and outstanding amounts.
4. Every interaction (call, email, payment) updates the debtor profile automatically.
5. Changes are auto-saved and synced across the CRM for all agents.

**Key features:**
- Tabbed profile view: General Info, Financial, Communication, Case
- Search by name or reference number
- Actions: edit profile, add payment, set follow-up, send message
- Sidebar list of assigned debtors/clients for quick access

**User roles:** Agent, Manager

---

## 3. Case Assignment & Workflow Automation

**Purpose:** Automatically assign debt cases to agents and guide them through predefined workflows.

**How it works:**
1. New debt cases arrive from clients or system triggers.
2. Cases are created from debtor profiles or imported portfolios.
3. The system auto-assigns cases using rules: debt type, agent workload, agent skill set.
4. Workflows trigger based on case status (overdue, partial payment, promise to pay, callbacks, etc.).
5. Agents receive reminders and notifications; cases escalate when required.

**Key features:**
- Case queue with filters (overdue, assigned/unassigned, by agent)
- Case detail tabs: summary, debtor profile, communication history, tasks
- Workflow overview showing current stage and upcoming tasks
- Manual or automatic case assignment and escalation rules

**User roles:** Manager, Admin

---

## 4. Communication Channels Integration

**Purpose:** Contact debtors via SMS, email, phone, and WhatsApp with all interactions logged centrally.

**How it works:**
1. The system receives or schedules communications across channels.
2. Agents select a channel (phone, email, SMS, WhatsApp) from the CRM.
3. Contact is initiated through the chosen channel and logged on the debtor profile.
4. Automated templates trigger based on case actions (payment reminders, follow-ups).
5. Responses are tracked and case status is updated accordingly.

**Key features:**
- Unified communication history sortable by date, type, or agent
- In-app conversation window for email, SMS, and messaging
- Call controls with note-taking and recording
- Predefined message templates and escalation triggers

**User roles:** Agent, Manager

---

## 5. Payment & Reconciliation

**Purpose:** Process payments through integrated gateways and reconcile them against outstanding debts.

**How it works:**
1. Payment requests trigger when debts become due or partial payments are made.
2. Debtors pay through an integrated payment gateway.
3. On successful payment, the debtor account is updated automatically.
4. The system reconciles payments with outstanding amounts and updates case status.
5. Agents and clients receive real-time payment notifications.

**Key features:**
- Payment forms and gateway integration
- Automatic reconciliation with case and account status
- Payment plan adherence tracking
- Real-time updates to agent dashboards and client portals

**User roles:** Agent, Manager, Client

---

## 6. Compliance & Legal

**Purpose:** Ensure all collection actions follow legal frameworks and regulatory requirements.

**How it works:**
1. Every action (communication, payment, escalation) is checked against compliance rules.
2. Cases approaching legal thresholds trigger alerts.
3. Managers review compliance checklists before escalating.
4. Legal cases are created and legal notices are generated and sent from the system.
5. A full audit trail records all actions for regulatory review.

**Key features:**
- Compliance checklists per case
- Legal case creation and escalation
- Legal notice generation and delivery
- Alerts for cases nearing legal action thresholds

**User roles:** Manager, Admin

---

## 7. Reporting & Analytics

**Purpose:** Generate custom reports and predictive insights for data-driven decisions.

**Route:** `/reporting-analytics` (redirects to `/reporting-analytics/customer-account-statement`)

### Report submodules

| Report | Route |
|--------|-------|
| Customer Account Statement | `/reporting-analytics/customer-account-statement` |
| Loans Due Report | `/reporting-analytics/loans-due-report` |
| MPesa Repayments Report | `/reporting-analytics/mpesa-repayments-report` |
| Loan Officer Performance | `/reporting-analytics/loan-officer-performance` |
| Non-performing loans | `/reporting-analytics/non-performing-loans` |
| Outstanding Loan Balances as at EOM | `/reporting-analytics/outstanding-loan-balances-eom` |
| Loans Pending Disbursement | `/reporting-analytics/loans-pending-disbursement` |
| Loans Listing | `/reporting-analytics/loans-listing` |
| Outstanding Loan Balances Report | `/reporting-analytics/outstanding-loan-balances-report` |
| Suspense Payments Report | `/reporting-analytics/suspense-payments-report` |
| Trace Mpesa Transaction | `/reporting-analytics/trace-mpesa-transaction` |
| Inactive Customers | `/reporting-analytics/inactive-customers` |
| Loan Arrears Report | `/reporting-analytics/loan-arrears-report` |
| Loans Due HQ Report | `/reporting-analytics/loans-due-hq-report` |
| Duplicate Loans Report | `/reporting-analytics/duplicate-loans-report` |
| HQ Disbursed Loans | `/reporting-analytics/hq-disbursed-loans` |
| HQ Customer Listing | `/reporting-analytics/hq-customer-listing` |

**How it works:**
1. Data is collected from all modules (debtor actions, payments, agent activity, KPIs).
2. Users open Reporting & Analytics and select a report from the vertical list.
3. Each report opens as a submodule with filters, tables, and export options (to be implemented per report).
4. Results can export to CSV or PDF when report logic is built.
5. Predictive analytics models forecast future collections and debtor behavior.

**Key features:**
- 17 predefined reports navigable from a scrollable report list
- Filters: time range, agent, debtor type, client (per report)
- Graphical reports: bar charts, pie charts, line graphs
- Tabular data with export options
- Predictive analytics and AI-driven forecasts

**User roles:** Executive, Manager, Client

---

## 8. Integration Capabilities

**Purpose:** Connect the CRM with external systems (ERP, credit bureaus, payment gateways) via API.

**Route:** `/system-configurations/integrations` (submodule of System Configurations)

**How it works:**
1. The system connects to third-party tools through API integrations.
2. Data flows automatically between systems (e.g., ERP payment data syncs to CRM).
3. Credit reports and external data are pulled on demand for case management.
4. Integration status and data exchange logs are monitored in real time.
5. Admins can add, modify, or remove integrations as needed.

**Key features:**
- List of active integrations with real-time status (Active, Inactive, Error)
- Data exchange logs for troubleshooting
- API settings and configuration management

**User roles:** Admin

---

## 9. Security & Access Control

**Purpose:** Manage role-based access, authentication, and audit logging for system security.

**How it works:**
1. User roles and access levels are predefined by admins.
2. Users authenticate with multi-factor authentication (2FA).
3. Role-based access control (RBAC) restricts data access by role.
4. All data access and edits are logged in the audit trail.
5. Encryption protects data in transit and at rest.

**Key features:**
- User roles table with granular permissions (Read, Write, Edit, Delete)
- Audit logs sortable by user, date, or role
- Security alerts for suspicious activity

**User roles:** Admin

---

## 10. User Experience (UX)

**Purpose:** Provide a customizable, intuitive interface that minimizes training and supports mobile use.

**How it works:**
1. Users log in to a role-specific, customizable interface.
2. Smart search and navigation help agents locate debtor data, cases, and logs quickly.
3. In-line prompts and tutorials assist with tasks and new features.
4. The system works on web and mobile with real-time sync across devices.

**Key features:**
- UI themes and layouts (dark mode, compact view)
- Customizable dashboard widgets and quick links
- In-line tutorials and video guides
- Help chat or support request system

**User roles:** All

---

## 11. Gamification & Motivation

**Purpose:** Motivate collection agents through scores, leaderboards, and rewards tied to performance.

**How it works:**
1. The system tracks agent KPIs (collections, contacts, engagement).
2. Scores are calculated from performance metrics.
3. Leaderboards display top performers in real time.
4. Agents earn points, badges, and incentives for hitting targets.
5. Managers use gamification to drive team performance.

**Key features:**
- Leaderboard sortable by collections, contacts, and other metrics
- Achievements tab with badges, points, and rewards
- Performance goal setting and progress tracking
- Notifications for new rewards and milestones

**User roles:** Agent, Manager

---

## 12. AI & Machine Learning

**Purpose:** Use predictive models to prioritize cases, optimize contact timing, and improve recovery rates.

**How it works:**
1. ML models analyze historical debtor interactions and payment data.
2. The system predicts debtor behavior (best contact time, likelihood of payment).
3. Cases are prioritized and actions recommended based on predictions.
4. Sentiment analysis suggests optimized communication strategies for agents.
5. Managers can adjust AI rules and workflows for custom prioritization.

**Key features:**
- AI insights panel with contact timing and payment likelihood
- Predictive dialing schedules
- Case prioritization ranked by recovery probability
- Configurable AI settings and workflow rules

**User roles:** Manager, Executive

---

## 13. Client Portal

**Purpose:** Give clients visibility and control over their debt portfolios and collection performance.

**How it works:**
1. Clients log into a dedicated portal with access to their portfolio data.
2. Real-time reports show debt status, payment plans, and agent activity.
3. Clients upload new cases or full debtor portfolios for collection.
4. Collection parameters can be adjusted within agreed limits.
5. Alerts notify clients of important events (large payments, overdue accounts).

**Key features:**
- Portfolio summary: total debts, paid/unpaid status, performance overview
- Detailed reports on recovery progress and agent activity
- Case and portfolio upload functionality
- Quick access to account manager or support

**User roles:** Client

---

## 14. System Configurations

**Purpose:** White-label the CRM for each business deployment with customizable branding, communication channels, and user access control.

**Route:** `/system-configurations` (redirects to `/system-configurations/business`)

### Submodules

| Submodule | Route | Description |
|-----------|-------|-------------|
| Business Configs | `/system-configurations/business` | Business name, address, phone, email, logo, and theme color |
| Communication Integration | `/system-configurations/communication` | Email (Resend default or custom SMTP) and SMS provider settings |
| Integrations | `/system-configurations/integrations` | External system connections (ERP, credit bureaus, payment gateways) |
| Access Levels | `/system-configurations/access-levels` | Roles, users, and CRUD permission matrix |

**How it works:**
1. An admin opens System Configurations and navigates between the four submodules.
2. Business Configs updates branding stored in the database; changes apply globally (sidebar name, logo, theme).
3. Communication Integration stores email provider settings (Resend by default, or custom SMTP) and SMS credentials.
4. Access Levels lets admins define roles with default permissions per module/submodule, create users, assign roles, and optionally override permissions per user.
5. The System Admin role has full CRUD access to all modules and submodules and cannot be deleted.
6. Permission enforcement on navigation uses the signed-in user's JWT; report and module access are loaded after OTP verification.

**Key features:**
- Business info and theme color with live preview
- Email: Resend (default) or custom SMTP with masked API keys/passwords
- SMS: Celcom Africa (Partner ID, API Key, Sender ID/Shortcode) — see [Celcom Africa SMS API](https://celcomafrica.com/developers-center)
- Role-based permission matrix (Create, Read, Update, Delete) for all modules and System Config submodules
- Users with role assignment and optional permission overrides

**API endpoints:**
- `GET /api/system-config` — full configuration (secrets masked)
- `GET /api/system-config/branding` — business name, logo, and theme only
- `PUT /api/system-config` — save configuration updates
- `GET /api/access/permission-registry` — module/submodule list for permission matrix
- `GET/POST/PUT/DELETE /api/access/roles` — role management
- `GET/POST/PUT/DELETE /api/access/users` — user management

**User roles:** System Admin (full access); other roles configured in Access Levels

---

## 15. Authentication

**Purpose:** Secure sign-in with email/password, OTP verification, and password reset.

**Routes:**

| Route | Description |
|-------|-------------|
| `/login` | Email and password |
| `/login/verify-otp` | 6-digit OTP verification |
| `/forgot-password` | Request password reset email |
| `/reset-password?token=...` | Set new password from email link |

**How it works:**
1. User enters email and password; backend validates credentials and sends a 6-digit OTP via email (Resend or SMTP from Communication Integration).
2. SMS OTP is attempted when SMS provider and user phone are configured; otherwise email-only.
3. After OTP verification, a JWT session is issued that expires at **midnight** in `AUTH_SESSION_TIMEZONE` (default `Africa/Nairobi`).
4. Forgot-password always returns a generic success message; reset emails are sent only when the account exists.
5. Admins can set an initial password and phone number when creating users in Access Levels.

**API endpoints:**
- `POST /api/auth/login` — start sign-in, send OTP
- `POST /api/auth/verify-otp` — complete sign-in, receive JWT
- `POST /api/auth/resend-otp` — resend OTP code
- `POST /api/auth/forgot-password` — request reset link
- `POST /api/auth/reset-password` — set password from token
- `POST /api/auth/change-password` — change password while signed in
- `GET /api/auth/me` — current user profile

**Note:** SMS delivery uses the [Celcom Africa Bulk SMS API](https://celcomafrica.com/developers-center) when configured under Communication Integration.

---

## 16. Audit Logs

**Purpose:** Maintain a tamper-evident record of authentication sessions and every email/SMS the platform sends, capturing device, browser, and provider details for security and compliance review.

**Access:** System Admin only. All `/api/audit/*` endpoints require a valid JWT **and** the System Admin role.

### Tables

| Table | Captures |
|-------|----------|
| `login_audit` | Login/logout sessions and failed attempts: user, email, session id, status, failure reason, IP, raw user agent, parsed browser/version, OS, device type, device vendor, `login_at`, `logout_at`, notes |
| `email_audit` | Every email sent: recipient, sender, subject, body, category (`otp`, `password_reset`, `test`, `general`), provider, status (`sent`/`failed`), provider message id, error message, metadata, notes |
| `sms_audit` | Every SMS sent: recipient, sender id/shortcode, message, category (`otp`, `test`, `general`), provider, status, provider message id, provider code, estimated segments, error message, notes |

**How it works:**
1. **Logins** — `authService` records a `failed` row for unknown email, inactive account, wrong password, or bad/expired OTP. On successful OTP verification it records a `success` row with a `session_id` that is also embedded in the JWT (`sid` claim). On logout, the matching open session's `logout_at` is set, yielding a session duration.
2. **Device/browser info** is parsed from the request `User-Agent` header by `utils/userAgent.js` (no external dependency).
3. **Emails** are logged automatically inside `emailService.sendEmail` for both success and failure, including the OTP and password-reset emails.
4. **SMS** are logged automatically inside `smsService.sendSms` for OTP, test, and general messages (pure skips like "not configured" or "no phone" are not logged as failures).
5. All recording is **fail-safe** — an audit write error never blocks login, email, or SMS delivery.

**API endpoints** (each resource supports full CRUD + stats; lists support DataTables `draw/start/length` or simple `page/limit`, plus `search`, `status`, `category`, `userId` filters):

- `GET /api/audit/logins` · `GET /api/audit/logins/stats` · `GET /api/audit/logins/:id` · `POST /api/audit/logins` · `PUT /api/audit/logins/:id` · `DELETE /api/audit/logins/:id` · `DELETE /api/audit/logins?olderThanDays=N`
- `GET /api/audit/emails` · `GET /api/audit/emails/stats` · `GET /api/audit/emails/:id` · `POST /api/audit/emails` · `PUT /api/audit/emails/:id` · `DELETE /api/audit/emails/:id` · `DELETE /api/audit/emails?olderThanDays=N`
- `GET /api/audit/sms` · `GET /api/audit/sms/stats` · `GET /api/audit/sms/:id` · `POST /api/audit/sms` · `PUT /api/audit/sms/:id` · `DELETE /api/audit/sms/:id` · `DELETE /api/audit/sms?olderThanDays=N`

**User roles:** System Admin only

---

## User roles summary

| Role | Access |
|------|--------|
| Admin | Full access to all modules and system settings |
| Manager | Case assignment, workflow, performance monitoring, compliance |
| Agent | Debtor profiles, communication, case management |
| Client | Own portfolio, reports, and communication logs |
| Executive | Dashboard, reporting, AI insights, high-level KPIs |
