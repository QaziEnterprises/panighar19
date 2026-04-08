-- Import ledger entries from batch files
DO $$
BEGIN
  -- Just a wrapper to allow the large insert
  NULL;
END $$;

-- Re-run the data import SQL directly
INSERT INTO public.ledger_entries (id, contact_id, date, description, debit, credit, balance, reference_type) VALUES
('f7b2bd91-8b5e-45e1-8114-bdef38fcfa8c', '76f1535b-5b12-4293-9560-bb9516d47099', '2024-05-23', '1.5L Bottle,..', 0.0, 25850.0, 25850.0, 'F1859'),
('b2e09e86-529a-4fe5-b09e-a10c1dc72ac6', '76f1535b-5b12-4293-9560-bb9516d47099', '2024-05-23', '1.5L Shoper', 0.0, 6800.0, 32650.0, 'F1876'),
('e14c1f8a-d48d-4001-9f84-567030adcfeb', '76f1535b-5b12-4293-9560-bb9516d47099', '2024-05-30', '30 mm Seal', 0.0, 5100.0, 37750.0, 'F1977')
ON CONFLICT DO NOTHING;