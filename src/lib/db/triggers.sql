-- The only hand-written SQL in the project. Everything else is generated from
-- src/lib/db/schema.ts. Nothing here redefines a table; these are the three
-- things Drizzle cannot express.
--
-- Run after the generated migrations. See src/lib/db/client.ts.

-- balance_due has exactly one definition and nothing writes it, so it cannot
-- drift. A Postgres GENERATED column cannot be used here: generated expressions
-- must be immutable and cannot aggregate over another table. A trigger-maintained
-- column would be faster and could drift, which is not a trade worth making
-- before there is a measurement to justify it.
CREATE OR REPLACE VIEW order_balances AS
SELECT
  o.id,
  o.shop_id,
  o.order_no,
  o.student_id,
  o.status,
  o.gross_pesewa,
  COALESCE(SUM(p.amount_pesewa) FILTER (WHERE p.state <> 'reversed'), 0)::bigint AS paid_pesewa,
  (o.gross_pesewa - COALESCE(SUM(p.amount_pesewa) FILTER (WHERE p.state <> 'reversed'), 0))::bigint
    AS balance_due
FROM orders o
LEFT JOIN payment p ON p.order_id = o.id
GROUP BY o.id;

-- A payment can never exceed what is left owing. This is the core mechanic, so
-- it is a law rather than a convention: it holds against raw SQL, a restored
-- dump, and a migration written by someone who never read the service layer.
CREATE OR REPLACE FUNCTION payment_within_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  gross   bigint;
  settled bigint;
BEGIN
  SELECT o.gross_pesewa INTO gross FROM orders o WHERE o.id = NEW.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % does not exist', NEW.order_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.state = 'reversed' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_pesewa <= 0 THEN
    RAISE EXCEPTION 'payment must be positive, got %', NEW.amount_pesewa
      USING ERRCODE = 'check_violation';
  END IF;

  -- Excludes NEW so the same function serves an update to an existing payment.
  SELECT COALESCE(SUM(p.amount_pesewa), 0) INTO settled
  FROM payment p
  WHERE p.order_id = NEW.order_id
    AND p.state <> 'reversed'
    AND p.id <> NEW.id;

  IF NEW.amount_pesewa > gross - settled THEN
    RAISE EXCEPTION
      'payment of % exceeds the remaining balance of % on order %',
      NEW.amount_pesewa, gross - settled, NEW.order_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_within_balance
  BEFORE INSERT OR UPDATE ON payment
  FOR EACH ROW EXECUTE FUNCTION payment_within_balance();

-- Status moves forward only: received to washing to ready to collected, with
-- cancelled as a branch off any open state. This is the whole conflict model
-- for the offline collector: because a backwards transition is impossible,
-- last-write-wins between two devices is safe and the sync queue needs no
-- reconciliation logic.
CREATE OR REPLACE FUNCTION forward_only_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  from_pos integer;
  to_pos   integer;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('collected', 'cancelled') THEN
    RAISE EXCEPTION 'order % is % and cannot move to %', OLD.order_no, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- enum_position is not available in this Postgres build; enum_range is
  -- universal and reads the order from the type definition itself.
  from_pos := array_position(enum_range(NULL::order_status), OLD.status);
  to_pos   := array_position(enum_range(NULL::order_status), NEW.status);

  IF to_pos < from_pos THEN
    RAISE EXCEPTION 'order % cannot move backwards from % to %', OLD.order_no, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_forward_only_status
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION forward_only_status();

-- The return must foot. Act 1151 requires VAT, NHIL and GETFund to be separately
-- traceable, and a return whose components do not sum to the invoice is a
-- return that does not reconcile. Checked on write rather than trusted.
ALTER TABLE orders
  ADD CONSTRAINT orders_tax_foots
  CHECK (base_pesewa + vat_pesewa + nhil_pesewa + getfund_pesewa = gross_pesewa);

ALTER TABLE orders
  ADD CONSTRAINT orders_weight_positive CHECK (weight_grams > 0);
