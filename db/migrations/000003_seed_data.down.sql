-- 000003_seed_data.down.sql
-- Removes everything seeded by 000003_seed_data.up.sql.
-- The append-only no-delete rule on stock_movements is dropped first (it blocks
-- ALL deletes, including migrations), then re-created afterwards.

-- 1. Drop append-only rule (restored at the end)
DROP RULE IF EXISTS no_delete_movements ON inv.stock_movements;

-- 2. Audit logs (seeded rows carry fixed request_ids)
DELETE FROM aud.audit_logs
WHERE request_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000006'
);

-- 3. Count lines, deliveries, movements (before documents)
DELETE FROM doc.count_lines
WHERE document_id IN (SELECT id FROM doc.documents WHERE doc_no IN (
    'CNT/WH01/2608/00007'
));

DELETE FROM doc.deliveries
WHERE document_id IN (SELECT id FROM doc.documents WHERE doc_no IN (
    'DO/WH01/2608/00003'
));

DELETE FROM inv.stock_movements
WHERE doc_no IN (
    'OPN/WH01/2608/00001', 'OPN/WH02/2608/00001',
    'GRN/WH01/2608/00002',
    'DO/WH01/2608/00003',
    'TRF/WH01/2608/00004',
    'ADJ/WH01/2608/00006', 'ADJ/WH01/2608/00013',
    'RTN_IN/WH01/2608/00009', 'RTN_OUT/WH01/2608/00010'
);

-- 4. Documents (cascades to document_lines and allocations)
DELETE FROM doc.documents WHERE doc_no IN (
    'OPN/WH01/2608/00001', 'OPN/WH02/2608/00001',
    'GRN/WH01/2608/00002',
    'DO/WH01/2608/00003',
    'TRF/WH01/2608/00004',
    'ADJ/WH01/2608/00006', 'ADJ/WH01/2608/00013',
    'CNT/WH01/2608/00007',
    'REQ/WH01/2608/00008',
    'DO/WH01/2608/00014',
    'DO/WH01/2608/00012',
    'RTN_IN/WH01/2608/00009', 'RTN_OUT/WH01/2608/00010',
    'GRN/WH01/2608/00015', 'GRN/WH01/2608/00011'
);

-- 5. Document number sequences for the seeded period
DELETE FROM doc.document_numbers WHERE period = '202608';

-- 6. Stock balances (seeded item × location keys)
DELETE FROM inv.stock_balances b
USING master.items i, master.locations l
WHERE b.item_id = i.id AND b.location_id = l.id
  AND i.sku IN ('SKU-001','SKU-002','SKU-003','SKU-004','SKU-005',
                'SKU-006','SKU-007','SKU-008','SKU-009','SKU-010')
  AND l.code IN ('STG-01-01','PK-01-01','PK-01-02','BLK-01-01','BLK-01-02',
                 'QTN-01-01','DMG-01-01','TRN-01-01',
                 'STG-02-01','PK-02-01','BLK-02-01','TRN-02-01');

-- 7. Master data
DELETE FROM master.item_uoms
WHERE item_id IN (SELECT id FROM master.items WHERE sku IN (
    'SKU-001','SKU-002','SKU-003','SKU-004','SKU-005',
    'SKU-006','SKU-007','SKU-008','SKU-009','SKU-010'
));

DELETE FROM master.batches
WHERE item_id IN (SELECT id FROM master.items WHERE sku IN (
    'SKU-001','SKU-002','SKU-003','SKU-004','SKU-005',
    'SKU-006','SKU-007','SKU-008','SKU-009','SKU-010'
));

DELETE FROM master.items WHERE sku IN (
    'SKU-001','SKU-002','SKU-003','SKU-004','SKU-005',
    'SKU-006','SKU-007','SKU-008','SKU-009','SKU-010'
);

DELETE FROM master.locations
WHERE warehouse_id IN (SELECT id FROM master.warehouses WHERE code IN ('WH01','WH02'));

DELETE FROM master.partners WHERE code IN (
    'SUP-001','SUP-002','CUS-001','CUS-002','UNIT-001','UNIT-002'
);

DELETE FROM master.categories WHERE code IN (
    'CAT-RAW','CAT-PKG','CAT-FG','CAT-SPT','CAT-CSM','CAT-PHA'
);

-- 8. Security: user_roles first (FK to users/warehouses), then users, then WH02
DELETE FROM sec.user_roles
WHERE user_id IN (SELECT id FROM sec.users WHERE username IN (
    'imanager','supervisor','receiving','picker','masterdata',
    'courier','requester','auditor'
))
   OR (user_id = (SELECT id FROM sec.users WHERE username = 'admin')
       AND warehouse_id = (SELECT id FROM master.warehouses WHERE code = 'WH02'));

DELETE FROM sec.users WHERE username IN (
    'imanager','supervisor','receiving','picker','masterdata',
    'courier','requester','auditor'
);

DELETE FROM master.warehouses WHERE code = 'WH02';

-- 9. Restore append-only ledger protection (as in 000001_init.up.sql)
CREATE RULE no_delete_movements AS ON DELETE TO inv.stock_movements DO INSTEAD NOTHING;
