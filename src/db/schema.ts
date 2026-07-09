// Version-based schema. Each entry in MIGRATIONS is one version; its index + 1
// is the target user_version. Add new migrations by appending — never edit a
// shipped one — so existing databases upgrade without data loss.

export const MIGRATIONS: string[] = [
  // --- v1: full initial schema (FEATURE_SPEC §Data model + additions) ---------
  `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    email_address TEXT NOT NULL,
    incoming_type TEXT NOT NULL,            -- 'imap' | 'pop3'
    incoming_host TEXT NOT NULL,
    incoming_port INTEGER NOT NULL,
    incoming_security TEXT NOT NULL,        -- 'ssl' | 'starttls' | 'none'
    outgoing_host TEXT NOT NULL,
    outgoing_port INTEGER NOT NULL,
    outgoing_security TEXT NOT NULL,
    username TEXT NOT NULL,
    colour TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Encrypted credentials, keyed by account. Ciphertext only — never plaintext.
  CREATE TABLE credentials (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    secret_enc BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    remote_path TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    remote_uid INTEGER,
    message_id_header TEXT,
    from_name TEXT,
    from_email TEXT,
    to_json TEXT,
    cc_json TEXT,
    bcc_json TEXT,
    subject TEXT,
    snippet TEXT,
    body_text TEXT,
    body_html TEXT,
    received_at TEXT,
    sent_at TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_starred INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    raw_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_messages_folder ON messages(folder_id, received_at);
  CREATE INDEX idx_messages_account ON messages(account_id);

  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT,
    mime_type TEXT,
    size INTEGER,
    local_path TEXT,
    downloaded_at TEXT
  );

  CREATE TABLE drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    to_json TEXT,
    cc_json TEXT,
    bcc_json TEXT,
    subject TEXT,
    body TEXT,
    created_by TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'claude'
    in_reply_to_message_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    colour TEXT
  );
  CREATE TABLE message_labels (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, label_id)
  );

  CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    last_uid INTEGER,
    last_sync_at TEXT,
    sync_status TEXT,
    sync_error TEXT
  );

  -- Single-row layout preferences (id = 1).
  CREATE TABLE layout_preferences (
    id INTEGER PRIMARY KEY,
    reading_pane_position TEXT NOT NULL,
    reading_pane_visible INTEGER NOT NULL,
    sidebar_position TEXT NOT NULL,
    sidebar_mode TEXT NOT NULL,
    message_list_density TEXT NOT NULL,
    message_list_style TEXT NOT NULL,
    preview_line_count INTEGER NOT NULL,
    open_email_behaviour TEXT NOT NULL,
    claude_panel_position TEXT NOT NULL,
    selected_layout_preset TEXT NOT NULL,
    theme TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- --- additions --------------------------------------------------------------
  CREATE TABLE signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT,
    body TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE scheduled_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    send_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',   -- 'scheduled' | 'sent' | 'cancelled'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE snoozes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    snooze_until TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    emails_json TEXT,
    org TEXT,
    notes TEXT,
    avatar_colour TEXT,
    last_seen_at TEXT
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start TEXT,
    end TEXT,
    provider TEXT,
    location TEXT,
    join_url TEXT,
    notes TEXT,
    calendar TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE event_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    response TEXT
  );
  `,

  // --- v2: parsed calendar-invite data attached to a message ------------------
  `ALTER TABLE messages ADD COLUMN invite_json TEXT;`,

  // --- v3: signature "append to new messages" toggle --------------------------
  `ALTER TABLE signatures ADD COLUMN append_to_new INTEGER NOT NULL DEFAULT 1;`,

  // --- v4: outbound mail-action queue (local change → pushed to IMAP) ----------
  // Captures enough (remote_uid, source/target paths) to replay against the server
  // even after the local move has happened, so the app can drain it independently
  // of who enqueued it (in-app action, junk filter, or a Claude MCP tool).
  `CREATE TABLE mail_actions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     message_id INTEGER,
     account_id INTEGER NOT NULL,
     op TEXT NOT NULL,           -- move | flag | unflag | read | unread | trash | junk | archive
     remote_uid INTEGER,
     source_path TEXT,
     target_path TEXT,
     status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | error
     error TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`
]
