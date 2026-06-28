# Admin: managing bypass invite codes

There is no admin UI yet. Use one of these paths to mint or revoke codes.

## Mint a code via script

```bash
pnpm insert-code --code=FRIENDS-Q3 --maxUses=10 --score=50 --expires=2026-09-30 --note="early friends round"
```

Flags:
- `--code` (required): the literal code string. Lookups are case-insensitive.
- `--maxUses` (default 1): how many redemptions allowed.
- `--score` (optional): assigns a baseline score to anyone who redeems this code. Used for content tiering.
- `--expires` (optional): ISO date — code stops working after this.
- `--note` (optional): free text for your records.

## Mint via SQL

```sql
INSERT INTO bypass_codes (code, max_uses, assigned_score, expires_at, note)
VALUES ('FRIENDS-Q3', 10, 50, '2026-09-30', 'early friends round');
```

## Revoke a code

```sql
UPDATE bypass_codes SET revoked_at = NOW() WHERE code = 'FRIENDS-Q3';
```

## See usage

```sql
SELECT code, uses_count, max_uses, expires_at, revoked_at, assigned_score, note
FROM bypass_codes
ORDER BY created_at DESC;
```
