# Backup and restore

Phase 1 uses SQLite's backup API (`Connection.backup`) so copies are consistent even if the source is in use.

Default backup directory: `backend/backups/`  
Backup files are ignored by Git. Do not commit shop databases.

## Create a backup

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m app.cli backup
```

What happens:

1. The live database is opened read-only and checked with `PRAGMA integrity_check`.
2. A new file named `dukaanvoice-YYYYMMDDTHHMMSSZ.db` is created (UTC).
3. If that name already exists, a numeric suffix is added (`-2`, `-3`, …).
4. Existing backups are never overwritten.
5. The copy is integrity-checked before the command succeeds.

Example name: `dukaanvoice-20261016T111500Z.db`

## Restore (safe copy, not a live swap)

Restore writes a **new** database file. It will not replace `backend/data/dukaanvoice.db`.

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m app.cli restore --backup "backups\dukaanvoice-20261016T111500Z.db" --destination "data\dukaanvoice-restored.db"
```

Validation before copy:

- Backup file exists and opens as SQLite
- `PRAGMA integrity_check` returns `ok`
- Required application tables are present
- Destination path does not already exist
- Destination is not the configured live database path

If copy validation fails, the incomplete destination file is removed.

## Recovery steps (operator)

1. Stop the API process so shopkeepers are not writing during a swap.
2. Create a fresh backup of the current live file (even if you believe it is damaged), unless the file cannot be opened.
3. Restore the known-good backup to a new path, as shown above.
4. Open the restored copy with a tool or a read-only Python connection and confirm tables and row counts.
5. Only after that check, manually replace the live file (Windows example):

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
Stop any process using data\dukaanvoice.db
Copy-Item "data\dukaanvoice.db" "backups\manual-pre-swap.db"
Copy-Item "data\dukaanvoice-restored.db" "data\dukaanvoice.db" -Force
```

The application will never perform that last overwrite by itself.

6. Start the API and call `GET /api/health/ready`.

## Tests

Automated tests use pytest temporary directories only:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m pytest tests\test_backup.py
```

Those tests must not point at `backend/data/dukaanvoice.db`.
