-- Include brought-forward balances in database balance-sheet results.
CREATE OR REPLACE FUNCTION balance_sheet_as_of(as_of_date date)
RETURNS TABLE (
  account_id uuid,
  code text,
  name text,
  account_type text,
  account_subtype text,
  balance numeric(18,2)
) AS $$
  SELECT balances.account_id,
         balances.code,
         balances.name,
         balances.account_type,
         balances.account_subtype,
         balances.balance
  FROM (
    SELECT coa.id AS account_id,
           coa.code,
           coa.name,
           coa.account_type,
           coa.account_subtype,
           (
             CASE WHEN coa.normal_balance = 'DEBIT'
                  THEN COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
                     - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0)
                  ELSE COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0)
                     - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
             END
             + CASE
                 WHEN coa.opening_balance_date IS NULL OR coa.opening_balance_date <= as_of_date
                   THEN COALESCE(coa.opening_balance, 0)
                 ELSE 0
               END
           )::numeric(18,2) AS balance
    FROM chart_of_accounts coa
    LEFT JOIN journal_lines jl ON jl.account_id = coa.id
    LEFT JOIN journal_entries je
      ON je.id = jl.entry_id
     AND je.entry_date <= as_of_date
     AND je.status = 'POSTED'
    WHERE coa.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
    GROUP BY coa.id
  ) balances
  WHERE balances.balance <> 0;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE VIEW balance_sheet_posted_accounts AS
SELECT balances.account_id,
       balances.code,
       balances.name,
       balances.account_type,
       balances.account_subtype,
       balances.balance
FROM (
  SELECT coa.id AS account_id,
         coa.code,
         coa.name,
         coa.account_type,
         coa.account_subtype,
         (
           CASE WHEN coa.normal_balance = 'DEBIT'
                THEN COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
                   - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0)
                ELSE COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0)
                   - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
           END
           + CASE
               WHEN coa.opening_balance_date IS NULL OR coa.opening_balance_date <= CURRENT_DATE
                 THEN COALESCE(coa.opening_balance, 0)
               ELSE 0
             END
         )::numeric(18,2) AS balance
  FROM chart_of_accounts coa
  LEFT JOIN journal_lines jl ON jl.account_id = coa.id
  LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'POSTED'
  WHERE coa.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
  GROUP BY coa.id
) balances
WHERE balances.balance <> 0;
