-- Post cash and bank movements together with their double-entry journal rows.
-- The source module/id pair makes retries safe.
CREATE OR REPLACE FUNCTION post_accounting_cash_movement(
  p_company_id uuid,
  p_source_module text,
  p_source_id text,
  p_reference text,
  p_entry_date date,
  p_description text,
  p_amount numeric,
  p_bank_account_name text,
  p_offset_account_name text,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric(18,2) := round(COALESCE(p_amount, 0), 2);
  v_bank bank_accounts%ROWTYPE;
  v_cash_account chart_of_accounts%ROWTYPE;
  v_offset_account chart_of_accounts%ROWTYPE;
  v_entry journal_entries%ROWTYPE;
  v_bank_line uuid;
  v_txn_id uuid;
BEGIN
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'amount_not_positive');
  END IF;

  SELECT * INTO v_entry FROM journal_entries
  WHERE company_id = p_company_id AND source_module = p_source_module AND source_id = p_source_id LIMIT 1;
  IF v_entry.id IS NOT NULL THEN
    RETURN jsonb_build_object('posted', false, 'already_posted', true, 'entry_id', v_entry.id);
  END IF;

  SELECT * INTO v_bank FROM bank_accounts
  WHERE company_id = p_company_id AND status = 'active'
    AND ((NULLIF(trim(p_bank_account_name), '') IS NOT NULL AND name = p_bank_account_name)
      OR (NULLIF(trim(p_bank_account_name), '') IS NULL AND lower(COALESCE(p_direction, '')) = 'deposit' AND name ILIKE '%cash%'))
  ORDER BY
    CASE WHEN name = p_bank_account_name THEN 0
         WHEN NULLIF(trim(p_bank_account_name), '') IS NULL AND name ILIKE '% - Cash' THEN 1
         WHEN NULLIF(trim(p_bank_account_name), '') IS NULL AND name ILIKE '%cash%' THEN 2
         ELSE 3 END,
    created_at
  LIMIT 1;
  IF v_bank.id IS NULL THEN RAISE EXCEPTION 'No active bank or cash account is configured for company %', p_company_id; END IF;

  IF lower(COALESCE(p_direction, '')) = 'withdrawal' AND COALESCE(v_bank.balance, 0) < v_amount THEN
    RAISE EXCEPTION 'Insufficient funds in account %', v_bank.name;
  END IF;

  SELECT * INTO v_cash_account FROM chart_of_accounts
  WHERE company_id = p_company_id AND name IN ('Cash', 'Cash and Bank Balance')
  ORDER BY CASE WHEN name = 'Cash' THEN 0 ELSE 1 END LIMIT 1;
  SELECT * INTO v_offset_account FROM chart_of_accounts
  WHERE company_id = p_company_id AND name = p_offset_account_name LIMIT 1;
  IF v_cash_account.id IS NULL OR v_offset_account.id IS NULL THEN
    RAISE EXCEPTION 'Required accounting accounts are not configured for company %', p_company_id;
  END IF;

  INSERT INTO journal_entries (company_id, entry_date, reference, description, source_module, source_id, status)
  VALUES (p_company_id, COALESCE(p_entry_date, CURRENT_DATE), p_reference, p_description, p_source_module, p_source_id, 'DRAFT')
  RETURNING * INTO v_entry;

  IF lower(COALESCE(p_direction, '')) = 'withdrawal' THEN
    INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description)
    VALUES (p_company_id, v_entry.id, v_offset_account.id, v_amount, 0, p_description),
          (p_company_id, v_entry.id, v_cash_account.id, 0, v_amount, p_description);
        SELECT id INTO v_bank_line FROM journal_lines
        WHERE entry_id = v_entry.id AND account_id = v_cash_account.id AND credit = v_amount LIMIT 1;
    UPDATE bank_accounts SET balance = balance - v_amount, updated_at = NOW() WHERE id = v_bank.id;
    INSERT INTO bank_transactions (company_id, bank_account_id, txn_date, description, amount, is_reconciled, matched_journal_line_id)
    VALUES (p_company_id, v_bank.id, COALESCE(p_entry_date, CURRENT_DATE), p_description, -v_amount, true, v_bank_line)
    RETURNING id INTO v_txn_id;
  ELSE
    INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description)
    VALUES (p_company_id, v_entry.id, v_cash_account.id, v_amount, 0, p_description),
          (p_company_id, v_entry.id, v_offset_account.id, 0, v_amount, p_description);
        SELECT id INTO v_bank_line FROM journal_lines
        WHERE entry_id = v_entry.id AND account_id = v_cash_account.id AND debit = v_amount LIMIT 1;
    UPDATE bank_accounts SET balance = balance + v_amount, updated_at = NOW() WHERE id = v_bank.id;
    INSERT INTO bank_transactions (company_id, bank_account_id, txn_date, description, amount, is_reconciled, matched_journal_line_id)
    VALUES (p_company_id, v_bank.id, COALESCE(p_entry_date, CURRENT_DATE), p_description, v_amount, true, v_bank_line)
    RETURNING id INTO v_txn_id;
  END IF;

  UPDATE journal_entries SET status = 'POSTED', updated_at = NOW() WHERE id = v_entry.id;

  RETURN jsonb_build_object('posted', true, 'entry_id', v_entry.id, 'transaction_id', v_txn_id, 'bank_account_id', v_bank.id);
END;
$$;