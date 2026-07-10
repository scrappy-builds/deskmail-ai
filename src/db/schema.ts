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
   );`,

  // --- v5: local-only message flags (pin/mute) + UI text-size preference -------
  `ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE messages ADD COLUMN is_muted INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE layout_preferences ADD COLUMN font_scale REAL NOT NULL DEFAULT 1;`,

  // --- v6: FTS5 full-text index over messages (subject/sender/body) ------------
  // Standalone (non-external-content) FTS5 table keyed by message id; kept in
  // sync from the message-write path. Backfilled from any existing rows here.
  `CREATE VIRTUAL TABLE messages_fts USING fts5(subject, sender, body);
   INSERT INTO messages_fts(rowid, subject, sender, body)
     SELECT id, COALESCE(subject,''),
            TRIM(COALESCE(from_name,'') || ' ' || COALESCE(from_email,'')),
            TRIM(COALESCE(body_text,'') || ' ' || COALESCE(snippet,'')) FROM messages;`,

  // --- v7: local rules / filters (one condition → one action, run on ingest) ---
  `CREATE TABLE rules (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     enabled INTEGER NOT NULL DEFAULT 1,
     field TEXT NOT NULL,            -- from | subject | to | body
     op TEXT NOT NULL,               -- contains | equals | startswith
     value TEXT NOT NULL,
     action TEXT NOT NULL,           -- move | star | read | junk | archive | label
     target_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
     target_label_id INTEGER REFERENCES labels(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // --- v8: adaptive Bayesian junk filter (learns from marked junk/not-junk) ----
  `CREATE TABLE junk_tokens (
     token TEXT PRIMARY KEY,
     spam INTEGER NOT NULL DEFAULT 0,
     ham INTEGER NOT NULL DEFAULT 0
   );`,

  // --- v9: contact groups (manual add/edit + simple lists) --------------------
  `ALTER TABLE contacts ADD COLUMN groups_json TEXT;`,

  // --- v10: saved smart views (match-all/any condition sets) ------------------
  `CREATE TABLE smart_views (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     match TEXT NOT NULL DEFAULT 'all',   -- all | any
     conditions_json TEXT NOT NULL,       -- [{field, op, value}]
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // --- v11: recurring events (simple RRULE: daily/weekly/monthly + until) ------
  `ALTER TABLE events ADD COLUMN recur_freq TEXT;
   ALTER TABLE events ADD COLUMN recur_until TEXT;`,

  // --- v12: local subfolders + manual folder ordering -------------------------
  `ALTER TABLE folders ADD COLUMN parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
   ALTER TABLE folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,

  // --- v13: repair duplicated attachment rows --------------------------------
  // Cause: ingest re-INSERTed attachments on every sync (each restart triggers
  // one), so a single attachment multiplied. Keep the earliest row per
  // (message, filename, size); the idempotent addAttachment stops new growth.
  `DELETE FROM attachments WHERE id NOT IN (
     SELECT MIN(id) FROM attachments
     GROUP BY message_id, COALESCE(filename,''), COALESCE(size,-1)
   );`,

  // --- v14: "mark read" behaviour preference (on select / after delay / never) -
  `ALTER TABLE layout_preferences ADD COLUMN mark_read_behaviour TEXT NOT NULL DEFAULT 'select';
   ALTER TABLE layout_preferences ADD COLUMN mark_read_delay_seconds INTEGER NOT NULL DEFAULT 2;`,

  // --- v15: message importance/priority (High/Normal/Low from the Importance hdr) -
  `ALTER TABLE messages ADD COLUMN importance TEXT;`,

  // --- v16: List-Unsubscribe header (RFC 2369) for one-click unsubscribe ---------
  `ALTER TABLE messages ADD COLUMN list_unsubscribe TEXT;`,

  // --- v17: follow-up flag with a due date (surfaced in Today when due) ----------
  `ALTER TABLE messages ADD COLUMN followup_at TEXT;`,

  // --- v18: custom colour themes (JSON array) + which one is active --------------
  `ALTER TABLE layout_preferences ADD COLUMN custom_themes_json TEXT;
   ALTER TABLE layout_preferences ADD COLUMN active_theme_id TEXT;`,

  // --- v19: drafts keep their attachments ([{name, path, size}] — paths, not copies)
  // + a reason on failed scheduled sends (e.g. "attachment file moved").
  `ALTER TABLE drafts ADD COLUMN attachments_json TEXT;
   ALTER TABLE scheduled_sends ADD COLUMN last_error TEXT;`,

  // --- v20: senders whose remote images always load (user-visible in Settings) --
  `CREATE TABLE trusted_senders (
     email TEXT PRIMARY KEY,
     added_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // --- v21: scheduled sends retry with backoff before landing on 'error' --------
  `ALTER TABLE scheduled_sends ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE scheduled_sends ADD COLUMN next_attempt_at TEXT;`,

  // --- v22: iCalendar UID per event, so sent invites and replies reference it ----
  `ALTER TABLE events ADD COLUMN ics_uid TEXT;`,

  // --- v23: Reply-To captured at ingest (phishing signal: replies diverted) ------
  `ALTER TABLE messages ADD COLUMN reply_to TEXT;`,

  // --- v24: lightweight tasks (surfaced in Today; optionally linked to a message)
  `CREATE TABLE tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     due_at TEXT,
     done INTEGER NOT NULL DEFAULT 0,
     done_at TEXT,
     message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // --- v25: reply threading headers + dismissed "waiting on a reply" nudges ------
  `ALTER TABLE messages ADD COLUMN references_json TEXT;
   CREATE TABLE nudge_dismissals (
     message_id INTEGER PRIMARY KEY,
     dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`
]
