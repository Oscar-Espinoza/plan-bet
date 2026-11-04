-- Grant reason is "signup": legacy/src/lib/auth.ts inserts that string with the user.
-- legacy/src/data/credits.ts does not write the grant. Spec §3.6's sample said "starting grant".
CREATE TRIGGER user_starting_grant AFTER INSERT ON "user" BEGIN
  INSERT INTO credit_entries (id, user_id, kind, amount, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, 'grant', 1000, 'signup',
          CAST(unixepoch('subsec') * 1000 AS INTEGER));
END;
