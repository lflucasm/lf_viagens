DO $$
BEGIN
  -- Receivable -> receivables
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='Receivable'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='receivables'
  ) THEN
    ALTER TABLE "Receivable" RENAME TO "receivables";
  END IF;

  -- Settings -> settings
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='Settings'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='settings'
  ) THEN
    ALTER TABLE "Settings" RENAME TO "settings";
  END IF;
END $$;
